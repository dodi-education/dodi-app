import { z } from "zod/v4";

import type {
  GameCommand,
  GameToParentMessage,
  ParentToGameMessage,
} from "@dodi/types/games";
import {
  MetricsSummarySchema,
  SuccessCriteriaSchema,
} from "./success";

const BridgeTokenSchema = z
  .string()
  .min(24)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const GameCommandSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), JsonValueSchema).optional(),
});

const GameGoalSchema = z.object({
  learningGoal: z.string(),
  successDefinition: z.string(),
  successCriteria: SuccessCriteriaSchema,
  progressKind: z.enum(["goal", "open"]),
});

const ParentInitMessageSchema = z.object({
  type: z.literal("dodi:init"),
  token: BridgeTokenSchema,
  payload: z.object({
    gameId: z.string().uuid(),
    goal: GameGoalSchema.optional(),
    savedState: z.record(z.string(), JsonValueSchema).optional(),
    locale: z.string().min(2).max(35).optional(),
  }),
});

const ParentSuccessMessageSchema = z.object({
  type: z.literal("dodi:success"),
  token: BridgeTokenSchema,
  payload: z.object({
    summary: z.string().optional(),
    metrics: MetricsSummarySchema.optional(),
  }),
});

const ParentCommandMessageSchema = z.object({
  type: z.literal("dodi:command"),
  token: BridgeTokenSchema,
  payload: z.object({
    command: GameCommandSchema,
  }),
});

const ParentGetStateMessageSchema = z.object({
  type: z.literal("dodi:get_state"),
  token: BridgeTokenSchema,
});

const ParentGetSaveStateMessageSchema = z.object({
  type: z.literal("dodi:get_save_state"),
  token: BridgeTokenSchema,
});

// Answered by the host-injected sandbox shim (not game code): capture the game
// surface and reply game:event { event: "host_snapshot", snapshot }.
const ParentHostSnapshotMessageSchema = z.object({
  type: z.literal("dodi:host_snapshot"),
  token: BridgeTokenSchema,
});

const GameReadyMessageSchema = z.object({
  type: z.literal("game:ready"),
  token: BridgeTokenSchema,
  payload: z.object({
    capabilities: z.array(z.string()),
    state: z.record(z.string(), JsonValueSchema).optional(),
  }),
});

const GameResultMessageSchema = z.object({
  type: z.literal("game:result"),
  token: BridgeTokenSchema,
  payload: z.object({
    command: GameCommandSchema,
    result: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
    }),
    state: z.record(z.string(), JsonValueSchema).optional(),
  }),
});

const GameStateMessageSchema = z.object({
  type: z.literal("game:state"),
  token: BridgeTokenSchema,
  payload: z.record(z.string(), JsonValueSchema),
});

const GameSaveStateMessageSchema = z.object({
  type: z.literal("game:save_state"),
  token: BridgeTokenSchema,
  payload: z.object({
    state: z.record(z.string(), JsonValueSchema),
  }),
});

const GameProgressMessageSchema = z.object({
  type: z.literal("game:progress"),
  token: BridgeTokenSchema,
  payload: z.object({
    progress: z.number(),
    progressLabel: z.string().optional(),
    metrics: MetricsSummarySchema.optional(),
  }),
});

const GameEventMessageSchema = z.object({
  type: z.literal("game:event"),
  token: BridgeTokenSchema,
  payload: z.object({
    event: z.string().min(1),
    message: z.string().optional(),
  }).catchall(JsonValueSchema),
});

const GameErrorMessageSchema = z.object({
  type: z.literal("game:error"),
  token: BridgeTokenSchema,
  payload: z.object({
    error: z.string().min(1),
    command: GameCommandSchema.optional(),
  }).catchall(JsonValueSchema),
});

export const ParentToGameMessageSchema = z.discriminatedUnion("type", [
  ParentInitMessageSchema,
  ParentCommandMessageSchema,
  ParentGetStateMessageSchema,
  ParentGetSaveStateMessageSchema,
  ParentSuccessMessageSchema,
  ParentHostSnapshotMessageSchema,
]);

export const GameToParentMessageSchema = z.discriminatedUnion("type", [
  GameReadyMessageSchema,
  GameResultMessageSchema,
  GameStateMessageSchema,
  GameSaveStateMessageSchema,
  GameProgressMessageSchema,
  GameEventMessageSchema,
  GameErrorMessageSchema,
]);

/**
 * Normalize a postMessage payload to plain JSON before schema validation.
 * Structured clone keeps `undefined` object properties, which the JSON-only
 * bridge schemas reject — and AI-generated games produce them routinely
 * (`x ? y : undefined`). The round-trip drops `undefined` properties, turns
 * `undefined` array items into `null`, and collapses non-JSON values (Date, …)
 * to their JSON form. Returns the input unchanged when it can't be serialized
 * (cycles, top-level undefined) — the schema then rejects it as before.
 */
export function toJsonSafeMessage(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

export function parseParentToGameMessage(value: unknown): ParentToGameMessage {
  return ParentToGameMessageSchema.parse(value) as ParentToGameMessage;
}

export function parseGameToParentMessage(value: unknown): GameToParentMessage {
  return GameToParentMessageSchema.parse(value) as GameToParentMessage;
}

export function isBridgeTokenValid(token: string, expectedToken?: string): boolean {
  const parsed = BridgeTokenSchema.safeParse(token);
  if (!parsed.success) return false;
  if (expectedToken) return token === expectedToken;
  return true;
}

export function createBridgeToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeGameCommand(command: unknown): GameCommand | null {
  const parsed = GameCommandSchema.safeParse(command);
  if (!parsed.success) return null;
  return parsed.data as GameCommand;
}
