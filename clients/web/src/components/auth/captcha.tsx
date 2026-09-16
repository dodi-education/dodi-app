"use client";

import {
  type Ref,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useLocale } from "next-intl";

import { loadTurnstile, type TurnstileApi } from "@/lib/captcha/turnstile";
import { useCaptchaStore } from "@/stores/captcha-store";

/**
 * Imperative surface of the widget: forms call `getToken()` in their submit
 * handler and forward the result via `captchaHeaders()`.
 */
export interface CaptchaHandle {
  /**
   * Run the challenge and resolve with a fresh single-use token, or with null
   * when the platform has captcha switched off. Rejects when the challenge
   * cannot run at all (script blocked, widget error); callers show
   * `auth.captchaUnavailable` for that.
   */
  getToken: () => Promise<string | null>;
}

type CaptchaAction = "sign-up" | "sign-in" | "reset-password";

/** Outcome of asking a mounted `<Captcha>` for a token before a request. */
export type CaptchaTokenResult =
  /** Send `captchaHeaders(token)`; null means captcha is off on the platform. */
  | { ok: true; token: string | null }
  /** The challenge could not run; show `auth.captchaUnavailable`. */
  | { ok: false };

/**
 * Convenience for form submit handlers: wraps `getToken()` so the caller only
 * branches on `ok`. An unmounted widget counts as "no token" (the platform
 * then answers MISSING_RESPONSE if it does require one).
 */
export async function requestCaptchaToken(
  ref: RefObject<CaptchaHandle | null>,
): Promise<CaptchaTokenResult> {
  try {
    const token = (await ref.current?.getToken()) ?? null;
    return { ok: true, token };
  } catch {
    return { ok: false };
  }
}

interface CaptchaProps {
  /** Turnstile `action` label, visible in the Cloudflare analytics only. */
  action: CaptchaAction;
  ref: Ref<CaptchaHandle>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Widget {
  api: TurnstileApi;
  id: string;
}

/**
 * The Cloudflare Turnstile challenge for an auth form. Renders an (almost
 * always) invisible widget: `execution: "execute"` means nothing runs until a
 * form asks for a token, and `appearance: "interaction-only"` keeps the box
 * hidden unless Cloudflare needs the visitor to tick it. With captcha off on
 * the platform the component renders an empty div and `getToken()` is null.
 *
 * Mount it inside the form whose submit needs the token (each auth step mounts
 * its own; unmount removes the widget). Tokens are single-use, so every
 * `getToken()` resets the widget and runs the challenge again.
 */
export function Captcha({ action, ref }: CaptchaProps) {
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<Widget | null>(null);
  const pendingRef = useRef<Deferred<string> | null>(null);
  // Resolves true once the widget is rendered, false when captcha is off;
  // rejects when the script or widget could not be set up.
  const readyRef = useRef<Deferred<boolean>>(deferred<boolean>());

  useEffect(() => {
    let cancelled = false;
    const ready = deferred<boolean>();
    // Swallow the rejection here; getToken() surfaces it to the caller.
    ready.promise.catch(() => {});
    readyRef.current = ready;

    (async () => {
      const config = await useCaptchaStore.getState().load();
      if (cancelled) return;
      if (config.provider !== "cloudflare-turnstile") {
        ready.resolve(false);
        return;
      }
      const api = await loadTurnstile();
      const container = containerRef.current;
      if (cancelled || !container) return;
      const id = api.render(container, {
        sitekey: config.siteKey,
        action,
        execution: "execute",
        appearance: "interaction-only",
        size: "flexible",
        theme: "auto",
        language: locale,
        callback: (token) => {
          pendingRef.current?.resolve(token);
          pendingRef.current = null;
        },
        "error-callback": (code) => {
          pendingRef.current?.reject(new Error(`Turnstile error ${code}`));
          pendingRef.current = null;
          return true;
        },
        "timeout-callback": () => {
          pendingRef.current?.reject(
            new Error("Turnstile challenge timed out"),
          );
          pendingRef.current = null;
        },
        // A token that expired unused is simply replaced: getToken() resets
        // the widget before every run.
        "expired-callback": () => {},
      });
      if (!id) throw new Error("Turnstile widget did not render");
      widgetRef.current = { api, id };
      ready.resolve(true);
    })().catch((error: unknown) => {
      if (!cancelled) ready.reject(error);
    });

    return () => {
      cancelled = true;
      const widget = widgetRef.current;
      if (widget) {
        widget.api.remove(widget.id);
        widgetRef.current = null;
      }
      // Settle anything still waiting on this instance (no-op once resolved).
      ready.reject(new Error("Captcha unmounted"));
      pendingRef.current?.reject(new Error("Captcha unmounted"));
      pendingRef.current = null;
    };
  }, [action, locale]);

  useImperativeHandle(
    ref,
    () => ({
      getToken: async () => {
        const enabled = await readyRef.current.promise;
        if (!enabled) return null;
        const widget = widgetRef.current;
        if (!widget) throw new Error("Captcha widget is gone");
        // Supersede a run nobody is waiting on any more.
        pendingRef.current?.reject(new Error("Captcha run superseded"));
        const pending = deferred<string>();
        pendingRef.current = pending;
        widget.api.reset(widget.id);
        widget.api.execute(widget.id);
        return pending.promise;
      },
    }),
    [],
  );

  return <div ref={containerRef} className="empty:hidden" />;
}
