import * as THREE from "three";

import { isDecalMaterial } from "./toon-materials";

/**
 * The fallback outline, for renderers the edge pass (outline-pass.ts) does not
 * run on: every outlined mesh gets a twin that is pushed out along its normals
 * and draws only its back faces in the line colour (the "inverted hull"). It
 * follows the skeleton and the morph targets of its mesh, so it moves with the
 * clips. It draws the silhouette and where parts overlap, but not the lines
 * where touching parts meet that the edge pass finds, and creases may show a
 * gap at hard edges. Decals take no part, as in the edge pass.
 */

const HULL_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform float thickness;
void main() {
  #include <morphinstance_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  transformed += normalize(objectNormal) * thickness;
  #include <skinning_vertex>
  #include <project_vertex>
}
`;

const HULL_FRAGMENT = /* glsl */ `
uniform vec3 lineColor;
void main() {
  gl_FragColor = vec4(lineColor, 1.0);
  #include <colorspace_fragment>
}
`;

function hullMaterial(lineColor: THREE.Color, thickness: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HULL_VERTEX,
    fragmentShader: HULL_FRAGMENT,
    uniforms: { lineColor: { value: lineColor }, thickness: { value: thickness } },
    side: THREE.BackSide,
  });
}

/** A twin of `mesh` drawn with `material`, hung under it so it shares its transform and visibility. */
function hullOf(mesh: THREE.Mesh, material: THREE.Material): THREE.Mesh {
  let hull: THREE.Mesh;
  if (mesh instanceof THREE.SkinnedMesh) {
    const skinned = new THREE.SkinnedMesh(mesh.geometry, material);
    skinned.bindMode = mesh.bindMode;
    skinned.bind(mesh.skeleton, mesh.bindMatrix);
    hull = skinned;
  } else {
    hull = new THREE.Mesh(mesh.geometry, material);
  }
  // The same arrays, so the face's expressions reach the hull too.
  hull.morphTargetInfluences = mesh.morphTargetInfluences;
  hull.morphTargetDictionary = mesh.morphTargetDictionary;
  hull.frustumCulled = false;
  hull.name = `${mesh.name}-hull`;
  hull.userData = { isOutlineHull: true };
  mesh.add(hull);
  return hull;
}

/** Whether `obj` is a hull twin (not part of the character for hit tests). */
export function isOutlineHull(obj: THREE.Object3D): boolean {
  return obj.userData.isOutlineHull === true;
}

export class HullOutline {
  private readonly normal: THREE.ShaderMaterial;
  private readonly fine: THREE.ShaderMaterial;
  private readonly hulls: THREE.Mesh[] = [];

  /** Thicknesses in model units: normal lines and those of fine parts (accessories). */
  constructor(lineColor: THREE.Color, thickness: number, fineThickness: number) {
    this.normal = hullMaterial(lineColor, thickness);
    this.fine = hullMaterial(lineColor, fineThickness);
  }

  /** Give `mesh` (with its display material set) a hull, unless it is a decal. */
  add(mesh: THREE.Mesh, isFine = false): void {
    if (Array.isArray(mesh.material) || isDecalMaterial(mesh.material)) return;
    this.hulls.push(hullOf(mesh, isFine ? this.fine : this.normal));
  }

  setVisible(isVisible: boolean): void {
    for (const hull of this.hulls) hull.visible = isVisible;
  }
}
