"use client";

/**
 * "Publish to dodi Discover" — the parent-facing end of the publication state
 * machine.
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
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/shared/icon";
import { dodi } from "@/lib/api";
import { useAccountStore } from "@/stores/account-store";
import { useGameStore } from "@/stores/game-store";
import {
  normalizePublicationHandle,
  publicationHandleError,
} from "@dodi/protocol/publication-handle";
import { toPublicationContent } from "@dodi/vault/game-crypto";
import type { Game } from "@dodi/types/database";

type PublicationState = "none" | "in-review" | "published";

function stateOf(publication: Game | null): PublicationState {
  if (!publication) return "none";
  return publication.published_at ? "published" : "in-review";
}

interface PublishCardProps {
  gameId: string;
  /** False while the game is still an unbuilt placeholder — nothing to publish. */
  built: boolean;
}

export function PublishCard({ gameId, built }: PublishCardProps) {
  const t = useTranslations("gameStudio");
  const account = useAccountStore((s) => s.account);
  const loadAccount = useAccountStore((s) => s.load);

  const [publication, setPublication] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    let cancelled = false;
    dodi
      .request(`/api/games/${gameId}/publication`)
      .then((r) => (r.ok ? r.json() : { publication: null }))
      .then((d: { publication: Game | null }) => {
        if (cancelled) return;
        setPublication(d.publication ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const state = stateOf(publication);
  const storedHandle = account?.publication_handle ?? null;
  const normalized = normalizePublicationHandle(handle);
  const handleProblem = handle ? publicationHandleError(normalized) : null;

  const submit = useCallback(async () => {
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
          throw new Error(
            data?.reason === "taken"
              ? t("publishHandleTaken")
              : t("publishHandleInvalid"),
          );
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

  if (!loaded) return null;

  const canSubmit =
    built && !busy && (storedHandle !== null || (!!normalized && !handleProblem));

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <Icon name="upload" size={16} className="text-ink-2" />
        <h3 className="text-xs font-semibold text-ink-2">{t("publishTitle")}</h3>
        {state !== "none" && (
          <span
            className={
              state === "published"
                ? "rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary"
                : "rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning"
            }
          >
            {state === "published" ? t("publishLive") : t("publishInReview")}
          </span>
        )}
      </div>

      <p className="text-[11px] text-faint">
        {state === "none" ? t("publishDescription") : t("publishSubmitted")}
      </p>

      {state === "none" && !storedHandle && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-2">
            {t("publishHandleLabel")}
          </label>
          <Input
            value={handle}
            placeholder={t("publishHandlePlaceholder")}
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
        <p className="text-[11px] text-faint">{t("publishNeedsBuild")}</p>
      )}

      {error && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={submit}
          disabled={!canSubmit}
        >
          <Icon name="upload" size={16} />
          {state === "none" ? t("publishSubmit") : t("publishResubmit")}
        </Button>
        {state !== "none" && (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={withdraw}
            disabled={busy}
          >
            {t("publishWithdraw")}
          </Button>
        )}
      </div>
    </div>
  );
}
