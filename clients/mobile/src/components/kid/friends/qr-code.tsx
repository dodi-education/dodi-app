import { Image, View } from "react-native";
import Svg, { Circle, G, Rect } from "react-native-svg";
import createQr from "qrcode-generator";
import { qrCode } from "@dodi/ui-recipes";

interface QrCodeProps {
  /** The text/URL to encode. Empty renders a blank placeholder. */
  value: string;
  size?: number;
}

/**
 * A real, scannable QR code in dodi's style (web: components/kid/friends/qr-code):
 * rounded data dots, rounded finder eyes and the dodi head as the center logo.
 * Error-correction level H (~30% recoverable) leaves room for the badge.
 */
export function QrCode({ value, size = 200 }: QrCodeProps) {
  if (!value) {
    return <View className={qrCode.placeholder} style={{ width: size, height: size }} />;
  }

  const qr = createQr(0, "H");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();

  // Fit the code + quiet zone into `size`.
  const total = count + qrCode.quiet * 2;
  const m = size / total;
  const off = qrCode.quiet * m;

  // The three 7×7 finder patterns are drawn as stylized eyes; skip their modules.
  const isFinder = (r: number, c: number) => {
    const inBox = (R: number, C: number) => r >= R && r < R + 7 && c >= C && c < C + 7;
    return inBox(0, 0) || inBox(0, count - 7) || inBox(count - 7, 0);
  };

  const dots: { x: number; y: number }[] = [];
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
  const badge = size * qrCode.badge;
  // White halo so dots clear the round badge; slightly larger than the badge.
  const halo = badge / 2 + m * 0.6;
  const ink = qrCode.ink;
  const paper = qrCode.paper;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image">
      <Svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {dots.map((d, i) => (
          <Rect
            key={i}
            x={d.x + m * 0.1}
            y={d.y + m * 0.1}
            width={m * 0.8}
            height={m * 0.8}
            rx={m * 0.22}
            fill={ink}
          />
        ))}
        {finders.map((f, i) => (
          <G key={`f${i}`}>
            <Rect x={f.x} y={f.y} width={m * 7} height={m * 7} rx={m * 1.4} fill={ink} />
            <Rect x={f.x + m} y={f.y + m} width={m * 5} height={m * 5} rx={m * 0.9} fill={paper} />
            <Rect x={f.x + m * 2} y={f.y + m * 2} width={m * 3} height={m * 3} rx={m * 0.6} fill={ink} />
          </G>
        ))}
        <Circle cx={center} cy={center} r={halo} fill={paper} />
      </Svg>
      <View
        className="absolute items-center justify-center overflow-hidden rounded-full bg-white"
        style={{
          width: badge,
          height: badge,
          left: center - badge / 2,
          top: center - badge / 2,
          borderWidth: 3,
          borderColor: ink,
        }}
      >
        <Image
          source={require("../../../../assets/images/dodi-head-active.png")}
          accessibilityLabel="dodi"
          resizeMode="contain"
          style={{ width: "100%", height: "100%", transform: [{ scale: 1.1 }] }}
        />
      </View>
    </View>
  );
}
