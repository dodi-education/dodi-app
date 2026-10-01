import * as THREE from "three";

/**
 * Two-tone toon shading, as in characters/blender/preview.py: the material's
 * base colour where lit, its `shade_color` extra in shadow, with a narrow soft
 * step between them. The light is fixed in the character's world.
 */

// preview.py's LIGHT_DIR (-0.15, -0.25, 1) in glTF axes (Blender x, z, -y).
const LIGHT_DIR = new THREE.Vector3(-0.15, 1.0, 0.25).normalize();
const SHADE_THRESHOLD = -0.2; // N·L below this is in shadow
const SHADE_SOFTNESS = 0.03;

const TOON_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vWorldNormal;
void main() {
  #include <morphinstance_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
}
`;

const TOON_FRAGMENT = /* glsl */ `
uniform vec3 baseColor;
uniform vec3 shadeColor;
uniform vec3 lightDir;
uniform vec2 shadeStep;
varying vec3 vWorldNormal;
void main() {
  float lit = smoothstep(shadeStep.x, shadeStep.y, dot(normalize(vWorldNormal), lightDir));
  gl_FragColor = vec4(mix(shadeColor, baseColor, lit), 1.0);
  #include <colorspace_fragment>
}
`;

function toonMaterial(base: THREE.Color, shade: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: TOON_VERTEX,
    fragmentShader: TOON_FRAGMENT,
    uniforms: {
      baseColor: { value: base },
      shadeColor: { value: shade },
      lightDir: { value: LIGHT_DIR },
      shadeStep: { value: new THREE.Vector2(SHADE_THRESHOLD - SHADE_SOFTNESS, SHADE_THRESHOLD + SHADE_SOFTNESS) },
    },
  });
}

function stringExtra(material: THREE.Material, key: string): string | null {
  const value: unknown = material.userData[key];
  return typeof value === "string" ? value : null;
}

/** Pictures drawn on a surface (the face, an accessory's decals): unlit, no outlines. */
export function isDecalMaterial(material: THREE.Material): boolean {
  return material.userData.unlit === true;
}

/**
 * The display material for a glTF material of the character format: toon
 * shading from the base colour and `shade_color`, or the texture as is for
 * `unlit` decals.
 */
export function characterMaterial(source: THREE.Material): THREE.Material {
  const display = isDecalMaterial(source) ? decalMaterial(source) : toonFrom(source);
  // The glTF extras travel along: the outline pass reads `unlit` off it.
  display.userData = { ...source.userData };
  display.name = source.name;
  return display;
}

function decalMaterial(source: THREE.Material): THREE.MeshBasicMaterial {
  const map = source instanceof THREE.MeshStandardMaterial ? source.map : null;
  return new THREE.MeshBasicMaterial({
    map,
    transparent: source.transparent,
    depthWrite: source.depthWrite,
    side: source.side,
  });
}

function toonFrom(source: THREE.Material): THREE.ShaderMaterial {
  const base = source instanceof THREE.MeshStandardMaterial ? source.color.clone() : new THREE.Color(1, 1, 1);
  const shadeHex = stringExtra(source, "shade_color");
  const shade = shadeHex ? new THREE.Color(shadeHex) : base.clone().multiplyScalar(0.75);
  return toonMaterial(base, shade);
}
