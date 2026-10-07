/**
 * The app's offline cache for the kid view: the shared device cache
 * (`@dodi/client-state/offline-cache`, which owns the cache keys, the snapshot
 * payload budget and the pending-autosave queue) over device storage that
 * survives an app restart and process death (web: IndexedDB).
 *
 * - Rows live in their own SQLite database (`dodi-offline.db`, table
 *   `offline_entries`, keyed by store + key) as the JSON of what the platform
 *   returned: CIPHERTEXT (`enc:v1:` / SealedEnvelope), never decrypted
 *   plaintext. Plaintext system-game rows land here too (they are public).
 * - Big values (a kid's game rows with their code bundles, snapshot payloads,
 *   parked autosaves) go to a file in `<documents>/offline-cache/` instead and
 *   the row keeps the file's name. A new file is written before the row points
 *   at it and the old one is deleted after, so a crash leaves at worst an
 *   unreferenced file, swept when the database next opens.
 * - The vault keys go through `sealedSlot` (a SecureStore key, the sealed blob
 *   in the key-value store), never this database, as the device keys do: a
 *   copy of the app data alone opens nothing.
 *
 * Every call runs on one queue, so overlapping writes of a key can't race
 * over its file. Failures reject here and the shared cache turns them into
 * misses: offline support never breaks the online path.
 */
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { type SQLiteDatabase, openDatabaseAsync } from "expo-sqlite";
import {
  createOfflineCache,
  type DeviceOfflineCache,
  type OfflineCacheBackend,
  type OfflineStoreName,
} from "@dodi/client-state/offline-cache";

import { sealedSlot } from "./sealed-storage";

const DB_NAME = "dodi-offline.db";
const BLOB_DIR = "offline-cache";
const BLOB_FILE = /^[A-Za-z0-9-]+\.json$/;

/** Values whose JSON is longer than this live in a file, not the row. */
export const INLINE_VALUE_MAX_CHARS = 64 * 1024;

interface EntryRow {
  entry_key: string;
  value_json: string | null;
  blob_file_name: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS offline_entries (
  store_name TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  value_json TEXT,
  blob_file_name TEXT,
  PRIMARY KEY (store_name, entry_key)
);
`;

function blobDir(): Directory {
  const dir = new Directory(Paths.document, BLOB_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function blobFile(name: string): File {
  // Names are ours (uuid.json); anything else must not turn into a path.
  if (!BLOB_FILE.test(name)) throw new Error("invalid offline blob name");
  return new File(blobDir(), name);
}

function deleteBlob(name: string): void {
  try {
    const file = blobFile(name);
    if (file.exists) file.delete();
  } catch {
    // An unreferenced file is swept on the next open.
  }
}

/** Files no row points at (a crash between file write and row update). */
async function sweepOrphanBlobs(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ blob_file_name: string }>(
    "SELECT blob_file_name FROM offline_entries WHERE blob_file_name IS NOT NULL",
  );
  const referenced = new Set(rows.map((row) => row.blob_file_name));
  for (const entry of blobDir().list()) {
    if (entry instanceof File && !referenced.has(entry.name)) entry.delete();
  }
}

async function readValue(row: EntryRow): Promise<unknown> {
  if (row.value_json !== null) return JSON.parse(row.value_json) as unknown;
  if (row.blob_file_name === null) return undefined;
  const file = blobFile(row.blob_file_name);
  // A missing file reads as a miss, like a missing row.
  return file.exists ? (JSON.parse(await file.text()) as unknown) : undefined;
}

/** The SQLite + files backend (exported for tests; the app uses `offlineCache`). */
export function createNativeOfflineBackend(): OfflineCacheBackend {
  let opening: Promise<SQLiteDatabase> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  function database(): Promise<SQLiteDatabase> {
    opening ??= (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA);
      await sweepOrphanBlobs(db).catch(() => {});
      return db;
    })().catch((error: unknown) => {
      opening = null;
      throw error;
    });
    return opening;
  }

  function serial<T>(task: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    const run = queue.then(async () => task(await database()));
    queue = run.catch(() => {});
    return run;
  }

  async function blobNameOf(db: SQLiteDatabase, store: OfflineStoreName, key: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ blob_file_name: string | null }>(
      "SELECT blob_file_name FROM offline_entries WHERE store_name = ? AND entry_key = ?",
      [store, key],
    );
    return row?.blob_file_name ?? null;
  }

  return {
    get: (store, key) =>
      serial(async (db) => {
        const row = await db.getFirstAsync<EntryRow>(
          "SELECT entry_key, value_json, blob_file_name FROM offline_entries WHERE store_name = ? AND entry_key = ?",
          [store, key],
        );
        return row ? readValue(row) : undefined;
      }),

    put: (store, key, value) =>
      serial(async (db) => {
        const json = JSON.stringify(value) ?? "null";
        const previous = await blobNameOf(db, store, key);
        let inline: string | null = json;
        let fileName: string | null = null;
        if (json.length > INLINE_VALUE_MAX_CHARS) {
          fileName = `${randomUUID()}.json`;
          const file = blobFile(fileName);
          file.create();
          file.write(json);
          inline = null;
        }
        try {
          await db.runAsync(
            "INSERT OR REPLACE INTO offline_entries (store_name, entry_key, value_json, blob_file_name) VALUES (?, ?, ?, ?)",
            [store, key, inline, fileName],
          );
        } catch (error) {
          if (fileName) deleteBlob(fileName);
          throw error;
        }
        if (previous) deleteBlob(previous);
      }),

    delete: (store, key) =>
      serial(async (db) => {
        const previous = await blobNameOf(db, store, key);
        await db.runAsync("DELETE FROM offline_entries WHERE store_name = ? AND entry_key = ?", [store, key]);
        if (previous) deleteBlob(previous);
      }),

    entries: (store) =>
      serial(async (db) => {
        const rows = await db.getAllAsync<EntryRow>(
          "SELECT entry_key, value_json, blob_file_name FROM offline_entries WHERE store_name = ?",
          [store],
        );
        const entries: { key: string; value: unknown }[] = [];
        for (const row of rows) {
          const value = await readValue(row);
          if (value !== undefined) entries.push({ key: row.entry_key, value });
        }
        return entries;
      }),

    clearAll: () =>
      serial(async (db) => {
        await db.runAsync("DELETE FROM offline_entries");
        const dir = new Directory(Paths.document, BLOB_DIR);
        if (dir.exists) dir.delete();
      }),
  };
}

/** The app-wide offline cache (stores, snapshots, sign-out wipe). */
export const offlineCache: DeviceOfflineCache = createOfflineCache({
  backend: createNativeOfflineBackend(),
  vaultKeys: sealedSlot("offline-vault-keys"),
});
