import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/services/feedback-messages", () => ({ getOpsFeedbackImage: vi.fn() }));

import { getOpsFeedbackImage } from "@/services/feedback-messages";

import { GET } from "./route";

/**
 * The ops console's image route: the auth gate, the id check, and a response
 * a browser can only ever show as the detected raster type.
 */

const ID = "0d15c0de-0000-4000-8000-000000000001";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);

function request(secret: string | null = "right"): Request {
  return new Request(`https://platform.dodi.app/api/internal/feedback/${ID}/image`, {
    headers: secret ? { "x-ops-secret": secret } : {},
  });
}

function context(id = ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPS_SECRET = "right";
  vi.mocked(getOpsFeedbackImage).mockResolvedValue({ contentType: "image/jpeg", bytes: JPEG });
});

describe("GET /api/internal/feedback/[id]/image", () => {
  it("refuses a caller without the ops secret", async () => {
    expect((await GET(request(null), context())).status).toBe(401);
    expect((await GET(request("wrong"), context())).status).toBe(401);
    expect(getOpsFeedbackImage).not.toHaveBeenCalled();
  });

  it("answers the bytes as the detected type, locked down and never cached", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...JPEG]);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe(String(JPEG.byteLength));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(getOpsFeedbackImage).toHaveBeenCalledWith({}, ID);
  });

  it("answers 404 for a message without an image and for an id that is not a uuid", async () => {
    vi.mocked(getOpsFeedbackImage).mockResolvedValue(null);
    expect((await GET(request(), context())).status).toBe(404);
    expect((await GET(request(), context("nope"))).status).toBe(404);
    expect(getOpsFeedbackImage).toHaveBeenCalledTimes(1);
  });
});
