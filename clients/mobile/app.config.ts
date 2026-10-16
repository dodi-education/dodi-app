import type { ExpoConfig } from "expo/config";

// iOS has one microphone usage string per app; every plugin that could set or
// delete it gets this one (a `false` there would delete it, or on Android
// block RECORD_AUDIO, which the voice companion needs).
const MICROPHONE_PERMISSION =
  "Your child talks with the voice companion through the microphone. The app only listens while a conversation is on.";

// Same for the camera: expo-image-picker and expo-camera both write it, and
// the image picker's value wins, so both get this one.
const CAMERA_PERMISSION =
  "The camera scans a friend's code to add them, and photographs ideas and worksheets for the Game Studio.";

// APP_VARIANT=development builds the dev client as its own app ("dodi dev",
// app.dodi.dev) so it installs next to the store version: separate icon,
// storage, keychain and URL scheme.
const IS_DEV_VARIANT = process.env.APP_VARIANT === "development";
const BUNDLE_ID = IS_DEV_VARIANT ? "app.dodi.dev" : "app.dodi";
const ICON_SUFFIX = IS_DEV_VARIANT ? "-dev" : "";

/**
 * Expo config. Environment (EXPO_PUBLIC_*) is read by Expo from .env.local at
 * build time; see .env.local.example. Native identifiers are fixed here (per
 * variant) so prebuild output is reproducible.
 */
const config: ExpoConfig = {
  name: IS_DEV_VARIANT ? "dodi dev" : "dodi",
  slug: "dodi",
  owner: "birkeal",
  scheme: IS_DEV_VARIANT ? "dodi-dev" : "dodi",
  version: "0.1.0",
  orientation: "default",
  icon: `./assets/images/icon${ICON_SUFFIX}.png`,
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
    deploymentTarget: "17.0",
    config: { usesNonExemptEncryption: true },
    infoPlist: {
      // Game Studio builds keep running as BGContinuedProcessingTask (iOS 26+);
      // the module registers one identifier per build under this prefix
      // (derived from the runtime bundle id, so it must follow the variant).
      BGTaskSchedulerPermittedIdentifiers: [`${BUNDLE_ID}.build.*`],
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: `./assets/images/adaptive-icon${ICON_SUFFIX}.png`,
      backgroundColor: "#F5F8FB",
    },
    // Merged in by dependencies but unused, and questioned in Play review of
    // an app children use: drawing over other apps and the install-referrer
    // (attribution) service.
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE",
    ],
  },
  plugins: [
    "expo-router",
    // No biometric unlock: drop the plugin's generic Face ID usage string.
    ["expo-secure-store", { faceIDPermission: false }],
    "expo-sqlite",
    "expo-localization",
    "expo-sharing",
    // Notification accent: the `primary` design token (core/design-tokens).
    ["expo-notifications", { color: "#2F6BD8" }],
    // Game Studio reference images: a photo of a worksheet, or one from the library.
    [
      "expo-image-picker",
      {
        cameraPermission: CAMERA_PERMISSION,
        photosPermission: "The Game Studio uses the photos you pick as reference images.",
        microphonePermission: MICROPHONE_PERMISSION,
      },
    ],
    // Kid friends: scanning a friend's QR code.
    [
      "expo-camera",
      {
        cameraPermission: CAMERA_PERMISSION,
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
        // FFmpeg only decodes MP4/M4A/AAC; the voice streams raw PCM and the
        // shutter sound is MP3 (miniaudio's built-in decoder). Dropping it cuts
        // most of the library's native size.
        disableFFmpeg: true,
      },
    ],
    "./plugins/with-android-signing",
    [
      "expo-splash-screen",
      { backgroundColor: "#F5F8FB", image: "./assets/images/splash.png", imageWidth: 160 },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: "18115b1f-3082-466f-8b30-381216bf1845" } },
};

export default config;
