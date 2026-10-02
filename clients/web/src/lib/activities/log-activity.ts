/**
 * Fire-and-forget kid activity reporting (Insights feed): the shared
 * `@dodi/client-state/kid-activity` bound to this app's platform API. Never
 * throws; never includes transcript/memory content.
 */
import {
  type KidActivityEvent,
  type KidActivityInput,
  logKidActivity as logKidActivityWith,
} from "@dodi/client-state/kid-activity";

import { dodi } from "@/lib/api";

export type { KidActivityEvent };

export function logKidActivity(input: KidActivityInput): void {
  logKidActivityWith(dodi, input);
}
