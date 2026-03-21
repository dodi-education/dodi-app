-- Game translations table for multilingual game titles and descriptions
-- reverse: DROP TABLE public.game_translations;

CREATE TABLE public.game_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, locale)
);

ALTER TABLE public.game_translations ENABLE ROW LEVEL SECURITY;

-- Anyone can read translations
CREATE POLICY "game_translations_select" ON public.game_translations
  FOR SELECT USING (true);

-- Game owners can manage translations for their custom games
CREATE POLICY "game_translations_insert" ON public.game_translations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.account_id = auth.uid())
  );
CREATE POLICY "game_translations_update" ON public.game_translations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.account_id = auth.uid())
  );
CREATE POLICY "game_translations_delete" ON public.game_translations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.account_id = auth.uid())
  );

-- Rename base title from "Drawing Playground" to "Drawing"
UPDATE public.games SET title = 'Drawing',
  markdown = replace(markdown, '# Drawing Playground', '# Drawing')
WHERE system_key = 'drawing-basic' AND is_system = true;

-- Seed English + German translations for the drawing game
INSERT INTO public.game_translations (game_id, locale, title, description)
SELECT id, 'en', 'Drawing', 'A simple drawing game with colors, brush sizes, and fun Dodi drawing commands.'
FROM public.games WHERE system_key = 'drawing-basic';

INSERT INTO public.game_translations (game_id, locale, title, description)
SELECT id, 'de', 'Zeichnen', 'Ein einfaches Zeichenspiel mit Farben, Pinselgrößen und lustigen Dodi-Zeichenbefehlen.'
FROM public.games WHERE system_key = 'drawing-basic';
