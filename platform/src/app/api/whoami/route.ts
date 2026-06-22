import { NextResponse } from "next/server";

import { resolveAuth, unauthorizedResponse } from "@/lib/resolve-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    const { accountId, via } = await resolveAuth(request);
    return NextResponse.json({ accountId, via });
  } catch (error) {
    return unauthorizedResponse(error) ?? NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
