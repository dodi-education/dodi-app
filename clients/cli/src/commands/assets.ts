/**
 * dodi assets new | check | push | list | pull
 *
 * A custom companion avatar or accessory is a folder:
 *   asset.md   front matter { kind, name, description, asset_id } + notes
 *   asset.glb  the glTF binary (see `dodi docs assets`)
 * `check` runs the same validator the apps use (@dodi/character); `push`
 * seals name, metadata and the GLB under the family vault and uploads them.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateCharacterAsset, type CharacterAssetReport } from "@dodi/character/asset-validator";
import YAML from "yaml";

import { parse, requirePositional } from "../lib/args";
import { splitFrontMatter } from "../lib/game-project";
import { CliError, EXIT, type Output } from "../lib/output";
import { connect, type Connection } from "../lib/session";

const USAGE = `dodi assets <command>
  new <folder> --kind avatar|accessory [--name <name>]
  check [<folder>]
  push [<folder>]
  list
  pull <asset id> [<folder>]
  publish [<folder>]                 share on dodi Discover (reviewed); uses preview.png if present
  status [<folder>]                  Discover review status`;

export const ASSET_META_FILE = "asset.md";
export const ASSET_FILE = "asset.glb";

type AssetKind = "avatar" | "accessory";

interface AssetMeta {
  kind: AssetKind;
  name: string;
  description: string;
  asset_id?: string;
}

interface AssetRow {
  id: string;
  kind: AssetKind;
  name_enc: string;
  meta_enc: string | null;
  byte_size: number;
  created_at: string;
  updated_at: string;
  glb_enc?: string;
}

function renderAssetMd(meta: AssetMeta, notes: string): string {
  return `---\n${YAML.stringify(meta, { lineWidth: 0 }).trimEnd()}\n---\n\n${notes.trim()}\n`;
}

async function readAssetFolder(dirInput: string): Promise<{ dir: string; meta: AssetMeta; notes: string; glb: Uint8Array }> {
  const dir = path.resolve(dirInput);
  let text: string;
  try {
    text = await readFile(path.join(dir, ASSET_META_FILE), "utf8");
  } catch {
    throw new CliError(`${dir} has no ${ASSET_META_FILE}`, EXIT.usage, "Create one with `dodi assets new`.");
  }
  const split = splitFrontMatter(text);
  const raw = (split ? YAML.parse(split.yaml) : null) as Partial<AssetMeta> | null;
  if (!raw || (raw.kind !== "avatar" && raw.kind !== "accessory")) {
    throw new CliError(`${ASSET_META_FILE}: "kind" must be avatar or accessory`, EXIT.usage);
  }
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 80) {
    throw new CliError(`${ASSET_META_FILE}: "name" is required (max 80 characters)`, EXIT.usage);
  }
  let glb: Uint8Array;
  try {
    glb = new Uint8Array(await readFile(path.join(dir, ASSET_FILE)));
  } catch {
    throw new CliError(`${dir} has no ${ASSET_FILE} yet`, EXIT.usage, "Export your model as asset.glb (see `dodi docs assets`).");
  }
  return {
    dir,
    meta: {
      kind: raw.kind,
      name: raw.name.trim(),
      description: typeof raw.description === "string" ? raw.description : "",
      ...(typeof raw.asset_id === "string" && raw.asset_id ? { asset_id: raw.asset_id } : {}),
    },
    notes: split?.body ?? "",
    glb,
  };
}

export async function newAsset(dirInput: string, kind: AssetKind, name?: string) {
  const dir = path.resolve(dirInput);
  await mkdir(dir, { recursive: true });
  if ((await readdir(dir)).includes(ASSET_META_FILE)) {
    throw new CliError(`${dir} already contains an asset`, EXIT.usage, "Pick an empty folder.");
  }
  const meta: AssetMeta = {
    kind,
    name: name?.trim() || path.basename(dir).replace(/[-_]+/g, " "),
    description: "",
  };
  await writeFile(
    path.join(dir, ASSET_META_FILE),
    renderAssetMd(meta, `Put the model next to this file as ${ASSET_FILE}. Read \`dodi docs assets\` first.`),
  );
  return { dir, kind, next: `Create ${ASSET_FILE}, then \`dodi assets check ${dirInput}\`.` };
}

export async function checkAsset(dirInput: string): Promise<CharacterAssetReport & { kind: AssetKind }> {
  const { meta, glb } = await readAssetFolder(dirInput);
  return { kind: meta.kind, ...validateCharacterAsset(glb, meta.kind) };
}

export async function pushAsset(conn: Connection, dirInput: string) {
  const asset = await readAssetFolder(dirInput);
  const report = validateCharacterAsset(asset.glb, asset.meta.kind);
  if (!report.isValid) {
    throw new CliError(
      `asset.glb does not follow the format:\n- ${report.errors.join("\n- ")}`,
      EXIT.checkFailed,
      "See `dodi docs assets`.",
    );
  }
  const meta = {
    v: 1,
    ...(asset.meta.description ? { description: asset.meta.description } : {}),
    ...(report.info.socket ? { socket: report.info.socket } : {}),
  };
  const sealed = {
    name_enc: conn.vault.encryptField(asset.meta.name),
    meta_enc: conn.vault.encryptJson(meta),
    glb_enc: conn.vault.encryptField(Buffer.from(asset.glb).toString("base64")),
    byte_size: asset.glb.byteLength,
  };
  if (asset.meta.asset_id) {
    await conn.api<AssetRow>(`/api/character-assets/${encodeURIComponent(asset.meta.asset_id)}`, {
      method: "PATCH",
      body: sealed,
    });
    return { action: "updated", assetId: asset.meta.asset_id, kind: asset.meta.kind, name: asset.meta.name, warnings: report.warnings };
  }
  const row = await conn.api<AssetRow>("/api/character-assets", { body: { kind: asset.meta.kind, ...sealed } });
  await writeFile(path.join(asset.dir, ASSET_META_FILE), renderAssetMd({ ...asset.meta, asset_id: row.id }, asset.notes));
  return { action: "created", assetId: row.id, kind: asset.meta.kind, name: asset.meta.name, warnings: report.warnings };
}

const PREVIEW_FILES: Array<[string, string]> = [
  ["preview.png", "image/png"],
  ["preview.jpg", "image/jpeg"],
  ["preview.jpeg", "image/jpeg"],
  ["preview.webp", "image/webp"],
];

async function readPreview(dir: string): Promise<string | null> {
  for (const [name, mime] of PREVIEW_FILES) {
    try {
      const bytes = await readFile(path.join(dir, name));
      if (bytes.byteLength > 1_000_000) {
        throw new CliError(`${name} is over 1 MB`, EXIT.usage, "Use a smaller picture (about 512 px is plenty).");
      }
      return `data:${mime};base64,${bytes.toString("base64")}`;
    } catch (error) {
      if (error instanceof CliError) throw error;
    }
  }
  return null;
}

interface PublicationStatus {
  id: string;
  state: "in_review" | "live" | "rejected";
  submitted_at: string;
  published_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

/**
 * Submit the uploaded asset to dodi Discover. What is published is the
 * pushed file (decrypted here), not unpushed local edits.
 */
export async function publishAsset(conn: Connection, dirInput: string) {
  const asset = await readAssetFolder(dirInput);
  if (!asset.meta.asset_id) {
    throw new CliError("This asset was never pushed", EXIT.usage, "Run `dodi assets push` first.");
  }
  const row = await conn.api<AssetRow>(`/api/character-assets/${encodeURIComponent(asset.meta.asset_id)}`);
  const pushed = row.glb_enc ? (conn.vault.decryptField(row.glb_enc) ?? "") : "";
  if (pushed !== Buffer.from(asset.glb).toString("base64")) {
    throw new CliError("asset.glb has changes that were not pushed", EXIT.usage, "Run `dodi assets push` first.");
  }
  try {
    const { publication } = await conn.api<{ publication: PublicationStatus }>(
      `/api/character-assets/${encodeURIComponent(asset.meta.asset_id)}/publication`,
      {
        body: {
          name: asset.meta.name,
          description: asset.meta.description,
          glbBase64: pushed,
          previewImage: await readPreview(asset.dir),
        },
      },
    );
    return { assetId: asset.meta.asset_id, ...publication };
  } catch (error) {
    if (error instanceof CliError && /handle_required/.test(error.message)) {
      throw new CliError(
        "The family has no public publication handle yet",
        EXIT.error,
        "The parent picks one once in the dodi app (publishing a game asks for it).",
      );
    }
    throw error;
  }
}

export async function assetStatus(conn: Connection, dirInput: string) {
  const asset = await readAssetFolder(dirInput);
  if (!asset.meta.asset_id) return { published: false };
  const { publication } = await conn.api<{ publication: PublicationStatus | null }>(
    `/api/character-assets/${encodeURIComponent(asset.meta.asset_id)}/publication`,
  );
  return publication ? { published: true, ...publication } : { published: false };
}

export async function listAssets(conn: Connection) {
  const rows = await conn.api<AssetRow[]>("/api/character-assets");
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: conn.vault.decryptField(row.name_enc) ?? "",
    bytes: row.byte_size,
    updatedAt: row.updated_at,
  }));
}

export async function pullAsset(conn: Connection, assetId: string, dirInput?: string) {
  const row = await conn.api<AssetRow>(`/api/character-assets/${encodeURIComponent(assetId)}`);
  const name = conn.vault.decryptField(row.name_enc) ?? "asset";
  const meta = row.meta_enc ? (conn.vault.decryptJson<{ description?: string }>(row.meta_enc) ?? {}) : {};
  const glbBase64 = row.glb_enc ? (conn.vault.decryptField(row.glb_enc) ?? "") : "";
  const dir = path.resolve(dirInput ?? (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || assetId));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, ASSET_FILE), Buffer.from(glbBase64, "base64"));
  await writeFile(
    path.join(dir, ASSET_META_FILE),
    renderAssetMd({ kind: row.kind, name, description: meta.description ?? "", asset_id: row.id }, ""),
  );
  return { dir, assetId: row.id, name };
}

function describeCheck(report: Awaited<ReturnType<typeof checkAsset>>): string {
  const lines = [report.isValid ? `✓ Valid ${report.kind}.` : `✗ ${report.errors.length} error(s):`];
  for (const error of report.errors) lines.push(`  - ${error}`);
  for (const warning of report.warnings) lines.push(`  ! ${warning}`);
  const i = report.info;
  lines.push(`Triangles ${i.triangles}, ${Math.round(i.bytes / 1024)} KB, largest texture ${i.maxTexture} px`);
  if (i.bones.length) lines.push(`Bones: ${i.bones.join(", ")}`);
  if (i.sockets.length) lines.push(`Sockets: ${i.sockets.join(", ")}`);
  if (i.socket) lines.push(`Rides on: ${i.socket}`);
  if (i.clips.length) lines.push(`Clips: ${i.clips.join(", ")}`);
  return lines.join("\n");
}

export async function runAssets(argv: string[], out: Output): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "new": {
      const args = parse(rest, { kind: { type: "string" }, name: { type: "string" } }, USAGE);
      const kind = args.str("kind");
      if (kind !== "avatar" && kind !== "accessory") throw new CliError("--kind must be avatar or accessory", EXIT.usage, USAGE);
      const result = await newAsset(requirePositional(args.positionals, 0, "folder", USAGE), kind, args.str("name"));
      out.result(result, () => `Created ${result.dir}. ${result.next}`);
      return EXIT.ok;
    }
    case "check": {
      const args = parse(rest, {}, USAGE);
      const report = await checkAsset(args.positionals[0] ?? ".");
      out.result(report, () => describeCheck(report));
      return report.isValid ? EXIT.ok : EXIT.checkFailed;
    }
    case "push": {
      const args = parse(rest, {}, USAGE);
      const result = await pushAsset(await connect(), args.positionals[0] ?? ".");
      out.result(result, () =>
        `${result.action === "created" ? "Uploaded" : "Updated"} ${result.kind} "${result.name}" (${result.assetId}). The family can pick it in the companion's Look.`,
      );
      return EXIT.ok;
    }
    case "list": {
      parse(rest, {}, USAGE);
      const assets = await listAssets(await connect());
      out.result({ assets }, () =>
        assets.length ? assets.map((a) => `${a.id}  ${a.kind.padEnd(9)}  ${a.name}`).join("\n") : "No custom avatars or accessories yet.",
      );
      return EXIT.ok;
    }
    case "pull": {
      const args = parse(rest, {}, USAGE);
      const result = await pullAsset(await connect(), requirePositional(args.positionals, 0, "asset id", USAGE), args.positionals[1]);
      out.result(result, () => `Pulled "${result.name}" into ${result.dir}.`);
      return EXIT.ok;
    }
    case "publish": {
      const args = parse(rest, {}, USAGE);
      const result = await publishAsset(await connect(), args.positionals[0] ?? ".");
      out.result(result, () => "Submitted to dodi Discover. A person reviews it before it goes live: `dodi assets status` shows where it is.");
      return EXIT.ok;
    }
    case "status": {
      const args = parse(rest, {}, USAGE);
      const result = await assetStatus(await connect(), args.positionals[0] ?? ".");
      out.result(result, () =>
        !result.published
          ? "Not submitted to Discover."
          : "state" in result
            ? `${result.state}${result.rejection_reason ? `: ${result.rejection_reason}` : ""}`
            : "",
      );
      return EXIT.ok;
    }
    default:
      throw new CliError(sub ? `Unknown command "assets ${sub}"` : "Missing assets command", EXIT.usage, USAGE);
  }
}
