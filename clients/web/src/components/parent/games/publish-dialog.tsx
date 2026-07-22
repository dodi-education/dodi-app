"use client";

/**
 * "Publish to dodi Discover" — the parent-facing end of the publication state
 * machine, opened from a game's actions menu.
 *
 * Publishing is the one moment a game leaves end-to-end encryption, so the flow
 * is explicit about it: the browser decrypts this game and posts the plaintext,
 * the platform stores it as a SEPARATE public copy, and a review pass checks it
 * before it goes live. The parent's own game and its version history stay sealed
 * and keep being editable — re-submitting replaces the copy and re-triggers
 * review.
 *
 * A first publish also asks for the account's public handle, because every real
 * name in dodi is encrypted and a listing can only credit a name the parent
 * deliberately chose for publication.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/shared/icon";
import { dodi } from "@/lib/api";
import { useAccountStore } from "@/stores/account-store";
import { useGameStore } from "@/stores/game-store";
import {
  PUBLICATION_HANDLE_MAX_LENGTH,
  normalizePublicationHandle,
  publicationHandleError,
} from "@dodi/protocol/publication-handle";
import { parseRejectionReasons } from "@dodi/protocol/publication-review";
import { toPublicationContent } from "@dodi/vault/game-crypto";
import type { Game } from "@dodi/types/database";

type PublicationState =
  | "none"
  | "in-review"
  | "changes-requested"
  | "rejected"
  | "published";

function stateOf(publication: Game | null): PublicationState {
  if (!publication) return "none";
  if (publication.published_at) return "published";
  if (publication.rejected_at) {
    return publication.rejection_kind === "hard" ? "rejected" : "changes-requested";
  }
  return "in-review";
}

/** Submit-error codes the platform returns that have parent-facing copy. */
const SUBMIT_ERROR_KEYS: Record<string, string> = {
  publication_limit_reached: "publishLimitReached",
  publication_hard_rejected: "publishHardBlocked",
};

interface PublishDialogProps {
  open: boolean;
  /** Stays set while the dialog animates closed, so the content doesn't blank out. */
  gameId: string | null;
  /** False while the game is still an unbuilt placeholder — nothing to publish. */
  built: boolean;
  onClose: () => void;
}

export function PublishDialog({ open, gameId, built, onClose }: PublishDialogProps) {
  const t = useTranslations("gameStudio");
  const account = useAccountStore((s) => s.account);
  const loadAccount = useAccountStore((s) => s.load);

  const [publication, setPublication] = useState<Game | null>(null);
  /** Which game `publication` describes — until it matches, we know nothing. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");

  useEffect(() => {
    if (open) void loadAccount();
  }, [open, loadAccount]);

  // Read the submission status each time the dialog opens — review may have
  // approved it since the parent last looked.
  useEffect(() => {
    if (!open || !gameId) return;
    let cancelled = false;
    dodi
      .request(`/api/games/${gameId}/publication`)
      .then((r) => (r.ok ? r.json() : { publication: null }))
      .then((d: { publication: Game | null }) => {
        if (cancelled) return;
        setPublication(d.publication ?? null);
        setError(null);
        setHandle("");
        setLoadedFor(gameId);
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(gameId);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gameId]);

  const loaded = loadedFor === gameId;

  // Until this game's status has loaded, show the neutral "not submitted" copy
  // rather than the previous game's badge.
  const state = loaded ? stateOf(publication) : "none";
  const storedHandle = account?.publication_handle ?? null;
  const normalized = normalizePublicationHandle(handle);
  const handleProblem = handle ? publicationHandleError(normalized) : null;

  const submit = useCallback(async () => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      // Claim the public byline first — the platform refuses a submission from
      // an account without one.
      if (!storedHandle) {
        const res = await dodi.request("/api/account/publication-handle", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: normalized }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            reason?: string;
          } | null;
          // Only 409/400 mean the name itself was rejected. Anything else is a
          // failed request — saying "that name can't be used" would blame the
          // parent for a server problem and send them renaming in circles.
          if (res.status === 409 || data?.reason === "taken") {
            throw new Error(t("publishHandleTaken"));
          }
          if (res.status === 400) throw new Error(t("publishHandleInvalid"));
          throw new Error(t("publishFailedGeneric"));
        }
        useAccountStore.getState().patchLocal({ publication_handle: normalized });
      }

      // Decrypt here and send plaintext: this is the disclosure the parent just
      // consented to. `loadOne` returns the decrypted row from the vault cache.
      const game = await useGameStore.getState().loadOne(gameId, undefined, true);
      if (!game) throw new Error(t("publishFailedGeneric"));

      const res = await dodi.request(`/api/games/${gameId}/publication`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPublicationContent(game)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        const errorKey = data?.error ? SUBMIT_ERROR_KEYS[data.error] : undefined;
        if (errorKey) throw new Error(t(errorKey));
        throw new Error(data?.error || t("publishFailedGeneric"));
      }
      const { publication: created } = (await res.json()) as {
        publication: Game;
      };
      setPublication(created);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("publishFailedGeneric"));
    } finally {
      setBusy(false);
    }
  }, [gameId, normalized, storedHandle, t]);

  const withdraw = useCallback(async () => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await dodi.request(`/api/games/${gameId}/publication`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(t("publishFailedGeneric"));
      setPublication(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("publishFailedGeneric"));
    } finally {
      setBusy(false);
    }
  }, [gameId, t]);

  const canSubmit =
    built && !busy && (storedHandle !== null || (!!normalized && !handleProblem));
  // A hard rejection is permanent — the platform refuses a resubmit anyway, so
  // don't offer one. Soft rejection keeps the button as the "fix and resubmit".
  const canResubmit = state !== "rejected";
  const rejectionReasons =
    state === "changes-requested" || state === "rejected"
      ? parseRejectionReasons(publication?.rejection_reasons ?? null)
      : [];

  const badgeClass =
    state === "published"
      ? "rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary"
      : state === "rejected"
        ? "rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger"
        : "rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning";
  const badgeLabel =
    state === "published"
      ? t("publishLive")
      : state === "rejected"
        ? t("publishRejected")
        : state === "changes-requested"
          ? t("publishChangesRequested")
          : t("publishInReview");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("publishTitle")}
            {state !== "none" && <span className={badgeClass}>{badgeLabel}</span>}
          </DialogTitle>
          <DialogDescription>
            {state === "none"
              ? t("publishDescription")
              : state === "changes-requested"
                ? t("publishReasonsIntro")
                : state === "rejected"
                  ? t("publishRejectedHardNotice")
                  : t("publishSubmitted")}
          </DialogDescription>
        </DialogHeader>

        {rejectionReasons.length > 0 && (
          <ul className="flex flex-col gap-2">
            {rejectionReasons.map((reason, i) => (
              <li
                key={`${reason.code}-${i}`}
                className={
                  state === "rejected"
                    ? "rounded-lg bg-danger-soft px-3 py-2 text-xs"
                    : "rounded-lg bg-warning-soft px-3 py-2 text-xs"
                }
              >
                <span
                  className={
                    state === "rejected"
                      ? "font-semibold text-danger"
                      : "font-semibold text-warning"
                  }
                >
                  {t(`publishReason_${reason.code}`)}
                </span>
                {reason.note && (
                  <p className="mt-0.5 text-muted-foreground">{reason.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {state === "none" && !storedHandle && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-2">
              {t("publishHandleLabel")}
            </label>
            <Input
              value={handle}
              placeholder={t("publishHandlePlaceholder")}
              // Stop at the limit rather than letting someone type a name they
              // can't have; the regex still guards paste and the API.
              maxLength={PUBLICATION_HANDLE_MAX_LENGTH}
              aria-invalid={handleProblem !== null || undefined}
              onChange={(e) => setHandle(e.target.value)}
            />
            <p className="text-[11px] text-faint">
              {handleProblem === "reserved"
                ? t("publishHandleReserved")
                : handleProblem === "format"
                  ? t("publishHandleFormat")
                  : t("publishHandleHint")}
            </p>
          </div>
        )}

        {!built && (
          <p className="text-xs text-muted-foreground">{t("publishNeedsBuild")}</p>
        )}

        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <DialogFooter>
          {state !== "none" && (
            <Button variant="outline" onClick={withdraw} disabled={busy}>
              {t("publishWithdraw")}
            </Button>
          )}
          {canResubmit && (
            <Button onClick={submit} disabled={!canSubmit || !loaded}>
              <Icon name="world_up" size={16} />
              {state === "none" ? t("publishSubmit") : t("publishResubmit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
