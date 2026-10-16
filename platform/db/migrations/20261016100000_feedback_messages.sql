-- feedback_messages: everything a parent sends the dodi team from the app.
--
-- "Give feedback" replaces "Report a problem": one inbox for feature requests,
-- bug reports, inappropriate content and anything else. Flagging inappropriate
-- content is still the in-app report path Google Play requires for AI-generated
-- content and the App Store for user-generated content (Discover games).
--
-- A parent writes a message on purpose to the operator, so its fields are
-- plaintext: staff read them in the ops console, and the platform mails them to
-- SYSTEM_NOTIFICATION_EMAIL. `sender_name` is the name the parent typed into
-- the form (not the sealed profile data); nothing from the family's encrypted
-- data travels with a message.
--
-- Staff state: `read_at` is set the first time a staff member opens the
-- message (shared across staff, it drives the console's unread badge);
-- `solved_at` marks it handled and implies read. Both are written only through
-- the service handle, so no UPDATE policy exists.
--
-- game_id may point at another account's published Discover row (the service
-- checks it is one the sender can see), so it is a plain FK that clears when
-- the game goes away. Messages go with the sending account (account deletion
-- erases them too).
--
-- Carry-over: every content_reports row moves here as inappropriate_content,
-- with its kind, reason and details composed into the message, and the old
-- table is dropped. Reports were not tied to a name, so `sender_name` is NULL
-- on those rows only. A resolved report arrives read and solved.

CREATE TABLE public.feedback_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  sender_name text,
  category text NOT NULL,
  message text NOT NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  client_platform text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  read_at timestamp with time zone,
  solved_at timestamp with time zone,
  solved_by_staff_email text,
  CONSTRAINT feedback_messages_category_check
    CHECK (category IN ('feature_request', 'bug_report', 'inappropriate_content', 'other')),
  CONSTRAINT feedback_messages_sender_name_length_check
    CHECK (char_length(sender_name) BETWEEN 1 AND 100),
  CONSTRAINT feedback_messages_message_length_check
    CHECK (char_length(message) BETWEEN 1 AND 4000),
  CONSTRAINT feedback_messages_client_platform_check
    CHECK (client_platform IN ('web', 'mobile')),
  CONSTRAINT feedback_messages_solved_is_read_check
    CHECK (solved_at IS NULL OR read_at IS NOT NULL),
  CONSTRAINT feedback_messages_solved_by_check
    CHECK (solved_by_staff_email IS NULL OR solved_at IS NOT NULL),
  CONSTRAINT feedback_messages_solved_by_length_check
    CHECK (char_length(solved_by_staff_email) <= 200)
);

CREATE INDEX feedback_messages_unread_idx ON public.feedback_messages (created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX feedback_messages_open_idx ON public.feedback_messages (created_at DESC)
  WHERE solved_at IS NULL;
CREATE INDEX feedback_messages_account_id_idx ON public.feedback_messages (account_id);
CREATE INDEX feedback_messages_game_id_idx ON public.feedback_messages (game_id)
  WHERE game_id IS NOT NULL;

ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback messages" ON public.feedback_messages
  FOR SELECT USING (app.current_account_id() = account_id);
CREATE POLICY "Users can send feedback messages for own account" ON public.feedback_messages
  FOR INSERT WITH CHECK (
    app.current_account_id() = account_id
    AND read_at IS NULL
    AND solved_at IS NULL
    AND solved_by_staff_email IS NULL
  );

COMMENT ON TABLE public.feedback_messages IS
  'Feedback a parent sends the dodi team from the app (feature requests, bug reports, inappropriate content, other). Plaintext by design: the parent sends it to the operator.';
COMMENT ON COLUMN public.feedback_messages.sender_name IS
  'The name the parent typed into the form, at most 100 characters. NULL only on rows carried over from content_reports.';
COMMENT ON COLUMN public.feedback_messages.message IS
  'The parent''s own message, plaintext, at most 4000 characters.';
COMMENT ON COLUMN public.feedback_messages.read_at IS
  'When a staff member first opened the message in the ops console; NULL while unread.';
COMMENT ON COLUMN public.feedback_messages.solved_at IS
  'When staff marked the message solved; NULL while open.';
COMMENT ON COLUMN public.feedback_messages.solved_by_staff_email IS
  'The ops console staff email that marked the message solved.';

INSERT INTO public.feedback_messages
  (id, account_id, sender_name, category, message, game_id, client_platform, created_at, read_at, solved_at)
SELECT
  r.id,
  r.account_id,
  NULL,
  'inappropriate_content',
  left(
    'Report a problem: '
      || CASE r.content_kind
           WHEN 'companion_answer' THEN 'something the companion said'
           WHEN 'game' THEN 'a game in the family''s library'
           ELSE 'a game on Discover'
         END
      || ', '
      || CASE r.reason
           WHEN 'inappropriate' THEN 'not okay for kids'
           WHEN 'upsetting' THEN 'scary or upsetting'
           WHEN 'wrong' THEN 'wrong or misleading'
           ELSE 'something else'
         END
      || '.'
      || COALESCE(E'\n\n' || NULLIF(btrim(r.details), ''), ''),
    4000
  ),
  r.game_id,
  r.client_platform,
  r.created_at,
  r.resolved_at,
  r.resolved_at
FROM public.content_reports r;

DROP TABLE public.content_reports;

-- reverse:
-- -- Best effort: only inappropriate_content messages fit the old table, so the
-- -- other categories are lost, and the composed message lands in `details`.
-- CREATE TABLE public.content_reports (
--   id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
--   account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
--   kid_id uuid,
--   game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
--   content_kind text NOT NULL,
--   reason text NOT NULL,
--   details text,
--   client_platform text NOT NULL,
--   created_at timestamp with time zone DEFAULT now() NOT NULL,
--   resolved_at timestamp with time zone,
--   CONSTRAINT content_reports_content_kind_check CHECK (content_kind IN ('companion_answer', 'game', 'discover_game')),
--   CONSTRAINT content_reports_reason_check CHECK (reason IN ('inappropriate', 'upsetting', 'wrong', 'other')),
--   CONSTRAINT content_reports_details_length_check CHECK (char_length(details) <= 2000),
--   CONSTRAINT content_reports_client_platform_check CHECK (client_platform IN ('web', 'mobile')),
--   CONSTRAINT content_reports_kid_account_fkey FOREIGN KEY (kid_id, account_id)
--     REFERENCES public.kids(id, account_id) ON DELETE SET NULL (kid_id)
-- );
-- CREATE INDEX content_reports_open_idx ON public.content_reports (created_at DESC)
--   WHERE resolved_at IS NULL;
-- CREATE INDEX content_reports_account_id_idx ON public.content_reports (account_id);
-- ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own content reports" ON public.content_reports
--   FOR SELECT USING (app.current_account_id() = account_id);
-- CREATE POLICY "Users can create content reports for own account" ON public.content_reports
--   FOR INSERT WITH CHECK (app.current_account_id() = account_id);
-- INSERT INTO public.content_reports
--   (id, account_id, game_id, content_kind, reason, details, client_platform, created_at, resolved_at)
-- SELECT id, account_id, game_id,
--        CASE WHEN game_id IS NULL THEN 'companion_answer' ELSE 'discover_game' END,
--        'inappropriate', left(message, 2000), client_platform, created_at, solved_at
-- FROM public.feedback_messages
-- WHERE category = 'inappropriate_content';
-- DROP TABLE public.feedback_messages;
