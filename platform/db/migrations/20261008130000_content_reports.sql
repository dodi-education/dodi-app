-- content_reports: in-app reports of AI answers and games.
--
-- Google Play requires apps that generate content with AI to let people flag
-- offensive output to the developer without leaving the app, and the App
-- Store requires a report path for user-generated content (Discover games).
-- A parent files a report on purpose from the parent area, so its fields are
-- plaintext: the operator reads them to tune the safety prompts and to act on
-- Discover games. `details` is the parent's own description (it may quote an
-- AI answer); nothing from the family's encrypted data travels with a report.
--
-- Account consistency: the kid FK is composite (kid_id, account_id) like
-- companions', and only clears kid_id when the kid is deleted. game_id may
-- point at another account's published Discover row (the service checks it is
-- one), so it is a plain FK that clears when the game goes away. Reports go
-- with the reporting account (account deletion erases them too).

CREATE TABLE public.content_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kid_id uuid,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  content_kind text NOT NULL,
  reason text NOT NULL,
  details text,
  client_platform text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  CONSTRAINT content_reports_content_kind_check CHECK (content_kind IN ('companion_answer', 'game', 'discover_game')),
  CONSTRAINT content_reports_reason_check CHECK (reason IN ('inappropriate', 'upsetting', 'wrong', 'other')),
  CONSTRAINT content_reports_details_length_check CHECK (char_length(details) <= 2000),
  CONSTRAINT content_reports_client_platform_check CHECK (client_platform IN ('web', 'mobile')),
  CONSTRAINT content_reports_kid_account_fkey FOREIGN KEY (kid_id, account_id)
    REFERENCES public.kids(id, account_id) ON DELETE SET NULL (kid_id)
);

CREATE INDEX content_reports_open_idx ON public.content_reports (created_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX content_reports_account_id_idx ON public.content_reports (account_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content reports" ON public.content_reports
  FOR SELECT USING (app.current_account_id() = account_id);
CREATE POLICY "Users can create content reports for own account" ON public.content_reports
  FOR INSERT WITH CHECK (app.current_account_id() = account_id);

COMMENT ON TABLE public.content_reports IS
  'In-app reports of AI answers and games (Google Play AI-content and App Store UGC rules). Plaintext by design: the parent sends them to the operator.';
COMMENT ON COLUMN public.content_reports.details IS
  'The parent''s own description, plaintext, at most 2000 characters.';
COMMENT ON COLUMN public.content_reports.resolved_at IS
  'When the operator handled the report; NULL while open.';

-- reverse:
-- DROP TABLE public.content_reports;
