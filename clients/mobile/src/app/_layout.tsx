// Must stay first: crypto and streaming fetch before anything uses them.
import "@/polyfills";
import "@/global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { installArgon2, verifyArgon2Executor } from "@/adapters/argon2";
import { LocaleProvider } from "@/lib/intl";
import { restoreSession, useSession } from "@/lib/session";

installArgon2();
if (__DEV__) void verifyArgon2Executor();
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const isLoaded = useSession((s) => s.isLoaded);

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (isLoaded) void SplashScreen.hideAsync();
  }, [isLoaded]);

  if (!isLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LocaleProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </LocaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
