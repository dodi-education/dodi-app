"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";

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
      <div className="flex aspect-square w-full max-w-[260px] flex-col items-center justify-center gap-3 rounded-[22px] bg-muted px-6 text-center">
        <Icon name="camera" size={30} stroke={1.7} className="text-faint" />
        <div className="text-[13.5px] font-bold leading-relaxed text-muted-foreground">
          {message}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-[22px] bg-[radial-gradient(circle_at_50%_40%,#2c3f54,#1b2735)]">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute left-[18px] top-[18px] size-[30px] rounded-tl-[10px] border-l-[3.5px] border-t-[3.5px] border-white/90" />
      <span className="absolute right-[18px] top-[18px] size-[30px] rounded-tr-[10px] border-r-[3.5px] border-t-[3.5px] border-white/90" />
      <span className="absolute bottom-[18px] left-[18px] size-[30px] rounded-bl-[10px] border-b-[3.5px] border-l-[3.5px] border-white/90" />
      <span className="absolute bottom-[18px] right-[18px] size-[30px] rounded-br-[10px] border-b-[3.5px] border-r-[3.5px] border-white/90" />
      <div className="absolute bottom-3 left-0 right-0 px-6 text-center text-[13px] font-bold text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
        {t("scanHint")}
      </div>
    </div>
  );
}
