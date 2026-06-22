import { z } from "zod/v4";

import type {
  GameCommand,
  GameToParentMessage,
  ParentToGameMessage,
} from "@/types/games";
import {
  MetricsSummarySchema,
  SuccessCriteriaSchema,
} from "@/lib/games/success";

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
  ParentSuccessMessageSchema,
]);

export const GameToParentMessageSchema = z.discriminatedUnion("type", [
  GameReadyMessageSchema,
  GameResultMessageSchema,
  GameStateMessageSchema,
  GameProgressMessageSchema,
  GameEventMessageSchema,
  GameErrorMessageSchema,
]);

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
