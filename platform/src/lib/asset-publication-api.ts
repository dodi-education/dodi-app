import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { AssetPublicationError } from "@/services/character-asset-publications";

/** POST /api/character-assets/[id]/publication: the decrypted copy to publish. */
export const SubmitAssetPublicationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  /** The .glb as base64 (an avatar is at most 3 MiB, so about 4.2 M chars). */
  glbBase64: z
    .string()
    .min(16)
    .max(4_200_000)
    .regex(/^[A-Za-z0-9+/_-]+={0,2}$/),
  previewImage: z
    .string()
    .max(1_500_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .default(null),
});

const STATUS: Record<AssetPublicationError["code"], number> = {
  not_found: 404,
  handle_required: 409,
  invalid_file: 400,
  limit_reached: 429,
  kind_mismatch: 400,
};

export function assetPublicationErrorResponse(
  error: AssetPublicationError,
): NextResponse {
  return NextResponse.json(
    {
      error: error.code,
      ...(error.details.length ? { details: error.details } : {}),
    },
    { status: STATUS[error.code] },
  );
}

/** The 400 every route answers for a malformed body. */
export function validationFailed(issues: unknown): NextResponse {
  return NextResponse.json(
    { error: "Validation failed", issues },
    { status: 400 },
  );
}

export const UUID = z.string().uuid();
