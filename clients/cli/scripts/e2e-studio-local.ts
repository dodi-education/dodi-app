/**
 * End-to-end run of `dodi studio` against a LOCAL platform (pnpm dev on :3001
 * and its dev database), with a stand-in model (./stub-anthropic) so no real
 * AI is called. It plays both sides:
 *
 *   parent  a test account (inserted into the local dev DB: sign-up sits
 *           behind Turnstile), its vault, a kid, a game model (Anthropic) with
 *           a key, and the approval that seals the build keys to the agent;
 *   agent   the real CLI: login → studio new (plan) → build → wait → send →
 *           wait → show → logout.
 *
 * It asserts that the game was built by the studio harness (dodi's game
 * agent), saved sealed with its thread, and that the thread is written in the
 * parent's language. Never point it at a shared database.
 *
 *   NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" pnpm --filter @dodi-education/cli exec tsx scripts/e2e-studio-local.ts
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { randomBytes, toBase64Url } from "@dodi/crypto";
import { sealAgentProviderKeys, selectAgentProviderKeys } from "@dodi/protocol/agent-provider-keys";
import { restoreTranscript } from "@dodi/studio/transcript";
import { addDeviceToVault, createAccountVault, createDevice, encryptProviders, VaultSession, type StoredVaultKeys } from "@dodi/vault";

import { startStubAnthropic } from "./stub-anthropic";

const API = process.env.DODI_API_URL ?? "https://localhost:3001";
const PLATFORM_ENV = path.resolve(import.meta.dirname, "../../../platform/.env.local");
const CLI = path.resolve(import.meta.dirname, "../src/index.ts");
const CONTAINER = process.env.DODI_DB_CONTAINER ?? "dodi-dev-postgres";

function sql(query: string): string {
  const url = readFileSync(PLATFORM_ENV, "utf8")
    .split("\n")
    .find((line) => line.startsWith("DATABASE_URL_MIGRATOR="))!
    .slice("DATABASE_URL_MIGRATOR=".length)
    .replace("127.0.0.1", "localhost");
  if (!/@localhost[:/]/.test(url)) throw new Error("Refusing: DATABASE_URL_MIGRATOR is not local");
  return execFileSync("docker", ["exec", CONTAINER, "psql", url, "-tAc", query], { encoding: "utf8" }).trim();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ok  ${message}`);
}

const configDir = mkdtempSync(path.join(tmpdir(), "dodi-studio-e2e-"));
const workDir = mkdtempSync(path.join(tmpdir(), "dodi-studio-e2e-work-"));
let stubUrl = "";

/**
 * Run the CLI asynchronously: the stand-in model lives in THIS process, so a
 * blocking spawnSync would freeze it and every model call would hang.
 */
async function cli(args: string[]): Promise<{ code: number; json: Record<string, unknown>; stderr: string }> {
  const startedAt = Date.now();
  // E2E_CLI_BIN runs an installed `dodi` (the published bundle) instead of the source.
  const bin = process.env.E2E_CLI_BIN;
  const child = spawn(bin ?? "npx", [...(bin ? [] : ["tsx", CLI]), ...args, "--json"], {
    cwd: workDir,
    // Its own process group, so a timeout can stop the CLI and everything it started.
    detached: true,
    env: {
      ...process.env,
      DODI_API_URL: API,
      DODI_APP_URL: "https://localhost:3000",
      DODI_CONFIG_DIR: configDir,
      ANTHROPIC_BASE_URL: stubUrl,
      DODI_DEBUG: process.env.DODI_DEBUG ?? "",
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (process.env.DODI_DEBUG) process.stdout.write(String(chunk).replace(/^/gm, "      | "));
  });
  // A stuck command names itself instead of hanging the run.
  const timer = setTimeout(() => {
    console.log(`    [dodi ${args.slice(0, 2).join(" ")}] timed out, stopping it`);
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }, Number(process.env.E2E_CMD_TIMEOUT_MS ?? 180_000));
  const code = await new Promise<number | string>((resolve) => child.on("exit", (c, signal) => resolve(c ?? signal ?? 1)));
  clearTimeout(timer);
  console.log(`    [dodi ${args.slice(0, 2).join(" ")}] exit ${code} in ${Date.now() - startedAt} ms`);
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(stdout);
  } catch {
    console.error("    stdout:", stdout.slice(0, 2000), "\n    stderr:", stderr.slice(0, 2000));
  }
  return { code: typeof code === "number" ? code : 1, json, stderr };
}

async function parent(token: string, route: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  return fetch(`${API}${route}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", connection: "close" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

/** Wait for the background build: `studio wait` exits 3 while it runs. */
async function waitForBuild(): Promise<Record<string, unknown>> {
  for (let i = 0; i < 6; i++) {
    const res = await cli(["studio", "wait", "--timeout", "60"]);
    if (res.code !== 3) return res.json;
  }
  throw new Error("FAILED: the build never finished");
}

async function main(): Promise<void> {
  const stub = await startStubAnthropic();
  stubUrl = stub.url;
  try {
    console.log("parent: account (German UI), vault, kid, a game model with a key");
    const email = `studio-e2e-${Date.now()}@example.com`;
    const userId = sql(`insert into auth_users (name, email, email_verified) values ('e2e', '${email}', true) returning id`).split("\n")[0];
    sql(`update accounts set language = 'de' where id = '${userId}'`);
    const token = toBase64Url(randomBytes(24));
    sql(`insert into auth_sessions (token, user_id, expires_at, updated_at) values ('${token}', '${userId}', now() + interval '1 hour', now())`);

    const browser = createDevice();
    const created = await createAccountVault({
      password: "correct horse battery staple",
      device: { deviceId: browser.deviceId, deviceKemPublicKey: toBase64Url(browser.kem.publicKey) },
    });
    let storedKeys: StoredVaultKeys = created.storedKeys;
    assert((await parent(token, "/api/vault/keys", { method: "PUT", body: { ...storedKeys, npub: created.npubHex } })).ok, "vault stored");
    const vault = new VaultSession(created.vmk);
    assert(
      (await parent(token, "/api/kids", { body: { display_name: vault.encryptField("Mia"), birthdate: vault.encryptField("2019-03-14"), language: "de" } })).ok,
      "kid created",
    );
    const config = {
      voiceProvider: "gemini",
      voiceModel: "gemini-live",
      voiceName: "Puck",
      gameProvider: "anthropic",
      gameModel: "claude-sonnet-5-5",
      thinkingProvider: "anthropic",
      thinkingModel: "claude-sonnet-5-5",
    };
    assert((await parent(token, "/api/ai/config", { method: "PATCH", body: config })).ok, "game model configured");
    const providerKeys = { anthropic: "sk-ant-test-key", gemini: "voice-only-key" };
    const encryptedProviders = encryptProviders(vault, {
      anthropic: { key: providerKeys.anthropic, keyPreview: "test", addedAt: new Date().toISOString() },
      gemini: { key: providerKeys.gemini, keyPreview: "-key", addedAt: new Date().toISOString() },
    });
    assert((await parent(token, "/api/ai/providers", { method: "PUT", body: { encryptedProviders } })).ok, "provider keys stored");

    console.log("agent: login; parent allows it to build with the family's providers");
    const login = await cli(["login", "--name", "e2e studio agent", "--scopes", "studio,games,games:publish,kids:basic", "--wait", "0"]);
    assert(login.code === 3, "login is pending");
    const claimRes = await parent(token, "/api/authorized-clients/claim", { body: { pairingCode: login.json.code } });
    const claimed = (await claimRes.json()) as { id: string; deviceId: string; kemPublicKey: string };
    storedKeys = addDeviceToVault(storedKeys, created.vmk, { deviceId: claimed.deviceId, deviceKemPublicKey: claimed.kemPublicKey });
    assert((await parent(token, "/api/vault/keys", { method: "PUT", body: storedKeys })).ok, "vault wrap stored");
    const bundle = selectAgentProviderKeys(config as never, providerKeys);
    assert(!("gemini" in bundle.keys), "the voice-only key is not handed out");
    const activate = await parent(token, `/api/authorized-clients/${claimed.id}/activate`, {
      body: {
        scopes: ["studio", "games", "games:publish", "kids:basic"],
        expiresInDays: 1,
        providerKeysSealed: sealAgentProviderKeys(claimed.kemPublicKey, bundle),
      },
    });
    assert(activate.ok, "allowed with the sealed build keys");
    assert((await cli(["login", "--resume", "--wait", "10"])).json.status === "connected", "agent connected");

    console.log("agent: plan the game with dodi");
    const planned = await cli(["studio", "new", "Ein Zählspiel mit Dinosauriern für eine Sechsjährige"]);
    assert(planned.code === 0 && typeof planned.json.gameId === "string", "the first plan turn created the game");
    assert(String(planned.json.plan).includes("Count dinosaurs"), "dodi proposed a plan");
    const gameId = String(planned.json.gameId);
    assert(sql(`select plan_enc like 'enc:v1:%' from games where id = '${gameId}'`) === "t", "the plan is sealed on the game row");

    console.log("agent: build it, wait for it");
    const build = await cli(["studio", "build"]);
    assert(build.code === 0, "the build started in the background");
    const built = await waitForBuild();
    const result = (built.result ?? {}) as Record<string, unknown>;
    assert(built.state === "done" && result.outcome === "built", `the build finished (${String(built.state)} / ${String(result.outcome)} / ${JSON.stringify(built.error ?? null)})`);
    assert(stub.calls.game > 0, "dodi's game agent (the studio harness) wrote the game");
    const row = sql(`select title || '|' || code_bundle || '|' || coalesce(plan_enc, 'NULL') from games where id = '${gameId}'`).split("|");
    assert(row[0].startsWith("enc:v1:") && row[1].startsWith("enc:v1:"), "title and code are sealed");
    assert(row[2] === "NULL", "planning ended");
    const transcriptEnc = sql(`select agent_transcript_enc from games where id = '${gameId}'`);
    const thread = restoreTranscript(vault, transcriptEnc);
    assert(thread.length >= 4, `the whole conversation is on the game (${thread.length} messages)`);
    assert(thread.some((m) => m.role === "user" && m.text.startsWith("Baue das Spiel")), "the build message is in the parent's language (de)");
    // Local Playwright (or the screenshot service) lets dodi's visual check run.
    console.log(`  frames saved: ${(result.frames as string[] | undefined)?.length ?? 0}`);
    for (const frame of (result.frames as string[] | undefined) ?? []) assert(existsSync(frame), `frame exists: ${path.basename(frame)}`);

    console.log("agent: one change round");
    const before = stub.calls.game;
    assert((await cli(["studio", "send", "Mach die Zahlen größer"])).code === 0, "the change round started");
    const edited = await waitForBuild();
    assert(edited.state === "done", "the change round finished");
    assert(stub.calls.game > before, "the game agent worked on the change");
    const show = await cli(["studio", "show"]);
    assert(show.json.stage === "built", "show: the game is built");

    console.log("agent: settings of a game without picture settings (as CLI 0.1.0 pushed them)");
    sql(`update games set metadata = metadata - 'generatePreviewImage' - 'generateBackgroundImage' || '{"createdWith":"dodi-cli"}' where id = '${gameId}'`);
    const settings = await cli(["studio", "settings"]);
    assert(settings.code === 0 && settings.json.previewImage === "off", "settings: the preview picture reads as off");
    const noImageModel = await cli(["studio", "settings", "--preview-image", "on"]);
    assert(noImageModel.code === 2 && String(noImageModel.json.error).includes("no image model"), `without an image model the picture can't be switched on (${String(noImageModel.json.error)})`);
    const changed = await cli(["studio", "settings", "--title", "Dino Zählen", "--ages", "5-7", "--perspective", "side"]);
    assert(changed.code === 0 && changed.json.title === "Dino Zählen" && changed.json.ages === "5-7", "settings saved");
    const saved = sql(`select title || '|' || target_age_min || '|' || target_age_max || '|' || (metadata->>'perspective') || '|' || (metadata->>'createdWith') from games where id = '${gameId}'`).split("|");
    assert(vault.decryptField(saved[0]) === "Dino Zählen", "the new title is sealed on the row");
    assert(saved.slice(1).join("|") === "5|7|side|dodi-cli", "ages and perspective saved, other metadata kept");
    assert((await cli(["studio", "settings", "--ages", "9-5"])).code === 2, "a reversed age range is refused");

    if (process.env.E2E_PUBLISH_GAME === "1") {
      console.log("agent: publish to dodi Discover (translated like the apps do)");
      sql(`update accounts set publication_handle = 'e2e${Date.now() % 100000}' where id = '${userId}'`);
      const published = await cli(["games", "publish"]);
      assert(published.code === 0 && published.json.status === "submitted", "submitted to Discover");
      const languages = (published.json.languages as string[] | undefined) ?? [];
      assert(languages.includes("en") && languages.includes("de"), "translated into every platform language");
      const copy = sql(`select title from games where source_game_id = '${gameId}' and publication_requested_at is not null`);
      assert(copy.length > 0 && !copy.startsWith("enc:v1:"), "the Discover copy is plaintext; the family's game stays sealed");
    } else {
      console.log("  (publishing skipped; E2E_PUBLISH_GAME=1 runs it and sends the operator notification email)");
    }

    console.log("agent: logout");
    assert((await cli(["logout"])).json.revoked === true, "logged out");
    console.log("\nAll good. Test account:", email);
  } finally {
    await stub.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
