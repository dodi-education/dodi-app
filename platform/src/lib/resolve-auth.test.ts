import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Agent bearers (the dodi CLI) are default-deny: a route that doesn't name an
 * agent scope refuses them, a route that does checks the scope against the
 * device row on every request, and a revoked or expired agent is a 401.
 */

const { getActiveAgentClientMock, getSessionMock } = vi.hoisted(() => ({
  getActiveAgentClientMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("@/services/authorized-clients", () => ({
  getActiveAgentClient: getActiveAgentClientMock,
}));
vi.mock("./auth", () => ({ auth: { api: { getSession: getSessionMock } } }));
vi.mock("./db", () => ({
  serviceDb: { role: "service" },
  scopedDb: (accountId: string) => ({ role: "scoped", accountId }),
}));

import { issueDeviceBearer } from "./device-token";
import {
  AuthError,
  ForbiddenError,
  requireAuth,
  resolveAuth,
} from "./resolve-auth";

function requestWith(token: string): Request {
  return new Request("https://platform.test/api/x", {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeAll(() => {
  process.env.DEVICE_TOKEN_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
});

beforeEach(() => {
  getActiveAgentClientMock.mockReset();
  getSessionMock.mockReset();
});

describe("resolveAuth for agents", () => {
  const agentToken = () => issueDeviceBearer("acc-1", "dev-1", "agent");

  it("refuses an agent on a route that doesn't opt in", async () => {
    getActiveAgentClientMock.mockResolvedValue({
      id: "d",
      scopes: ["games"],
      name: "x",
    });
    await expect(resolveAuth(requestWith(agentToken()))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("refuses an agent missing the route's scope", async () => {
    getActiveAgentClientMock.mockResolvedValue({
      id: "d",
      scopes: ["games"],
      name: "x",
    });
    await expect(
      resolveAuth(requestWith(agentToken()), { agentScope: "kids:memory" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admits an agent holding the scope, as the account with RLS", async () => {
    getActiveAgentClientMock.mockResolvedValue({
      id: "d",
      scopes: ["games"],
      name: "x",
    });
    const auth = await resolveAuth(requestWith(agentToken()), {
      agentScope: "games",
    });
    expect(auth.via).toBe("agent");
    expect(auth.accountId).toBe("acc-1");
    expect(auth.deviceId).toBe("dev-1");
    expect(auth.db).toEqual({ role: "scoped", accountId: "acc-1" });
    expect([...auth.scopes!]).toEqual(["games"]);
  });

  it("is a 401 once the agent is revoked or expired", async () => {
    getActiveAgentClientMock.mockResolvedValue(null);
    const res = await requireAuth(requestWith(agentToken()), {
      agentScope: "any",
    });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it("answers a 403 from requireAuth for a refused route", async () => {
    getActiveAgentClientMock.mockResolvedValue({
      id: "d",
      scopes: [],
      name: "x",
    });
    const res = await requireAuth(requestWith(agentToken()));
    expect((res as Response).status).toBe(403);
  });

  it("leaves robots and users unscoped", async () => {
    const robot = await resolveAuth(
      requestWith(issueDeviceBearer("acc-1", "robot-1")),
    );
    expect(robot.via).toBe("robot");
    expect(robot.scopes).toBeNull();
    expect(getActiveAgentClientMock).not.toHaveBeenCalled();

    getSessionMock.mockResolvedValue({
      user: { id: "acc-2" },
      session: { id: "sess-2" },
    });
    const user = await resolveAuth(requestWith("session-token"));
    expect(user.via).toBe("user");
    expect(user.scopes).toBeNull();
    expect(user.sessionId).toBe("sess-2");
  });

  it("is still an AuthError without a token", async () => {
    await expect(
      resolveAuth(new Request("https://platform.test/")),
    ).rejects.toBeInstanceOf(AuthError);
  });
});
