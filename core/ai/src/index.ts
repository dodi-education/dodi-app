/**
 * @dodi/ai — portable AI orchestration: provider registry, thinking providers
 * (browser + node), prompt + context builders. Consumed by web (browser
 * thinking/voice) and the agent (node jobs). Subpath exports mirror the files.
 *
 * The browser-side game agent lives here too (subpath exports: game-agent,
 * game-agent-tools, game-agent-prompt, game-analysis, success-mapping) so game
 * creation + game-state analysis run fully client-side with the vault key —
 * imported by subpath, not re-exported here, to keep the root import lean.
 */
export * from "./providers";
export * from "./thinking-config";
export * from "./client-thinking";
export * from "./validate-key";
export * from "./memory-prompt";
export * from "./dodi-context";
export * from "./learning-context";
