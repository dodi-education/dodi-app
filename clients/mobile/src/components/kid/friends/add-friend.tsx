import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  MIN_HANDLE_LENGTH,
  formatHandle,
  friendErrorKey,
  friendShareUrl,
  normalizeHandle,
  parseScannedCode,
} from "@dodi/client-state/friends";
import { addFriend as a, input as inputRecipe, friendProfile } from "@dodi/ui-recipes";

import { Icon, type IconName } from "@/components/ui";
import { useAnnounceOnIos } from "@/lib/announce";
import { cn } from "@/lib/cn";
import { APP_URL } from "@/lib/env";
import { fontFamilyFor } from "@/lib/fonts";

import { KidButton } from "../kid-button";
import { kidShadowStyle } from "../kid-shadow";
import { KidText } from "../kid-text";
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

const SEGMENTS: { key: Seg; labelKey: "segTag" | "segScan" | "segCode"; icon: IconName }[] = [
  { key: "tag", labelKey: "segTag", icon: "user_plus" },
  { key: "scan", labelKey: "segScan", icon: "camera" },
  { key: "code", labelKey: "segCode", icon: "qrcode" },
];

/** A kid text field (web: rounded-2xl muted input, white + primary border when focused). */
function KidInput({
  inputRef,
  isFocused,
  sizeClass,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  inputRef?: React.Ref<TextInput>;
  isFocused: boolean;
  sizeClass: string;
}) {
  const classes = cn(a.input, sizeClass, isFocused && a.inputFocused, "font-kid");
  return (
    <TextInput
      ref={inputRef}
      placeholderTextColor={inputRecipe.placeholderColor}
      className={classes}
      style={{ fontFamily: fontFamilyFor(classes) }}
      {...props}
    />
  );
}

/** Add a friend by code, by scanning, or show my code (web: components/kid/friends/add-friend). */
export function AddFriend({ myHandle, busy, initialCode, onBack, onSendRequest, resolveName }: AddFriendProps) {
  const t = useTranslations("friends");
  const myTag = formatHandle(myHandle);
  const [seg, setSeg] = useState<Seg>("tag");
  const [isCopied, setIsCopied] = useState(false);
  const [tag, setTag] = useState(initialCode ? normalizeHandle(initialCode) : "");
  const [nickname, setNickname] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // TalkBack reads the live regions below; VoiceOver hears the same here.
  useAnnounceOnIos(sent ? t("sentTitle") : error);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focused, setFocused] = useState<"tag" | "nickname" | null>(null);
  const tagInputRef = useRef<TextInput>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Land on "Add by code" with the code field ready to type.
  useEffect(() => {
    if (seg === "tag") tagInputRef.current?.focus();
  }, [seg]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // The QR encodes the web app's deep link, so a phone camera opens it anywhere.
  const shareUrl = friendShareUrl(APP_URL, myHandle);

  function switchSeg(next: Seg): void {
    setSeg(next);
    setSent(null);
    setError(null);
  }

  function copyTag(): void {
    setIsCopied(true);
    void Clipboard.setStringAsync(myTag).catch(() => {});
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setIsCopied(false), 1600);
  }

  // Stable so the scanner isn't remounted on every render.
  const handleScan = useCallback((value: string) => {
    const code = parseScannedCode(value);
    if (!code) return;
    setTag(code);
    setError(null);
    setSeg("tag"); // hop to the form so they can add a nickname and send
  }, []);

  const trimmedNickname = nickname.trim();

  async function submit(): Promise<void> {
    const clean = normalizeHandle(tag);
    if (clean.length < MIN_HANDLE_LENGTH || trimmedNickname.length === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSendRequest(clean, trimmedNickname);
      setSent(trimmedNickname);
      setTag("");
      setNickname("");
    } catch (e) {
      // Prefer the existing relationship's real name; fall back to the typed nickname.
      const name = resolveName?.(clean) || trimmedNickname;
      setError(t(friendErrorKey(e), { name }));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSendDisabled =
    normalizeHandle(tag).length < MIN_HANDLE_LENGTH || trimmedNickname.length === 0 || isSubmitting || busy;
  const cardShadow = kidShadowStyle("card");

  return (
    <View className={a.root}>
      <View className="flex-row">
        <KidButton variant="back" size="sm" icon="arrow_left" iconStroke={2.2} onPress={onBack} className={friendProfile.back}>
          {t("kidBack")}
        </KidButton>
      </View>
      <KidText className={a.title} accessibilityRole="header">
        {t("addTitle")}
      </KidText>

      <View className={a.segments} accessibilityRole="tablist">
        {SEGMENTS.map((s) => {
          const isActive = seg === s.key;
          return (
            <Pressable
              hitSlop={{ top: 3, bottom: 3 }}
              key={s.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => switchSeg(s.key)}
              className={cn(a.segment, isActive && a.segmentActive)}
              style={isActive ? kidShadowStyle("segment") : undefined}
            >
              <Icon name={s.icon} size={16} stroke={2} color={isActive ? "primary" : "muted-foreground"} />
              <KidText className={cn(a.segmentText, isActive ? a.segmentActiveText : a.segmentIdleText)} numberOfLines={1}>
                {t(s.labelKey)}
              </KidText>
            </Pressable>
          );
        })}
      </View>

      {sent ? (
        <View className={a.card} style={cardShadow}>
          <View className={a.sentIcon}>
            <Icon name="check" size={30} stroke={2.6} color="success" />
          </View>
          <KidText className={a.sentTitle} accessibilityLiveRegion="polite">
            {t("sentTitle")}
          </KidText>
          <KidText className={cn(a.sentSub, a.textAlign)}>{t("sentSub", { name: sent })}</KidText>
          <KidButton
            variant="ghost"
            size="sm"
            icon="user_plus"
            iconSize={14}
            iconStroke={2.2}
            className={a.spaced}
            onPress={() => setSent(null)}
          >
            {t("addAnother")}
          </KidButton>
        </View>
      ) : seg === "code" ? (
        <View className={a.card} style={cardShadow}>
          <View className={a.qrFrame}>
            <QrCode value={shareUrl} size={208} accessibilityLabel={t("segCode")} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isCopied ? t("copied") : myTag}
            onPress={copyTag}
            hitSlop={6}
            className={cn(a.code, "active:bg-primary-soft-2")}
          >
            <KidText className={cn(a.codeText, "font-mono")}>{myTag}</KidText>
            <Icon name={isCopied ? "check" : "copy"} size={14} stroke={isCopied ? 3 : 2} color="primary" />
          </Pressable>
          <KidText className={cn(a.hint, a.textAlign)}>{t("myCodeHint")}</KidText>
          <KidButton variant="play" icon="share" iconStroke={2} className={a.spaced} onPress={copyTag}>
            {isCopied ? t("copied") : t("shareCode")}
          </KidButton>
        </View>
      ) : seg === "scan" ? (
        <View className={a.card} style={cardShadow}>
          <QrScanner onDetected={handleScan} />
          <KidButton
            variant="ghost"
            size="sm"
            icon="user_plus"
            iconSize={14}
            iconStroke={2.2}
            className={a.scanAlt}
            onPress={() => switchSeg("tag")}
          >
            {t("typeCodeInstead")}
          </KidButton>
        </View>
      ) : (
        <View className={cn(a.card, a.cardStretch)} style={cardShadow}>
          <KidText className={cn(a.tagLabel, a.fieldLabel)}>{t("tagLabel")}</KidText>
          <KidInput
            inputRef={tagInputRef}
            value={tag}
            onChangeText={(value) => {
              setTag(value.replace(/@/g, "").toUpperCase());
              if (error) setError(null);
            }}
            onSubmitEditing={() => void submit()}
            accessibilityLabel={t("tagLabel")}
            placeholder={t("tagPlaceholder")}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="next"
            isFocused={focused === "tag"}
            onFocus={() => setFocused("tag")}
            onBlur={() => setFocused(null)}
            sizeClass={a.tagInput}
          />
          <KidText className={cn(a.hint, a.tagHint, a.textAlign)}>{t("tagHint")}</KidText>
          <KidText className={cn(a.nicknameLabel, a.fieldLabel)}>{t("nicknameLabel")}</KidText>
          <KidInput
            value={nickname}
            onChangeText={(value) => {
              setNickname(value);
              if (error) setError(null);
            }}
            onSubmitEditing={() => void submit()}
            accessibilityLabel={t("nicknameLabel")}
            placeholder={t("nicknamePlaceholder")}
            maxLength={60}
            returnKeyType="send"
            isFocused={focused === "nickname"}
            onFocus={() => setFocused("nickname")}
            onBlur={() => setFocused(null)}
            sizeClass={a.nicknameInput}
          />
          {error ? (
            <KidText className={cn(a.error, a.textAlign)} accessibilityLiveRegion="polite">
              {error}
            </KidText>
          ) : null}
          <KidButton
            variant="play"
            icon="send"
            iconStroke={2.2}
            className={a.send}
            onPress={() => void submit()}
            disabled={isSendDisabled}
          >
            {isSubmitting ? t("sending") : t("sendRequest")}
          </KidButton>
        </View>
      )}
    </View>
  );
}
