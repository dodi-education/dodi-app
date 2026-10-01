// Expo's default config already handles the pnpm monorepo (watch folders,
// workspace packages, package exports). NativeWind compiles global.css.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/global.css" });
