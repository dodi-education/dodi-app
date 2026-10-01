/**
 * Cloudflare Turnstile for the auth front doors (sign-up, sign-in, code
 * resend). The widget runs in a WebView whose document is served under
 * CAPTCHA_ORIGIN, a hostname the platform's site key allows, so the token
 * passes the same hostname pinning as the web's. Invisible unless Cloudflare
 * needs the parent to act. Forms call `getToken()` right before a request.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useCaptchaStore } from "@/lib/client-state";
import { CAPTCHA_ORIGIN } from "@/lib/env";

export interface CaptchaHandle {
  /** A fresh single-use token, or null when the platform has captcha off. Rejects when it can't run. */
  getToken: () => Promise<string | null>;
}

export type CaptchaAction = "sign-up" | "sign-in" | "reset-password";

export type CaptchaTokenResult = { ok: true; token: string | null } | { ok: false };

/** Wraps `getToken()` so submit handlers only branch on `ok`. */
export async function requestCaptchaToken(
  handle: CaptchaHandle | null,
): Promise<CaptchaTokenResult> {
  try {
    return { ok: true, token: (await handle?.getToken()) ?? null };
  } catch {
    return { ok: false };
  }
}

const CHALLENGE_TIMEOUT_MS = 30_000;

function widgetHtml(siteKey: string, action: CaptchaAction): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style></head>
<body><div id="w"></div><script>
var widget=null;
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function ensure(){
  if(widget!==null)return true;
  if(!window.turnstile)return false;
  widget=turnstile.render('#w',{sitekey:${JSON.stringify(siteKey)},action:${JSON.stringify(action)},
    execution:'execute',appearance:'interaction-only',
    callback:function(t){post({type:'token',token:t});},
    'error-callback':function(){post({type:'error'});return true;},
    'expired-callback':function(){turnstile.reset(widget);}});
  return true;
}
window.__runChallenge=function(){
  if(!ensure()){setTimeout(window.__runChallenge,200);return;}
  turnstile.reset(widget);turnstile.execute(widget);
};
</script></body></html>`;
}

interface Pending {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}

export const Captcha = forwardRef<CaptchaHandle, { action: CaptchaAction }>(function Captcha(
  { action },
  ref,
) {
  const config = useCaptchaStore((s) => s.config);
  const load = useCaptchaStore((s) => s.load);
  const webRef = useRef<WebView>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useImperativeHandle(ref, () => ({
    getToken: async () => {
      const resolved = config ?? (await load());
      if (resolved.provider === null) return null;
      pending.current?.reject(new Error("superseded"));
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.current = null;
          reject(new Error("captcha timeout"));
        }, CHALLENGE_TIMEOUT_MS);
        pending.current = {
          resolve: (token) => {
            clearTimeout(timer);
            resolve(token);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        webRef.current?.injectJavaScript("window.__runChallenge();true;");
      });
    },
  }));

  if (!config || config.provider === null) return null;

  const onMessage = (event: WebViewMessageEvent): void => {
    const message = JSON.parse(event.nativeEvent.data) as { type: string; token?: string };
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    if (message.type === "token" && message.token) current.resolve(message.token);
    else current.reject(new Error("captcha failed"));
  };

  return (
    <View className="h-20 w-full" accessibilityElementsHidden={false}>
      <WebView
        ref={webRef}
        source={{ html: widgetHtml(config.siteKey, action), baseUrl: CAPTCHA_ORIGIN }}
        originWhitelist={["https://*"]}
        onMessage={onMessage}
        style={{ backgroundColor: "transparent" }}
        scrollEnabled={false}
      />
    </View>
  );
});
