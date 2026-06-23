import { NextResponse } from "next/server";

import { issueChallenge } from "@/lib/device-token";
import { serviceClient } from "@/lib/supabase";
import { getActiveDevice } from "@/services/devices";

/** Public: an active device requests a challenge nonce to sign. */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const deviceId = body?.deviceId;
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  const device = await getActiveDevice(serviceClient(), deviceId);
  if (!device) {
    return NextResponse.json(
      { error: "Unknown or inactive device" },
      { status: 404 },
    );
  }
  return NextResponse.json({ nonce: issueChallenge(deviceId) });
}
