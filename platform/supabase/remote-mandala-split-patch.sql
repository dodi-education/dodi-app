-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the Drawing/Mandala split (what local seed.sql now defines, but a
-- db reset / db seed will NOT re-apply to the linked remote).
--
--   1) Drawing (drawing-basic): generate_drawing now produces a plain 2D picture,
--      not a mandala. Sets metadata.drawingStyle = 'picture' and rewords the
--      briefing away from mandala language. The canvas/UI bundle is unchanged.
--   2) Mandala (mandala-basic): a NEW system game with the SAME canvas/UI as
--      Drawing (bundle copied from drawing-basic, only the <title> swapped) whose
--      generate_drawing produces mandalas (metadata.drawingStyle = 'mandala') and
--      whose briefing opens by asking the child which mandala to draw.
--
-- The image style is chosen client-side from metadata.drawingStyle, so both games
-- share one code bundle and one generate_drawing tool.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.
-- Requires the drawing-basic system game to already exist (seeded / earlier patch).

BEGIN;

-- 1) Refresh the Drawing game (metadata + briefing only; the bundle is untouched).
UPDATE public.games SET
  metadata = '{"version": "2.1.0", "category": "drawing", "drawingStyle": "picture", "capabilities": ["generate_drawing", "set_drawing_color", "set_brush_size", "clear_canvas", "undo", "get_snapshot"], "supportsVoiceCommands": true}'::jsonb,
  markdown = '# Drawing

## Game Overview
A freeform drawing canvas where kids create art using colors and brushes. There are no win/lose conditions — this is a creative sandbox. Dodi can also generate a printable-style **coloring page** (a simple black-and-white 2D picture) of anything the child asks for, which the child then colors in.

## Rules
- The child draws freely on a canvas using touch or pointer input
- When the child asks Dodi to draw or make a picture of something, Dodi generates a plain, kid-friendly coloring-page outline with the `generate_drawing` command — Dodi never tries to draw the subject stroke by stroke
- Dodi can also help by changing colors or suggesting creative ideas
- There is no score or levels — creativity is the goal

## Available Commands

### set_drawing_color
Change the active brush color.
- `payload.color` (string, required): A hex color from the palette: `#111111`, `#e53935`, `#fb8c00`, `#fdd835`, `#43a047`, `#1e88e5`, `#8e24aa`, `#ff5ca8`
- Example: `{"type":"set_drawing_color","payload":{"color":"#e53935"}}`

### set_brush_size
Change the brush thickness.
- `payload.size` (number, required): One of `4`, `8`, `12`, `18`, `24`
- Example: `{"type":"set_brush_size","payload":{"size":12}}`

### generate_drawing
Create a simple black-and-white **coloring page** — a plain, kid-friendly 2D picture (NOT a mandala) — of whatever the child asks for and place it on the canvas as a fresh base to color in. This is how Dodi draws ANY subject — animals, objects, characters, or scenes.
- `payload.subject` (string, required): What to draw, e.g. `"owl"`, `"a friendly dragon"`, `"a flower"`
- MANDATORY: whenever the child asks you to draw, make, or show a picture of something, you MUST emit this generate_drawing command in the SAME turn. Saying "I will draw it" without emitting the command does nothing and leaves the canvas blank — the command is the only thing that draws
- First emit the tool call, THEN speak this exact acknowledgement in the language of the child "Here is your picture!"
- Do NOT say the picture is already done or already on the canvas; it appears on its own a few seconds after you emit the command
- The canvas is cleared and the generated outline becomes the new base layer; the child colors on top with their brush
- Do NOT try to build the picture yourself from lines or shapes — always use this command for anything the child wants drawn
- Example: `{"type":"generate_drawing","payload":{"subject":"owl"}}`

### clear_canvas
Erase everything on the canvas. No payload needed.
- Example: `{"type":"clear_canvas"}`

### undo
Undo the last drawing action. No payload needed.
- Example: `{"type":"undo"}`

### get_snapshot
Capture a PNG image of the current canvas. Used by the AI to visually analyze what has been drawn. No payload needed.
- Returns the snapshot as a `game:event` with `event: "snapshot"` and a `snapshot` field containing a data URL
- Example: `{"type":"get_snapshot"}`

## Tips
- To draw something for the child, always use `generate_drawing` with a clear `subject` — do not attempt to build pictures from lines or shapes
- Generating a new drawing clears the canvas, so if the child is in the middle of their own artwork, check before replacing it
- After the outline appears, encourage the child to color it in with different colors

## State Fields
- `currentColor` (string): Currently selected color hex
- `brushSize` (number): Currently selected brush width
- `strokeCount` (number): How many drawing actions have been performed
- `actions` (array): History of drawing actions (last 50). Each entry has:
  - `action`: type — `"freehand"` or `"generated_image"`
  - `region`: where on the canvas — `"top-left"`, `"center"`, `"bottom-right"`, etc.
  - Freehand actions include: `color`, `brushSize`, `boundingBox` (with `x`, `y`, `w`, `h`)

## Teaching Strategy
- Encourage experimentation with different colors
- When the child names something they want to see, use `generate_drawing` to make a coloring page of it, then color it in together
- Suggest fun subjects ("Want me to draw an owl for you to color?")
- Celebrate creativity — there are no wrong answers
- Talk about the picture while coloring: the colors, the patterns, and what the subject is
- When the child asks "Can you guess what I drew?", use get_snapshot + read_game_state to see their drawing and make a fun guess
- Keep interactions playful and age-appropriate
',
  updated_at = now()
WHERE system_key = 'drawing-basic';

-- 2) Upsert the Mandala game. Copies the Drawing bundle verbatim (only the
--    <title> swapped) so the in-game UI stays identical and in sync.
INSERT INTO public.games (id, account_id, kid_id, source_game_id, system_key, is_system, title, description, target_age_min, target_age_max, estimated_duration_minutes, tags, code_bundle, metadata, created_by, created_at, updated_at, markdown)
SELECT
  '00079709-ce39-4669-98e8-a3181640b4fb', NULL, NULL, NULL, 'mandala-basic', 't',
  'Mandala',
  'A calming coloring game where dodi draws mandalas for you to color in.',
  target_age_min, target_age_max, estimated_duration_minutes,
  '{mandala,art,creativity,coloring,calm}',
  replace(code_bundle, '<title>Drawing</title>', '<title>Mandala</title>'),
  '{"version": "2.1.0", "category": "mandala", "drawingStyle": "mandala", "capabilities": ["generate_drawing", "set_drawing_color", "set_brush_size", "clear_canvas", "undo", "get_snapshot"], "supportsVoiceCommands": true}'::jsonb,
  'system', created_at, now(),
  '# Mandala

## Game Overview
A calm coloring canvas where kids color in beautiful mandalas. There are no win/lose conditions — this is a relaxing, creative sandbox. Dodi generates a printable-style **mandala coloring sheet** (a symmetrical black-and-white outline) of anything the child asks for, which the child then colors in.

## Session Start
- When the game starts and you greet the child, keep it short and warm, then briefly ask what kind of mandala they would like you to draw (for example "a flower, an animal, the moon...?"). Ask this ONCE, in the child''s language, and wait for their idea.
- As soon as the child names a subject, immediately emit `generate_drawing` with that subject in the SAME turn.

## Rules
- The child colors freely on the canvas using touch or pointer input
- When the child asks Dodi to draw or make a mandala of something, Dodi generates a mandala coloring-sheet outline with the `generate_drawing` command — Dodi never tries to draw the mandala stroke by stroke
- Dodi can also help by changing colors or suggesting creative ideas
- There is no score or levels — creativity and calm are the goal

## Available Commands

### set_drawing_color
Change the active brush color.
- `payload.color` (string, required): A hex color from the palette: `#111111`, `#e53935`, `#fb8c00`, `#fdd835`, `#43a047`, `#1e88e5`, `#8e24aa`, `#ff5ca8`
- Example: `{"type":"set_drawing_color","payload":{"color":"#e53935"}}`

### set_brush_size
Change the brush thickness.
- `payload.size` (number, required): One of `4`, `8`, `12`, `18`, `24`
- Example: `{"type":"set_brush_size","payload":{"size":12}}`

### generate_drawing
Create a symmetrical black-and-white **mandala coloring sheet** of whatever the child asks for and place it on the canvas as a fresh base to color in. This is how Dodi draws ANY subject as a mandala — animals, objects, characters, flowers, or patterns.
- `payload.subject` (string, required): What the mandala should be based on, e.g. `"owl"`, `"a flower"`, `"the moon and stars"`
- MANDATORY: whenever the child asks you to draw, make, or show a mandala of something, you MUST emit this generate_drawing command in the SAME turn. Saying "I will draw it" without emitting the command does nothing and leaves the canvas blank — the command is the only thing that draws
- First emit the tool call, THEN speak this exact acknowledgement in the language of the child "Here is your mandala!"
- Do NOT say the mandala is already done or already on the canvas; it appears on its own a few seconds after you emit the command
- The canvas is cleared and the generated outline becomes the new base layer; the child colors on top with their brush
- Do NOT try to build the mandala yourself from lines or shapes — always use this command for anything the child wants drawn
- Example: `{"type":"generate_drawing","payload":{"subject":"owl"}}`

### clear_canvas
Erase everything on the canvas. No payload needed.
- Example: `{"type":"clear_canvas"}`

### undo
Undo the last coloring action. No payload needed.
- Example: `{"type":"undo"}`

### get_snapshot
Capture a PNG image of the current canvas. Used by the AI to visually analyze what has been colored. No payload needed.
- Returns the snapshot as a `game:event` with `event: "snapshot"` and a `snapshot` field containing a data URL
- Example: `{"type":"get_snapshot"}`

## Tips
- To draw a mandala for the child, always use `generate_drawing` with a clear `subject` — do not attempt to build mandalas from lines or shapes
- Generating a new mandala clears the canvas, so if the child is in the middle of coloring, check before replacing it
- After the outline appears, encourage the child to color it in with different colors

## State Fields
- `currentColor` (string): Currently selected color hex
- `brushSize` (number): Currently selected brush width
- `strokeCount` (number): How many coloring actions have been performed
- `actions` (array): History of coloring actions (last 50). Each entry has:
  - `action`: type — `"freehand"` or `"generated_image"`
  - `region`: where on the canvas — `"top-left"`, `"center"`, `"bottom-right"`, etc.
  - Freehand actions include: `color`, `brushSize`, `boundingBox` (with `x`, `y`, `w`, `h`)

## Teaching Strategy
- Keep the mood calm, relaxing, and encouraging — mandalas are about mindfulness and patterns
- When the child names something they want, use `generate_drawing` to make a mandala of it, then color it in together
- Suggest soothing subjects ("Want me to draw a flower mandala for you to color?")
- Celebrate creativity — there are no wrong answers
- Talk about the picture while coloring: the colors, the symmetry, and the repeating patterns
- When the child asks "Can you guess what I colored?", use get_snapshot + read_game_state to see their mandala and make a fun guess
- Keep interactions playful, gentle, and age-appropriate
'
FROM public.games WHERE system_key = 'drawing-basic'
ON CONFLICT (system_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  tags = EXCLUDED.tags,
  code_bundle = EXCLUDED.code_bundle,
  metadata = EXCLUDED.metadata,
  markdown = EXCLUDED.markdown,
  updated_at = EXCLUDED.updated_at;

-- 3) Upsert Mandala translations (title is "Mandala" in both locales).
INSERT INTO public.game_translations (id, game_id, locale, title, description, created_at, updated_at) VALUES
  ('4810262a-14f9-4373-9ab9-e8405df2f1ee', '00079709-ce39-4669-98e8-a3181640b4fb', 'en', 'Mandala', 'A calming coloring game where Dodi draws mandalas for you to color in.', now(), now()),
  ('4318046f-88f0-4b3e-b044-1acd3f0a4fd0', '00079709-ce39-4669-98e8-a3181640b4fb', 'de', 'Mandala', 'Ein entspannendes Ausmalspiel, bei dem Dodi Mandalas zum Ausmalen für dich zeichnet.', now(), now())
ON CONFLICT (game_id, locale) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;

COMMIT;
