import * as THREE from "three";

/**
 * A three.js renderer on a WebGL 2 context that has no DOM canvas around it
 * (expo-gl's GL ES 3 context in the app). three only needs the canvas for its
 * size and its context-loss listeners, so a stand-in object does. The caller
 * sizes the drawing buffer (`width`, `height` in pixels); the renderer draws
 * at pixel ratio 1 into it and never resizes it.
 */
export function rendererForContext(context: WebGL2RenderingContext, width: number, height: number): THREE.WebGLRenderer {
  const canvas = {
    width,
    height,
    style: {},
    clientWidth: width,
    clientHeight: height,
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => context,
  };
  const renderer = withWebGL1CheckFixed(
    context,
    () =>
      new THREE.WebGLRenderer({
        canvas: canvas as unknown as HTMLCanvasElement,
        context,
        alpha: true,
      }),
  );
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  return renderer;
}

const WEBGL1_GLOBAL = "WebGLRenderingContext";

/**
 * three's WebGLRenderer constructor rejects any context that is
 * `instanceof WebGLRenderingContext` as WebGL 1 (its only such check; nothing
 * at render time repeats it). expo-gl makes WebGL2RenderingContext extend
 * WebGLRenderingContext, unlike browsers, so its real WebGL 2 context fails
 * that check. For a context that is WebGL 2 the global is hidden for the
 * synchronous construction only and restored in `finally`, so nothing else
 * observes it. A genuine WebGL 1 context still hits three's check.
 */
function withWebGL1CheckFixed<T>(context: object, construct: () => T): T {
  const scope = globalThis as unknown as Record<string, unknown>;
  const webgl1 = scope[WEBGL1_GLOBAL];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, WEBGL1_GLOBAL);
  const misfires =
    typeof webgl1 === "function" && context instanceof webgl1 && isWebGL2(context) && descriptor?.configurable === true;
  if (!misfires || descriptor === undefined) return construct();

  Object.defineProperty(globalThis, WEBGL1_GLOBAL, { value: undefined, writable: true, configurable: true });
  try {
    return construct();
  } finally {
    Object.defineProperty(globalThis, WEBGL1_GLOBAL, descriptor);
  }
}

function isWebGL2(context: object): boolean {
  const webgl2 = (globalThis as unknown as Record<string, unknown>).WebGL2RenderingContext;
  if (typeof webgl2 === "function" && context instanceof webgl2) return true;
  const api = context as Partial<Record<"texStorage2D" | "createVertexArray", unknown>>;
  return typeof api.texStorage2D === "function" && typeof api.createVertexArray === "function";
}
