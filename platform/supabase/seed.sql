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
INSERT INTO public.games (id, account_id, kid_id, source_game_id, system_key, is_system, title, description, target_age_min, target_age_max, estimated_duration_minutes, tags, code_bundle, metadata, created_by, created_at, updated_at, markdown) VALUES ('560b130f-80a6-4353-a750-deac44224c53', NULL, NULL, NULL, 'drawing-basic', 't', 'Drawing', 'A simple drawing game with colors, brush sizes, and fun Dodi drawing commands.', '3', '12', '15', '{drawing,art,creativity,avatar}', '
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
      var capabilities = [''set_color'', ''set_brush_size'', ''draw_shape'', ''draw_line'', ''draw_curve'', ''clear_canvas'', ''undo'', ''get_snapshot''];

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
        var existing = ctx.getImageData(0, 0, canvas.width || 1, canvas.height || 1);
        var ratio = window.devicePixelRatio || 1;
        // Size the drawing buffer to the canvas'' own (flex-allocated) box so it fills
        // the fixed game stage exactly — no assumptions about the device viewport.
        var nextW = Math.max(1, Math.floor(canvas.clientWidth));
        var nextH = Math.max(1, Math.floor(canvas.clientHeight));

        canvas.width = Math.floor(nextW * ratio);
        canvas.height = Math.floor(nextH * ratio);

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

      function drawCurve(x1, y1, cx1, cy1, cx2, cy2, x2, y2, color, width, countStroke) {
        ctx.strokeStyle = color || state.color;
        ctx.lineWidth = width || state.brushSize;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        if (cx2 != null && cy2 != null) {
          ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
        } else {
          ctx.quadraticCurveTo(cx1, cy1, x2, y2);
        }
        ctx.stroke();
        if (countStroke) {
          state.strokeCount += 1;
          emitState();
        }
      }

      function drawShape(shape, centerX, centerY, scale, color, width) {
        var x = centerX || (canvas.clientWidth / 2);
        var y = centerY || (canvas.clientHeight / 2);
        var s = Math.max(20, Math.min(220, scale || 90));
        var strokeW = width || state.brushSize;

        snapshot();

        switch (shape) {
          case ''sun'':
            ctx.fillStyle = color || ''#fdd835'';
            ctx.beginPath();
            ctx.arc(x, y, s * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = ''#fb8c00'';
            ctx.lineWidth = 4;
            for (var i = 0; i < 12; i++) {
              var angle = (Math.PI * 2 * i) / 12;
              drawLine(
                x + Math.cos(angle) * s * 0.36,
                y + Math.sin(angle) * s * 0.36,
                x + Math.cos(angle) * s * 0.52,
                y + Math.sin(angle) * s * 0.52,
                ''#fb8c00'',
                4,
                false
              );
            }
            break;
          case ''house'':
            ctx.fillStyle = color || ''#90caf9'';
            ctx.fillRect(x - s * 0.35, y - s * 0.1, s * 0.7, s * 0.5);
            ctx.fillStyle = ''#ef5350'';
            ctx.beginPath();
            ctx.moveTo(x - s * 0.42, y - s * 0.1);
            ctx.lineTo(x, y - s * 0.5);
            ctx.lineTo(x + s * 0.42, y - s * 0.1);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = ''#6d4c41'';
            ctx.fillRect(x - s * 0.1, y + s * 0.15, s * 0.2, s * 0.25);
            break;
          case ''tree'':
            ctx.fillStyle = ''#8d6e63'';
            ctx.fillRect(x - s * 0.08, y, s * 0.16, s * 0.4);
            ctx.fillStyle = color || ''#43a047'';
            ctx.beginPath();
            ctx.arc(x, y - s * 0.1, s * 0.3, 0, Math.PI * 2);
            ctx.fill();
            break;
          case ''star'': {
            ctx.fillStyle = color || ''#ffca28'';
            var spikes = 5;
            var outer = s * 0.35;
            var inner = s * 0.16;
            var rot = Math.PI / 2 * 3;
            var step = Math.PI / spikes;
            ctx.beginPath();
            ctx.moveTo(x, y - outer);
            for (var i = 0; i < spikes; i++) {
              ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
              rot += step;
              ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
              rot += step;
            }
            ctx.closePath();
            ctx.fill();
            break;
          }
          case ''heart'':
            ctx.fillStyle = color || ''#ec407a'';
            ctx.beginPath();
            ctx.moveTo(x, y + s * 0.3);
            ctx.bezierCurveTo(x + s * 0.45, y - s * 0.05, x + s * 0.4, y - s * 0.4, x, y - s * 0.2);
            ctx.bezierCurveTo(x - s * 0.4, y - s * 0.4, x - s * 0.45, y - s * 0.05, x, y + s * 0.3);
            ctx.fill();
            break;
          case ''cloud'':
            ctx.fillStyle = color || ''#e3f2fd'';
            ctx.beginPath();
            ctx.arc(x - s * 0.2, y, s * 0.18, 0, Math.PI * 2);
            ctx.arc(x, y - s * 0.1, s * 0.22, 0, Math.PI * 2);
            ctx.arc(x + s * 0.22, y, s * 0.18, 0, Math.PI * 2);
            ctx.fill();
            break;
          case ''flower'':
            ctx.fillStyle = ''#66bb6a'';
            ctx.fillRect(x - 3, y, 6, s * 0.35);
            ctx.fillStyle = color || ''#ab47bc'';
            for (var i = 0; i < 6; i++) {
              var angle = (Math.PI * 2 * i) / 6;
              ctx.beginPath();
              ctx.arc(x + Math.cos(angle) * s * 0.18, y, s * 0.1, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = ''#fdd835'';
            ctx.beginPath();
            ctx.arc(x, y, s * 0.08, 0, Math.PI * 2);
            ctx.fill();
            break;
          case ''circle'':
            ctx.strokeStyle = color || state.color;
            ctx.lineWidth = strokeW;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case ''filled-circle'':
            ctx.fillStyle = color || state.color;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
            ctx.fill();
            break;
          case ''rectangle'':
            ctx.strokeStyle = color || state.color;
            ctx.lineWidth = strokeW;
            ctx.strokeRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.6);
            break;
          case ''filled-rectangle'':
            ctx.fillStyle = color || state.color;
            ctx.fillRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.6);
            break;
          case ''triangle'': {
            ctx.strokeStyle = color || state.color;
            ctx.lineWidth = strokeW;
            var r = s * 0.45;
            ctx.beginPath();
            ctx.moveTo(x, y - r);
            ctx.lineTo(x + r * Math.cos(Math.PI / 6), y + r * Math.sin(Math.PI / 6));
            ctx.lineTo(x - r * Math.cos(Math.PI / 6), y + r * Math.sin(Math.PI / 6));
            ctx.closePath();
            ctx.stroke();
            break;
          }
          case ''filled-triangle'': {
            ctx.fillStyle = color || state.color;
            var r = s * 0.45;
            ctx.beginPath();
            ctx.moveTo(x, y - r);
            ctx.lineTo(x + r * Math.cos(Math.PI / 6), y + r * Math.sin(Math.PI / 6));
            ctx.lineTo(x - r * Math.cos(Math.PI / 6), y + r * Math.sin(Math.PI / 6));
            ctx.closePath();
            ctx.fill();
            break;
          }
          default:
            return false;
        }

        pushAction({ action: ''shape'', shape: shape, x: Math.round(x), y: Math.round(y), scale: s, color: color || null, region: getRegion(x, y) });
        state.strokeCount += 1;
        emitState();
        return true;
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
          case ''draw_shape'': {
            var shape = String(payload.shape || '''');
            var x = payload.x == null ? undefined : Number(payload.x);
            var y = payload.y == null ? undefined : Number(payload.y);
            var scale = payload.scale == null ? undefined : Number(payload.scale);
            var color = payload.color == null ? undefined : String(payload.color);
            var width = payload.width == null ? undefined : Number(payload.width);
            var ok = drawShape(shape, x, y, scale, color, width);
            return ok ? { ok: true } : { ok: false, error: ''Unsupported shape'' };
          }
          case ''draw_line'': {
            var x1 = Number(payload.x1);
            var y1 = Number(payload.y1);
            var x2 = Number(payload.x2);
            var y2 = Number(payload.y2);
            if ([x1, y1, x2, y2].some(function (n) { return Number.isNaN(n); })) {
              return { ok: false, error: ''Invalid coordinates'' };
            }
            snapshot();
            drawLine(x1, y1, x2, y2, String(payload.color || state.color), Number(payload.size || state.brushSize), true);
            pushAction({
              action: ''line'',
              x1: Math.round(x1), y1: Math.round(y1),
              x2: Math.round(x2), y2: Math.round(y2),
              color: payload.color ? String(payload.color) : state.color,
              region: getRegion((x1 + x2) / 2, (y1 + y2) / 2),
            });
            return { ok: true };
          }
          case ''draw_curve'': {
            var x1 = Number(payload.x1), y1 = Number(payload.y1);
            var x2 = Number(payload.x2), y2 = Number(payload.y2);
            var cx1 = Number(payload.cx1), cy1 = Number(payload.cy1);
            if ([x1, y1, x2, y2, cx1, cy1].some(function (n) { return Number.isNaN(n); })) {
              return { ok: false, error: ''Invalid coordinates'' };
            }
            var cx2 = payload.cx2 != null ? Number(payload.cx2) : null;
            var cy2 = payload.cy2 != null ? Number(payload.cy2) : null;
            if ((cx2 != null && Number.isNaN(cx2)) || (cy2 != null && Number.isNaN(cy2))) {
              return { ok: false, error: ''Invalid control point coordinates'' };
            }
            snapshot();
            drawCurve(x1, y1, cx1, cy1, cx2, cy2, x2, y2,
              payload.color != null ? String(payload.color) : null,
              payload.size != null ? Number(payload.size) : null, true);
            pushAction({
              action: ''curve'',
              x1: Math.round(x1), y1: Math.round(y1),
              x2: Math.round(x2), y2: Math.round(y2),
              color: payload.color ? String(payload.color) : state.color,
              region: getRegion((x1 + x2) / 2, (y1 + y2) / 2),
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
', '{"version": "1.3.0", "category": "drawing", "capabilities": ["set_color", "set_brush_size", "draw_shape", "draw_line", "draw_curve", "clear_canvas", "undo", "get_snapshot"], "supportsVoiceCommands": true}', 'system', '2026-03-06 16:44:18.288505+00', '2026-03-21 14:11:01.921611+00', '# Drawing

## Game Overview
A freeform drawing canvas where kids create art using colors, brushes, and shape stamps. There are no win/lose conditions — this is a creative sandbox.

## Rules
- The child draws freely on a canvas using touch or pointer input
- Dodi can help by drawing shapes, changing colors, or suggesting creative ideas
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

### draw_shape
Stamp a shape onto the canvas. Shapes are split into two categories:

**Decorative shapes** have built-in colors (overridable via `payload.color`):
- `sun` — yellow sun with orange rays
- `house` — blue house with red roof and brown door
- `tree` — brown trunk with green canopy
- `star` — golden five-pointed star
- `heart` — pink heart
- `cloud` — light blue cloud
- `flower` — purple petals with yellow center and green stem

**Geometric shapes** use the current brush color by default:
- `circle` — outline circle
- `filled-circle` — solid circle
- `rectangle` — outline rectangle (4:3 ratio)
- `filled-rectangle` — solid rectangle (4:3 ratio)
- `triangle` — outline equilateral triangle
- `filled-triangle` — solid equilateral triangle

**Parameters:**
- `payload.shape` (string, required): Shape name from the lists above
- `payload.x` (number, optional): Horizontal center in pixels. Defaults to canvas center
- `payload.y` (number, optional): Vertical center in pixels. Defaults to canvas center
- `payload.scale` (number, optional): Size 20-220, default 90
- `payload.color` (string, optional): Override fill/stroke color. Accepts any CSS color. For decorative shapes, overrides the primary element color
- `payload.width` (number, optional): Override stroke width for outline shapes (`circle`, `rectangle`, `triangle`). Defaults to the current brush size

**Examples:**
- `{"type":"draw_shape","payload":{"shape":"sun","scale":120}}`
- `{"type":"draw_shape","payload":{"shape":"circle","x":200,"y":150,"scale":80,"color":"#e53935"}}`
- `{"type":"draw_shape","payload":{"shape":"filled-rectangle","x":300,"y":200,"scale":100,"color":"#1e88e5"}}`

### draw_line
Draw a line between two points.
- `payload.x1`, `payload.y1`, `payload.x2`, `payload.y2` (number, required): Start and end coordinates
- `payload.color` (string, optional): Override color
- `payload.size` (number, optional): Override brush size
- Example: `{"type":"draw_line","payload":{"x1":10,"y1":10,"x2":200,"y2":200}}`

### draw_curve
Draw a curved line (Bezier curve) between two points.
- `payload.x1`, `payload.y1` (number, required): Start point
- `payload.x2`, `payload.y2` (number, required): End point
- `payload.cx1`, `payload.cy1` (number, required): Control point — the curve bends toward this point
- `payload.cx2`, `payload.cy2` (number, optional): Second control point for S-curves (cubic Bezier)
- `payload.color` (string, optional): Override color
- `payload.size` (number, optional): Override brush size
- Simple curve: `{"type":"draw_curve","payload":{"x1":50,"y1":200,"cx1":150,"cy1":50,"x2":250,"y2":200}}`
- S-curve: `{"type":"draw_curve","payload":{"x1":50,"y1":150,"cx1":100,"cy1":50,"cx2":200,"cy2":250,"x2":250,"y2":150}}`

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

## Combining Commands
You can send multiple commands in sequence to build complex drawings:

**Snowman** (3 stacked circles):
1. `{"type":"draw_shape","payload":{"shape":"filled-circle","x":200,"y":280,"scale":120,"color":"#e3f2fd"}}` — bottom
2. `{"type":"draw_shape","payload":{"shape":"filled-circle","x":200,"y":190,"scale":90,"color":"#e3f2fd"}}` — middle
3. `{"type":"draw_shape","payload":{"shape":"filled-circle","x":200,"y":120,"scale":60,"color":"#e3f2fd"}}` — head

**House from geometric shapes:**
1. `{"type":"draw_shape","payload":{"shape":"filled-rectangle","x":200,"y":220,"scale":140,"color":"#90caf9"}}` — walls
2. `{"type":"draw_shape","payload":{"shape":"filled-triangle","x":200,"y":130,"scale":160,"color":"#ef5350"}}` — roof
3. `{"type":"draw_shape","payload":{"shape":"filled-rectangle","x":200,"y":250,"scale":40,"color":"#6d4c41"}}` — door

**Smiley face** (circle + eyes + curved mouth):
1. `{"type":"draw_shape","payload":{"shape":"filled-circle","x":200,"y":200,"scale":180,"color":"#fdd835"}}` — face
2. `{"type":"draw_shape","payload":{"shape":"filled-circle","x":170,"y":170,"scale":20,"color":"#111111"}}` — left eye
3. `{"type":"draw_shape","payload":{"shape":"filled-circle","x":230,"y":170,"scale":20,"color":"#111111"}}` — right eye
4. `{"type":"draw_curve","payload":{"x1":160,"y1":220,"cx1":200,"cy1":260,"x2":240,"y2":220,"color":"#111111","size":4}}` — smile

**Tips:**
- Draw back-to-front — later shapes cover earlier ones
- Use `payload.color` for per-shape colors instead of `set_color` to avoid changing the kid''s brush
- Geometric shapes are great for teaching: "How many sides does a triangle have?"
- Mix decorative and geometric shapes for rich scenes
- Use draw_curve for organic shapes: smiles, waves, hills, rainbow arcs

## State Fields
- `currentColor` (string): Currently selected color hex
- `brushSize` (number): Currently selected brush width
- `strokeCount` (number): How many drawing actions have been performed
- `actions` (array): History of drawing actions (last 50). Each entry has:
  - `action`: type — `"shape"`, `"freehand"`, `"line"`, or `"curve"`
  - `region`: where on the canvas — `"top-left"`, `"center"`, `"bottom-right"`, etc.
  - Shape actions include: `shape`, `x`, `y`, `scale`, `color`
  - Freehand actions include: `color`, `brushSize`, `boundingBox` (with `x`, `y`, `w`, `h`)
  - Line/curve actions include: `x1`, `y1`, `x2`, `y2`, `color`

## Teaching Strategy
- Encourage experimentation with different colors and shapes
- Suggest drawing scenes ("Let us draw a garden with flowers and a sun!")
- Celebrate creativity — there are no wrong answers
- Use draw_shape to demonstrate or collaborate ("I will add a sun to your sky!")
- Use geometric shapes to teach about shapes: names, sides, corners, sizes
- Ask questions: "Can you tell me what shape has 3 sides?" then draw a triangle
- Build compositions together: "Let us make a snowman using circles!"
- Compare filled vs outline: "Look, this circle is empty inside, and this one is full!"
- Use draw_curve to draw expressive features: smiley mouths, waves, arches, rainbow arcs
- When the child asks "Can you guess what I drew?", use get_snapshot + read_game_state to see their drawing and make a fun guess
- Keep interactions playful and age-appropriate
');

-- Translations for system games
INSERT INTO public.game_translations (id, game_id, locale, title, description, created_at, updated_at) VALUES ('1c187c8b-ec94-4317-baa2-9cd4bb5187e2', '560b130f-80a6-4353-a750-deac44224c53', 'de', 'Zeichnen', 'Ein einfaches Zeichenspiel mit Farben, Pinselgrößen und lustigen Dodi-Zeichenbefehlen.', '2026-03-12 11:44:49.512873+00', '2026-03-12 11:44:49.512873+00');
INSERT INTO public.game_translations (id, game_id, locale, title, description, created_at, updated_at) VALUES ('f3d2cd5e-3c1c-41f5-b481-0ec373c53c7a', '560b130f-80a6-4353-a750-deac44224c53', 'en', 'Drawing', 'A simple drawing game with colors, brush sizes, and fun Dodi drawing commands.', '2026-03-12 11:44:49.512873+00', '2026-03-12 11:44:49.512873+00');
