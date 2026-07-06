/**
 * @dodi/games — shared, pure games-domain logic used by both the browser game UI
 * and the server-side generation agents: success criteria + evaluator, the bridge
 * protocol, command parsing, the stage/canvas layout contract, tags, placeholder.
 */
export * from "./success";
export * from "./game-spec";
export * from "./stage";
export * from "./bridge-protocol";
export * from "./toolbox";
export * from "./command-markers";
export * from "./normalize-commands";
export * from "./placeholder";
export * from "./tags";
export * from "./sanitizer";
export * from "./agent-validator";
export * from "./debug";
