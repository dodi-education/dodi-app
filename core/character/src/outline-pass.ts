import * as THREE from "three";

import { isDecalMaterial } from "./toon-materials";

/**
 * Outlines the way characters/blender/preview.py draws them, so the lines
 * where parts meet appear too (not only the silhouette):
 * 1. render every material slot in a flat part-ID colour, with depth;
 * 2. mark pixels whose ID differs from a neighbour's, or whose depth jumps;
 * 3. measure each pixel's exact distance to the nearest marked pixel (a
 *    separable distance transform: along rows, then down columns) and draw
 *    the line where it is under the radius, with a one-pixel soft edge.
 * The web stage renders above the display resolution, so the browser's
 * downscale smooths what is left of the pixel steps. It needs depth textures
 * and float-free RGBA8 targets only (WebGL 2 / GL ES 3); `isSupported` checks
 * a renderer, and the stage falls back to the inverted hull (hull-outline.ts).
 * Decals (the face) take no part: they lie on the skin and have no lines.
 * Fine parts (accessories) draw thinner lines, as in the 2D art: an edge that
 * touches a fine part is measured and drawn apart from the others, in the
 * second channel of each pass.
 */

// A depth step larger than this (model units) is an edge, as in preview.py.
const DEPTH_STEP = 0.04;
const MAX_RADIUS_PX = 16; // the distance search's reach
const FAR = MAX_RADIUS_PX + 1; // "no edge within reach", stored as FAR / 255

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const EDGE_FRAGMENT = /* glsl */ `
uniform sampler2D idTexture;
uniform sampler2D depthTexture;
uniform vec2 texel;
uniform float depthStep;
varying vec2 vUv;

// x: part ID (0 for the background), y: 1 on fine parts.
vec2 part(vec2 uv) {
  vec4 c = texture2D(idTexture, uv);
  return c.a < 0.5 ? vec2(0.0) : c.rg;
}

// Adds this neighbour's edge, if any, to the normal (x) or the fine (y) lines.
vec2 edgeTo(vec2 offset, vec2 self, float depth) {
  vec2 uv = vUv + offset * texel;
  vec2 other = part(uv);
  bool edge = abs(other.x - self.x) > 0.5 / 255.0 || abs(texture2D(depthTexture, uv).x - depth) > depthStep;
  if (!edge) return vec2(0.0);
  return max(self.y, other.y) > 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
}

void main() {
  vec2 self = part(vUv);
  float depth = texture2D(depthTexture, vUv).x;
  vec2 edge = max(max(edgeTo(vec2(1.0, 0.0), self, depth), edgeTo(vec2(-1.0, 0.0), self, depth)),
    max(edgeTo(vec2(0.0, 1.0), self, depth), edgeTo(vec2(0.0, -1.0), self, depth)));
  gl_FragColor = vec4(edge, 0.0, 1.0);
}
`;

// Per pixel: the horizontal distance to the nearest edge pixel in its row,
// normal (r) and fine (g).
const ROW_DISTANCE_FRAGMENT = /* glsl */ `
uniform sampler2D edgeTexture;
uniform vec2 texel;
varying vec2 vUv;

void main() {
  vec2 best = vec2(${FAR}.0);
  for (int x = -${MAX_RADIUS_PX}; x <= ${MAX_RADIUS_PX}; x++) {
    float d = abs(float(x));
    vec2 edge = texture2D(edgeTexture, vUv + vec2(float(x), 0.0) * texel).rg;
    if (edge.r > 0.5) best.x = min(best.x, d);
    if (edge.g > 0.5) best.y = min(best.y, d);
  }
  gl_FragColor = vec4(best / 255.0, 0.0, 1.0);
}
`;

// Per pixel: the Euclidean distance to the nearest edge pixel, from the row
// distances of the pixels above and below; drawn as a line of the radius.
const OUTLINE_FRAGMENT = /* glsl */ `
uniform sampler2D rowDistanceTexture;
uniform vec2 texel;
uniform float radius;
uniform float fineRadius;
uniform vec3 lineColor;
varying vec2 vUv;

void main() {
  vec2 best = vec2(${FAR}.0);
  for (int y = -${MAX_RADIUS_PX}; y <= ${MAX_RADIUS_PX}; y++) {
    float dy = float(y);
    vec2 dx = texture2D(rowDistanceTexture, vUv + vec2(0.0, dy) * texel).rg * 255.0;
    best = min(best, sqrt(dx * dx + dy * dy));
  }
  float cover = max(clamp(radius + 0.5 - best.x, 0.0, 1.0), clamp(fineRadius + 0.5 - best.y, 0.0, 1.0));
  if (cover <= 0.0) discard;
  gl_FragColor = vec4(lineColor, cover);
  #include <colorspace_fragment>
}
`;

interface MeshMaterials {
  mesh: THREE.Mesh;
  display: THREE.Material;
  /** The part-ID material, or null for decals, which hide during the ID pass. */
  id: THREE.Material | null;
}

function pixelTarget(options: THREE.RenderTargetOptions = {}): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    ...options,
  });
}

function fullscreenMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

export class OutlinePass {
  private readonly idTarget: THREE.WebGLRenderTarget;
  private readonly edgeTarget = pixelTarget({ depthBuffer: false });
  private readonly rowDistanceTarget = pixelTarget({ depthBuffer: false });
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.Camera();
  private readonly quad: THREE.Mesh;
  private readonly texel = new THREE.Vector2(1, 1);
  private readonly edgeMaterial: THREE.ShaderMaterial;
  private readonly rowDistanceMaterial: THREE.ShaderMaterial;
  private readonly outlineMaterial: THREE.ShaderMaterial;
  private readonly meshes: MeshMaterials[] = [];
  private nextId = 1;

  constructor(lineColor: THREE.Color, depthRange: number) {
    const depthTexture = new THREE.DepthTexture(1, 1);
    this.idTarget = pixelTarget({ depthTexture });
    this.edgeMaterial = fullscreenMaterial(EDGE_FRAGMENT, {
      idTexture: { value: this.idTarget.texture },
      depthTexture: { value: depthTexture },
      texel: { value: this.texel },
      depthStep: { value: DEPTH_STEP / depthRange },
    });
    this.rowDistanceMaterial = fullscreenMaterial(ROW_DISTANCE_FRAGMENT, {
      edgeTexture: { value: this.edgeTarget.texture },
      texel: { value: this.texel },
    });
    this.outlineMaterial = fullscreenMaterial(OUTLINE_FRAGMENT, {
      rowDistanceTexture: { value: this.rowDistanceTarget.texture },
      texel: { value: this.texel },
      radius: { value: 1 },
      fineRadius: { value: 1 },
      lineColor: { value: lineColor },
    });
    this.outlineMaterial.transparent = true;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.edgeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /**
   * Register a mesh (with its display material already set). One ID per
   * material; `isFine` parts get the thinner lines.
   */
  add(mesh: THREE.Mesh, isFine = false): void {
    if (Array.isArray(mesh.material)) throw new Error("character meshes have one material each");
    const display = mesh.material;
    let id: THREE.Material | null = null;
    if (!isDecalMaterial(display)) {
      id = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.nextId / 255, isFine ? 1 : 0, 0) });
      this.nextId += 1;
    }
    this.meshes.push({ mesh, display, id });
  }

  /** Buffer size in pixels, and the line radii (normal, fine) in those pixels. */
  setSize(width: number, height: number, radiusPx: number, fineRadiusPx: number): void {
    this.idTarget.setSize(width, height);
    this.edgeTarget.setSize(width, height);
    this.rowDistanceTarget.setSize(width, height);
    this.texel.set(1 / width, 1 / height);
    this.outlineMaterial.uniforms.radius.value = Math.min(radiusPx, MAX_RADIUS_PX - 0.5);
    this.outlineMaterial.uniforms.fineRadius.value = Math.min(fineRadiusPx, MAX_RADIUS_PX - 0.5);
  }

  /**
   * Draw one frame and report whether the passes compiled and their targets
   * are complete on this renderer (some GL drivers lack depth textures).
   */
  isSupported(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): boolean {
    const gl = renderer.getContext();
    const previousOnShaderError = renderer.debug.onShaderError;
    let isFailed = false;
    renderer.debug.onShaderError = () => {
      isFailed = true;
    };
    try {
      this.render(renderer, scene, camera);
      renderer.setRenderTarget(this.idTarget);
      isFailed ||= gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE;
    } catch {
      isFailed = true;
    } finally {
      renderer.setRenderTarget(null);
      renderer.debug.onShaderError = previousOnShaderError;
    }
    return !isFailed;
  }

  /** Draw the shaded scene with its outlines to the canvas. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    for (const m of this.meshes) {
      if (m.id) m.mesh.material = m.id;
      else m.mesh.visible = false;
    }
    renderer.setRenderTarget(this.idTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    for (const m of this.meshes) {
      m.mesh.material = m.display;
      m.mesh.visible = true;
    }

    this.renderQuad(renderer, this.edgeMaterial, this.edgeTarget);
    this.renderQuad(renderer, this.rowDistanceMaterial, this.rowDistanceTarget);

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.renderQuad(renderer, this.outlineMaterial, null);
    renderer.autoClear = autoClear;
  }

  private renderQuad(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget | null,
  ): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCamera);
  }
}
