-- companions: a kid's companion characters.
--
-- A companion is what the kid talks to and plays with: a persona (personality,
-- account-level library), an avatar from the built-in character catalog and a
-- kid-made look (colors, accessories). A kid can have several companions and
-- has one active one; kids.active_companion_id points at it.
--
-- Sealing: name_enc and look_enc are enc:v1 records sealed client-side under
-- the account vault key (look_enc is a sealed JSON CompanionLook, so the model
-- choice, colors and accessories never reach the server in plaintext). NULL
-- means "the catalog model's stock name / default look", which is what the
-- server writes for the default companion of a new kid, since it cannot seal.
-- persona_id stays plaintext, as kids.active_persona_id was.
--
-- The persona choice moves from kids.active_persona_id onto the companion: one
-- companion per existing kid is backfilled from it, then the column is dropped.
-- The kid read shape keeps a derived active_persona embed (through the active
-- companion), so readers of active_persona keep working.
--
-- Account consistency: FK checks bypass RLS, so the kid FK is composite
-- (kid_id, account_id) to stop a row of one account pointing at another
-- account's kid. kids gets the matching UNIQUE (id, account_id) anchor, and
-- companions carries its own for rows that reference a companion.

ALTER TABLE public.kids ADD CONSTRAINT kids_id_account_id_key UNIQUE (id, account_id);

CREATE TABLE public.companions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kid_id uuid NOT NULL,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  name_enc text,
  look_enc text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT companions_kid_account_fkey FOREIGN KEY (kid_id, account_id)
    REFERENCES public.kids(id, account_id) ON DELETE CASCADE,
  CONSTRAINT companions_id_account_id_key UNIQUE (id, account_id)
);

CREATE INDEX companions_kid_id_idx ON public.companions (kid_id);

CREATE TRIGGER companions_updated_at BEFORE UPDATE ON public.companions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.companions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own companions" ON public.companions
  FOR SELECT USING (app.current_account_id() = account_id);
CREATE POLICY "Users can create companions for own account" ON public.companions
  FOR INSERT WITH CHECK (app.current_account_id() = account_id);
CREATE POLICY "Users can update own companions" ON public.companions
  FOR UPDATE USING (app.current_account_id() = account_id);
CREATE POLICY "Users can delete own companions" ON public.companions
  FOR DELETE USING (app.current_account_id() = account_id);

COMMENT ON TABLE public.companions IS
  'A kid''s companion characters: persona + catalog avatar + kid-made look. A kid has one or more; kids.active_companion_id is the active one.';
COMMENT ON COLUMN public.companions.persona_id IS
  'Personality (personas row). NULL = the system default persona. Plaintext.';
COMMENT ON COLUMN public.companions.name_enc IS
  'enc:v1 sealed companion name. NULL = the catalog model''s stock name ("dodi").';
COMMENT ON COLUMN public.companions.look_enc IS
  'enc:v1 sealed JSON CompanionLook {v, model, colors, accessories}. NULL = the catalog defaults. Never jsonb.';

ALTER TABLE public.kids
  ADD COLUMN active_companion_id uuid REFERENCES public.companions(id) ON DELETE SET NULL,
  ADD COLUMN can_change_companion_avatar boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.kids.active_companion_id IS
  'The companion the kid is with. NULL or stale = the kid''s oldest companion.';
COMMENT ON COLUMN public.kids.can_change_companion_avatar IS
  'Parent setting: the kid may swap a companion''s avatar (catalog model) in the Playground. Colors, accessories, name and tricks are always open.';

-- Backfill: one companion per kid, carrying its current persona. The kids
-- trigger is paused so the backfill doesn't bump every kid's updated_at.
ALTER TABLE public.kids DISABLE TRIGGER kids_updated_at;

INSERT INTO public.companions (account_id, kid_id, persona_id, created_at)
  SELECT account_id, id, active_persona_id, created_at FROM public.kids;

UPDATE public.kids k
  SET active_companion_id = c.id
  FROM public.companions c
  WHERE c.kid_id = k.id;

ALTER TABLE public.kids ENABLE TRIGGER kids_updated_at;

ALTER TABLE public.kids DROP COLUMN active_persona_id;

-- reverse:
-- ALTER TABLE public.kids ADD COLUMN active_persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL;
-- UPDATE public.kids k SET active_persona_id = c.persona_id FROM public.companions c WHERE c.id = k.active_companion_id;
-- ALTER TABLE public.kids DROP COLUMN active_companion_id, DROP COLUMN can_change_companion_avatar;
-- DROP TABLE public.companions;
-- ALTER TABLE public.kids DROP CONSTRAINT kids_id_account_id_key;
