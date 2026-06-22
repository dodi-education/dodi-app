/**
 * @dodi/platform — all DB/API/business logic (framework-agnostic; never imports
 * next/*). Services are reached via the `@dodi/platform/services/*` subpath;
 * this barrel exposes the shared server utilities. The supabase server client is
 * created by the host (web's lib/supabase/server.ts under next/headers) and
 * passed into services; a device-scoped client + resolveAuth land in P7.
 */
export * from "./logger";
export * from "./encryption";
export * from "./game-sanitizer";
