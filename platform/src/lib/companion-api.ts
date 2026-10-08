import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { CompanionError } from "@/services/companions";

/**
 * Writable companion fields. name_enc / look_enc are opaque client-sealed
 * enc:v1 strings (or NULL for the catalog defaults); the server never reads
 * them.
 */
export const CompanionFieldsSchema = z.object({
  persona_id: z.string().uuid().nullable().optional(),
  name_enc: z.string().max(600).nullable().optional(),
  look_enc: z.string().max(6000).nullable().optional(),
});

const STATUS: Record<CompanionError["code"], number> = {
  not_found: 404,
  persona_not_found: 400,
  companion_limit_reached: 409,
  last_companion: 409,
};

export function companionErrorResponse(error: CompanionError): NextResponse {
  return NextResponse.json({ error: error.code }, { status: STATUS[error.code] });
}
