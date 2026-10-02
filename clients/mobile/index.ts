// The app entry ("main" in package.json). The polyfills must run before any
// other module: @noble reads globalThis.crypto once, when it loads, and Expo
// Router loads route files (which import the vault, hence @noble) before the
// root _layout. Keep this import first; see src/entry-order.test.ts.
import "./src/polyfills";
import "expo-router/entry";
