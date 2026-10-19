/**
 * The captcha WebView's `originWhitelist`. react-native-webview cancels every
 * navigation (iframes included) whose origin isn't listed here or `about:blank`
 * and hands the URL to `Linking`, so a frame Turnstile needs that is missing
 * here never loads and the challenge times out. `about:srcdoc` is Turnstile's
 * challenge iframe; entries match as an origin prefix, so it is listed exactly
 * rather than as `about:*`.
 */
export const CAPTCHA_ORIGIN_WHITELIST: string[] = ["https://*", "about:srcdoc"];
