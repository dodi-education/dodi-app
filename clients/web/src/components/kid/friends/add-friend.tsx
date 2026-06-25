"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { KidButton } from "@/components/kid/kid-button";
import { Icon } from "@/components/shared/icon";
import type { IconName } from "@/components/shared/icon";
import {
  FriendsError,
  formatHandle,
  normalizeHandle,
  parseScannedCode,
} from "@/lib/friends";

import { QrCode } from "./qr-code";
import { QrScanner } from "./qr-scanner";

type Seg = "code" | "scan" | "tag";

interface AddFriendProps {
  myHandle: string | null;
  busy: boolean;
  /** Friend code to pre-fill (e.g. arriving via a scanned `?add=` deep link). */
  initialCode?: string;
  onBack: () => void;
  /** Resolves on success; throws FriendsError with a message on failure. */
  onSendRequest: (handle: string, nickname: string) => Promise<void>;
  /** Best-known display name for an existing relationship with a handle (for error copy). */
  resolveName?: (handle: string) => string | null;
}

const SEGMENTS: Array<{ key: Seg; labelKey: string; icon: IconName }> = [
  { key: "code", labelKey: "segCode", icon: "qrcode" },
  { key: "scan", labelKey: "segScan", icon: "camera" },
  { key: "tag", labelKey: "segTag", icon: "user_plus" },
];

const CARD = "flex flex-col items-center rounded-[26px] bg-white px-6 py-[26px] shadow-[0_4px_18px_rgba(34,56,78,0.06)]";

export function AddFriend({
  myHandle,
  busy,
  initialCode,
  onBack,
  onSendRequest,
  resolveName,
}: AddFriendProps) {
  const t = useTranslations("friends");
  const myTag = formatHandle(myHandle);
  const [seg, setSeg] = useState<Seg>(initialCode ? "tag" : "code");
  const [copied, setCopied] = useState(false);
  const [tag, setTag] = useState(initialCode ? normalizeHandle(initialCode) : "");
  const [nickname, setNickname] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The QR encodes an absolute deep link, so it needs the runtime origin —
  // resolved after mount (empty on the server) to keep hydration stable. The
  // setState is deferred off the effect tick to avoid the cascading-render lint.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setOrigin(window.location.origin);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const shareUrl =
    myHandle && origin
      ? `${origin}/friends?add=${encodeURIComponent(myHandle)}`
      : "";

  function switchSeg(next: Seg) {
    setSeg(next);
    setSent(null);
    setError(null);
  }

  function copyTag() {
    setCopied(true);
    try {
      void navigator.clipboard?.writeText(myTag);
    } catch {
      // clipboard unavailable
    }
    window.setTimeout(() => setCopied(false), 1600);
  }

  // Stable so the scanner's camera effect isn't torn down on every render.
  const handleScan = useCallback((value: string) => {
    const code = parseScannedCode(value);
    if (!code) return;
    setTag(code);
    setError(null);
    setSeg("tag"); // hop to the form so they can add a nickname and send
  }, []);

  const trimmedNickname = nickname.trim();

  // Map a server error code (or 404 / locked vault) to localized, kid-friendly copy.
  function friendlyError(e: unknown, name: string): string {
    if (e instanceof FriendsError) {
      if (e.status === 404) return t("errorNotFound");
      switch (e.message) {
        case "already_friends":
          return t("errorAlreadyFriends", { name });
        case "request_exists":
          return t("errorRequestExists", { name });
        case "friendship_blocked":
          return t("errorBlocked", { name });
        case "cannot_initiate":
          return t("errorNotAllowed");
        case "cannot_add_self":
          return t("errorSelf");
        case "target_unavailable":
          return t("errorNotFound");
        default:
          return t("errorGeneric");
      }
    }
    if (e instanceof Error && e.message === "locked") return t("errorVaultLocked");
    return t("errorGeneric");
  }

  async function submit() {
    const clean = normalizeHandle(tag);
    if (clean.length < 3 || trimmedNickname.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSendRequest(clean, trimmedNickname);
      setSent(trimmedNickname);
      setTag("");
      setNickname("");
    } catch (e) {
      // Prefer the existing relationship's real name; fall back to the typed nickname.
      const name = resolveName?.(clean) || trimmedNickname;
      setError(friendlyError(e, name));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[460px] px-5 pb-8">
      <KidButton variant="back" size="sm" onClick={onBack} className="pl-3">
        <Icon name="arrow_left" stroke={2.2} />
        {t("profileBack")}
      </KidButton>
      <h1 className="mb-4 mt-1 text-2xl font-extrabold tracking-tight text-ink">
        {t("addTitle")}
      </h1>

      <div className="mb-[18px] flex gap-1 rounded-2xl bg-white/70 p-[5px]">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => switchSeg(s.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-[11px] text-[13.5px] font-extrabold transition-colors ${
              seg === s.key
                ? "bg-white text-primary shadow-[0_2px_8px_rgba(34,56,78,0.08)]"
                : "text-muted-foreground"
            }`}
          >
            <Icon name={s.icon} size={16} stroke={2} />
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {sent ? (
        <div className={CARD}>
          <div className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <Icon name="check" size={30} stroke={2.6} />
          </div>
          <div className="mt-3.5 text-xl font-extrabold text-ink">
            {t("sentTitle")}
          </div>
          <div className="mt-2 max-w-[320px] text-center text-sm font-semibold leading-relaxed text-muted-foreground">
            {t("sentSub", { name: sent })}
          </div>
          <KidButton
            variant="ghost"
            size="sm"
            className="mt-[18px]"
            onClick={() => setSent(null)}
          >
            <Icon name="user_plus" size={14} stroke={2.2} />
            {t("addAnother")}
          </KidButton>
        </div>
      ) : seg === "code" ? (
        <div className={CARD}>
          <div className="rounded-[20px] border-2 border-border bg-white p-4">
            <QrCode value={shareUrl} size={208} />
          </div>
          <button
            type="button"
            onClick={copyTag}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-2 font-mono text-sm font-bold text-primary transition-colors hover:bg-primary-soft-2"
          >
            {myTag}
            <Icon name={copied ? "check" : "copy"} size={14} stroke={copied ? 3 : 2} />
          </button>
          <div className="mt-4 max-w-[300px] text-center text-[13.5px] font-semibold leading-relaxed text-muted-foreground">
            {t("myCodeHint")}
          </div>
          <KidButton variant="play" className="mt-[18px]" onClick={copyTag}>
            <Icon name="share" stroke={2} />
            {copied ? t("copied") : t("shareCode")}
          </KidButton>
        </div>
      ) : seg === "scan" ? (
        <div className={CARD}>
          <QrScanner onDetected={handleScan} />
          <KidButton
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => switchSeg("tag")}
          >
            <Icon name="user_plus" size={14} stroke={2.2} />
            {t("typeCodeInstead")}
          </KidButton>
        </div>
      ) : (
        <div className={`${CARD} items-stretch`}>
          <div className="mb-2.5 text-sm font-extrabold text-ink-2">
            {t("tagLabel")}
          </div>
          <input
            value={tag}
            onChange={(e) => {
              setTag(e.target.value.replace(/@/g, ""));
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={t("tagPlaceholder")}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="rounded-2xl border-2 border-border-strong bg-muted px-4 py-3.5 text-center font-mono text-[17px] font-bold text-ink outline-none focus:border-primary focus:bg-white"
          />
          <div className="mt-4 self-center max-w-[300px] text-center text-[13.5px] font-semibold leading-relaxed text-muted-foreground">
            {t("tagHint", { example: "k4f9q2tz" })}
          </div>
          <div className="mb-1 mt-4 text-sm font-extrabold text-ink-2">
            {t("nicknameLabel")}
          </div>
          <input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={t("nicknamePlaceholder")}
            maxLength={60}
            className="rounded-2xl border-2 border-border-strong bg-muted px-4 py-3 text-center text-[15px] font-bold text-ink outline-none focus:border-primary focus:bg-white"
          />
          {error ? (
            <div className="mt-2 text-center text-[13.5px] font-bold text-danger">
              {error}
            </div>
          ) : null}
          <KidButton
            variant="play"
            className="mt-[18px] self-center"
            onClick={() => void submit()}
            disabled={
              normalizeHandle(tag).length < 3 ||
              trimmedNickname.length === 0 ||
              submitting ||
              busy
            }
          >
            <Icon name="send" stroke={2.2} />
            {submitting ? t("sending") : t("sendRequest")}
          </KidButton>
        </div>
      )}
    </div>
  );
}
