"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useTranslations } from "next-intl";

import { qrScanner } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

type ScanError = "denied" | "nocamera" | "unsupported";

interface QrScannerProps {
  /** Called once with the decoded QR text. The scanner stops after the first hit. */
  onDetected: (value: string) => void;
}

// Decode at most ~8×/sec; cap the analyzed frame width so it's light on tablets.
const DECODE_INTERVAL_MS = 120;
const MAX_FRAME_WIDTH = 640;

/**
 * Live camera QR scanner. Uses getUserMedia for the rear camera and jsQR to
 * decode frames in the browser (works on iOS Safari + desktop, unlike the native
 * BarcodeDetector). Cleans up the stream on unmount / first detection. Requires a
 * secure context (HTTPS or localhost), which dev already serves.
 */
export function QrScanner({ onDetected }: QrScannerProps) {
  const t = useTranslations("friends");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<ScanError | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let lastDecode = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function stop() {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    function tick(now: number) {
      if (done) return;
      const video = videoRef.current;
      if (video && ctx && video.readyState >= 2 && now - lastDecode >= DECODE_INTERVAL_MS) {
        lastDecode = now;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh) {
          const scale = Math.min(1, MAX_FRAME_WIDTH / vw);
          const w = Math.round(vw * scale);
          const h = Math.round(vh * scale);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);
          const found = jsQR(data, w, h, { inversionAttempts: "dontInvert" });
          if (found?.data) {
            const value = found.data;
            stop();
            onDetected(value);
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (done) {
          // Unmounted while awaiting permission — drop the just-opened stream.
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("denied");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("nocamera");
        } else {
          setError("unsupported");
        }
      }
    }

    void start();
    return stop;
  }, [onDetected]);

  if (error) {
    const message =
      error === "denied"
        ? t("scanDenied")
        : error === "nocamera"
          ? t("scanNoCamera")
          : t("scanUnsupported");
    return (
      <div className={cn(qrScanner.error, qrScanner.webError)}>
        <Icon name="camera" size={30} stroke={1.7} className="text-faint" />
        <div className={qrScanner.errorText}>
          {message}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(qrScanner.frame, qrScanner.webFrame)}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className={cn(qrScanner.corner, qrScanner.cornerTopLeft)} />
      <span className={cn(qrScanner.corner, qrScanner.cornerTopRight)} />
      <span className={cn(qrScanner.corner, qrScanner.cornerBottomLeft)} />
      <span className={cn(qrScanner.corner, qrScanner.cornerBottomRight)} />
      <div className={cn(qrScanner.hint, qrScanner.hintText, qrScanner.webHint)}>
        {t("scanHint")}
      </div>
    </div>
  );
}
