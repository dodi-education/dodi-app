/**
 * POST /api/vault/device-wraps — add one device's wrap of the family's VMK
 * (pairing an agent or the robot). The owner's client rewrites the whole blob
 * through PUT /api/vault/keys; a co-parent's client, which must not touch the
 * owner's password wrap, adds just the one entry here.
 */
import { NextResponse } from "next/server";

import { AppendDeviceWrapBodySchema } from "@dodi/protocol/family-members";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { appendDeviceWrap, removeDeviceWrap } from "@/services/vault-keys";

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { roles: ["owner", "co_parent"] });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  const parsed = AppendDeviceWrapBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const added = await appendDeviceWrap(auth.db, auth.accountId, parsed.data);
    if (!added) return NextResponse.json({ error: "No vault to update" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to add the device", "api/vault/device-wraps#POST", {
      accountId: auth.accountId,
    });
  }
}

/** DELETE /api/vault/device-wraps?deviceId=… — drop one device's wrap (a pairing rolled back). */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { roles: ["owner", "co_parent"] });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  const deviceId = new URL(request.url).searchParams.get("deviceId") ?? "";
  if (deviceId.length < 1 || deviceId.length > 200) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  try {
    await removeDeviceWrap(auth.db, auth.accountId, deviceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to remove the device", "api/vault/device-wraps#DELETE", {
      accountId: auth.accountId,
    });
  }
}
