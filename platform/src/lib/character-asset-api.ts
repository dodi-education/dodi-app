import { NextResponse } from "next/server";
import { z } from "zod/v4";

import {
  CHARACTER_ASSET_MAX_BYTES,
  CHARACTER_ASSET_MAX_GLB_ENC_LENGTH,
  type CharacterAssetError,
} from "@/services/character-assets";

/**
 * Request bodies for /api/character-assets. Every text field is an opaque
 * client-sealed enc:v1 record: the server checks the prefix and the size,
 * never the content (the client validates the .glb before sealing it).
 */
const sealed = (max: number) =>
  z
    .string()
    .min(8)
    .max(max)
    .refine((value) => value.startsWith("enc:v1:"), {
      message: "must be an enc:v1: record",
    });

const NAME_ENC_MAX = 2000;
const META_ENC_MAX = 16000;
const GLB_ENC_MAX = Math.max(
  ...Object.values(CHARACTER_ASSET_MAX_GLB_ENC_LENGTH),
);
const BYTE_SIZE_MAX = Math.max(...Object.values(CHARACTER_ASSET_MAX_BYTES));

export const CreateCharacterAssetSchema = z.object({
  kind: z.enum(["avatar", "accessory"]),
  name_enc: sealed(NAME_ENC_MAX),
  meta_enc: sealed(META_ENC_MAX).nullable().optional(),
  glb_enc: sealed(GLB_ENC_MAX),
  byte_size: z.number().int().positive().max(BYTE_SIZE_MAX),
});

export const UpdateCharacterAssetSchema = z
  .object({
    name_enc: sealed(NAME_ENC_MAX).optional(),
    meta_enc: sealed(META_ENC_MAX).nullable().optional(),
    glb_enc: sealed(GLB_ENC_MAX).optional(),
    byte_size: z.number().int().positive().max(BYTE_SIZE_MAX).optional(),
  })
  // A new file comes with its size, so the limits keep holding.
  .refine(
    (body) => (body.glb_enc === undefined) === (body.byte_size === undefined),
    {
      message: "glb_enc and byte_size go together",
    },
  );

const STATUS: Record<CharacterAssetError["code"], number> = {
  not_found: 404,
  asset_limit_reached: 409,
  too_large: 413,
};

export function characterAssetErrorResponse(
  error: CharacterAssetError,
): NextResponse {
  return NextResponse.json(
    { error: error.code },
    { status: STATUS[error.code] },
  );
}

/** Parse a JSON body; null when it isn't JSON. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
