// The app mirrors the web's phone layout (see CLAUDE.md): these rules keep
// generic native UI from creeping back into screens.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const NATIVE_UI = [
  {
    name: "react-native",
    importNames: ["Text", "Switch", "Alert"],
    message:
      "Use the mirrored kit (@/components/ui: Text, Switch, Dialog). The app copies the web's phone layout.",
  },
  {
    name: "expo-router",
    importNames: ["Tabs", "Stack"],
    message: "No native tab bars or stack headers: use ParentShell / Slot (the web's top bar + drawer).",
  },
  {
    name: "@tabler/icons-react-native",
    message: "Use the Icon wrapper (@/components/ui/icon) with the web's semantic names.",
  },
];

module.exports = defineConfig([
  expoConfig,
  { ignores: ["android/*", "ios/*", ".expo/*", ".expo-export/*", "plugins/*"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: NATIVE_UI }] },
  },
  {
    // Per-icon subpaths resolve through the package's "./*" export, which the
    // import plugin's resolver doesn't follow; TypeScript checks them.
    files: ["src/components/ui/icons.ts"],
    rules: { "import/no-unresolved": "off" },
  },
  {
    // The kit itself wraps the native primitives; the root layout owns the navigator.
    files: ["src/components/ui/**", "src/app/_layout.tsx", "src/app/(auth)/_layout.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
]);
