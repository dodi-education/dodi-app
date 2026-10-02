"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  MIN_HANDLE_LENGTH,
  friendErrorKey,
  friendShareUrl,
} from "@dodi/client-state/friends";
import { addFriend, friendProfile } from "@dodi/ui-recipes";

import { KidButton } from "@/components/kid/kid-button";
import { Icon } from "@/components/shared/icon";
import type { IconName } from "@/components/shared/icon";
import {
  formatHandle,
  normalizeHandle,
  parseScannedCode,
} from "@/lib/friends";
import { cn } from "@/lib/utils";

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
  { key: "tag", labelKey: "segTag", icon: "user_plus" },
  { key: "scan", labelKey: "segScan", icon: "camera" },
  { key: "code", labelKey: "segCode", icon: "qrcode" },
];

const CARD = cn(addFriend.card, addFriend.webCard);

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
  const [seg, setSeg] = useState<Seg>("tag");
  const [copied, setCopied] = useState(false);
  const [tag, setTag] = useState(initialCode ? normalizeHandle(initialCode) : "");
  const [nickname, setNickname] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Land on the "Add by code" tab with the code field ready to type. Re-runs when
  // switching back to this tab; the ref is null while another panel is shown, so
  // the focus call is a safe no-op there.
  useEffect(() => {
    if (seg === "tag") tagInputRef.current?.focus();
  }, [seg]);

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
  const shareUrl = friendShareUrl(origin, myHandle);

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
    return t(friendErrorKey(e), { name });
  }

  async function submit() {
    const clean = normalizeHandle(tag);
    if (clean.length < MIN_HANDLE_LENGTH || trimmedNickname.length === 0) return;
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
    <div className={addFriend.root}>
      <KidButton variant="back" size="sm" onClick={onBack} className={friendProfile.back}>
        <Icon name="arrow_left" stroke={2.2} />
        {t("kidBack")}
      </KidButton>
      <h1 className={addFriend.title}>
        {t("addTitle")}
      </h1>

      <div className={cn(addFriend.segments, addFriend.webSegments)}>
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => switchSeg(s.key)}
            className={cn(
              addFriend.segment,
              addFriend.segmentText,
              addFriend.webSegment,
              seg === s.key
                ? [
                    addFriend.segmentActive,
                    addFriend.segmentActiveText,
                    addFriend.webSegmentActive,
                  ]
                : addFriend.segmentIdleText,
            )}
          >
            <Icon name={s.icon} size={16} stroke={2} />
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {sent ? (
        <div className={CARD}>
          <div className={cn(addFriend.sentIcon, addFriend.webSentIcon)}>
            <Icon name="check" size={30} stroke={2.6} />
          </div>
          <div className={addFriend.sentTitle}>
            {t("sentTitle")}
          </div>
          <div className={cn(addFriend.sentSub, addFriend.textAlign)}>
            {t("sentSub", { name: sent })}
          </div>
          <KidButton
            variant="ghost"
            size="sm"
            className={addFriend.spaced}
            onClick={() => setSent(null)}
          >
            <Icon name="user_plus" size={14} stroke={2.2} />
            {t("addAnother")}
          </KidButton>
        </div>
      ) : seg === "code" ? (
        <div className={CARD}>
          <div className={addFriend.qrFrame}>
            <QrCode value={shareUrl} size={208} />
          </div>
          <button
            type="button"
            onClick={copyTag}
            className={cn(addFriend.code, addFriend.codeText, addFriend.webCode)}
          >
            {myTag}
            <Icon name={copied ? "check" : "copy"} size={14} stroke={copied ? 3 : 2} />
          </button>
          <div className={cn(addFriend.hint, addFriend.textAlign)}>
            {t("myCodeHint")}
          </div>
          <KidButton variant="play" className={addFriend.spaced} onClick={copyTag}>
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
            className={addFriend.scanAlt}
            onClick={() => switchSeg("tag")}
          >
            <Icon name="user_plus" size={14} stroke={2.2} />
            {t("typeCodeInstead")}
          </KidButton>
        </div>
      ) : (
        <div className={cn(CARD, addFriend.cardStretch)}>
          <div className={cn(addFriend.tagLabel, addFriend.fieldLabel)}>
            {t("tagLabel")}
          </div>
          <input
            ref={tagInputRef}
            value={tag}
            onChange={(e) => {
              setTag(e.target.value.replace(/@/g, "").toUpperCase());
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={t("tagPlaceholder")}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={cn(addFriend.input, addFriend.tagInput, addFriend.webInput)}
          />
          <div className={cn(addFriend.hint, addFriend.tagHint, addFriend.textAlign)}>
            {t("tagHint")}
          </div>
          <div className={cn(addFriend.nicknameLabel, addFriend.fieldLabel)}>
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
            className={cn(addFriend.input, addFriend.nicknameInput, addFriend.webInput)}
          />
          {error ? (
            <div className={cn(addFriend.error, addFriend.textAlign)}>
              {error}
            </div>
          ) : null}
          <KidButton
            variant="play"
            className={addFriend.send}
            onClick={() => void submit()}
            disabled={
              normalizeHandle(tag).length < MIN_HANDLE_LENGTH ||
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
