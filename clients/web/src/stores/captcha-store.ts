// Shared logic: @dodi/client-state (captcha-store.ts). Binds the browser instance.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

export type { CaptchaConfig } from "@dodi/client-state";

/** GET /api/auth/captcha-config, fetched once and shared by every auth form. */
export const useCaptchaStore = bindStore(clientState.captcha);
