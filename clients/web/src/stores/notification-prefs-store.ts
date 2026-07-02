/**
 * Account-level notification preferences cache. These are plaintext toggles
 * (opt-out; unset ⇒ on) that the server also reads to decide whether to send
 * transactional email. Fetched once from `/api/account` and reused across
 * navigation, with optimistic updates from the settings form.
 */
import { create } from "zustand";

import { dodi } from "@/lib/api";

export interface NotificationPreferences {
  friend_approval_email?: boolean;
}

interface NotificationPrefsState {
  prefs: NotificationPreferences | null;
  loaded: boolean;
  load: (force?: boolean) => Promise<void>;
  /** Optimistic update after the settings form saves. */
  setPrefs: (prefs: NotificationPreferences) => void;
}

let inFlight: Promise<void> | null = null;

export const useNotificationPrefsStore = create<NotificationPrefsState>(
  (set, get) => ({
    prefs: null,
    loaded: false,

    load: async (force = false) => {
      if (get().loaded && !force) return;
      if (inFlight && !force) return inFlight;

      inFlight = (async () => {
        try {
          const res = await dodi.request("/api/account");
          if (!res.ok) {
            set({ loaded: true });
            return;
          }
          const data = (await res.json()) as {
            account?: {
              notification_preferences?: NotificationPreferences | null;
            };
          };
          set({
            prefs: data.account?.notification_preferences ?? {},
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        }
      })();

      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
    },

    setPrefs: (prefs) => set({ prefs, loaded: true }),
  }),
);
