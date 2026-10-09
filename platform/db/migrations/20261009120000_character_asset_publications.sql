-- Discover for companion avatars and accessories.
--
-- A family shares one of its sealed character_assets with every family by
-- submitting a PLAINTEXT copy (the client decrypts and sends name, description
-- and the .glb; the server validates the file, which it can do only here, on
-- the copy that is public anyway). The private asset stays sealed. Like games,
-- publication forks, and the copy lives in its own table so a plaintext row
-- is never mistaken for a sealed one.
--
-- Review: the platform re-validates the file against the character format on
-- submit; a person approves or rejects it through the ops endpoints before it
-- appears on Discover (published_at set).
--
-- Use in place, never copy: another family "adds" a published asset with a
-- character_asset_sharings row (its own account_id) pointing at the single
-- published row, and its companions' looks refer to it as custom:<id>, the
-- same ref a family's own assets use.
--
-- Access: users can read their own submissions (status) and manage their own
-- sharing rows. Every cross-account read (the Discover list, another family's
-- file) goes through the service handle in services/character-asset-publications.ts
-- with an explicit projection: account_id never leaves the server; the byline
-- is the publisher's publication_handle.

CREATE TABLE public.published_character_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_asset_id uuid REFERENCES public.character_assets(id) ON DELETE SET NULL,
  kind text NOT NULL,
  name text NOT NULL,
  description text DEFAULT '' NOT NULL,
  socket text,
  glb_base64 text NOT NULL,
  byte_size integer NOT NULL,
  preview_image text,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  published_at timestamp with time zone,
  rejected_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT published_character_assets_kind_check CHECK (kind = ANY (ARRAY['avatar'::text, 'accessory'::text])),
  CONSTRAINT published_character_assets_name_check CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT published_character_assets_description_check CHECK (char_length(description) <= 500),
  CONSTRAINT published_character_assets_byte_size_check CHECK (
    byte_size > 0 AND byte_size <= CASE WHEN kind = 'avatar' THEN 3145728 ELSE 1048576 END
  ),
  CONSTRAINT published_character_assets_glb_length_check CHECK (
    char_length(glb_base64) <= CASE WHEN kind = 'avatar' THEN 4200000 ELSE 1400000 END
  ),
  CONSTRAINT published_character_assets_preview_check CHECK (
    preview_image IS NULL OR (preview_image LIKE 'data:image/%' AND char_length(preview_image) <= 1500000)
  ),
  CONSTRAINT published_character_assets_rejection_reason_check CHECK (
    rejection_reason IS NULL OR char_length(rejection_reason) <= 1000
  )
);

-- One submission per source asset: resubmitting replaces it.
CREATE UNIQUE INDEX published_character_assets_source_uniq
  ON public.published_character_assets (source_asset_id) WHERE source_asset_id IS NOT NULL;
CREATE INDEX published_character_assets_account_id_idx ON public.published_character_assets (account_id);
CREATE INDEX published_character_assets_live_idx
  ON public.published_character_assets (published_at DESC) WHERE published_at IS NOT NULL;

CREATE TRIGGER published_character_assets_updated_at BEFORE UPDATE ON public.published_character_assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.published_character_assets ENABLE ROW LEVEL SECURITY;

-- Owners see their own submissions; nobody writes through RLS (service handle only).
CREATE POLICY "Users can view own published character assets" ON public.published_character_assets
  FOR SELECT USING (app.current_account_id() = account_id);

CREATE TABLE public.character_asset_sharings (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  published_asset_id uuid NOT NULL REFERENCES public.published_character_assets(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (account_id, published_asset_id)
);

CREATE INDEX character_asset_sharings_published_asset_id_idx
  ON public.character_asset_sharings (published_asset_id);

ALTER TABLE public.character_asset_sharings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own character asset sharings" ON public.character_asset_sharings
  FOR SELECT USING (app.current_account_id() = account_id);
CREATE POLICY "Users can add character asset sharings for own account" ON public.character_asset_sharings
  FOR INSERT WITH CHECK (app.current_account_id() = account_id);
CREATE POLICY "Users can remove own character asset sharings" ON public.character_asset_sharings
  FOR DELETE USING (app.current_account_id() = account_id);

COMMENT ON TABLE public.published_character_assets IS
  'Plaintext Discover copies of character_assets (avatars, accessories). Written only by the service handle; live when published_at is set.';
COMMENT ON COLUMN public.published_character_assets.account_id IS
  'The publishing family. Never exposed; the Discover byline is accounts.publication_handle.';
COMMENT ON COLUMN public.published_character_assets.glb_base64 IS
  'Base64 of the .glb, plaintext (public once published). Re-validated server-side on submit.';
COMMENT ON COLUMN public.published_character_assets.socket IS
  'For an accessory: the socket it rides on, from the validated file.';
COMMENT ON COLUMN public.published_character_assets.preview_image IS
  'Optional picture for the Discover card (data: URL).';
COMMENT ON TABLE public.character_asset_sharings IS
  'A family added a published avatar or accessory: it appears among the family''s assets and looks may refer to it. Use in place, never copied.';

-- reverse:
-- DROP TABLE public.character_asset_sharings;
-- DROP TABLE public.published_character_assets;
