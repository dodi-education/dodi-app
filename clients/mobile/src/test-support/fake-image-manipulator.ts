/**
 * Stand-in for `expo-image-manipulator` for Node tests:
 * `vi.mock("expo-image-manipulator", () => import("@/test-support/fake-image-manipulator"))`.
 * A geometry-only raster engine: it reads the source's size from its PNG/JPEG
 * header (from the fake file system or a data URI), applies crop and resize in
 * call order (a crop outside the image throws, like the native module), and
 * "encodes" a header-only JPEG of the result. An unreadable source rejects.
 */
import { decodeBase64, fakeJpegBase64, readImageSize } from "@dodi/studio/ports.contract";

import { readFileBytes } from "./fake-expo-file-system";

export enum SaveFormat {
  JPEG = "jpeg",
  PNG = "png",
  WEBP = "webp",
}

interface Size {
  width: number;
  height: number;
}

function sourceSize(uri: string): Size | null {
  const bytes = uri.startsWith("data:") ? decodeBase64(uri.slice(uri.indexOf(",") + 1)) : readFileBytes(uri);
  return bytes ? readImageSize(bytes) : null;
}

class FakeImageRef {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  async saveAsync(options: { format?: SaveFormat; compress?: number; base64?: boolean } = {}) {
    if ((options.format ?? SaveFormat.JPEG) !== SaveFormat.JPEG) throw new Error("fake encoder: JPEG only");
    return {
      uri: `file:///cache/ImageManipulator/${Math.random().toString(36).slice(2)}.jpg`,
      width: this.width,
      height: this.height,
      base64: options.base64 ? fakeJpegBase64(this.width, this.height) : undefined,
    };
  }
}

class FakeContext {
  private readonly actions: ((size: Size) => Size)[] = [];
  constructor(private readonly uri: string) {}
  crop(rect: { originX: number; originY: number; width: number; height: number }): this {
    this.actions.push((size) => {
      const isInside =
        rect.originX >= 0 &&
        rect.originY >= 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.originX + rect.width <= size.width &&
        rect.originY + rect.height <= size.height;
      if (!isInside) throw new Error("Invalid crop options have been passed");
      return { width: rect.width, height: rect.height };
    });
    return this;
  }
  resize(target: { width?: number | null; height?: number | null }): this {
    this.actions.push((size) => {
      const width = target.width ?? Math.round((size.width * target.height!) / size.height);
      const height = target.height ?? Math.round((size.height * target.width!) / size.width);
      return { width, height };
    });
    return this;
  }
  async renderAsync(): Promise<FakeImageRef> {
    const size = sourceSize(this.uri);
    if (!size) throw new Error(`Could not load the image: ${this.uri}`);
    const result = this.actions.reduce((current, action) => action(current), { width: size.width, height: size.height });
    return new FakeImageRef(result.width, result.height);
  }
}

export const ImageManipulator = {
  manipulate(uri: string): FakeContext {
    return new FakeContext(uri);
  },
};
