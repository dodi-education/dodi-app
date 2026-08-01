-- System game previews: replace the static SVG previews with the new PNG
-- renders shipped at /images/game-previews/*.png (clients/web/public).
UPDATE public.games SET preview_image = '/images/game-previews/drawing.png' WHERE system_key = 'drawing-basic';
UPDATE public.games SET preview_image = '/images/game-previews/mandala.png' WHERE system_key = 'mandala-basic';

-- reverse:
-- UPDATE public.games SET preview_image = '/images/game-previews/drawing.svg' WHERE system_key = 'drawing-basic';
-- UPDATE public.games SET preview_image = '/images/game-previews/mandala.svg' WHERE system_key = 'mandala-basic';
