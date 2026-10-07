/**
 * Shared plumbing for providers that expose an OpenAI-compatible REST surface
 * (xAI, Venice). Each provider describes itself once (base URL, extra request
 * fields, prompt-cache style) and the chat-based adapters (thinking, game agent,
 * vision analysis, key validation) drive it through the `openai` SDK.
 *
 * In the browser (BYOK, E2EE) the key is passed in-memory and never reaches our
 * server, so client callers set `browser = true` (`dangerouslyAllowBrowser`);
 * node callers leave it off.
 */
import OpenAI from "openai";

export type OpenAICompatibleProviderId = "xai" | "venice";

export interface OpenAICompatibleProvider {
  id: OpenAICompatibleProviderId;
  /** Human-readable name for error messages ("xAI", "Venice"). */
  label: string;
  baseURL: string;
  /**
   * Provider-specific top-level fields merged into every chat request (sent
   * as-is: the SDK does not validate unknown params at runtime).
   */
  extraBody?: Readonly<Record<string, unknown>>;
  /**
   * Whether the model needs explicit Anthropic-style `cache_control`
   * breakpoints to get prompt caching (Claude behind an OpenAI-compatible
   * gateway). Providers that cache automatically leave this off.
   */
  needsCacheBreakpoints?: (model: string) => boolean;
}

/** OpenAI SDK client pointed at `baseURL`. `browser` enables `dangerouslyAllowBrowser`. */
export function createOpenAICompatibleClient(opts: {
  baseURL: string;
  apiKey: string;
  browser?: boolean;
}): OpenAI {
  return new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    dangerouslyAllowBrowser: opts.browser ?? false,
  });
}

/** Client for a described provider. */
export function createProviderClient(
  provider: OpenAICompatibleProvider,
  apiKey: string,
  browser = false,
): OpenAI {
  return createOpenAICompatibleClient({ baseURL: provider.baseURL, apiKey, browser });
}

/** Request params with the provider's extra body fields merged in (no-op without any). */
export function withExtraBody<T extends object>(
  provider: OpenAICompatibleProvider,
  params: T,
): T {
  return provider.extraBody ? ({ ...params, ...provider.extraBody } as T) : params;
}
