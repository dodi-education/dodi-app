/**
 * Device storage for Game Studio build checkpoints (`CheckpointStore` of
 * `@dodi/studio`): one vault-sealed file per game in the app's document
 * directory, so a build the OS suspended or a killed process cut short can
 * continue on this device. Records are sealed before they get here and never
 * leave the device (the web keeps the same records in IndexedDB).
 */
import { Directory, File, Paths } from "expo-file-system";
import type { CheckpointStore } from "@dodi/studio/ports";

const GAME_ID = /^[A-Za-z0-9-]+$/;

function checkpointDir(): Directory {
  const dir = new Directory(Paths.document, "build-checkpoints");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function checkpointFile(gameId: string): File {
  // Game ids are UUIDs; anything else must not turn into a path.
  if (!GAME_ID.test(gameId)) throw new Error("invalid game id");
  return new File(checkpointDir(), `${gameId}.sealed`);
}

export const fileCheckpointStore: CheckpointStore = {
  async save(gameId, sealed) {
    const file = checkpointFile(gameId);
    if (!file.exists) file.create();
    file.write(sealed);
  },
  async load(gameId) {
    const file = checkpointFile(gameId);
    return file.exists ? file.text() : null;
  },
  async clear(gameId) {
    const file = checkpointFile(gameId);
    if (file.exists) file.delete();
  },
};

/** Games with a stored checkpoint, for the cold-start "Continue building" offer. */
export function listCheckpointGameIds(): string[] {
  return checkpointDir()
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith(".sealed"))
    .map((file) => file.name.slice(0, -".sealed".length));
}
