import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { CLIENT_REQUEST_HEADERS, CURRENT_DEVICE_HEADER } from "@dodi/protocol/client-headers";

import { middleware } from "./middleware";

/**
 * CORS preflight for the browser clients (app.dodi.app → platform.dodi.app).
 * Every custom header a client sends must be allowed here, or the browser
 * blocks the request before it reaches the route. Node tests and the CLI
 * never see that, so it is pinned here.
 */
function preflight(path: string, headers: string): Response {
  return middleware(
    new NextRequest(`https://platform.dodi.app${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        "access-control-request-headers": headers,
      },
    }),
  );
}

function allowedHeaders(res: Response): string[] {
  return (res.headers.get("access-control-allow-headers") ?? "").split(",").map((h) => h.trim().toLowerCase());
}

describe("platform CORS", () => {
  it("allows the Access list's current-device header (Settings > Access)", () => {
    const res = preflight("/api/authorized-clients", `authorization,${CURRENT_DEVICE_HEADER}`);
    expect(res.status).toBe(204);
    expect(allowedHeaders(res)).toContain(CURRENT_DEVICE_HEADER);
  });

  it("allows every custom header a client sends", () => {
    expect(allowedHeaders(preflight("/api/kids", "authorization"))).toEqual(
      expect.arrayContaining(["authorization", "content-type", ...CLIENT_REQUEST_HEADERS]),
    );
  });
});
