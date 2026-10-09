-- character_assets: a family's own companion avatars and accessories.
--
-- Families make them with the dodi CLI (or, later, the apps): a .glb in the
-- character format (characters/README.md), checked on the client by
-- @dodi/character's validateCharacterAsset before it is sealed, as the game
-- sanitizer runs before a game is sealed. A companion's look refers to one as
-- `custom:<id>` (CompanionLook.model / accessories, inside the sealed
-- companions.look_enc), so the server never learns which companion wears it.
--
-- Sealing: name_enc, meta_enc and glb_enc are enc:v1 records sealed
-- client-side under the account vault key. glb_enc is the sealed base64 of the
-- file's bytes (text, never jsonb or bytea: the sealed form is a string). The
-- server cannot decrypt, so it cannot check the file; it only enforces sizes.
-- byte_size is the plaintext file size, kept in the clear for the limits
-- (it reveals no more than glb_enc's own length does).
--
-- Sizes follow validate.py's budgets: an avatar is at most 3 MiB, an
-- accessory 1 MiB. A sealed record costs about 43 + 1.34n chars of an
-- n-char plaintext, and the plaintext is base64 (1.34x), so a 3 MiB avatar
-- seals to about 5.6 M chars and a 1 MiB accessory to about 1.9 M.
--
-- Deleting an asset needs nothing else: looks that refer to it are sealed, so
-- the client drops unknown custom refs (sanitizeLook) and falls back to the
-- catalog.

CREATE TABLE public.character_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name_enc text NOT NULL,
  meta_enc text,
  glb_enc text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT character_assets_kind_check CHECK (kind = ANY (ARRAY['avatar'::text, 'accessory'::text])),
  CONSTRAINT character_assets_name_enc_length_check CHECK (char_length(name_enc) BETWEEN 1 AND 2000),
  CONSTRAINT character_assets_meta_enc_length_check CHECK (meta_enc IS NULL OR char_length(meta_enc) <= 16000),
  CONSTRAINT character_assets_byte_size_check CHECK (
    byte_size > 0 AND byte_size <= CASE WHEN kind = 'avatar' THEN 3145728 ELSE 1048576 END
  ),
  CONSTRAINT character_assets_glb_enc_length_check CHECK (
    char_length(glb_enc) <= CASE WHEN kind = 'avatar' THEN 5600000 ELSE 1900000 END
  )
);

CREATE INDEX character_assets_account_id_idx ON public.character_assets (account_id);

CREATE TRIGGER character_assets_updated_at BEFORE UPDATE ON public.character_assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.character_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own character assets" ON public.character_assets
  FOR SELECT USING (app.current_account_id() = account_id);
CREATE POLICY "Users can create character assets for own account" ON public.character_assets
  FOR INSERT WITH CHECK (app.current_account_id() = account_id);
CREATE POLICY "Users can update own character assets" ON public.character_assets
  FOR UPDATE USING (app.current_account_id() = account_id)
  WITH CHECK (app.current_account_id() = account_id);
CREATE POLICY "Users can delete own character assets" ON public.character_assets
  FOR DELETE USING (app.current_account_id() = account_id);

COMMENT ON TABLE public.character_assets IS
  'A family''s own companion avatars and accessories (.glb, character format v1), sealed client-side. Looks refer to them as custom:<id>.';
COMMENT ON COLUMN public.character_assets.kind IS
  'avatar (a whole character) or accessory (a prop on a socket). Plaintext.';
COMMENT ON COLUMN public.character_assets.name_enc IS
  'enc:v1 sealed display name. Server cannot decrypt.';
COMMENT ON COLUMN public.character_assets.meta_enc IS
  'enc:v1 sealed JSON CharacterAssetMeta { v: 1, description?, socket? }. NULL = none. Never jsonb.';
COMMENT ON COLUMN public.character_assets.glb_enc IS
  'enc:v1 sealed base64 of the .glb bytes, validated on the client before sealing. Server cannot decrypt or check it.';
COMMENT ON COLUMN public.character_assets.byte_size IS
  'Plaintext .glb size in bytes, for the per-kind limits (avatar 3 MiB, accessory 1 MiB).';

-- reverse:
-- DROP TABLE public.character_assets;
