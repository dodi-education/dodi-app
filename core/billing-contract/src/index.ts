/**
 * @dodi/billing-contract — the shared API contract between the OSS clients and
 * the commercial `ai.dodi.app` control plane (dodi-com/ai implements it;
 * clients/web consumes it). Self-hosters never talk to these APIs: with no
 * `NEXT_PUBLIC_DODI_AI_URL` configured the client hides every dodi AI surface.
 *
 * Keep changes contract-first: edit here, then both sides (see
 * dodi-com/PROJECT.md § Agentic / dual-repo maintenance).
 */

export const API_VERSION = "2";
export const VERSION_HEADER = "X-Dodi-Ai-Api-Version";

export * from "./billing";
export * from "./keys";
export * from "./prices";
