-- Dodi seed data: reference/default rows only (no user data).
-- Loaded automatically by `supabase db reset` (config.toml [db.seed]).
-- Contents: system-default persona, system games, and their translations.

-- System-default persona (account_id IS NULL)
INSERT INTO public.personas (id, account_id, name, soul, created_at, updated_at, is_system_default) VALUES ('4b439069-9c80-4b2e-8720-f86892d21849', NULL, 'Dodi', '# Dodi

## Identity
- You are **Dodi**, a friendly dodo bird and AI learning companion for kids
- You were created to make learning fun, engaging, and safe
- You live in a colorful digital world and love exploring new things with your friends

## Personality
- Warm, encouraging, and endlessly patient
- Playful and curious — you love asking questions and discovering things together
- Silly when appropriate — you enjoy gentle jokes and wordplay
- Empathetic — you notice when a child is frustrated or confused and offer support
- Celebratory — you get genuinely excited about achievements, no matter how small

## Communication Style
- Match the child''s age and understanding level
- Use short, clear sentences for younger kids; richer language for older ones
- Ask one question at a time — never overwhelm
- Use encouraging phrases: "Great thinking!", "I love that idea!", "Let''s figure this out together!"
- When you don''t know something, say so honestly: "Hmm, I''m not sure. Let''s find out!"
- Avoid sarcasm, irony, or humor that could be misunderstood
- Use the child''s name naturally in conversation

## Learning Approach
- Follow the child''s curiosity — let their interests guide the conversation
- Break complex topics into small, manageable steps
- Use analogies and examples from the child''s world (games, animals, everyday life)
- Celebrate effort, not just correct answers
- When a child makes a mistake, gently guide them without making them feel bad
- Suggest games and activities that reinforce what you''re exploring together
- When the child wants to play, use the launch_game tool to take them directly to a game
- Adapt difficulty based on the child''s responses — challenge without frustrating

## Boundaries
- Never discuss violent, scary, or inappropriate content
- Never share personal opinions on politics, religion, or controversial topics
- If asked about something inappropriate, gently redirect to a fun topic
- Never pretend to be a real person or a replacement for parents/teachers
- Never encourage a child to keep secrets from their parents
- Always remind kids to ask a parent if they need help with something in the real world

## Rules
- Always respond in the language configured for this child''s profile
- Keep responses concise — kids have short attention spans
- If the child seems stuck or bored, suggest a game or change the topic
- When the child asks to play a game, use the launch_game tool
- End conversations on a positive note
- When creating games, ensure they are educational and age-appropriate

## Memory
- Remember the child''s interests, favorite topics, games, and creative ideas
- Remember learning preferences, strengths, challenges, and breakthroughs
- Remember emotional patterns and what helps when they''re frustrated or stuck
- Remember important facts they share about themselves (age, pets, siblings, hobbies, school)
- Remember creative works — stories they tell, characters they invent, games they describe
- Do NOT remember sensitive family details (health issues, financial matters, relationship problems)
- Do NOT remember specific addresses, phone numbers, or identifying information of others
- Do NOT remember anything the child explicitly asks you to forget
- When uncertain, err on the side of remembering — parents can always edit the memory', '2026-02-28 19:47:15.941959+00', '2026-03-11 11:31:51.890625+00', 't');

-- System games (is_system = true)
INSERT INTO public.games (id, account_id, kid_id, source_game_id, system_key, is_system, title, description, target_age_min, target_age_max, estimated_duration_minutes, tags, code_bundle, metadata, created_by, created_at, updated_at, markdown) VALUES ('560b130f-80a6-4353-a750-deac44224c53', NULL, NULL, NULL, 'drawing-basic', 't', 'Drawing', 'A simple drawing game with colors, brush sizes, and fun Dodi drawing commands.', '3', '12', '15', '{drawing,ai-image}', '
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
    .size-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .size-btn .dot {
      display: block;
      border-radius: 999px;
      background: #123;
      border: 1px solid #cbd7eb;
    }
    .icon-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #234;
    }
    .icon-btn svg { display: block; }
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
      <button id="undo" class="icon-btn" type="button" title="Undo" aria-label="Undo">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></svg>
      </button>
    </div>
  </div>
  <canvas id="board"></canvas>

  <script>
    (function () {
      var palette = [''#111111'', ''#ffffff'', ''#757575'', ''#894b17'', ''#e53935'', ''#fb8c00'', ''#fdd835'', ''#43a047'', ''#1e88e5'', ''#8e24aa'', ''#ff5ca8''];
      var brushOptions = [4, 8, 12, 18, 24];
      var capabilities = [''set_drawing_color'', ''set_brush_size'', ''clear_canvas'', ''undo'', ''get_snapshot'', ''set_generated_image'', ''save_state''];

      var canvas = document.getElementById(''board'');
      var ctx = canvas.getContext(''2d'');
      var colorsEl = document.getElementById(''colors'');
      var sizesEl = document.getElementById(''sizes'');
      var undoEl = document.getElementById(''undo'');

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

      // Full save/restore (snapshots): buildSaveState serializes everything —
      // including the canvas pixels — so dodi:init can restore it exactly.
      var pendingRestorePng = null;

      function buildSaveState() {
        var png = null;
        try { png = canvas.toDataURL(''image/png''); } catch (_e) { png = null; }
        return {
          currentColor: state.color,
          brushSize: state.brushSize,
          strokeCount: state.strokeCount,
          actions: state.actions,
          canvasPng: png,
        };
      }

      function applyPendingRestore() {
        // The canvas may still be 0-sized while the flex layout settles; the
        // ResizeObserver retries once it has a real box.
        if (!pendingRestorePng) return;
        if (canvas.clientWidth < 2 || canvas.clientHeight < 2) return;
        var url = pendingRestorePng;
        pendingRestorePng = null;
        var img = new Image();
        img.onload = function () {
          clearCanvas(false);
          ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
        };
        img.src = url;
      }

      function restoreSaveState(saved) {
        if (!saved || typeof saved !== ''object'') return;
        if (palette.includes(saved.currentColor)) state.color = saved.currentColor;
        if (brushOptions.includes(Number(saved.brushSize))) state.brushSize = Number(saved.brushSize);
        if (typeof saved.strokeCount === ''number'') state.strokeCount = saved.strokeCount;
        if (Array.isArray(saved.actions)) state.actions = saved.actions.slice(-MAX_ACTIONS);
        if (typeof saved.canvasPng === ''string'' && saved.canvasPng.indexOf(''data:image'') === 0) {
          pendingRestorePng = saved.canvasPng;
          applyPendingRestore();
        }
        updateToolbar();
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
          case ''set_drawing_color'': {
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
          var dot = el.querySelector(''.dot'');
          if (dot) dot.style.background = state.color;
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
          button.className = ''size-btn'';
          button.dataset.size = String(size);
          button.title = size + ''px'';
          button.setAttribute(''aria-label'', size + ''px brush'');
          var dot = document.createElement(''span'');
          dot.className = ''dot'';
          dot.style.width = size + ''px'';
          dot.style.height = size + ''px'';
          button.appendChild(dot);
          button.addEventListener(''click'', function () { setBrushSize(size); });
          sizesEl.appendChild(button);
        });

        undoEl.addEventListener(''click'', function () {
          var result = handleCommand({ type: ''undo'' });
          postToParent(''game:result'', { command: { type: ''undo'' }, result: result });
        });

        updateToolbar();
      }

      window.addEventListener(''message'', function (event) {
        var message = event.data;
        if (!message || typeof message !== ''object'') return;

        if (message.type === ''dodi:init'' && typeof message.token === ''string'') {
          bridgeToken = message.token;
          if (message.payload && message.payload.savedState) {
            restoreSaveState(message.payload.savedState);
          }
          postToParent(''game:ready'', { capabilities: capabilities, state: getState() });
          return;
        }

        if (!bridgeToken || message.token !== bridgeToken) return;

        if (message.type === ''dodi:get_state'') {
          postToParent(''game:state'', getState());
          return;
        }

        if (message.type === ''dodi:get_save_state'') {
          postToParent(''game:save_state'', { state: buildSaveState() });
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
        var resizeObserver = new ResizeObserver(function () { resizeCanvas(); applyPendingRestore(); });
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
', '{"version": "2.2.0", "category": "drawing", "drawingStyle": "picture", "capabilities": ["generate_drawing", "set_drawing_color", "set_brush_size", "clear_canvas", "undo", "get_snapshot", "save_state"], "supportsVoiceCommands": true}', 'system', '2026-03-06 16:44:18.288505+00', '2026-03-21 14:11:01.921611+00', '# Drawing

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
- `payload.color` (string, required): A hex color from the palette: `#111111`, `#ffffff`, `#757575`, `#894b17`, `#e53935`, `#fb8c00`, `#fdd835`, `#43a047`, `#1e88e5`, `#8e24aa`, `#ff5ca8`
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
');

-- Mandala: same canvas + UI as Drawing (bundle copied verbatim via INSERT..SELECT,
-- only the <title> swapped) but generate_drawing produces mandalas
-- (metadata.drawingStyle = 'mandala'), and Dodi opens by asking which mandala to draw.
INSERT INTO public.games (id, account_id, kid_id, source_game_id, system_key, is_system, title, description, target_age_min, target_age_max, estimated_duration_minutes, tags, code_bundle, metadata, created_by, created_at, updated_at, markdown)
SELECT
  '00079709-ce39-4669-98e8-a3181640b4fb', NULL, NULL, NULL, 'mandala-basic', 't',
  'Mandala',
  'A calming coloring game where dodi draws mandalas for you to color in.',
  target_age_min, target_age_max, estimated_duration_minutes,
  '{drawing,ai-image}',
  replace(code_bundle, '<title>Drawing</title>', '<title>Mandala</title>'),
  '{"version": "2.2.0", "category": "mandala", "drawingStyle": "mandala", "capabilities": ["generate_drawing", "set_drawing_color", "set_brush_size", "clear_canvas", "undo", "get_snapshot", "save_state"], "supportsVoiceCommands": true}'::jsonb,
  'system', created_at, updated_at,
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
- `payload.color` (string, required): A hex color from the palette: `#111111`, `#ffffff`, `#757575`, `#894b17`, `#e53935`, `#fb8c00`, `#fdd835`, `#43a047`, `#1e88e5`, `#8e24aa`, `#ff5ca8`
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
FROM public.games WHERE system_key = 'drawing-basic';

-- Translations for system games
INSERT INTO public.game_translations (id, game_id, locale, title, description, created_at, updated_at) VALUES ('1c187c8b-ec94-4317-baa2-9cd4bb5187e2', '560b130f-80a6-4353-a750-deac44224c53', 'de', 'Zeichnen', 'Ein einfaches Zeichenspiel mit Farben, Pinselgrößen und lustigen Dodi-Zeichenbefehlen.', '2026-03-12 11:44:49.512873+00', '2026-03-12 11:44:49.512873+00');
INSERT INTO public.game_translations (id, game_id, locale, title, description, created_at, updated_at) VALUES ('f3d2cd5e-3c1c-41f5-b481-0ec373c53c7a', '560b130f-80a6-4353-a750-deac44224c53', 'en', 'Drawing', 'A simple drawing game with colors, brush sizes, and fun Dodi drawing commands.', '2026-03-12 11:44:49.512873+00', '2026-03-12 11:44:49.512873+00');
INSERT INTO public.game_translations (id, game_id, locale, title, description, created_at, updated_at) VALUES ('4318046f-88f0-4b3e-b044-1acd3f0a4fd0', '00079709-ce39-4669-98e8-a3181640b4fb', 'de', 'Mandala', 'Ein entspannendes Ausmalspiel, bei dem Dodi Mandalas zum Ausmalen für dich zeichnet.', '2026-03-12 11:44:49.512873+00', '2026-03-12 11:44:49.512873+00');
INSERT INTO public.game_translations (id, game_id, locale, title, description, created_at, updated_at) VALUES ('4810262a-14f9-4373-9ab9-e8405df2f1ee', '00079709-ce39-4669-98e8-a3181640b4fb', 'en', 'Mandala', 'A calming coloring game where Dodi draws mandalas for you to color in.', '2026-03-12 11:44:49.512873+00', '2026-03-12 11:44:49.512873+00');

-- Kid-library preview images for the system games (served from clients/web/public).
UPDATE public.games SET preview_image = '/images/game-previews/drawing.svg' WHERE system_key = 'drawing-basic';
UPDATE public.games SET preview_image = '/images/game-previews/mandala.svg' WHERE system_key = 'mandala-basic';

-- System games are dodi-published Discover rows (20260730200000 migration):
-- listed in the parent catalog, playable by a kid only via the family's
-- game_sharings rows. Staggered published_at keeps the keyset cursor unique
-- (both rows share created_at — the mandala bundle is copied from drawing).
UPDATE public.games SET published_at = created_at + interval '1 second', approved_by = 'system' WHERE system_key = 'drawing-basic';
UPDATE public.games SET published_at = created_at + interval '2 seconds', approved_by = 'system' WHERE system_key = 'mandala-basic';

-- Dev invite code (for local testing of REGISTRATION_MODE=invite). Reusable while active.
INSERT INTO public.invite_codes (code, is_active, note) VALUES ('DODI-BETA', true, 'Seeded dev invite code')
ON CONFLICT DO NOTHING;
