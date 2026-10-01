import type { ExpoConfig } from "expo/config";

/**
 * Expo config. Environment (EXPO_PUBLIC_*) is read by Expo from .env.local at
 * build time; see .env.local.example. Native identifiers are fixed here so
 * prebuild output is reproducible.
 */
const config: ExpoConfig = {
  name: "dodi",
  slug: "dodi",
  scheme: "dodi",
  version: "0.1.0",
  orientation: "default",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "app.dodi.mobile",
    supportsTablet: true,
    deploymentTarget: "17.0",
    config: { usesNonExemptEncryption: true },
  },
  android: {
    package: "app.dodi.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#F5F8FB",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    "expo-localization",
    "./plugins/with-android-signing",
    [
      "expo-splash-screen",
      { backgroundColor: "#F5F8FB", image: "./assets/images/splash.png", imageWidth: 160 },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
