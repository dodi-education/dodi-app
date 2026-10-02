import type { ExpoConfig } from "expo/config";

// iOS has one microphone usage string per app; every plugin that could set or
// delete it gets this one (a `false` there would delete it, or on Android
// block RECORD_AUDIO, which the voice companion needs).
const MICROPHONE_PERMISSION =
  "Your child talks with the voice companion through the microphone. The app only listens while a conversation is on.";

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
    infoPlist: {
      // Game Studio builds keep running as BGContinuedProcessingTask (iOS 26+);
      // the module registers one identifier per build under this prefix.
      BGTaskSchedulerPermittedIdentifiers: ["app.dodi.mobile.build.*"],
    },
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
    "expo-sharing",
    // Notification accent: the `primary` design token (core/design-tokens).
    ["expo-notifications", { color: "#2F6BD8" }],
    // Game Studio reference images: a photo of a worksheet, or one from the library.
    [
      "expo-image-picker",
      {
        cameraPermission: "The Game Studio uses the camera to photograph ideas and worksheets.",
        photosPermission: "The Game Studio uses the photos you pick as reference images.",
        microphonePermission: MICROPHONE_PERMISSION,
      },
    ],
    // Kid friends: scanning a friend's QR code. iOS has one camera usage
    // string per app, so this one (applied last) covers the Game Studio too.
    [
      "expo-camera",
      {
        cameraPermission:
          "The camera scans a friend's code to add them, and photographs ideas and worksheets for the Game Studio.",
        microphonePermission: MICROPHONE_PERMISSION,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    // The voice companion's native audio (mic capture + playback). Foreground
    // only: no iOS background-audio mode and no Android media-playback
    // foreground service (the plugin's defaults); the session ends when the
    // app leaves the foreground.
    [
      "react-native-audio-api",
      {
        iosBackgroundMode: false,
        androidForegroundService: false,
        androidPermissions: ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"],
        iosMicrophonePermission: MICROPHONE_PERMISSION,
      },
    ],
    "./plugins/with-android-signing",
    [
      "expo-splash-screen",
      { backgroundColor: "#F5F8FB", image: "./assets/images/splash.png", imageWidth: 160 },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
