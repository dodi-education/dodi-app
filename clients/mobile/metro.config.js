// Expo's default config already handles the pnpm monorepo (watch folders,
// workspace packages, package exports). NativeWind compiles global.css.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
// The 3D character files (assets/characters, loaded with expo-asset).
config.resolver.assetExts.push("glb");

// inlineRem: NativeWind defaults to 14px per rem; the web uses the browser
// default of 16px. The app ports the web's classes 1:1, so 1rem must be 16 here
// too, or every rem class (spacing, sizes, text-*) renders at 87.5% and
// JS-computed px geometry (e.g. the Switch thumb offset) no longer matches.
// See src/rem-parity.test.ts.
module.exports = withNativeWind(config, { input: "./src/global.css", inlineRem: 16 });
