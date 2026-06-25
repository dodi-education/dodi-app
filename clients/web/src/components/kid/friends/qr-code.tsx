import Image from "next/image";
import qrcode from "qrcode-generator";

const INK = "#22384E";
/** Quiet zone (margin) around the code, in modules — the QR spec asks for ≥4. */
const QUIET = 4;

interface QrCodeProps {
  /** The text/URL to encode. Empty renders a blank placeholder. */
  value: string;
  size?: number;
}

/**
 * A real, scannable QR code in Dodi's visual style: rounded data dots, rounded
 * finder eyes, and the Dodi head as a center logo. Error-correction level H
 * (~30% recoverable) gives the center badge enough headroom that it never
 * breaks the code. `value` is typically a deep link (e.g. `…/friends?add=<code>`).
 */
export function QrCode({ value, size = 200 }: QrCodeProps) {
  if (!value) {
    return (
      <span
        className="inline-block rounded-[14px] bg-muted"
        style={{ width: size, height: size }}
      />
    );
  }

  const qr = qrcode(0, "H");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();

  // Fit the code + quiet zone into `size`.
  const total = count + QUIET * 2;
  const m = size / total;
  const off = QUIET * m;

  // The three finder patterns (7×7) are rendered as stylized eyes; skip their
  // modules in the dot pass so they don't double-draw.
  const isFinder = (r: number, c: number) => {
    const inBox = (R: number, C: number) =>
      r >= R && r < R + 7 && c >= C && c < C + 7;
    return inBox(0, 0) || inBox(0, count - 7) || inBox(count - 7, 0);
  };

  const dots: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c) || isFinder(r, c)) continue;
      dots.push({ x: off + c * m, y: off + r * m });
    }
  }

  const finders = [
    { x: off, y: off },
    { x: off + (count - 7) * m, y: off },
    { x: off, y: off + (count - 7) * m },
  ];

  const center = size / 2;
  const badge = size * 0.28;
  // White halo so dots clear the round badge; slightly larger than the badge.
  const halo = badge / 2 + m * 0.6;

  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block">
        {dots.map((d, i) => (
          <rect
            key={i}
            x={d.x + m * 0.1}
            y={d.y + m * 0.1}
            width={m * 0.8}
            height={m * 0.8}
            rx={m * 0.22}
            fill={INK}
          />
        ))}
        {finders.map((f, i) => (
          <g key={`f${i}`}>
            <rect x={f.x} y={f.y} width={m * 7} height={m * 7} rx={m * 1.4} fill={INK} />
            <rect x={f.x + m} y={f.y + m} width={m * 5} height={m * 5} rx={m * 0.9} fill="#fff" />
            <rect x={f.x + m * 2} y={f.y + m * 2} width={m * 3} height={m * 3} rx={m * 0.6} fill={INK} />
          </g>
        ))}
        <circle cx={center} cy={center} r={halo} fill="#fff" />
      </svg>
      <span
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-white"
        style={{ width: badge, height: badge, border: `3px solid ${INK}` }}
      >
        <Image
          src="/images/dodi-head-active.png"
          alt="Dodi"
          width={Math.round(badge)}
          height={Math.round(badge)}
          className="h-full w-full scale-[1.1] object-contain"
        />
      </span>
    </span>
  );
}
