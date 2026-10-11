/**
 * The static checks a hand-edited game passes before `dodi games push`
 * uploads it: the same sanitizer and validator Game Studio's own agent runs
 * (blocked APIs, size, bridge protocol, capabilities, goal metrics, the
 * translations block). Games are made with `dodi studio`; this only guards
 * manual edits of a pulled game.
 */
import { validateGameCode } from "@dodi/games/agent-validator";
import { sanitizeGameBundle } from "@dodi/games/sanitizer";

import type { GameProject } from "./game-project";

export interface StaticResult {
  errors: string[];
  warnings: string[];
  sanitizedCode: string | null;
  sizeBytes: number;
}

export function checkStatic(project: GameProject): StaticResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitizedCode: string | null = null;
  let sizeBytes = new TextEncoder().encode(project.code).byteLength;
  try {
    const sanitized = sanitizeGameBundle(project.code);
    sanitizedCode = sanitized.code;
    sizeBytes = sanitized.sizeBytes;
  } catch (error) {
    errors.push((error as Error).message);
  }

  const { meta } = project;
  const validation = validateGameCode(project.code, {
    progressKind: meta.progress_kind,
    requiredMetrics: meta.success_criteria?.requiredMetrics ?? [],
    capabilities: meta.capabilities,
    requireTranslations: true,
  });
  for (const error of validation.errors) if (!errors.includes(error)) errors.push(error);

  if (meta.progress_kind === "goal" && !meta.success_criteria?.conditions.length) {
    errors.push('progress_kind is "goal" but game.md has no success_criteria conditions');
  }
  if (!project.briefing) warnings.push("game.md has no briefing body: the companion won't know how to help");
  return { errors, warnings, sanitizedCode, sizeBytes };
}
