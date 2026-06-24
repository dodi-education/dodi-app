/**
 * @dodi/ai — portable AI orchestration: provider registry, thinking providers
 * (browser + node), prompt + context builders. Consumed by web (browser
 * thinking/voice) and the agent (node jobs). Subpath exports mirror the files.
 *
 * Deferred (still in web/platform until consumed): the game-generation agent
 * loop (agent-session/agent-tools/agent-system-prompt/agent-validator) and the
 * pure consolidateMemory extraction — both land when the agent jobs need them.
 */
export * from "./providers";
export * from "./thinking-config";
export * from "./client-thinking";
export * from "./validate-key";
export * from "./memory-prompt";
export * from "./dodi-context";
export * from "./learning-context";
