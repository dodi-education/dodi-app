-- Idempotent patch: remove the in-game clear (trash) toolbar button from the
-- Drawing (drawing-basic) and Mandala (mandala-basic) system games — the kid
-- play view now owns game reset via a host-level trash button in the title bar
-- (which remounts the sandbox fresh and persists the reset through autosave).
-- The clear_canvas COMMAND stays: Dodi can still clear the canvas by voice.
--
-- seed.sql defines these but a db reset/seed does NOT re-apply to the linked remote,
-- so this brings an already-initialized remote up to date. Full-column replace of the
-- Drawing code_bundle (never anchor-replace code_bundle on remote); Mandala shares the
-- Drawing bundle with only <title> swapped, so it is re-derived. Safe to re-run.
BEGIN;

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
',
  updated_at = now()
WHERE system_key = 'drawing-basic';

UPDATE public.games m SET
  code_bundle = replace(d.code_bundle, '<title>Drawing</title>', '<title>Mandala</title>'),
  updated_at = now()
FROM public.games d
WHERE d.system_key = 'drawing-basic' AND m.system_key = 'mandala-basic';

COMMIT;
