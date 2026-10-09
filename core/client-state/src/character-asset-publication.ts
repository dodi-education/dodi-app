/**
 * Sharing one of the family's own avatars or accessories on dodi Discover.
 *
 * Publishing is the one moment an asset leaves end-to-end encryption: the
 * device opens the sealed file (through the asset store, which decrypts it in
 * the unlocked vault) and posts a PLAINTEXT copy. The platform re-validates
 * the file and a person reviews it before it goes live; the family's own
 * asset stays sealed. Statuses are cached per asset (single-flight per id),
 * so the Companions list can show each row's state without refetching.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import { bytesToBase64 } from "@dodi/vault/character-asset-crypto";

import type { AccountStore } from "./account-store";
import type { CharacterAssetStore } from "./character-asset-store";
import { claimPublicationHandle, PublicationRequestError } from "./game-publication";
import type { PlatformApi } from "./platform";

/** Mirrors the platform's SubmitAssetPublicationSchema. */
export const ASSET_PUBLICATION_NAME_MAX_LENGTH = 80;
export const ASSET_PUBLICATION_DESCRIPTION_MAX_LENGTH = 500;

/** The submitter's view of a submission (GET/POST /api/character-assets/[id]/publication). */
export interface AssetPublicationStatus {
  id: string;
  state: "in_review" | "live" | "rejected";
  submitted_at: string;
  published_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

export type AssetPublicationFailure =
  /** The account has no public handle yet (pick one, then submit again). */
  | "handle-required"
  /** The handle is claimed by another account. */
  | "handle-taken"
  /** The platform refused the handle's format. */
  | "handle-invalid"
  /** The platform's validator refused the file (see `details`). */
  | "invalid-file"
  /** Too many submissions this month. */
  | "limit-reached"
  /** Any other failed request (or the file did not open). */
  | "failed";

export class AssetPublicationRequestError extends Error {
  constructor(
    readonly failure: AssetPublicationFailure,
    readonly details: string[] = [],
  ) {
    super(failure);
    this.name = "AssetPublicationRequestError";
  }
}

/** The `characterAssets` message key for a failed request. */
export function assetPublicationErrorKey(failure: AssetPublicationFailure): string {
  switch (failure) {
    case "handle-required":
      return "shareHandleRequired";
    case "handle-taken":
      return "shareHandleTaken";
    case "handle-invalid":
      return "shareHandleInvalid";
    case "invalid-file":
      return "shareInvalidFile";
    case "limit-reached":
      return "shareLimitReached";
    case "failed":
      return "shareFailed";
  }
}

export interface AssetPublicationInput {
  name: string;
  description: string;
  /** A normalized handle to claim first, when the account has none. */
  handle?: string;
}

export interface AssetPublicationsState {
  /** Asset id → its submission (null = never submitted / withdrawn); absent until loaded. */
  byAssetId: Record<string, AssetPublicationStatus | null>;
  load: (assetId: string, force?: boolean) => Promise<AssetPublicationStatus | null>;
  /** Submit or resubmit (decrypts the file on the device and posts a plaintext copy). */
  submit: (assetId: string, input: AssetPublicationInput) => Promise<AssetPublicationStatus>;
  /** Take the copy off Discover (families that added it lose it). */
  withdraw: (assetId: string) => Promise<void>;
  reset: () => void;
}

export type AssetPublicationStore = StoreApi<AssetPublicationsState>;

export interface AssetPublicationDeps {
  api: PlatformApi;
  account: AccountStore;
  /** Opens the sealed file (getBytes). */
  characterAssets: CharacterAssetStore;
}

async function failureOf(res: Response): Promise<AssetPublicationRequestError> {
  const body = (await res.json().catch(() => null)) as { error?: string; details?: unknown } | null;
  const details = Array.isArray(body?.details) ? body.details.filter((d): d is string => typeof d === "string") : [];
  if (res.status === 409 && body?.error === "handle_required") return new AssetPublicationRequestError("handle-required");
  if (body?.error === "invalid_file") return new AssetPublicationRequestError("invalid-file", details);
  if (res.status === 429 || body?.error === "limit_reached") return new AssetPublicationRequestError("limit-reached");
  return new AssetPublicationRequestError("failed");
}

export function createAssetPublicationStore({
  api,
  account,
  characterAssets,
}: AssetPublicationDeps): AssetPublicationStore {
  const pending = new Map<string, Promise<AssetPublicationStatus | null>>();

  return createStore<AssetPublicationsState>()((set, get) => {
    const put = (assetId: string, status: AssetPublicationStatus | null): void =>
      set({ byAssetId: { ...get().byAssetId, [assetId]: status } });

    return {
      byAssetId: {},

      load: (assetId, force = false) => {
        const known = get().byAssetId;
        if (!force && assetId in known) return Promise.resolve(known[assetId] ?? null);
        const inFlight = pending.get(assetId);
        if (inFlight && !force) return inFlight;
        const promise = (async () => {
          const res = await api.request(`/api/character-assets/${assetId}/publication`);
          if (!res.ok) throw new AssetPublicationRequestError("failed");
          const { publication } = (await res.json()) as { publication: AssetPublicationStatus | null };
          put(assetId, publication ?? null);
          return publication ?? null;
        })();
        pending.set(assetId, promise);
        void promise
          .finally(() => {
            if (pending.get(assetId) === promise) pending.delete(assetId);
          })
          .catch(() => {});
        return promise;
      },

      submit: async (assetId, input) => {
        const storedHandle = account.getState().account?.publication_handle ?? null;
        if (!storedHandle && input.handle) {
          try {
            await claimPublicationHandle({ api, account }, input.handle);
          } catch (error) {
            const failure = error instanceof PublicationRequestError ? error.failure : "failed";
            throw new AssetPublicationRequestError(
              failure === "handle-taken" || failure === "handle-invalid" ? failure : "failed",
            );
          }
        }
        let bytes: Uint8Array;
        try {
          bytes = await characterAssets.getState().getBytes(assetId);
        } catch {
          throw new AssetPublicationRequestError("failed");
        }
        const res = await api.request(`/api/character-assets/${assetId}/publication`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name.trim().slice(0, ASSET_PUBLICATION_NAME_MAX_LENGTH),
            description: input.description.trim().slice(0, ASSET_PUBLICATION_DESCRIPTION_MAX_LENGTH),
            glbBase64: bytesToBase64(bytes),
            previewImage: null,
          }),
        });
        if (!res.ok) throw await failureOf(res);
        const { publication } = (await res.json()) as { publication: AssetPublicationStatus };
        put(assetId, publication);
        return publication;
      },

      withdraw: async (assetId) => {
        const res = await api.request(`/api/character-assets/${assetId}/publication`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) throw new AssetPublicationRequestError("failed");
        put(assetId, null);
      },

      reset: () => {
        pending.clear();
        set({ byAssetId: {} });
      },
    };
  });
}

/** The `characterAssets` message key of a submission's state label. */
export function assetPublicationStateKey(status: AssetPublicationStatus | null | undefined): string | null {
  if (!status) return null;
  if (status.state === "live") return "shareStateLive";
  if (status.state === "rejected") return "shareStateRejected";
  return "shareStateInReview";
}

/** The share dialog asks for input when never submitted (or withdrawn) and after a rejection. */
export function isAssetShareFormMode(status: AssetPublicationStatus | null | undefined): boolean {
  return !status || status.state === "rejected";
}

/** Whether the share dialog's submit is enabled. */
export function canSubmitAssetShare(input: {
  name: string;
  storedHandle: string | null;
  normalizedHandle: string;
  hasHandleProblem: boolean;
  isBusy: boolean;
}): boolean {
  return (
    !input.isBusy &&
    input.name.trim().length > 0 &&
    (input.storedHandle !== null || (input.normalizedHandle.length > 0 && !input.hasHandleProblem))
  );
}
