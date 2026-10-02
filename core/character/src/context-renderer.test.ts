import { afterEach, describe, expect, it } from "vitest";

import { rendererForContext } from "./context-renderer";

type Globals = Record<string, unknown>;
const globals = globalThis as unknown as Globals;
const saved = {
  webgl1: globals.WebGLRenderingContext,
  webgl2: globals.WebGL2RenderingContext,
};

afterEach(() => {
  globals.WebGLRenderingContext = saved.webgl1;
  globals.WebGL2RenderingContext = saved.webgl2;
});

/**
 * expo-gl installs both context constructors on the global and makes
 * WebGL2RenderingContext extend WebGLRenderingContext (common/EXWebGLRenderer.cpp).
 * Browsers don't. three.js (r163+) rejects any context that is
 * `instanceof WebGLRenderingContext` as WebGL 1, so the app's real WebGL 2
 * context failed with "WebGL 1 is not supported since r163" and the 3D
 * companion never rendered (seen on a Pixel 10).
 */
function installExpoGlClasses(): new () => object {
  class WebGLRenderingContext {}
  class WebGL2RenderingContext extends WebGLRenderingContext {}
  globals.WebGLRenderingContext = WebGLRenderingContext;
  globals.WebGL2RenderingContext = WebGL2RenderingContext;
  return WebGL2RenderingContext;
}

function errorOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("rendererForContext", () => {
  it("accepts expo-gl's WebGL 2 context instead of rejecting it as WebGL 1", () => {
    const Webgl2 = installExpoGlClasses();
    const context = new Webgl2() as unknown as WebGL2RenderingContext;

    // The stand-in context has no GL methods, so three may still fail further
    // in; it must not fail the WebGL 1 check.
    const message = errorOf(() => rendererForContext(context, 64, 64));
    expect(message ?? "").not.toMatch(/WebGL 1 is not supported/);
  });

  it("still rejects a context that is only WebGL 1", () => {
    installExpoGlClasses();
    const Webgl1 = globals.WebGLRenderingContext as new () => object;
    const context = new Webgl1() as unknown as WebGL2RenderingContext;

    expect(errorOf(() => rendererForContext(context, 64, 64))).toMatch(/WebGL 1 is not supported/);
    expect(globals.WebGLRenderingContext).toBe(Webgl1);
  });

  it("leaves the global context constructors as they were", () => {
    const Webgl2 = installExpoGlClasses();
    const webgl1 = globals.WebGLRenderingContext;
    const context = new Webgl2() as unknown as WebGL2RenderingContext;

    errorOf(() => rendererForContext(context, 64, 64));
    expect(globals.WebGLRenderingContext).toBe(webgl1);
    expect(globals.WebGL2RenderingContext).toBe(Webgl2);
  });
});
