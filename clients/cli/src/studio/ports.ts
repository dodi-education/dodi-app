/**
 * The CLI's adapters for Game Studio (`@dodi/studio`), like the web's
 * `lib/games/studio-ports.ts` and the app's: the build logic itself is the
 * apps' own; only these platform pieces differ.
 *
 *  - images:      pure-JS codecs (./image-ops)
 *  - execution:   the apps' own resolver (`createExecutionResolver`), fed with
 *                 the build keys the parent sealed to this agent (`studio`)
 *  - screenshots: Playwright on this machine when installed, else dodi's
 *                 screenshot service through the platform
 *  - checkpoints: sealed files under the config dir (resume after a crash)
 *  - telemetry:   the platform's usage and error-log endpoints
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createExecutionResolver } from "@dodi/client-state/resolve-execution";
import { createTelemetry } from "@dodi/client-state/telemetry";
import type { ProvidersStore } from "@dodi/client-state/providers-store";
import { buildSandboxSrcDoc } from "@dodi/games/sandbox-doc";
import {
  DEFAULT_SCREENSHOT_VIEWPORT,
  SCREENSHOT_CONTRACT_VERSION,
  type ScreenshotResponse,
} from "@dodi/games/screenshot-contract";
import { openAgentProviderKeys } from "@dodi/protocol/agent-provider-keys";
import { createScreenshotService } from "@dodi/studio/screenshot-service";
import { createStudioTelemetry } from "@dodi/studio/telemetry";
import { SCREENSHOT_BOUND } from "@dodi/studio/build-runner";
import type { BuildRenderer, CheckpointStore, ScreenshotPort } from "@dodi/studio/ports";
import type { StudioSessionPorts } from "@dodi/studio/studio-session";
import type { AIProviderId } from "@dodi/types/ai";
import { createStore } from "zustand/vanilla";

import { configDir } from "../lib/config";
import { CliError, EXIT } from "../lib/output";
import type { Connection } from "../lib/session";
import { nodeImageOps } from "./image-ops";

/** The build keys the parent sealed to this agent, opened with its device key. */
export async function openBuildKeys(conn: Connection): Promise<Partial<Record<AIProviderId, string>>> {
  const res = await conn.client.request("/api/authorized-clients/self/provider-keys");
  if (res.status === 403 || res.status === 404) {
    throw new CliError(
      "This agent may not build with the family's AI providers",
      EXIT.forbidden,
      'Ask the parent to connect you again with "Build with your AI providers" switched on (`dodi login --force`).',
    );
  }
  if (!res.ok) throw new CliError(`Loading the build keys failed (${res.status})`);
  const { sealed } = (await res.json()) as { sealed: string };
  try {
    return openAgentProviderKeys(sealed, conn.identity.keys.kem.secretKey).keys;
  } catch {
    throw new CliError(
      "The build keys can't be opened with this agent's key",
      EXIT.unauthorized,
      "Connect again (`dodi login --force`) and have the parent allow it.",
    );
  }
}

/** A providers store holding only the agent's build keys (the resolver's input). */
function keysStore(keys: Partial<Record<AIProviderId, string>>): ProvidersStore {
  const providers = Object.fromEntries(
    Object.entries(keys).map(([id, key]) => [id, { key, keyPreview: String(key).slice(-4), addedAt: "" }]),
  );
  return createStore(() => ({
    providers,
    load: async () => providers,
    addKey: async () => {
      throw new Error("read-only");
    },
    removeKey: async () => {
      throw new Error("read-only");
    },
    getKey: (id: AIProviderId) => providers[id]?.key ?? null,
    hasAny: () => Object.keys(providers).length > 0,
    invalidate: () => {},
  })) as unknown as ProvidersStore;
}

/** The apps' execution resolver on the agent's keys; dodi AI is not offered to agents. */
export function createCliExecution(conn: Connection, keys: Partial<Record<AIProviderId, string>>) {
  const unavailable = { isConfigured: () => false, request: async () => new Response(null, { status: 503 }) };
  const noStore = createStore(() => ({
    keys: null,
    load: async () => null,
    ensureFresh: async () => null,
    getKey: () => null,
    refresh: async () => {},
  }));
  return createExecutionResolver({
    api: conn.client,
    dodiAI: unavailable,
    dodiAIDefaults: noStore as never,
    dodiAIKeys: noStore as never,
    providers: keysStore(keys),
  });
}

/** Sealed build checkpoints as files (0600), one per game. */
export function fileCheckpointStore(dir = path.join(configDir(), "checkpoints")): CheckpointStore {
  const file = (gameId: string) => path.join(dir, `${gameId.replace(/[^a-zA-Z0-9-]/g, "")}.json`);
  return {
    async save(gameId, sealed) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(file(gameId), sealed, { mode: 0o600 });
      await chmod(file(gameId), 0o600);
    },
    async load(gameId) {
      try {
        return await readFile(file(gameId), "utf8");
      } catch {
        return null;
      }
    },
    async clear(gameId) {
      await rm(file(gameId), { force: true });
    },
  };
}

type LocalRender = (request: Parameters<import("@dodi/screenshot/src/renderer").Renderer["render"]>[0]) => Promise<ScreenshotResponse>;

/** Thrown when this machine can't render locally (no Playwright, or no browser for it). */
class NoLocalRenderer extends Error {}

/**
 * Render with Playwright on this machine. Each render launches a browser and
 * closes it again, so none outlives the work (or keeps the CLI alive).
 * Throws NoLocalRenderer when Playwright or its browser isn't installed.
 */
const renderLocally: LocalRender = async (request) => {
  let createRenderer: typeof import("@dodi/screenshot/src/renderer").createRenderer;
  try {
    ({ createRenderer } = await import("@dodi/screenshot/src/renderer"));
  } catch {
    throw new NoLocalRenderer();
  }
  const renderer = createRenderer({ maxConcurrent: 1, renderTimeoutMs: 20_000, readyTimeoutMs: 5_000, chromiumSandbox: false });
  try {
    return await renderer.render(request);
  } catch (error) {
    if (/Executable doesn't exist|browserType\.launch|Cannot find (module|package)/i.test(String((error as Error)?.message))) {
      throw new NoLocalRenderer();
    }
    throw error;
  } finally {
    await renderer.close();
  }
};

async function viewLocally(input: { code: string; steps: Array<{ label: string; command?: unknown }> }) {
  const output = await renderLocally({
    version: SCREENSHOT_CONTRACT_VERSION,
    document: buildSandboxSrcDoc(input.code),
    viewport: DEFAULT_SCREENSHOT_VIEWPORT,
    steps: input.steps.map((step) => ({ label: step.label, command: step.command as never })),
  });
  const frames = [];
  for (const frame of output.frames) {
    const image = await nodeImageOps.downscale(frame.image, SCREENSHOT_BOUND);
    if (image) frames.push({ label: frame.label, image });
  }
  return {
    frames,
    ready: output.ready,
    warnings: output.warnings,
    errors: output.errors,
    ...(output.layoutIssues?.length ? { layoutIssues: output.layoutIssues } : {}),
  };
}

/**
 * The screenshot port: Playwright on this machine when it can run, else
 * dodi's screenshot service through the platform. Decided at the first render,
 * so commands that never render pay nothing.
 */
export function createCliScreenshots(conn: Connection): ScreenshotPort {
  const service = createScreenshotService({
    api: conn.client,
    fetch: (input, init) => fetch(input, init),
    images: nodeImageOps,
    // Agents can't read the account settings: dodi's own service, through the platform.
    setting: () => ({ mode: "dodi" }),
    session: () => conn.vault,
  });
  let isLocalAvailable: boolean | null = null;
  return {
    forBuild: (): BuildRenderer => {
      const viaService = service.forBuild();
      return {
        async viewGame(input) {
          if (isLocalAvailable !== false) {
            try {
              const output = await viewLocally(input);
              isLocalAvailable = true;
              return output;
            } catch (error) {
              if (!(error instanceof NoLocalRenderer)) return null;
              isLocalAvailable = false;
            }
          }
          return viaService ? viaService.viewGame(input) : null;
        },
        wasServiceUnavailable: () => isLocalAvailable === false && (viaService?.wasServiceUnavailable() ?? true),
      };
    },
  };
}

/** Everything a studio step or build needs, for this connection. */
export async function createCliStudioPorts(conn: Connection): Promise<StudioSessionPorts> {
  const keys = await openBuildKeys(conn);
  const execution = createCliExecution(conn, keys);
  return {
    api: conn.client,
    session: async () => conn.vault,
    currentSession: () => conn.vault,
    images: nodeImageOps,
    execution: {
      resolveGame: () => execution.resolveGame(),
      resolveImage: () => execution.resolveImage(),
    },
    screenshots: createCliScreenshots(conn),
    telemetry: createStudioTelemetry(createTelemetry(conn.client), () => ({})),
    games: { put: () => {}, patchLocal: () => {}, invalidate: () => {} },
    checkpoints: fileCheckpointStore(),
  };
}

/** The thinking model (publication translations) on the agent's keys. */
export async function createCliThinking(conn: Connection) {
  const execution = createCliExecution(conn, await openBuildKeys(conn));
  return { resolveThinking: () => execution.resolveThinking(), telemetry: createTelemetry(conn.client) };
}
