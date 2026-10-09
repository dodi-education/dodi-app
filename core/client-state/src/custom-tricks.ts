/**
 * Custom tricks: tricks a kid teaches a companion ("Teach a trick" in the
 * Playground, or by voice). The parent's thinking model writes a motion script
 * from the kid's words, in the browser with the vault-held key; the script is
 * checked and fitted to the avatar (motion-script.ts) and sealed before it is
 * stored. The store keeps each companion's opened tricks (single-flight).
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import { buildCustomTrickInstruction, buildCustomTrickPrompt } from "@dodi/ai/custom-trick-prompt";
import { characterModelFor, type CharacterModelRef } from "@dodi/character/character-catalog";
import { MotionScriptSchema, parseMotionScript, type MotionScript } from "@dodi/character/motion-script";
import type { CustomTrick, Json } from "@dodi/types/database";
import { openCustomTrick, sealCustomTrick, type CustomTrickRecord } from "@dodi/vault/custom-trick-crypto";

import { awaitSession } from "./await-session";
import { FlowError, jsonInit, serverErrorOf } from "./flow-error";
import type { PlatformApi } from "./platform";
import type { ExecutionResolver } from "./resolve-execution";
import type { Telemetry } from "./telemetry";
import type { VaultStore } from "./vault-store";

/** Mirrors MAX_CUSTOM_TRICKS_PER_COMPANION on the platform. */
export const MAX_CUSTOM_TRICKS_PER_COMPANION = 24;
export const TRICK_DESCRIPTION_MAX_LENGTH = 200;

/** An opened custom trick, ready to play. */
export interface CustomTrickView {
  id: string;
  name: string;
  description: string;
  model: string;
  requiredBones: string[];
  script: MotionScript;
}

function viewOf(id: string, record: CustomTrickRecord): CustomTrickView | null {
  const script = MotionScriptSchema.safeParse(record.script);
  if (!script.success) return null;
  return {
    id,
    name: record.name,
    description: record.description,
    model: record.model,
    requiredBones: record.requiredBones,
    script: script.data,
  };
}

/** Whether an avatar can perform a trick (it has every bone the trick moves). */
export function canPerformTrick(trick: Pick<CustomTrickView, "requiredBones">, model: CharacterModelRef): boolean {
  const bones = new Set(characterModelFor(model).bones);
  return trick.requiredBones.every((bone) => bones.has(bone));
}

// ----- Store -------------------------------------------------------------------

export interface CustomTricksState {
  byCompanion: Record<string, CustomTrickView[]>;
  load: (companionId: string, force?: boolean) => Promise<CustomTrickView[]>;
  /** Seals and stores a trick; resolves with it opened. */
  save: (companionId: string, record: CustomTrickRecord) => Promise<CustomTrickView>;
  remove: (companionId: string, trickId: string) => Promise<void>;
  invalidate: () => void;
}

export type CustomTricksStore = StoreApi<CustomTricksState>;

export interface CustomTricksDeps {
  api: PlatformApi;
  vault: VaultStore;
}

export function createCustomTricksStore({ api, vault }: CustomTricksDeps): CustomTricksStore {
  const inFlight = new Map<string, Promise<CustomTrickView[]>>();

  return createStore<CustomTricksState>()((set, get) => ({
    byCompanion: {},

    load: (companionId, force = false) => {
      const cached = get().byCompanion[companionId];
      if (cached && !force) return Promise.resolve(cached);
      const running = inFlight.get(companionId);
      if (running && !force) return running;
      const promise = (async () => {
        const res = await api.request(`/api/companions/${companionId}/custom-tricks`);
        if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
        const rows = (await res.json()) as CustomTrick[];
        const session = await awaitSession(vault);
        const tricks = rows.flatMap((row) => {
          const record = openCustomTrick(session, row.trick_enc);
          const view = record ? viewOf(row.id, record) : null;
          return view ? [view] : [];
        });
        set({ byCompanion: { ...get().byCompanion, [companionId]: tricks } });
        return tricks;
      })();
      inFlight.set(companionId, promise);
      void promise.finally(() => inFlight.delete(companionId)).catch(() => {});
      return promise;
    },

    save: async (companionId, record) => {
      const session = vault.getState().session;
      if (!session) throw new FlowError("vault_locked");
      const res = await api.request(
        `/api/companions/${companionId}/custom-tricks`,
        jsonInit("POST", { trick_enc: sealCustomTrick(session, record) }),
      );
      if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
      const row = (await res.json()) as CustomTrick;
      const view = viewOf(row.id, record);
      if (!view) throw new FlowError("request_failed", "invalid_trick");
      const current = get().byCompanion[companionId] ?? [];
      set({ byCompanion: { ...get().byCompanion, [companionId]: [...current, view] } });
      return view;
    },

    remove: async (companionId, trickId) => {
      const res = await api.request(`/api/companions/${companionId}/custom-tricks/${trickId}`, { method: "DELETE" });
      if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
      const current = get().byCompanion[companionId] ?? [];
      set({ byCompanion: { ...get().byCompanion, [companionId]: current.filter((t) => t.id !== trickId) } });
    },

    invalidate: () => set({ byCompanion: {} }),
  }));
}

// ----- Teaching ----------------------------------------------------------------

export interface TeachTrickDeps {
  resolveThinking: ExecutionResolver["resolveThinking"];
  reportUsage: Telemetry["reportUsage"];
}

export interface TeachTrickInput {
  kidId: string;
  model: CharacterModelRef;
  description: string;
  /** The kid's language in English ("German"), for the trick's name. */
  languageName: string;
}

export type TeachTrickResult =
  | { ok: true; record: CustomTrickRecord; script: MotionScript; warnings: string[] }
  | { ok: false; reason: "no_thinking" | "failed" };

const LANGUAGE_NAMES: Record<string, string> = { en: "English", de: "German" };

/** The kid's language as the prompt names it. */
export function trickLanguageName(language: string | null | undefined): string {
  return LANGUAGE_NAMES[language ?? "en"] ?? "English";
}

// One retry with the problems spelled out; clamping handles the rest.
const MAX_ATTEMPTS = 2;

/**
 * Asks the thinking model for a trick and fits it to the avatar. Nothing is
 * stored: the caller previews it and saves it with the store.
 */
export async function teachTrick(deps: TeachTrickDeps, input: TeachTrickInput): Promise<TeachTrickResult> {
  const description = input.description.trim().slice(0, TRICK_DESCRIPTION_MAX_LENGTH);
  if (!description) return { ok: false, reason: "failed" };
  const resolved = await deps.resolveThinking();
  if (!resolved) return { ok: false, reason: "no_thinking" };

  const model = characterModelFor(input.model);
  const instruction = buildCustomTrickInstruction(model, input.languageName);
  const provider = createClientThinkingProvider(resolved.provider, resolved.apiKey, resolved.model, (usage) =>
    deps.reportUsage({
      eventType: "custom_trick",
      kidId: input.kidId,
      provider: resolved.provider,
      model: resolved.model,
      usage,
    }),
  );

  let issues: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await provider.generateJson(instruction, buildCustomTrickPrompt(description, issues));
    } catch {
      issues = ["the answer was not a JSON object"];
      continue;
    }
    const parsed = parseMotionScript(raw, model);
    if (!parsed.ok) {
      issues = parsed.issues.slice(0, 8);
      continue;
    }
    const { script, requiredBones, warnings } = parsed.motion;
    return {
      ok: true,
      script,
      warnings,
      record: {
        v: 1,
        name: script.name,
        description,
        model: input.model,
        requiredBones,
        script: script as unknown as Json,
      },
    };
  }
  return { ok: false, reason: "failed" };
}
