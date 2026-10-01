/**
 * Release signing for local Android builds.
 *
 * Reads the upload keystore from clients/mobile/credentials.json (gitignored),
 * in the format EAS uses for local credentials:
 *
 *   { "android": { "keystore": {
 *       "keystorePath": "keystores/upload.jks",   // relative to clients/mobile
 *       "keystorePassword": "…", "keyAlias": "upload", "keyPassword": "…" } } }
 *
 * The passwords are never written into the generated android/ project: the
 * injected Gradle code reads the file when Gradle runs. Without the file,
 * release builds keep the debug key (fine for side-loaded test builds, refused
 * by the Play Store).
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// @dodi/android-signing";

const SIGNING_CONFIG = `
        ${MARKER}
        release {
            def credentialsFile = file("../../credentials.json")
            if (credentialsFile.exists()) {
                def keystore = new groovy.json.JsonSlurper().parse(credentialsFile).android.keystore
                storeFile file("../../" + keystore.keystorePath)
                storePassword keystore.keystorePassword
                keyAlias keystore.keyAlias
                keyPassword keystore.keyPassword
            }
        }`;

const RELEASE_SIGNING =
  'signingConfig file("../../credentials.json").exists() ? signingConfigs.release : signingConfigs.debug';

function applySigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const configsStart = gradle.indexOf("signingConfigs {");
  if (configsStart === -1) throw new Error("with-android-signing: no signingConfigs block");
  const insertAt = configsStart + "signingConfigs {".length;
  let out = gradle.slice(0, insertAt) + SIGNING_CONFIG + gradle.slice(insertAt);

  // The release build type's signingConfig line (the template points it at the debug key).
  const releaseType = out.search(/buildTypes\s*\{[\s\S]*?release\s*\{/);
  if (releaseType === -1) throw new Error("with-android-signing: no release build type");
  const releaseBlock = out.indexOf("release {", out.indexOf("buildTypes", releaseType));
  const line = out.indexOf("signingConfig signingConfigs.debug", releaseBlock);
  if (line === -1) throw new Error("with-android-signing: release signingConfig not found");
  out = out.slice(0, line) + RELEASE_SIGNING + out.slice(line + "signingConfig signingConfigs.debug".length);
  return out;
}

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("with-android-signing: expected a Groovy app/build.gradle");
    }
    mod.modResults.contents = applySigning(mod.modResults.contents);
    return mod;
  });
};

module.exports.applySigning = applySigning;
