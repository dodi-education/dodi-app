import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { qrScanner as q } from "@dodi/ui-recipes";

import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

import { KidText } from "../kid-text";

interface QrScannerProps {
  /** Called once with the decoded QR text. The scanner stops after the first hit. */
  onDetected: (value: string) => void;
}

/**
 * Live camera QR scanner (web: components/kid/friends/qr-scanner, getUserMedia
 * + jsQR): the rear camera through expo-camera's native barcode scanner, the
 * same framed square with corner marks and hint. Asks for the camera on first
 * use; a refusal shows the web's "camera access is off" message.
 */
export function QrScanner({ onDetected }: QrScannerProps) {
  const t = useTranslations("friends");
  const [permission, requestPermission] = useCameraPermissions();
  const isDone = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View className={q.error}>
        <Icon name="camera" size={30} stroke={1.7} color="faint" />
        <KidText className={cn(q.errorText, "text-center")}>{t("scanDenied")}</KidText>
      </View>
    );
  }

  return (
    <View className={cn(q.frame, q.frameFill)}>
      {permission?.granted ? (
        <CameraView
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (isDone.current || !data) return;
            isDone.current = true;
            onDetected(data);
          }}
          accessibilityLabel={t("scanHint")}
        />
      ) : null}
      <View className={cn(q.corner, q.cornerTopLeft)} />
      <View className={cn(q.corner, q.cornerTopRight)} />
      <View className={cn(q.corner, q.cornerBottomLeft)} />
      <View className={cn(q.corner, q.cornerBottomRight)} />
      <View className={q.hint}>
        <KidText
          className={cn(q.hintText, "text-center")}
          style={{ textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}
        >
          {t("scanHint")}
        </KidText>
      </View>
    </View>
  );
}
