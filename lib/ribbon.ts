import * as THREE from "three";
import { CONFIG } from "./config";
import { centerX, groundY, roadPoint } from "./road";

/**
 * Ribbon geometry builder.
 * ------------------------
 * Builds a curved strip that follows the road between two lateral offsets.
 * Used for the asphalt, shoulders, painted lines and the terrain itself —
 * every surface in the world is one of these, so they all follow exactly
 * the same curve and connect seamlessly across chunk boundaries.
 */
export interface RibbonOptions {
  /** Road distance range this ribbon spans. */
  sStart: number;
  sEnd: number;
  /** Lateral offsets (metres from the centreline). */
  uMin: number;
  uMax: number;
  /** Tessellation. */
  lengthSegments?: number;
  widthSegments?: number;
  /** Constant vertical lift, to layer surfaces without z-fighting. */
  yOffset?: number;
}

/**
 * Ground mesh for one chunk.
 *
 * Deliberately *not* an offset ribbon. An offset curve folds inside-out
 * wherever the lateral distance exceeds the curve's radius of curvature,
 * and this road's tightest radius is around 14 m against a ground surface
 * 130 m wide — so building the terrain that way shreds it on every bend.
 *
 * Instead each row sits at a constant z and simply slides sideways to
 * follow the centreline. That can never self-intersect, and because
 * neighbouring chunks share an identical row at their boundary (same z,
 * same x range) the ground still joins seamlessly.
 *
 * The narrow surfaces — asphalt, shoulders, rails — stay true offset
 * curves, since a few metres is far inside the radius everywhere.
 */
export function buildTerrain({
  sStart,
  sEnd,
  halfWidth,
  lengthSegments = CONFIG.road.lengthSegments,
  widthSegments = CONFIG.road.groundSegments,
}: {
  sStart: number;
  sEnd: number;
  halfWidth: number;
  lengthSegments?: number;
  widthSegments?: number;
}): THREE.BufferGeometry {
  const rows = lengthSegments + 1;
  const cols = widthSegments + 1;

  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const indices: number[] = [];

  for (let i = 0; i < rows; i++) {
    const ti = i / lengthSegments;
    const s = sStart + (sEnd - sStart) * ti;
    const z = -s;
    const cx = centerX(s);

    for (let j = 0; j < cols; j++) {
      const tj = j / widthSegments;
      const x = cx + (tj * 2 - 1) * halfWidth;

      const vi = (i * cols + j) * 3;
      positions[vi] = x;
      positions[vi + 1] = groundY(x, z);
      positions[vi + 2] = z;

      const uvi = (i * cols + j) * 2;
      uvs[uvi] = tj;
      uvs[uvi + 1] = ti;
    }
  }

  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < widthSegments; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Sweep an arbitrary cross-section along the road.
 *
 * The profile is a polyline in road-local space: `u` metres from the
 * centreline, `y` metres above the road surface. Sweeping it gives tunnel
 * bores, bridge parapets and guard rails from the same code path as the
 * road itself, so they follow every bend exactly.
 */
export function buildSweep({
  profile,
  sStart,
  sEnd,
  lengthSegments = CONFIG.road.lengthSegments,
}: {
  profile: { u: number; y: number }[];
  sStart: number;
  sEnd: number;
  lengthSegments?: number;
}): THREE.BufferGeometry {
  const rows = lengthSegments + 1;
  const cols = profile.length;

  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const indices: number[] = [];
  const p = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < rows; i++) {
    const ti = i / lengthSegments;
    const s = sStart + (sEnd - sStart) * ti;

    for (let j = 0; j < cols; j++) {
      roadPoint(profile[j].u, s, p);

      const vi = (i * cols + j) * 3;
      positions[vi] = p.x;
      positions[vi + 1] = p.y + profile[j].y;
      positions[vi + 2] = p.z;

      const uvi = (i * cols + j) * 2;
      uvs[uvi] = j / (cols - 1);
      uvs[uvi + 1] = ti;
    }
  }

  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function buildRibbon({
  sStart,
  sEnd,
  uMin,
  uMax,
  lengthSegments = CONFIG.road.lengthSegments,
  widthSegments = 1,
  yOffset = 0,
}: RibbonOptions): THREE.BufferGeometry {
  const rows = lengthSegments + 1;
  const cols = widthSegments + 1;

  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const indices: number[] = [];

  const p = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < rows; i++) {
    const ti = i / lengthSegments;
    const s = sStart + (sEnd - sStart) * ti;

    for (let j = 0; j < cols; j++) {
      const tj = j / widthSegments;
      const u = uMin + (uMax - uMin) * tj;

      roadPoint(u, s, p);

      const vi = (i * cols + j) * 3;
      positions[vi] = p.x;
      positions[vi + 1] = p.y + yOffset;
      positions[vi + 2] = p.z;

      const uvi = (i * cols + j) * 2;
      uvs[uvi] = tj;
      uvs[uvi + 1] = ti;
    }
  }

  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < widthSegments; j++) {
      const a = i * cols + j;
      const b = a + 1; // +1 column = +u = toward the driver's right
      const c = a + cols; // +1 row = +s = forward, which is -z
      const d = c + 1;
      // Winding matters: rows advance along -z while columns advance
      // along +x, so (a, b, c) is the order whose cross product points
      // up (+Y). The other order makes every road surface back-facing,
      // and therefore invisible from above.
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
