import { NextResponse } from "next/server";

import { fromBase64Url, utf8ToBytes, verify } from "@dodi/crypto";

import { issueDeviceBearer, verifyChallenge } from "@/lib/device-token";
import { serviceDb } from "@/lib/db";
import { getActiveDevice, touchLastSeen } from "@/services/devices";

/** Public: a device proves possession of its ML-DSA key by signing the nonce,
 *  and receives a short-lived bearer token. */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const deviceId = body?.deviceId;
  const nonce = body?.nonce;
  const signature = body?.signature;
  if (!deviceId || !nonce || !signature) {
    return NextResponse.json(
      { error: "deviceId, nonce, signature are required" },
      { status: 400 },
    );
  }
  if (!verifyChallenge(nonce, deviceId)) {
    return NextResponse.json(
      { error: "Invalid or expired challenge" },
      { status: 401 },
    );
  }
  const db = serviceDb;
  const device = await getActiveDevice(db, deviceId);
  if (!device || !device.account_id) {
    return NextResponse.json(
      { error: "Unknown or inactive device" },
      { status: 404 },
    );
  }
  const valid = verify(
    fromBase64Url(device.sign_public_key),
    utf8ToBytes(nonce),
    fromBase64Url(signature),
  );
  if (!valid) {
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 },
    );
  }
  await touchLastSeen(db, device.id);
  return NextResponse.json({
    token: issueDeviceBearer(device.account_id, deviceId),
  });
}
