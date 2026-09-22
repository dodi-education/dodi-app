import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/services/ops-stats", () => ({
  getOpsKpis: vi.fn(),
  getOpsGameStats: vi.fn(),
  getOpsAiRequestShare: vi.fn(),
}));
vi.mock("@/services/ops-lists", async (importOriginal) => {
  // Keep the real query schemas: their coercion and caps are what is under test.
  const actual = await importOriginal<typeof import("@/services/ops-lists")>();
  return { ...actual, listOpsAccounts: vi.fn(), listOpsGames: vi.fn() };
});
vi.mock("@/services/error-logs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/error-logs")>();
  return { ...actual, listOpsErrorLogs: vi.fn() };
});

import { getOpsAiRequestShare, getOpsGameStats, getOpsKpis } from "@/services/ops-stats";
import { listOpsAccounts, listOpsGames } from "@/services/ops-lists";
import { listOpsErrorLogs } from "@/services/error-logs";

import { GET as getKpis } from "./stats/kpis/route";
import { GET as getGameStats } from "./stats/games/route";
import { GET as getAiRequests } from "./stats/ai-requests/route";
import { GET as getAccounts } from "./accounts/route";
import { GET as getGames } from "./games/route";
import { GET as getErrorLogs } from "./error-logs/route";

/**
 * Route-level behaviour of the ops read endpoints: the auth gate, query
 * parsing, and that the service result is returned unwrapped. The service
 * tests cover the SQL; these cover the door.
 */

const SECRET = "ops-secret-for-tests";

function request(path: string, secret: string | null = SECRET): Request {
  return new Request(`https://platform.dodi.app${path}`, {
    headers: secret ? { "x-ops-secret": secret } : {},
  });
}

type Handler = (request: Request) => Promise<Response>;

const ENDPOINTS: Array<{ name: string; path: string; handler: Handler; mock: ReturnType<typeof vi.fn> }> = [
  { name: "stats/kpis", path: "/api/internal/stats/kpis", handler: getKpis, mock: vi.mocked(getOpsKpis) },
  { name: "stats/games", path: "/api/internal/stats/games", handler: getGameStats, mock: vi.mocked(getOpsGameStats) },
  { name: "stats/ai-requests", path: "/api/internal/stats/ai-requests", handler: getAiRequests, mock: vi.mocked(getOpsAiRequestShare) },
  { name: "accounts", path: "/api/internal/accounts", handler: getAccounts, mock: vi.mocked(listOpsAccounts) },
  { name: "games", path: "/api/internal/games", handler: getGames, mock: vi.mocked(listOpsGames) },
  { name: "error-logs", path: "/api/internal/error-logs", handler: getErrorLogs, mock: vi.mocked(listOpsErrorLogs) },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPS_SECRET = SECRET;
  for (const endpoint of ENDPOINTS) endpoint.mock.mockResolvedValue({ ok: true } as never);
});

describe("the ops read endpoints", () => {
  for (const endpoint of ENDPOINTS) {
    it(`${endpoint.name} refuses a request with no ops secret`, async () => {
      const response = await endpoint.handler(request(endpoint.path, null));
      expect(response.status).toBe(401);
      expect(endpoint.mock).not.toHaveBeenCalled();
    });

    it(`${endpoint.name} refuses a request with the wrong ops secret`, async () => {
      const response = await endpoint.handler(request(endpoint.path, "not-the-secret"));
      expect(response.status).toBe(401);
      expect(endpoint.mock).not.toHaveBeenCalled();
    });

    it(`${endpoint.name} returns the service result to an authorized caller`, async () => {
      const response = await endpoint.handler(request(endpoint.path));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });
  }

  it("fails closed when OPS_SECRET is unset", async () => {
    delete process.env.OPS_SECRET;
    const response = await getKpis(request("/api/internal/stats/kpis"));
    expect(response.status).toBe(401);
  });
});

describe("query handling", () => {
  it("defaults the stats window to 30 days", async () => {
    await getKpis(request("/api/internal/stats/kpis"));
    expect(vi.mocked(getOpsKpis).mock.calls[0][1]).toMatchObject({ key: "30d", days: 30 });
  });

  it("passes a valid range through", async () => {
    await getKpis(request("/api/internal/stats/kpis?range=7d"));
    expect(vi.mocked(getOpsKpis).mock.calls[0][1]).toMatchObject({ key: "7d", days: 7 });
  });

  it("rejects an unknown range rather than guessing", async () => {
    const response = await getKpis(request("/api/internal/stats/kpis?range=all-time"));
    expect(response.status).toBe(400);
    expect(vi.mocked(getOpsKpis)).not.toHaveBeenCalled();
  });

  it("applies the list defaults", async () => {
    await getGames(request("/api/internal/games"));
    expect(vi.mocked(listOpsGames).mock.calls[0][1]).toMatchObject({
      state: "all",
      sort: "submitted_desc",
      page: 1,
    });
  });

  it("carries the state filter and search term into the service", async () => {
    await getGames(request("/api/internal/games?state=requested&query=rocket&page=2"));
    expect(vi.mocked(listOpsGames).mock.calls[0][1]).toMatchObject({
      state: "requested",
      query: "rocket",
      page: 2,
    });
  });

  it("refuses an unknown game state", async () => {
    const response = await getGames(request("/api/internal/games?state=deleted"));
    expect(response.status).toBe(400);
  });

  it("caps the page size so one call cannot pull the whole table", async () => {
    const response = await getAccounts(request("/api/internal/accounts?limit=5000"));
    expect(response.status).toBe(400);
    expect(vi.mocked(listOpsAccounts)).not.toHaveBeenCalled();
  });

  it("passes the billing-only account filters through, for the empty-state answer", async () => {
    await getAccounts(request("/api/internal/accounts?status=trial"));
    expect(vi.mocked(listOpsAccounts).mock.calls[0][1]).toMatchObject({ status: "trial" });
  });
});
