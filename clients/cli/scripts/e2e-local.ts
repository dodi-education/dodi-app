/**
 * End-to-end run of the agent flow against a LOCAL platform (pnpm dev on
 * :3001 with the dev database). It plays both sides:
 *
 *   parent  a fresh test account (inserted straight into the local dev DB,
 *           because sign-up sits behind Turnstile), its vault and one kid;
 *   agent   the real CLI: login → (parent approves like the web does) →
 *           resume → kids → games new/check/push/list/pull → scope refusal →
 *           logout.
 *
 * It asserts that what reached the server is sealed and that the agent is
 * refused outside its scopes. Never point it at a shared database.
 *
 * E2E_PUBLISH_GAME=1 also publishes the game to Discover with an access key.
 * Off by default: a game submission sends the operator notification email
 * when the local platform has SYSTEM_NOTIFICATION_EMAIL + RESEND_API_KEY set.
 *
 *   NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" pnpm --filter @dodi-education/cli exec tsx scripts/e2e-local.ts
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { randomBytes, toBase64Url } from "@dodi/crypto";
import { agentKeyPairs, formatAgentAccessKey } from "@dodi/protocol/agent-key";
import { addDeviceToVault, createAccountVault, createDevice, VaultSession, type StoredVaultKeys } from "@dodi/vault";

const API = process.env.DODI_API_URL ?? "https://localhost:3001";
const PLATFORM_ENV = path.resolve(import.meta.dirname, "../../../platform/.env.local");
const CLI = path.resolve(import.meta.dirname, "../src/index.ts");
const CONTAINER = process.env.DODI_DB_CONTAINER ?? "dodi-dev-postgres";
const PASSWORD = "correct horse battery staple";

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

const configDir = mkdtempSync(path.join(tmpdir(), "dodi-cli-e2e-"));
const workDir = mkdtempSync(path.join(tmpdir(), "dodi-cli-e2e-work-"));

function cli(args: string[]): { code: number; json: Record<string, unknown> } {
  const res = spawnSync("npx", ["tsx", CLI, ...args, "--json"], {
    cwd: workDir,
    encoding: "utf8",
    env: { ...process.env, DODI_API_URL: API, DODI_APP_URL: "https://localhost:3000", DODI_CONFIG_DIR: configDir },
  });
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(res.stdout);
  } catch {
    console.error(res.stdout, res.stderr);
  }
  return { code: res.status ?? 1, json };
}

async function parent(token: string, route: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  return fetch(`${API}${route}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", connection: "close" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function main(): Promise<void> {
  console.log("parent: account, session, vault, kid");
  const email = `agent-e2e-${Date.now()}@example.com`;
  const userId = sql(`insert into auth_users (name, email, email_verified) values ('e2e', '${email}', true) returning id`).split("\n")[0];
  // A real credential: allowing access re-checks the account password.
  const passwordHash = execFileSync(
    "node",
    ["-e", `import("better-auth/crypto").then((m) => m.hashPassword(${JSON.stringify(PASSWORD)})).then((h) => process.stdout.write(h))`],
    { cwd: path.dirname(PLATFORM_ENV), encoding: "utf8" },
  );
  sql(
    `insert into auth_accounts (account_id, provider_id, user_id, password, updated_at) values ('${userId}', 'credential', '${userId}', '${passwordHash}', now())`,
  );
  const token = toBase64Url(randomBytes(24));
  sql(`insert into auth_sessions (token, user_id, expires_at, updated_at) values ('${token}', '${userId}', now() + interval '1 hour', now())`);

  const browser = createDevice();
  const created = await createAccountVault({
    password: PASSWORD,
    device: { deviceId: browser.deviceId, deviceKemPublicKey: toBase64Url(browser.kem.publicKey) },
  });
  let storedKeys: StoredVaultKeys = created.storedKeys;
  const putKeys = await parent(token, "/api/vault/keys", { method: "PUT", body: { ...storedKeys, npub: created.npubHex } });
  assert(putKeys.ok, `vault keys stored (${putKeys.status})`);
  const vault = new VaultSession(created.vmk);
  const kidRes = await parent(token, "/api/kids", {
    body: { display_name: vault.encryptField("Mia"), birthdate: vault.encryptField("2019-03-14"), language: "en" },
  });
  assert(kidRes.ok, `kid created (${kidRes.status})`);

  console.log("agent: login (pending)");
  const login = cli(["login", "--name", "e2e agent", "--scopes", "games,kids:basic,assets,assets:publish", "--wait", "0"]);
  assert(login.code === 3 && login.json.status === "pending", "login is pending approval");
  const code = String(login.json.code);

  console.log("parent: approve like the web does (claim, wrap the vault, activate with a narrower grant)");
  const claimRes = await parent(token, "/api/authorized-clients/claim", { body: { pairingCode: code } });
  const claimed = (await claimRes.json()) as { id: string; deviceId: string; kemPublicKey: string; kind: string; requestedScopes: string[] };
  assert(claimed.kind === "agent", "claim shows an agent");
  assert(claimed.requestedScopes.join() === "games,kids:basic,assets,assets:publish", "claim shows the requested scopes");
  storedKeys = addDeviceToVault(storedKeys, created.vmk, { deviceId: claimed.deviceId, deviceKemPublicKey: claimed.kemPublicKey });
  assert((await parent(token, "/api/vault/keys", { method: "PUT", body: storedKeys })).ok, "wrap stored");
  const activate = await parent(token, `/api/authorized-clients/${claimed.id}/activate`, {
    body: { scopes: ["games", "kids:basic", "kids:memory", "assets", "assets:publish"], expiresInDays: 7 },
  });
  assert(activate.ok, "activated");

  console.log("agent: resume, whoami, kids");
  const resumed = cli(["login", "--resume", "--wait", "10"]);
  assert(resumed.code === 0 && resumed.json.status === "connected", "connected after approval");
  assert(
    JSON.stringify(resumed.json.scopes) === JSON.stringify(["games", "kids:basic", "assets", "assets:publish"]),
    "grant never widens the request",
  );
  const kids = cli(["kids"]);
  const kidList = (kids.json.kids ?? []) as Array<{ name: string; age: number }>;
  assert(kidList[0]?.name === "Mia" && typeof kidList[0]?.age === "number", "kid name and age decrypted on the agent");

  console.log("agent: games new, check, push, list, pull");
  assert(cli(["games", "new", "dino", "--title", "Dino Count"]).code === 0, "scaffolded");
  const check = cli(["games", "check", "dino", "--static"]);
  assert(check.code === 0 && check.json.ok === true, "starter passes the check");
  const push = cli(["games", "push", "dino"]);
  assert(push.code === 0 && push.json.action === "created", "pushed");
  const gameId = String(push.json.gameId);
  const stored = sql(`select title || '|' || code_bundle from games where id = '${gameId}'`);
  assert(stored.startsWith("enc:v1:") && stored.includes("|enc:v1:"), "title and bundle are sealed in the database");
  const again = cli(["games", "push", "dino"]);
  assert(again.json.action === "updated", "second push updates the same game");
  const list = cli(["games", "list"]);
  assert(((list.json.games ?? []) as Array<{ title: string }>).some((g) => g.title === "Dino Count"), "list decrypts the title");
  const pulled = cli(["games", "pull", gameId, "dino-copy"]);
  assert(pulled.code === 0 && readFileSync(path.join(workDir, "dino-copy", "game.html"), "utf8").includes("dodi-translations"), "pull writes the game back");

  console.log("agent: refused outside its scopes");
  const memory = cli(["kids", "--memory", String((kids.json.kids as Array<{ id: string }>)[0].id)]);
  assert(memory.code === 6, "kids:memory was not granted → exit 6");
  const publish = cli(["games", "publish", "dino"]);
  assert(publish.code === 6 || publish.code === 2, "publishing without games:publish is refused");

  console.log("agent: assets new, check, push, list, pull, publish");
  assert(cli(["assets", "new", "hat", "--kind", "accessory", "--name", "Party hat"]).code === 0, "asset scaffolded");
  copyFileSync(
    path.resolve(import.meta.dirname, "../../../characters/accessories/party_hat/party_hat.glb"),
    path.join(workDir, "hat", "asset.glb"),
  );
  const assetCheck = cli(["assets", "check", "hat"]);
  assert(assetCheck.code === 0 && (assetCheck.json.info as { socket: string }).socket === "socket_head_top", "asset passes the format check");
  const assetPush = cli(["assets", "push", "hat"]);
  assert(assetPush.code === 0 && assetPush.json.action === "created", "asset pushed");
  const assetId = String(assetPush.json.assetId);
  assert(sql(`select glb_enc from character_assets where id = '${assetId}'`).startsWith("enc:v1:"), "asset file is sealed in the database");
  const assets = cli(["assets", "list"]);
  assert(((assets.json.assets ?? []) as Array<{ name: string }>).some((a) => a.name === "Party hat"), "asset list decrypts the name");
  assert(cli(["assets", "pull", assetId, "hat-copy"]).code === 0, "asset pulled");
  assert(
    readFileSync(path.join(workDir, "hat-copy", "asset.glb")).equals(readFileSync(path.join(workDir, "hat", "asset.glb"))),
    "pulled file is byte-identical",
  );
  assert(cli(["assets", "publish", "hat"]).code === 1, "publishing needs a publication handle first");
  sql(`update accounts set publication_handle = 'e2e${Date.now() % 100000}' where id = '${userId}'`);
  const assetPublish = cli(["assets", "publish", "hat"]);
  assert(assetPublish.code === 0 && assetPublish.json.state === "in_review", "asset submitted to Discover");
  assert(cli(["assets", "status", "hat"]).json.state === "in_review", "status shows it in review");
  assert(sql(`select count(*) from published_character_assets where source_asset_id = '${assetId}' and published_at is null`) === "1", "queued for review, not live");

  console.log("agent: logout revokes and drops the wrap");
  assert(cli(["logout"]).json.revoked === true, "logged out");
  const status = sql(`select status from authorized_clients where device_id = '${claimed.deviceId}'`);
  assert(status === "revoked", "device revoked");
  const wraps = sql(`select vault_keys->'deviceWraps' from accounts where id = '${userId}'`);
  assert(!wraps.includes(claimed.deviceId) && wraps.includes(browser.deviceId), "vault wrap removed, the browser's kept");

  console.log("parent: the browser registers itself and the Access list shows it");
  const register = await parent(token, "/api/authorized-clients/register", {
    body: {
      deviceId: browser.deviceId,
      kemPublicKey: toBase64Url(browser.kem.publicKey),
      kind: "browser",
      label: "Firefox on Linux",
    },
  });
  assert(register.ok, "browser registered");
  const listRes = await fetch(`${API}/api/authorized-clients`, {
    headers: { authorization: `Bearer ${token}`, "x-dodi-device-id": browser.deviceId, connection: "close" },
  });
  const { clients } = (await listRes.json()) as {
    clients: Array<{ id: string; kind: string; label: string | null; is_current: boolean; has_vault_access: boolean }>;
  };
  const thisBrowser = clients.find((c) => c.is_current);
  assert(thisBrowser?.label === "Firefox on Linux" && thisBrowser.has_vault_access, "this browser is listed as current");
  assert(!clients.some((c) => c.kind === "agent"), "the revoked agent is gone from the list");

  const revokeBrowser = async (): Promise<void> => {
    console.log("parent: revoke this browser in one step");
    const res = await parent(token, `/api/authorized-clients/${thisBrowser.id}`, { method: "DELETE" });
    const body = (await res.json()) as { wasCurrent: boolean };
    assert(res.ok && body.wasCurrent, "revoked, reported as the current client");
    assert((await parent(token, "/api/kids")).status === 401, "its session is gone");
    const wrapsLeft = sql(`select vault_keys->'deviceWraps' from accounts where id = '${userId}'`);
    assert(!wrapsLeft.includes(browser.deviceId), "its vault wrap is gone");
  };

  console.log("parent: create an access key in one step (no password), agent connects with it");
  {
    const seed = randomBytes(32);
    const keyId = Array.from(randomBytes(12), (b) => b.toString(16).padStart(2, "0")).join("");
    const pairs = agentKeyPairs({ deviceId: keyId, seed });
    storedKeys = addDeviceToVault(storedKeys, created.vmk, { deviceId: keyId, deviceKemPublicKey: toBase64Url(pairs.kem.publicKey) });
    assert((await parent(token, "/api/vault/keys", { method: "PUT", body: storedKeys })).ok, "access key wrap stored");
    const createdKey = await parent(token, "/api/authorized-clients/access-keys", {
      body: {
        deviceId: keyId,
        kemPublicKey: toBase64Url(pairs.kem.publicKey),
        signPublicKey: toBase64Url(pairs.sign.publicKey),
        name: "e2e home server",
        scopes: ["games"],
        expiresInDays: 30,
      },
    });
    assert(createdKey.status === 201, "access key created without a password");
    const keyLogin = cli(["login", "--token", formatAgentAccessKey({ deviceId: keyId, seed })]);
    assert(keyLogin.code === 0 && JSON.stringify(keyLogin.json.scopes) === '["games"]', "agent connected with the key");
    assert(cli(["games", "list"]).code === 0, "the key works for games");
    assert(cli(["logout"]).json.revoked === true, "access key disconnected");
  }

  if (process.env.E2E_PUBLISH_GAME !== "1") {
    await revokeBrowser();
    console.log("\nAll good (game publishing skipped; E2E_PUBLISH_GAME=1 runs it). Test account:", email);
    return;
  }

  console.log("parent: create an access key for a second agent (games + games:publish)");
  const seed = randomBytes(32);
  const keyDeviceId = Array.from(randomBytes(12), (b) => b.toString(16).padStart(2, "0")).join("");
  const keyPairs = agentKeyPairs({ deviceId: keyDeviceId, seed });
  const enrolled = await fetch(`${API}/api/authorized-clients/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({
      deviceId: keyDeviceId,
      kemPublicKey: toBase64Url(keyPairs.kem.publicKey),
      signPublicKey: toBase64Url(keyPairs.sign.publicKey),
      name: "e2e access key",
      kind: "agent",
      scopes: ["games", "games:publish"],
    }),
  });
  const { pairingCode } = (await enrolled.json()) as { pairingCode: string };
  const keyClaim = (await (await parent(token, "/api/authorized-clients/claim", { body: { pairingCode } })).json()) as { id: string };
  storedKeys = addDeviceToVault(storedKeys, created.vmk, {
    deviceId: keyDeviceId,
    deviceKemPublicKey: toBase64Url(keyPairs.kem.publicKey),
  });
  assert((await parent(token, "/api/vault/keys", { method: "PUT", body: storedKeys })).ok, "access key wrap stored");
  assert(
    (await parent(token, `/api/authorized-clients/${keyClaim.id}/activate`, { body: { scopes: ["games", "games:publish"], expiresInDays: null } })).ok,
    "access key activated",
  );

  console.log("agent 2: login --token, publish the game to Discover");
  const accessKey = formatAgentAccessKey({ deviceId: keyDeviceId, seed });
  const tokenLogin = cli(["login", "--token", accessKey]);
  assert(tokenLogin.code === 0 && tokenLogin.json.expiresAt === null, "connected with the access key, never expires");
  const gamePublish = cli(["games", "publish", "dino"]);
  assert(gamePublish.code === 0 && gamePublish.json.status === "submitted", "game submitted to Discover");
  const gameStatus = cli(["games", "status", "dino"]);
  assert(gameStatus.json.published === true && gameStatus.json.state === "in_review", "game status shows it in review");
  const copy = sql(`select title from games where source_game_id = '${gameId}' and publication_requested_at is not null`);
  assert(copy === "Dino Count", "the Discover copy is plaintext; the family's game stays sealed");
  assert(cli(["logout"]).json.revoked === true, "access key revoked on logout");
  await revokeBrowser();

  console.log("\nAll good. Test account:", email);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
