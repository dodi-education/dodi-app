-- Add geometric shapes and color/width override to Drawing Playground
-- reverse: (no reversal needed — this only updates data)
update public.games
set
code_bundle = $drawing$
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Drawing Playground</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f2f7ff;
      color: #123;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
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
      background: #fff;
      touch-action: none;
      width: 100%;
      height: calc(100vh - 70px);
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
      const palette = ['#111111', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ff5ca8'];
      const brushOptions = [4, 8, 12, 18, 24];
      const capabilities = ['set_color', 'set_brush_size', 'draw_shape', 'draw_line', 'clear_canvas', 'undo'];

      const canvas = document.getElementById('board');
      const ctx = canvas.getContext('2d');
      const colorsEl = document.getElementById('colors');
      const sizesEl = document.getElementById('sizes');
      const undoEl = document.getElementById('undo');
      const clearEl = document.getElementById('clear');

      const state = {
        color: '#111111',
        brushSize: 8,
        drawing: false,
        prevX: 0,
        prevY: 0,
        strokeCount: 0,
        snapshots: [],
        maxSnapshots: 30,
      };

      let bridgeToken = null;

      function postToParent(type, payload) {
        if (!bridgeToken) return;
        parent.postMessage({ type, token: bridgeToken, payload }, '*');
      }

      function emitState() {
        postToParent('game:state', getState());
      }

      function getState() {
        return {
          currentColor: state.color,
          brushSize: state.brushSize,
          strokeCount: state.strokeCount,
        };
      }

      function snapshot() {
        try {
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          state.snapshots.push(data);
          if (state.snapshots.length > state.maxSnapshots) {
            state.snapshots.shift();
          }
        } catch (_error) {
          // ignore
        }
      }

      function resizeCanvas() {
        const existing = ctx.getImageData(0, 0, canvas.width || 1, canvas.height || 1);
        const ratio = window.devicePixelRatio || 1;
        const nextW = Math.max(300, Math.floor(window.innerWidth));
        const nextH = Math.max(300, Math.floor(window.innerHeight - 70));

        canvas.width = Math.floor(nextW * ratio);
        canvas.height = Math.floor(nextH * ratio);
        canvas.style.width = nextW + 'px';
        canvas.style.height = nextH + 'px';

        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (existing && existing.width > 1 && existing.height > 1) {
          try {
            const temp = document.createElement('canvas');
            temp.width = existing.width;
            temp.height = existing.height;
            const tctx = temp.getContext('2d');
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

      function drawShape(shape, centerX, centerY, scale, color, width) {
        const x = centerX || (canvas.clientWidth / 2);
        const y = centerY || (canvas.clientHeight / 2);
        const s = Math.max(20, Math.min(220, scale || 90));
        const strokeW = width || state.brushSize;

        snapshot();

        switch (shape) {
          case 'sun':
            ctx.fillStyle = color || '#fdd835';
            ctx.beginPath();
            ctx.arc(x, y, s * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fb8c00';
            ctx.lineWidth = 4;
            for (let i = 0; i < 12; i++) {
              const angle = (Math.PI * 2 * i) / 12;
              drawLine(
                x + Math.cos(angle) * s * 0.36,
                y + Math.sin(angle) * s * 0.36,
                x + Math.cos(angle) * s * 0.52,
                y + Math.sin(angle) * s * 0.52,
                '#fb8c00',
                4,
                false
              );
            }
            break;
          case 'house':
            ctx.fillStyle = color || '#90caf9';
            ctx.fillRect(x - s * 0.35, y - s * 0.1, s * 0.7, s * 0.5);
            ctx.fillStyle = '#ef5350';
            ctx.beginPath();
            ctx.moveTo(x - s * 0.42, y - s * 0.1);
            ctx.lineTo(x, y - s * 0.5);
            ctx.lineTo(x + s * 0.42, y - s * 0.1);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(x - s * 0.1, y + s * 0.15, s * 0.2, s * 0.25);
            break;
          case 'tree':
            ctx.fillStyle = '#8d6e63';
            ctx.fillRect(x - s * 0.08, y, s * 0.16, s * 0.4);
            ctx.fillStyle = color || '#43a047';
            ctx.beginPath();
            ctx.arc(x, y - s * 0.1, s * 0.3, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'star': {
            ctx.fillStyle = color || '#ffca28';
            const spikes = 5;
            const outer = s * 0.35;
            const inner = s * 0.16;
            let rot = Math.PI / 2 * 3;
            const step = Math.PI / spikes;
            ctx.beginPath();
            ctx.moveTo(x, y - outer);
            for (let i = 0; i < spikes; i++) {
              ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
              rot += step;
              ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
              rot += step;
            }
            ctx.closePath();
            ctx.fill();
            break;
          }
          case 'heart':
            ctx.fillStyle = color || '#ec407a';
            ctx.beginPath();
            ctx.moveTo(x, y + s * 0.3);
            ctx.bezierCurveTo(x + s * 0.45, y - s * 0.05, x + s * 0.4, y - s * 0.4, x, y - s * 0.2);
            ctx.bezierCurveTo(x - s * 0.4, y - s * 0.4, x - s * 0.45, y - s * 0.05, x, y + s * 0.3);
            ctx.fill();
            break;
          case 'cloud':
            ctx.fillStyle = color || '#e3f2fd';
            ctx.beginPath();
            ctx.arc(x - s * 0.2, y, s * 0.18, 0, Math.PI * 2);
            ctx.arc(x, y - s * 0.1, s * 0.22, 0, Math.PI * 2);
            ctx.arc(x + s * 0.22, y, s * 0.18, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'flower':
            ctx.fillStyle = '#66bb6a';
            ctx.fillRect(x - 3, y, 6, s * 0.35);
            ctx.fillStyle = color || '#ab47bc';
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI * 2 * i) / 6;
              ctx.beginPath();
              ctx.arc(x + Math.cos(angle) * s * 0.18, y, s * 0.1, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = '#fdd835';
            ctx.beginPath();
            ctx.arc(x, y, s * 0.08, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'circle':
            ctx.strokeStyle = color || state.color;
            ctx.lineWidth = strokeW;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'filled-circle':
            ctx.fillStyle = color || state.color;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'rectangle':
            ctx.strokeStyle = color || state.color;
            ctx.lineWidth = strokeW;
            ctx.strokeRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.6);
            break;
          case 'filled-rectangle':
            ctx.fillStyle = color || state.color;
            ctx.fillRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.6);
            break;
          case 'triangle': {
            ctx.strokeStyle = color || state.color;
            ctx.lineWidth = strokeW;
            const r = s * 0.45;
            ctx.beginPath();
            ctx.moveTo(x, y - r);
            ctx.lineTo(x + r * Math.cos(Math.PI / 6), y + r * Math.sin(Math.PI / 6));
            ctx.lineTo(x - r * Math.cos(Math.PI / 6), y + r * Math.sin(Math.PI / 6));
            ctx.closePath();
            ctx.stroke();
            break;
          }
          case 'filled-triangle': {
            ctx.fillStyle = color || state.color;
            const r = s * 0.45;
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

        state.strokeCount += 1;
        emitState();
        return true;
      }

      function clearCanvas(countStroke) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        if (countStroke) {
          state.strokeCount += 1;
          emitState();
        }
      }

      function undo() {
        const last = state.snapshots.pop();
        if (!last) return false;
        ctx.putImageData(last, 0, 0);
        state.strokeCount = Math.max(0, state.strokeCount - 1);
        emitState();
        return true;
      }

      function getPoint(event) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }

      function startDraw(event) {
        state.drawing = true;
        snapshot();
        const pt = getPoint(event);
        state.prevX = pt.x;
        state.prevY = pt.y;
      }

      function moveDraw(event) {
        if (!state.drawing) return;
        const pt = getPoint(event);
        drawLine(state.prevX, state.prevY, pt.x, pt.y, state.color, state.brushSize, false);
        state.prevX = pt.x;
        state.prevY = pt.y;
      }

      function endDraw() {
        if (!state.drawing) return;
        state.drawing = false;
        state.strokeCount += 1;
        emitState();
      }

      function handleCommand(command) {
        if (!command || typeof command !== 'object') {
          return { ok: false, error: 'Invalid command payload' };
        }

        const type = command.type;
        const payload = command.payload || {};

        switch (type) {
          case 'set_color': {
            const ok = setColor(String(payload.color || ''));
            return ok ? { ok: true } : { ok: false, error: 'Unsupported color' };
          }
          case 'set_brush_size': {
            const size = Number(payload.size);
            const ok = setBrushSize(size);
            return ok ? { ok: true } : { ok: false, error: 'Unsupported brush size' };
          }
          case 'draw_shape': {
            const shape = String(payload.shape || '');
            const x = payload.x == null ? undefined : Number(payload.x);
            const y = payload.y == null ? undefined : Number(payload.y);
            const scale = payload.scale == null ? undefined : Number(payload.scale);
            const color = payload.color == null ? undefined : String(payload.color);
            const width = payload.width == null ? undefined : Number(payload.width);
            const ok = drawShape(shape, x, y, scale, color, width);
            return ok ? { ok: true } : { ok: false, error: 'Unsupported shape' };
          }
          case 'draw_line': {
            const x1 = Number(payload.x1);
            const y1 = Number(payload.y1);
            const x2 = Number(payload.x2);
            const y2 = Number(payload.y2);
            if ([x1, y1, x2, y2].some((n) => Number.isNaN(n))) {
              return { ok: false, error: 'Invalid coordinates' };
            }
            snapshot();
            drawLine(x1, y1, x2, y2, String(payload.color || state.color), Number(payload.size || state.brushSize), true);
            return { ok: true };
          }
          case 'clear_canvas': {
            snapshot();
            clearCanvas(true);
            return { ok: true };
          }
          case 'undo': {
            const ok = undo();
            return ok ? { ok: true } : { ok: false, error: 'Nothing to undo' };
          }
          default:
            return { ok: false, error: 'Unknown command type' };
        }
      }

      function updateToolbar() {
        colorsEl.querySelectorAll('button').forEach((el) => {
          el.classList.toggle('active', el.dataset.color === state.color);
        });
        sizesEl.querySelectorAll('button').forEach((el) => {
          el.classList.toggle('active', Number(el.dataset.size) === state.brushSize);
        });
      }

      function buildToolbar() {
        palette.forEach((color) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'swatch';
          button.dataset.color = color;
          button.style.background = color;
          button.title = color;
          button.addEventListener('click', () => setColor(color));
          colorsEl.appendChild(button);
        });

        brushOptions.forEach((size) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.size = String(size);
          button.textContent = String(size);
          button.addEventListener('click', () => setBrushSize(size));
          sizesEl.appendChild(button);
        });

        undoEl.addEventListener('click', () => {
          const result = handleCommand({ type: 'undo' });
          postToParent('game:result', { command: { type: 'undo' }, result });
        });

        clearEl.addEventListener('click', () => {
          const result = handleCommand({ type: 'clear_canvas' });
          postToParent('game:result', { command: { type: 'clear_canvas' }, result });
        });

        updateToolbar();
      }

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || typeof message !== 'object') return;

        if (message.type === 'dodi:init' && typeof message.token === 'string') {
          bridgeToken = message.token;
          postToParent('game:ready', { capabilities, state: getState() });
          return;
        }

        if (!bridgeToken || message.token !== bridgeToken) return;

        if (message.type === 'dodi:get_state') {
          postToParent('game:state', getState());
          return;
        }

        if (message.type === 'dodi:command') {
          const result = handleCommand(message.payload && message.payload.command);
          if (result.ok) {
            postToParent('game:event', {
              event: 'command_executed',
              message: 'Command executed',
            });
          } else {
            postToParent('game:error', {
              error: result.error,
              command: message.payload && message.payload.command,
            });
          }
          postToParent('game:result', {
            command: message.payload && message.payload.command,
            result,
            state: getState(),
          });
        }
      });

      buildToolbar();
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      clearCanvas(false);

      canvas.addEventListener('pointerdown', startDraw);
      canvas.addEventListener('pointermove', moveDraw);
      canvas.addEventListener('pointerup', endDraw);
      canvas.addEventListener('pointerleave', endDraw);
      canvas.addEventListener('pointercancel', endDraw);

      postToParent('game:event', {
        event: 'loaded',
        message: 'Drawing playground loaded',
      });
    })();
  </script>
</body>
</html>
$drawing$,
markdown = $markdown$# Drawing Playground

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

### clear_canvas
Erase everything on the canvas. No payload needed.
- Example: `{"type":"clear_canvas"}`

### undo
Undo the last drawing action. No payload needed.
- Example: `{"type":"undo"}`

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

**Tips:**
- Draw back-to-front — later shapes cover earlier ones
- Use `payload.color` for per-shape colors instead of `set_color` to avoid changing the kid's brush
- Geometric shapes are great for teaching: "How many sides does a triangle have?"
- Mix decorative and geometric shapes for rich scenes

## State Fields
- `currentColor` (string): Currently selected color hex
- `brushSize` (number): Currently selected brush width
- `strokeCount` (number): How many drawing actions have been performed

## Teaching Strategy
- Encourage experimentation with different colors and shapes
- Suggest drawing scenes ("Let us draw a garden with flowers and a sun!")
- Celebrate creativity — there are no wrong answers
- Use draw_shape to demonstrate or collaborate ("I will add a sun to your sky!")
- Use geometric shapes to teach about shapes: names, sides, corners, sizes
- Ask questions: "Can you tell me what shape has 3 sides?" then draw a triangle
- Build compositions together: "Let us make a snowman using circles!"
- Compare filled vs outline: "Look, this circle is empty inside, and this one is full!"
- Keep interactions playful and age-appropriate
$markdown$,
metadata = '{
    "version": "1.1.0",
    "capabilities": ["set_color", "set_brush_size", "draw_shape", "draw_line", "clear_canvas", "undo"],
    "category": "drawing",
    "supportsVoiceCommands": true
  }'::jsonb
where system_key = 'drawing-basic';
