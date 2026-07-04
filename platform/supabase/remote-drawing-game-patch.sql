-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the enhanced built-in Drawing game (what local seed.sql now defines but a
-- db reset / db seed will not re-apply to the linked remote).
--
-- Refreshes the drawing-basic system game in place:
--  1) Adds the AI image-generation flow: dodi draws any subject as a black-and-
--     white mandala coloring sheet via the generate_drawing command, rendered
--     onto the canvas by the internal set_generated_image command.
--  2) Removes the old procedural draw commands and their briefing so image
--     generation is the single draw path.
--  3) Fixes the canvas-sizing race: a ResizeObserver re-sizes the drawing buffer
--     when the flex layout settles, so freehand strokes and generated images no
--     longer render into a collapsed 1px buffer.
--
-- Only touches the one system game row. Safe to run multiple times.
-- Apply via the Supabase SQL editor or psql.

UPDATE public.games SET
  code_bundle = '
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Drawing</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body {
      margin: 0;
      background: #f2f7ff;
      color: #123;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px;
      background: #fff;
      border-bottom: 1px solid #d7e3f5;
      align-items: center;
    }
    .group {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding-right: 10px;
      border-right: 1px solid #e5edf8;
    }
    .group:last-child { border-right: none; }
    button {
      border: 1px solid #cbd7eb;
      border-radius: 10px;
      background: #fff;
      padding: 6px 10px;
      cursor: pointer;
      font-weight: 600;
    }
    button.active {
      border-color: #4a86c8;
      box-shadow: 0 0 0 2px rgba(74, 134, 200, 0.2);
    }
    .swatch {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      padding: 0;
    }
    #board {
      flex: 1;
      min-height: 0;
      background: #fff;
      touch-action: none;
      width: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="group" id="colors"></div>
    <div class="group" id="sizes"></div>
    <div class="group">
      <button id="undo" type="button">Undo</button>
      <button id="clear" type="button">Clear</button>
    </div>
  </div>
  <canvas id="board"></canvas>

  <script>
    (function () {
      var palette = [''#111111'', ''#e53935'', ''#fb8c00'', ''#fdd835'', ''#43a047'', ''#1e88e5'', ''#8e24aa'', ''#ff5ca8''];
      var brushOptions = [4, 8, 12, 18, 24];
      var capabilities = [''set_color'', ''set_brush_size'', ''clear_canvas'', ''undo'', ''get_snapshot'', ''set_generated_image''];

      var canvas = document.getElementById(''board'');
      var ctx = canvas.getContext(''2d'');
      var colorsEl = document.getElementById(''colors'');
      var sizesEl = document.getElementById(''sizes'');
      var undoEl = document.getElementById(''undo'');
      var clearEl = document.getElementById(''clear'');

      var MAX_ACTIONS = 50;

      var state = {
        color: ''#111111'',
        brushSize: 8,
        drawing: false,
        prevX: 0,
        prevY: 0,
        strokeCount: 0,
        snapshots: [],
        maxSnapshots: 30,
        actions: [],
        // Freehand stroke tracking
        freehandMinX: 0,
        freehandMinY: 0,
        freehandMaxX: 0,
        freehandMaxY: 0,
      };

      var bridgeToken = null;

      function postToParent(type, payload) {
        if (!bridgeToken) return;
        parent.postMessage({ type: type, token: bridgeToken, payload: payload }, ''*'');
      }

      function emitState() {
        postToParent(''game:state'', getState());
      }

      function getRegion(cx, cy) {
        var cw = canvas.clientWidth;
        var ch = canvas.clientHeight;
        var col = cx < cw * 0.33 ? ''left'' : cx > cw * 0.66 ? ''right'' : ''center'';
        var row = cy < ch * 0.33 ? ''top'' : cy > ch * 0.66 ? ''bottom'' : ''middle'';
        if (col === ''center'' && row === ''middle'') return ''center'';
        if (col === ''center'') return row;
        if (row === ''middle'') return col;
        return row + ''-'' + col;
      }

      function pushAction(entry) {
        state.actions.push(entry);
        if (state.actions.length > MAX_ACTIONS) {
          state.actions.shift();
        }
      }

      function getState() {
        return {
          currentColor: state.color,
          brushSize: state.brushSize,
          strokeCount: state.strokeCount,
          actions: state.actions,
        };
      }

      function snapshot() {
        try {
          var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          state.snapshots.push(data);
          if (state.snapshots.length > state.maxSnapshots) {
            state.snapshots.shift();
          }
        } catch (_error) {
          // ignore
        }
      }

      function resizeCanvas() {
        var ratio = window.devicePixelRatio || 1;
        // Size the drawing buffer to the canvas'' own (flex-allocated) box so it fills
        // the fixed game stage exactly — no assumptions about the device viewport.
        var nextW = Math.max(1, Math.floor(canvas.clientWidth));
        var nextH = Math.max(1, Math.floor(canvas.clientHeight));
        var targetW = Math.floor(nextW * ratio);
        var targetH = Math.floor(nextH * ratio);

        // Skip when the buffer already matches the laid-out size — avoids
        // re-scaling the drawing on every ResizeObserver tick.
        if (canvas.width === targetW && canvas.height === targetH) return;

        var existing = ctx.getImageData(0, 0, canvas.width || 1, canvas.height || 1);

        canvas.width = targetW;
        canvas.height = targetH;

        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.lineCap = ''round'';
        ctx.lineJoin = ''round'';

        if (existing && existing.width > 1 && existing.height > 1) {
          try {
            var temp = document.createElement(''canvas'');
            temp.width = existing.width;
            temp.height = existing.height;
            var tctx = temp.getContext(''2d'');
            tctx.putImageData(existing, 0, 0);
            ctx.drawImage(temp, 0, 0, nextW, nextH);
          } catch (_error) {
            clearCanvas(false);
          }
        } else {
          clearCanvas(false);
        }
      }

      function setColor(color) {
        if (!palette.includes(color)) return false;
        state.color = color;
        updateToolbar();
        emitState();
        return true;
      }

      function setBrushSize(size) {
        if (!brushOptions.includes(size)) return false;
        state.brushSize = size;
        updateToolbar();
        emitState();
        return true;
      }

      function drawLine(x1, y1, x2, y2, color, width, countStroke) {
        ctx.strokeStyle = color || state.color;
        ctx.lineWidth = width || state.brushSize;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (countStroke) {
          state.strokeCount += 1;
          emitState();
        }
      }

      function drawGeneratedImage(dataUrl, done) {
        var img = new Image();
        img.onload = function () {
          snapshot();
          clearCanvas(false);
          var cw = canvas.clientWidth;
          var ch = canvas.clientHeight;
          var scale = Math.min(cw / img.width, ch / img.height);
          var dw = img.width * scale;
          var dh = img.height * scale;
          ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
          state.actions = [];
          pushAction({ action: ''generated_image'', region: ''center'' });
          state.strokeCount += 1;
          emitState();
          if (done) done(true);
        };
        img.onerror = function () {
          if (done) done(false);
        };
        img.src = dataUrl;
      }

      function clearCanvas(countStroke) {
        ctx.fillStyle = ''#ffffff'';
        ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        if (countStroke) {
          state.actions = [];
          state.strokeCount += 1;
          emitState();
        }
      }

      function undo() {
        var last = state.snapshots.pop();
        if (!last) return false;
        ctx.putImageData(last, 0, 0);
        state.actions.pop();
        state.strokeCount = Math.max(0, state.strokeCount - 1);
        emitState();
        return true;
      }

      function captureSnapshot() {
        try {
          var maxW = 512;
          var cw = canvas.clientWidth;
          var ch = canvas.clientHeight;
          var scale = Math.min(1, maxW / cw);
          var tw = Math.floor(cw * scale);
          var th = Math.floor(ch * scale);
          var tmp = document.createElement(''canvas'');
          tmp.width = tw;
          tmp.height = th;
          var tctx = tmp.getContext(''2d'');
          tctx.drawImage(canvas, 0, 0, tw, th);
          return tmp.toDataURL(''image/png'');
        } catch (_e) {
          return null;
        }
      }

      function getPoint(event) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }

      function startDraw(event) {
        state.drawing = true;
        snapshot();
        var pt = getPoint(event);
        state.prevX = pt.x;
        state.prevY = pt.y;
        state.freehandMinX = pt.x;
        state.freehandMinY = pt.y;
        state.freehandMaxX = pt.x;
        state.freehandMaxY = pt.y;
      }

      function moveDraw(event) {
        if (!state.drawing) return;
        var pt = getPoint(event);
        drawLine(state.prevX, state.prevY, pt.x, pt.y, state.color, state.brushSize, false);
        state.prevX = pt.x;
        state.prevY = pt.y;
        // Track bounding box
        if (pt.x < state.freehandMinX) state.freehandMinX = pt.x;
        if (pt.y < state.freehandMinY) state.freehandMinY = pt.y;
        if (pt.x > state.freehandMaxX) state.freehandMaxX = pt.x;
        if (pt.y > state.freehandMaxY) state.freehandMaxY = pt.y;
      }

      function endDraw() {
        if (!state.drawing) return;
        state.drawing = false;
        var bx = Math.round(state.freehandMinX);
        var by = Math.round(state.freehandMinY);
        var bw = Math.round(state.freehandMaxX - state.freehandMinX);
        var bh = Math.round(state.freehandMaxY - state.freehandMinY);
        var cx = bx + bw / 2;
        var cy = by + bh / 2;
        pushAction({
          action: ''freehand'',
          color: state.color,
          brushSize: state.brushSize,
          boundingBox: { x: bx, y: by, w: bw, h: bh },
          region: getRegion(cx, cy),
        });
        state.strokeCount += 1;
        emitState();
      }

      function handleCommand(command) {
        if (!command || typeof command !== ''object'') {
          return { ok: false, error: ''Invalid command payload'' };
        }

        var type = command.type;
        var payload = command.payload || {};

        switch (type) {
          case ''set_color'': {
            var ok = setColor(String(payload.color || ''''));
            return ok ? { ok: true } : { ok: false, error: ''Unsupported color'' };
          }
          case ''set_brush_size'': {
            var size = Number(payload.size);
            var ok = setBrushSize(size);
            return ok ? { ok: true } : { ok: false, error: ''Unsupported brush size'' };
          }
          case ''set_generated_image'': {
            var url = String(payload.dataUrl || '''');
            if (url.indexOf(''data:image'') !== 0) {
              return { ok: false, error: ''Invalid image data'' };
            }
            drawGeneratedImage(url, function (rendered) {
              if (rendered) {
                postToParent(''game:event'', { event: ''generated_image'', message: ''Drawing ready'' });
              } else {
                postToParent(''game:error'', { error: ''Failed to render generated image'' });
              }
            });
            return { ok: true };
          }
          case ''clear_canvas'': {
            snapshot();
            clearCanvas(true);
            return { ok: true };
          }
          case ''undo'': {
            var ok = undo();
            return ok ? { ok: true } : { ok: false, error: ''Nothing to undo'' };
          }
          case ''get_snapshot'': {
            var dataUrl = captureSnapshot();
            if (dataUrl) {
              postToParent(''game:event'', { event: ''snapshot'', snapshot: dataUrl });
              return { ok: true };
            }
            return { ok: false, error: ''Failed to capture snapshot'' };
          }
          default:
            return { ok: false, error: ''Unknown command type'' };
        }
      }

      function updateToolbar() {
        colorsEl.querySelectorAll(''button'').forEach(function (el) {
          el.classList.toggle(''active'', el.dataset.color === state.color);
        });
        sizesEl.querySelectorAll(''button'').forEach(function (el) {
          el.classList.toggle(''active'', Number(el.dataset.size) === state.brushSize);
        });
      }

      function buildToolbar() {
        palette.forEach(function (color) {
          var button = document.createElement(''button'');
          button.type = ''button'';
          button.className = ''swatch'';
          button.dataset.color = color;
          button.style.background = color;
          button.title = color;
          button.addEventListener(''click'', function () { setColor(color); });
          colorsEl.appendChild(button);
        });

        brushOptions.forEach(function (size) {
          var button = document.createElement(''button'');
          button.type = ''button'';
          button.dataset.size = String(size);
          button.textContent = String(size);
          button.addEventListener(''click'', function () { setBrushSize(size); });
          sizesEl.appendChild(button);
        });

        undoEl.addEventListener(''click'', function () {
          var result = handleCommand({ type: ''undo'' });
          postToParent(''game:result'', { command: { type: ''undo'' }, result: result });
        });

        clearEl.addEventListener(''click'', function () {
          var result = handleCommand({ type: ''clear_canvas'' });
          postToParent(''game:result'', { command: { type: ''clear_canvas'' }, result: result });
        });

        updateToolbar();
      }

      window.addEventListener(''message'', function (event) {
        var message = event.data;
        if (!message || typeof message !== ''object'') return;

        if (message.type === ''dodi:init'' && typeof message.token === ''string'') {
          bridgeToken = message.token;
          postToParent(''game:ready'', { capabilities: capabilities, state: getState() });
          return;
        }

        if (!bridgeToken || message.token !== bridgeToken) return;

        if (message.type === ''dodi:get_state'') {
          postToParent(''game:state'', getState());
          return;
        }

        if (message.type === ''dodi:command'') {
          var result = handleCommand(message.payload && message.payload.command);
          if (result.ok) {
            postToParent(''game:event'', {
              event: ''command_executed'',
              message: ''Command executed'',
            });
          } else {
            postToParent(''game:error'', {
              error: result.error,
              command: message.payload && message.payload.command,
            });
          }
          postToParent(''game:result'', {
            command: message.payload && message.payload.command,
            result: result,
            state: getState(),
          });
        }
      });

      buildToolbar();
      resizeCanvas();
      window.addEventListener(''resize'', resizeCanvas);

      // The canvas lives in a flex box whose height is derived from the parent
      // stage. When the game loads before that layout settles, clientHeight is 0
      // and the drawing buffer collapses to 1px — so freehand strokes and
      // generated images render into nothing even though the element looks full
      // size. window "resize" does NOT fire for that initial 0 -> real transition
      // inside the iframe; a ResizeObserver does, and also catches every later
      // size change.
      if (typeof ResizeObserver !== ''undefined'') {
        var resizeObserver = new ResizeObserver(function () { resizeCanvas(); });
        resizeObserver.observe(canvas);
      }

      clearCanvas(false);

      canvas.addEventListener(''pointerdown'', startDraw);
      canvas.addEventListener(''pointermove'', moveDraw);
      canvas.addEventListener(''pointerup'', endDraw);
      canvas.addEventListener(''pointerleave'', endDraw);
      canvas.addEventListener(''pointercancel'', endDraw);

      postToParent(''game:event'', {
        event: ''loaded'',
        message: ''Drawing playground loaded'',
      });
    })();
  </script>
</body>
</html>
',
  metadata = '{"version": "2.0.0", "category": "drawing", "capabilities": ["set_color", "set_brush_size", "clear_canvas", "undo", "get_snapshot", "generate_drawing"], "supportsVoiceCommands": true}',
  markdown = '# Drawing

## Game Overview
A freeform drawing canvas where kids create art using colors and brushes. There are no win/lose conditions — this is a creative sandbox. Dodi can also generate a printable-style **coloring sheet** (a black-and-white mandala outline) of anything the child asks for, which the child then colors in.

## Rules
- The child draws freely on a canvas using touch or pointer input
- When the child asks Dodi to draw or make a picture of something, Dodi generates a coloring-sheet outline with the `generate_drawing` command — Dodi never tries to draw the subject stroke by stroke
- Dodi can also help by changing colors or suggesting creative ideas
- There is no score or levels — creativity is the goal

## Available Commands

### set_color
Change the active brush color.
- `payload.color` (string, required): A hex color from the palette: `#111111`, `#e53935`, `#fb8c00`, `#fdd835`, `#43a047`, `#1e88e5`, `#8e24aa`, `#ff5ca8`
- Example: `{"type":"set_color","payload":{"color":"#e53935"}}`

### set_brush_size
Change the brush thickness.
- `payload.size` (number, required): One of `4`, `8`, `12`, `18`, `24`
- Example: `{"type":"set_brush_size","payload":{"size":12}}`

### generate_drawing
Create a black-and-white mandala **coloring sheet** of whatever the child asks for and place it on the canvas as a fresh base to color in. This is how Dodi draws ANY subject — animals, objects, characters, or scenes.
- `payload.subject` (string, required): What to draw, e.g. `"owl"`, `"a friendly dragon"`, `"a flower"`
- MANDATORY: whenever the child asks you to draw, make, or show a picture of something, you MUST emit this generate_drawing command in the SAME turn. Saying "I will draw it" without emitting the command does nothing and leaves the canvas blank — the command is the only thing that draws
- Speak a short acknowledgment TOGETHER WITH the command (e.g. "I am creating your picture — it will be there in a moment!"). The words accompany the command; they never replace it
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
- When the child names something they want to see, use `generate_drawing` to make a coloring sheet of it, then color it in together
- Suggest fun subjects ("Want me to draw an owl mandala for you to color?")
- Celebrate creativity — there are no wrong answers
- Talk about the picture while coloring: the colors, the patterns, and what the subject is
- When the child asks "Can you guess what I drew?", use get_snapshot + read_game_state to see their drawing and make a fun guess
- Keep interactions playful and age-appropriate
',
  updated_at = now()
WHERE system_key = 'drawing-basic';
