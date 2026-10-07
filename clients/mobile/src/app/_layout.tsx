// The polyfills run from the app entry (index.ts), before Expo Router loads
// any route; importing them here too is a no-op kept as a safety net.
import "@/polyfills";
import "@/global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { installArgon2, verifyArgon2Executor } from "@/adapters/argon2";
import { BackgroundBuildBridge } from "@/lib/background-build";
import { useAppFonts } from "@/lib/fonts";
import { LocaleProvider } from "@/lib/intl";
import { restoreSession, useSession } from "@/lib/session";
import { primeReduceMotion } from "@/lib/use-reduce-motion";

installArgon2();
if (__DEV__) void verifyArgon2Executor();
void SplashScreen.preventAutoHideAsync();
// Resolved while the splash shows, so the first animations already know it.
primeReduceMotion();

export default function RootLayout() {
  const isLoaded = useSession((s) => s.isLoaded);
  const areFontsLoaded = useAppFonts();

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (isLoaded && areFontsLoaded) void SplashScreen.hideAsync();
  }, [isLoaded, areFontsLoaded]);

  if (!isLoaded || !areFontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LocaleProvider>
          <StatusBar style="dark" />
          <BackgroundBuildBridge />
          <Stack screenOptions={{ headerShown: false }} />
        </LocaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
