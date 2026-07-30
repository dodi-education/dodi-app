/**
 * Warm-socket pool for pooled-strategy voice providers (today: xAI).
 *
 * xAI bills a realtime socket for its whole open lifetime once audio has EVER
 * been transmitted on it — including silent "deaf" stretches — while a socket
 * that never carried audio is free to hold. So instead of keeping one socket
 * open across active↔deaf, the session store draws from this pool:
 *
 *   - The pool maintains a pipeline of TARGET_SOCKETS sockets total. Standbys
 *     are pre-connected, setup-complete, never-audio clients ("warm");
 *     holding them costs nothing.
 *   - Going active `acquire()`s the first ready warm client — setup already
 *     happened, so activation is near-instant. The acquired client counts
 *     toward the pipeline: while active it's 1 active + 1 warm standby.
 *   - Going deaf `retire()`s the now-tainted active client (closing it stops
 *     the billing clock) and the pool warms a replacement secondary, so deaf
 *     holds 2 warm and the next activation is instant again.
 *
 * INVARIANT: nothing content-like is ever sent on a warm client — no audio, no
 * text, no greeting, no context. Only the provider-internal setup handshake.
 * That is what keeps warm sockets un-billable. The pool enforces this
 * structurally by never handing a warm client to anyone except via acquire().
 *
 * Warm clients' lifecycle events stay pool-internal; only an acquired client's
 * events flow to the handler passed to acquire(). retire() marks the slot
 * before disconnecting, so the store never sees the close it asked for.
 */

import type { VoiceClient, VoiceClientConfig, VoiceEvent } from "./voice-client";
import { createVoiceClient } from "./create-voice-client";

/** Total concurrent sockets the pool maintains, INCLUDING an acquired one:
 * the pipeline is [active-or-head, warm standby]. While active that means one
 * live conversation + one silenced standby; while deaf (nothing acquired) two
 * warm standbys, so the next activation is always instant. */
const TARGET_SOCKETS = 2;
/** Backoff between replenish attempts after a warm socket fails; indexed by
 * consecutive-failure streak (last entry repeats), reset on any success. */
const REPLENISH_BACKOFF_MS = [1000, 2000, 5000, 15000, 30000];
/** Transient ephemeral-token mint failures retried this often before the pool
 * gives up and reports fatal. Auth mint failures are fatal immediately. */
const MINT_FAILURE_MAX_RETRIES = 2;
/** Warm sockets older than this are proactively replaced (replace-then-close).
 * Free (they are untainted) and it preempts unknown server idle-kill policies. */
const WARM_MAX_AGE_MS = 10 * 60 * 1000;

export type PoolFailureReason = "fatal" | "destroyed" | "superseded";

export class VoiceSocketPoolError extends Error {
  constructor(
    readonly reason: PoolFailureReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "VoiceSocketPoolError";
  }
}

export function isPoolAbort(err: unknown): boolean {
  return (
    err instanceof VoiceSocketPoolError &&
    (err.reason === "destroyed" || err.reason === "superseded")
  );
}

export interface VoiceSocketPoolOptions {
  config: VoiceClientConfig;
  /** Test seam; defaults to createVoiceClient. */
  createClient?: (
    config: VoiceClientConfig,
    onEvent: (event: VoiceEvent) => void,
  ) => VoiceClient;
  /** Terminal fill failure (quota/auth/exhausted mint retries). Fired at most once. */
  onFatal: (message: string) => void;
}

interface Slot {
  client: VoiceClient;
  status: "connecting" | "ready";
  createdAt: number;
  /** Config epoch the slot's session.update reflects (see updateConfig). */
  epoch: number;
  /** Retired slots swallow every event — the store must not see their close. */
  isRetired: boolean;
  /** Aged slot awaiting a fresh replacement before being closed. */
  isRecycling: boolean;
  /** Set on acquire: all events forward here; the slot leaves pool control. */
  handler: ((event: VoiceEvent) => void) | null;
  recycleTimer: ReturnType<typeof setTimeout> | null;
}

interface Waiter {
  resolve: () => void;
  reject: (err: VoiceSocketPoolError) => void;
}

interface PendingAcquire {
  resolve: (client: VoiceClient) => void;
  reject: (err: VoiceSocketPoolError) => void;
  onEvent: (event: VoiceEvent) => void;
}

export class VoiceSocketPool {
  private config: VoiceClientConfig;
  private readonly createClient: NonNullable<VoiceSocketPoolOptions["createClient"]>;
  private readonly onFatal: (message: string) => void;

  /** Warm slots only (connecting or ready), oldest first. */
  private slots: Slot[] = [];
  private acquiredSlot: Slot | null = null;
  private pendingAcquire: PendingAcquire | null = null;
  private readyWaiters: Waiter[] = [];

  private configEpoch = 0;
  private isDestroyed = false;
  private fatalMessage: string | null = null;

  private replenishTimer: ReturnType<typeof setTimeout> | null = null;
  private failureStreak = 0;
  private mintFailureStreak = 0;

  constructor(opts: VoiceSocketPoolOptions) {
    this.config = opts.config;
    this.createClient = opts.createClient ?? createVoiceClient;
    this.onFatal = opts.onFatal;
  }

  /** Begin filling to TARGET_WARM. */
  start(): void {
    this.fill();
  }

  get hasFatalError(): boolean {
    return this.fatalMessage !== null;
  }

  get fatalErrorMessage(): string | null {
    return this.fatalMessage;
  }

  /** Is a warm client ready to be acquired synchronously right now? */
  get headReady(): boolean {
    return (
      !this.isDestroyed &&
      this.fatalMessage === null &&
      this.slots.some((s) => s.status === "ready" && s.epoch === this.configEpoch)
    );
  }

  /**
   * Resolves once ≥1 warm client is ready at the current config epoch.
   * Rejects with VoiceSocketPoolError on fatal / destroy / a newer updateConfig.
   */
  whenReady(): Promise<void> {
    if (this.isDestroyed) {
      return Promise.reject(new VoiceSocketPoolError("destroyed"));
    }
    if (this.fatalMessage !== null) {
      return Promise.reject(new VoiceSocketPoolError("fatal", this.fatalMessage));
    }
    if (this.headReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
    });
  }

  /**
   * Hand out a warm client and route all its events to `onEvent`. Resolves
   * synchronously-ish when one is ready, else on the next setupComplete. The
   * pool replenishes in the background either way.
   */
  acquire(onEvent: (event: VoiceEvent) => void): Promise<VoiceClient> {
    if (this.isDestroyed) {
      return Promise.reject(new VoiceSocketPoolError("destroyed"));
    }
    if (this.fatalMessage !== null) {
      return Promise.reject(new VoiceSocketPoolError("fatal", this.fatalMessage));
    }
    // Defensive: a caller re-acquiring without retiring leaks a tainted socket.
    if (this.acquiredSlot && !this.acquiredSlot.isRetired) {
      this.retire(this.acquiredSlot.client);
    }

    const index = this.slots.findIndex(
      (s) => s.status === "ready" && s.epoch === this.configEpoch,
    );
    if (index !== -1) {
      const slot = this.slots.splice(index, 1)[0];
      this.clearRecycleState(slot);
      slot.handler = onEvent;
      this.acquiredSlot = slot;
      this.log(`acquired warm socket (age ${Date.now() - slot.createdAt}ms)`);
      this.fill();
      return Promise.resolve(slot.client);
    }

    this.pendingAcquire?.reject(new VoiceSocketPoolError("superseded"));
    this.fill();
    return new Promise<VoiceClient>((resolve, reject) => {
      this.pendingAcquire = { resolve, reject, onEvent };
    });
  }

  /**
   * Close a client the pool handed out (or an unknown stray). Marks the slot
   * retired BEFORE disconnecting so its close event never escapes the pool,
   * then replenishes.
   */
  retire(client: VoiceClient): void {
    const slot =
      this.acquiredSlot?.client === client
        ? this.acquiredSlot
        : (this.slots.find((s) => s.client === client) ?? null);
    if (!slot) {
      client.disconnect();
      return;
    }
    if (slot === this.acquiredSlot) {
      this.acquiredSlot = null;
    } else {
      this.removeSlot(slot);
    }
    slot.isRetired = true;
    slot.handler = null;
    this.clearRecycleState(slot);
    slot.client.disconnect();
    this.log(`retired socket (age ${Date.now() - slot.createdAt}ms)`);
    this.fill();
  }

  /**
   * Apply a new config (context switch). Warm clients that support
   * updateSession are re-instructed in place — a JSON frame, no reconnect;
   * others are recycled. A pending acquire and outstanding whenReady()s are
   * rejected as "superseded" (the caller re-awaits against the new epoch).
   * Never touches the acquired client — the store swaps that itself.
   */
  updateConfig(config: VoiceClientConfig): Promise<void> {
    if (this.isDestroyed) {
      return Promise.reject(new VoiceSocketPoolError("destroyed"));
    }
    this.config = config;
    this.configEpoch++;

    this.pendingAcquire?.reject(new VoiceSocketPoolError("superseded"));
    this.pendingAcquire = null;
    this.rejectWaiters(new VoiceSocketPoolError("superseded"));

    for (const slot of [...this.slots]) {
      if (slot.client.updateSession) {
        slot.client.updateSession(config);
        slot.epoch = this.configEpoch;
      } else {
        this.removeSlot(slot);
        slot.isRetired = true;
        this.clearRecycleState(slot);
        slot.client.disconnect();
      }
    }
    this.log(`config updated (epoch ${this.configEpoch})`);
    this.fill();
    return this.whenReady();
  }

  /** Idempotent teardown: close everything, reject waiters, clear timers. */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.replenishTimer) {
      clearTimeout(this.replenishTimer);
      this.replenishTimer = null;
    }
    for (const slot of this.slots) {
      slot.isRetired = true;
      this.clearRecycleState(slot);
      slot.client.disconnect();
    }
    this.slots = [];
    if (this.acquiredSlot) {
      this.acquiredSlot.isRetired = true;
      this.acquiredSlot.handler = null;
      this.acquiredSlot.client.disconnect();
      this.acquiredSlot = null;
    }
    this.pendingAcquire?.reject(new VoiceSocketPoolError("destroyed"));
    this.pendingAcquire = null;
    this.rejectWaiters(new VoiceSocketPoolError("destroyed"));
    this.log("destroyed");
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private fill(): void {
    if (this.isDestroyed || this.fatalMessage !== null) return;
    // The acquired socket counts toward the target (the pipeline includes it);
    // recycling slots are marked for death and don't count.
    while (
      this.slots.filter((s) => !s.isRecycling).length +
        (this.acquiredSlot ? 1 : 0) <
      TARGET_SOCKETS
    ) {
      this.spawnSlot();
    }
  }

  private spawnSlot(): void {
    const slot: Slot = {
      client: null as unknown as VoiceClient,
      status: "connecting",
      createdAt: Date.now(),
      epoch: this.configEpoch,
      isRetired: false,
      isRecycling: false,
      handler: null,
      recycleTimer: null,
    };
    slot.client = this.createClient(this.config, (event) => this.route(slot, event));
    this.slots.push(slot);
    slot.client.connect();
    this.log("warming new socket");
  }

  private route(slot: Slot, event: VoiceEvent): void {
    if (slot.isRetired) return;
    if (slot.handler) {
      // Acquired: the store owns this client; every event is its business.
      slot.handler(event);
      return;
    }
    if (this.isDestroyed) return;

    switch (event.type) {
      case "setupComplete":
        this.onSlotReady(slot);
        break;
      case "closed":
        this.onWarmClosed(slot, event);
        break;
      case "error":
        // Diagnostic only — a `closed` follows and drives the real handling.
        this.log(`warm socket error: ${event.error}`);
        break;
      default:
        // Warm sockets produce no content events; ignore anything else.
        break;
    }
  }

  private onSlotReady(slot: Slot): void {
    slot.status = "ready";
    this.failureStreak = 0;
    this.mintFailureStreak = 0;
    this.log(`warm socket ready in ${Date.now() - slot.createdAt}ms`);

    if (this.pendingAcquire && slot.epoch === this.configEpoch) {
      const pending = this.pendingAcquire;
      this.pendingAcquire = null;
      this.removeSlot(slot);
      this.clearRecycleState(slot);
      slot.handler = pending.onEvent;
      this.acquiredSlot = slot;
      this.fill();
      pending.resolve(slot.client);
      return;
    }

    if (slot.epoch === this.configEpoch) {
      const waiters = this.readyWaiters;
      this.readyWaiters = [];
      for (const waiter of waiters) waiter.resolve();
    }

    // A fresh ready socket exists → aged slots awaiting replacement can go.
    for (const aged of this.slots.filter((s) => s.isRecycling && s !== slot)) {
      this.removeSlot(aged);
      aged.isRetired = true;
      this.clearRecycleState(aged);
      aged.client.disconnect();
      this.log(`recycled aged warm socket (age ${Date.now() - aged.createdAt}ms)`);
    }

    slot.recycleTimer = setTimeout(() => {
      slot.recycleTimer = null;
      this.beginRecycle(slot);
    }, WARM_MAX_AGE_MS);
  }

  private onWarmClosed(
    slot: Slot,
    event: Extract<VoiceEvent, { type: "closed" }>,
  ): void {
    this.removeSlot(slot);
    this.clearRecycleState(slot);
    this.log(
      `warm socket closed (code ${event.code}, reason "${event.reason}", age ${Date.now() - slot.createdAt}ms)`,
    );

    if (event.fatal) {
      // Transient mint failures get a few retries; anything else terminal
      // (auth, quota) won't heal on its own.
      if (
        event.reason === "ephemeral_token" &&
        this.mintFailureStreak < MINT_FAILURE_MAX_RETRIES
      ) {
        this.mintFailureStreak++;
        this.scheduleReplenish();
        return;
      }
      this.failFatal(event.message);
      return;
    }
    this.scheduleReplenish();
  }

  private failFatal(message: string): void {
    if (this.fatalMessage !== null || this.isDestroyed) return;
    this.fatalMessage = message;
    if (this.replenishTimer) {
      clearTimeout(this.replenishTimer);
      this.replenishTimer = null;
    }
    // Remaining warm sockets share the doomed key/quota — close them out.
    for (const slot of this.slots) {
      slot.isRetired = true;
      this.clearRecycleState(slot);
      slot.client.disconnect();
    }
    this.slots = [];
    this.pendingAcquire?.reject(new VoiceSocketPoolError("fatal", message));
    this.pendingAcquire = null;
    this.rejectWaiters(new VoiceSocketPoolError("fatal", message));
    this.log(`fatal: ${message}`);
    this.onFatal(message);
  }

  private scheduleReplenish(): void {
    if (this.isDestroyed || this.fatalMessage !== null) return;
    if (this.replenishTimer) return;
    const delay =
      REPLENISH_BACKOFF_MS[Math.min(this.failureStreak, REPLENISH_BACKOFF_MS.length - 1)];
    this.failureStreak++;
    this.replenishTimer = setTimeout(() => {
      this.replenishTimer = null;
      this.fill();
    }, delay);
    this.log(`replenish in ${delay}ms (failure streak ${this.failureStreak})`);
  }

  private beginRecycle(slot: Slot): void {
    if (this.isDestroyed || this.fatalMessage !== null) return;
    if (!this.slots.includes(slot) || slot.isRecycling) return;
    // One recycle at a time, and never while a replenish is pending.
    if (this.slots.some((s) => s.isRecycling) || this.replenishTimer) {
      slot.recycleTimer = setTimeout(() => {
        slot.recycleTimer = null;
        this.beginRecycle(slot);
      }, 60_000);
      return;
    }
    slot.isRecycling = true;
    this.log(`recycling warm socket (age ${Date.now() - slot.createdAt}ms)`);
    this.fill();
  }

  private removeSlot(slot: Slot): void {
    const index = this.slots.indexOf(slot);
    if (index !== -1) this.slots.splice(index, 1);
  }

  private clearRecycleState(slot: Slot): void {
    if (slot.recycleTimer) {
      clearTimeout(slot.recycleTimer);
      slot.recycleTimer = null;
    }
    slot.isRecycling = false;
  }

  private rejectWaiters(err: VoiceSocketPoolError): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const waiter of waiters) waiter.reject(err);
  }

  private log(message: string): void {
    console.info(
      `[VoicePool] ${message} (warm ${this.slots.filter((s) => s.status === "ready").length}/${this.slots.length})`,
    );
  }
}
