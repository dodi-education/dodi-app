/**
 * In-memory stand-in for `expo-file-system` (the SDK 54+ File / Directory /
 * Paths API) for Node tests: `vi.mock("expo-file-system", () =>
 * import("@/test-support/fake-expo-file-system"))`. Mirrors the native
 * behaviour the adapters depend on: `create()` throws when the entry exists
 * (unless idempotent / overwrite) or the parent is missing (unless
 * intermediates), `write()` creates a missing file, `delete()` throws for a
 * missing entry, `text()` is async.
 */
import { decodeBase64, encodeBase64 } from "@dodi/studio/ports.contract";

const files = new Map<string, Uint8Array>();
const dirs = new Set<string>();

const ROOTS = ["file:///document", "file:///cache"];

/** Empty file system with the document and cache roots. */
export function resetFileSystem(): void {
  files.clear();
  dirs.clear();
  for (const root of ROOTS) dirs.add(root);
}
resetFileSystem();

/** The bytes of the file at `uri`, or null (for fakes of native modules that read files). */
export function readFileBytes(uri: string): Uint8Array | null {
  return files.get(uri) ?? null;
}

/** Every file's contents, decoded as UTF-8 (for "never stored in plaintext" checks). */
export function dumpFiles(): string {
  return [...files.entries()].map(([uri, bytes]) => `${uri}\n${new TextDecoder().decode(bytes)}`).join("\n");
}

type PathPart = string | FsEntry;

function joinUri(parts: PathPart[]): string {
  const raw = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  const [, scheme = "file://", rest = raw] = /^([a-z]+:\/\/)?(.*)$/.exec(raw) ?? [];
  return scheme + "/" + rest.split("/").filter(Boolean).join("/");
}

function parentOf(uri: string): string {
  return uri.slice(0, uri.lastIndexOf("/"));
}

abstract class FsEntry {
  readonly uri: string;
  constructor(...parts: PathPart[]) {
    this.uri = joinUri(parts);
  }
  get name(): string {
    return this.uri.slice(this.uri.lastIndexOf("/") + 1);
  }
  abstract get exists(): boolean;
}

export class Directory extends FsEntry {
  get exists(): boolean {
    return dirs.has(this.uri);
  }
  create(options: { intermediates?: boolean; idempotent?: boolean; overwrite?: boolean } = {}): void {
    if (this.exists) {
      if (options.idempotent || options.overwrite) return;
      throw new Error(`Directory ${this.uri} already exists`);
    }
    const parent = parentOf(this.uri);
    if (!dirs.has(parent)) {
      if (!options.intermediates) throw new Error(`Parent of ${this.uri} does not exist`);
      new Directory(parent).create({ intermediates: true, idempotent: true });
    }
    dirs.add(this.uri);
  }
  list(): (File | Directory)[] {
    if (!this.exists) throw new Error(`Directory ${this.uri} does not exist`);
    const children: (File | Directory)[] = [];
    for (const uri of files.keys()) if (parentOf(uri) === this.uri) children.push(new File(uri));
    for (const uri of dirs) if (parentOf(uri) === this.uri) children.push(new Directory(uri));
    return children;
  }
  delete(): void {
    if (!this.exists) throw new Error(`Directory ${this.uri} does not exist`);
    for (const uri of [...files.keys()]) if (uri.startsWith(this.uri + "/")) files.delete(uri);
    for (const uri of [...dirs]) if (uri === this.uri || uri.startsWith(this.uri + "/")) dirs.delete(uri);
  }
}

export class File extends FsEntry {
  get exists(): boolean {
    return files.has(this.uri);
  }
  get size(): number {
    return files.get(this.uri)?.length ?? 0;
  }
  create(options: { intermediates?: boolean; overwrite?: boolean } = {}): void {
    if (this.exists && !options.overwrite) throw new Error(`File ${this.uri} already exists`);
    const parent = parentOf(this.uri);
    if (!dirs.has(parent)) {
      if (!options.intermediates) throw new Error(`Parent of ${this.uri} does not exist`);
      new Directory(parent).create({ intermediates: true, idempotent: true });
    }
    files.set(this.uri, new Uint8Array(0));
  }
  write(content: string | Uint8Array, options: { encoding?: "utf8" | "base64" } = {}): void {
    if (!dirs.has(parentOf(this.uri))) throw new Error(`Parent of ${this.uri} does not exist`);
    const bytes =
      typeof content === "string"
        ? options.encoding === "base64"
          ? decodeBase64(content)
          : new TextEncoder().encode(content)
        : new Uint8Array(content);
    files.set(this.uri, bytes);
  }
  private read(): Uint8Array {
    const bytes = files.get(this.uri);
    if (!bytes) throw new Error(`File ${this.uri} does not exist`);
    return bytes;
  }
  textSync(): string {
    return new TextDecoder().decode(this.read());
  }
  async text(): Promise<string> {
    return this.textSync();
  }
  base64Sync(): string {
    return encodeBase64(this.read());
  }
  async base64(): Promise<string> {
    return this.base64Sync();
  }
  bytesSync(): Uint8Array {
    return new Uint8Array(this.read());
  }
  async bytes(): Promise<Uint8Array> {
    return this.bytesSync();
  }
  delete(): void {
    this.read();
    files.delete(this.uri);
  }
}

export const Paths = {
  get document(): Directory {
    return new Directory(ROOTS[0]);
  },
  get cache(): Directory {
    return new Directory(ROOTS[1]);
  },
};
