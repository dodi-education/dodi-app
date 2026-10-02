/**
 * The web's typefaces: Hanken Grotesk (the app, `font-sans`) and Nunito (the
 * kid view, `font-kid`). Custom fonts on Android render only the weight they
 * were built for, so `Text` picks the face from the weight class instead of
 * relying on fontWeight.
 */
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { useFonts } from "expo-font";
import { Platform } from "react-native";

export const FONT_ASSETS = {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
};

export function useAppFonts(): boolean {
  const [isLoaded] = useFonts(FONT_ASSETS);
  return isLoaded;
}

const WEIGHTS: Record<string, number> = {
  "font-normal": 400,
  "font-medium": 500,
  "font-semibold": 600,
  "font-bold": 700,
  "font-extrabold": 800,
};

const HANKEN: Record<number, string> = {
  400: "HankenGrotesk_400Regular",
  500: "HankenGrotesk_500Medium",
  600: "HankenGrotesk_600SemiBold",
  700: "HankenGrotesk_700Bold",
  800: "HankenGrotesk_700Bold",
};

const NUNITO: Record<number, string> = {
  400: "Nunito_400Regular",
  500: "Nunito_500Medium",
  600: "Nunito_600SemiBold",
  700: "Nunito_700Bold",
  800: "Nunito_800ExtraBold",
};

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/** The font face for a class list (last weight class wins, as in CSS). */
export function fontFamilyFor(className: string | undefined): string {
  const tokens = (className ?? "").split(/\s+/);
  if (tokens.includes("font-mono")) return MONO;
  let weight = 400;
  for (const token of tokens) if (token in WEIGHTS) weight = WEIGHTS[token];
  return (tokens.includes("font-kid") ? NUNITO : HANKEN)[weight];
}
