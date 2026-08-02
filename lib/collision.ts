import { CONFIG } from "./config";

/**
 * Vehicle-to-vehicle collision
 * ============================
 *
 * The rest of the simulator is arcade physics on an analytic road, and the
 * Rapier body on the car is kinematic — it carries a collider but does not
 * own the motion. So collisions with traffic are resolved here instead, as
 * an explicit two-body impulse in the XZ plane. That keeps every impact
 * deterministic and lets the response be tuned in CONFIG.collision rather
 * than emerging from a solver nobody is driving.
 *
 * Two steps, in the order a physics engine would do them:
 *
 *  1. `overlap` — separating-axis test between two oriented boxes. Vehicles
 *     are long and they meet at an angle, so an axis-aligned test would
 *     both miss real side-swipes and invent collisions in traffic that is
 *     merely alongside. It returns the minimum translation vector: the
 *     shortest push that pulls the two apart.
 *
 *  2. `resolve` — impulse along that normal, with restitution, tangential
 *     friction for glancing blows, and a torque from the lever arm so an
 *     off-centre hit spins you rather than just slowing you down. Momentum
 *     is shared by mass, which is the whole point: clipping a motorbike
 *     barely registers, and putting a shoulder into a loaded Tata does not
 *     end well.
 *
 * Everything is 2D. Cars stay on the road surface, so the vertical axis
 * carries no useful information and leaving it out halves the work.
 *
 * Convention throughout matches the vehicle: yaw = 0 faces -Z, positive yaw
 * turns left, so forward = (-sin y, -cos y) and right = (cos y, -sin y).
 */

export interface Obb {
  x: number;
  z: number;
  yaw: number;
  /** Half-extent across the vehicle (its "right" axis). */
  halfW: number;
  /** Half-extent along the vehicle (its "forward" axis). */
  halfL: number;
}

export interface Contact {
  /** Unit normal pointing from A toward B. */
  nx: number;
  nz: number;
  /** How deeply they interpenetrate along that normal, in metres. */
  depth: number;
}

export const forwardX = (yaw: number) => -Math.sin(yaw);
export const forwardZ = (yaw: number) => -Math.cos(yaw);
export const rightX = (yaw: number) => Math.cos(yaw);
export const rightZ = (yaw: number) => -Math.sin(yaw);

/** Radius of an OBB projected onto a unit axis. */
function projectedRadius(box: Obb, ax: number, az: number): number {
  const fx = forwardX(box.yaw);
  const fz = forwardZ(box.yaw);
  const rx = rightX(box.yaw);
  const rz = rightZ(box.yaw);
  return (
    Math.abs(box.halfL * (fx * ax + fz * az)) +
    Math.abs(box.halfW * (rx * ax + rz * az))
  );
}

// Candidate separating axes: the four face normals of the two boxes. Reused
// between calls — this runs once per traffic slot per frame.
const AXES = [0, 0, 0, 0, 0, 0, 0, 0];

/**
 * Separating-axis overlap test. Writes the minimum translation vector into
 * `out` and returns true when the boxes intersect.
 *
 * Only face normals are tested. In 2D that is exact for convex polygons —
 * the edge-cross axes that a 3D OBB test needs do not exist here.
 */
export function overlap(a: Obb, b: Obb, out: Contact): boolean {
  AXES[0] = forwardX(a.yaw); AXES[1] = forwardZ(a.yaw);
  AXES[2] = rightX(a.yaw); AXES[3] = rightZ(a.yaw);
  AXES[4] = forwardX(b.yaw); AXES[5] = forwardZ(b.yaw);
  AXES[6] = rightX(b.yaw); AXES[7] = rightZ(b.yaw);

  const dx = b.x - a.x;
  const dz = b.z - a.z;

  let bestDepth = Infinity;
  let bestX = 0;
  let bestZ = 0;

  for (let i = 0; i < 8; i += 2) {
    const ax = AXES[i];
    const az = AXES[i + 1];

    const distance = dx * ax + dz * az;
    const gap =
      projectedRadius(a, ax, az) + projectedRadius(b, ax, az) - Math.abs(distance);

    // A single axis with clear air on it proves the boxes are apart.
    if (gap <= 0) return false;

    if (gap < bestDepth) {
      bestDepth = gap;
      // Orient the axis so it always points from A toward B, whichever way
      // the two happen to be facing.
      const sign = distance < 0 ? -1 : 1;
      bestX = ax * sign;
      bestZ = az * sign;
    }
  }

  out.nx = bestX;
  out.nz = bestZ;
  out.depth = bestDepth;
  return true;
}

export interface Body {
  x: number;
  z: number;
  yaw: number;
  /** World velocity. */
  vx: number;
  vz: number;
  mass: number;
  halfW: number;
  halfL: number;
}

export interface Resolution {
  /** Positional correction for each body along the contact normal (m). */
  pushA: number;
  pushB: number;
  /** Post-impact world velocities. */
  avx: number;
  avz: number;
  bvx: number;
  bvz: number;
  /** Yaw rate imparted to each body (rad/s), positive turns left. */
  spinA: number;
  spinB: number;
  /** Closing speed along the normal, before the impulse (m/s). */
  impactSpeed: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Lever arm from a body's centre to the contact point, approximated as the
 * other body's centre clamped into this body's own footprint. Crude, but it
 * gets the thing that matters right: a hit on the nose has a long arm and
 * spins the car, a hit square in the flank has almost none and does not.
 */
function leverArm(body: Body, towardX: number, towardZ: number, out: [number, number]) {
  const fx = forwardX(body.yaw);
  const fz = forwardZ(body.yaw);
  const rx = rightX(body.yaw);
  const rz = rightZ(body.yaw);

  const along = clamp(towardX * fx + towardZ * fz, -body.halfL, body.halfL);
  const across = clamp(towardX * rx + towardZ * rz, -body.halfW, body.halfW);

  out[0] = fx * along + rx * across;
  out[1] = fz * along + rz * across;
}

/** Moment of inertia of a box about its vertical axis. */
const inertia = (b: Body) =>
  (b.mass * (4 * b.halfW * b.halfW + 4 * b.halfL * b.halfL)) / 12;

const armA: [number, number] = [0, 0];
const armB: [number, number] = [0, 0];

/**
 * Resolve one contact into separation, new velocities and spin.
 *
 * Pure: it reads the two bodies and the contact and returns the changes, so
 * the caller decides how to apply them — which matters because the traffic
 * lives on the road curve in (u, s) rather than in free XZ.
 */
export function resolve(
  a: Body,
  b: Body,
  contact: Contact,
  out: Resolution
): Resolution {
  const c = CONFIG.collision;
  const { nx, nz } = contact;

  // Split the separation by mass, so the heavier vehicle barely moves.
  const total = a.mass + b.mass;
  out.pushA = -contact.depth * (b.mass / total);
  out.pushB = contact.depth * (a.mass / total);

  out.avx = a.vx;
  out.avz = a.vz;
  out.bvx = b.vx;
  out.bvz = b.vz;
  out.spinA = 0;
  out.spinB = 0;

  // Closing speed along the normal. Negative means they are already moving
  // apart — the boxes still overlap (we separate them) but there is no
  // impact to transmit, which stops a scrape re-triggering every frame.
  const rvx = a.vx - b.vx;
  const rvz = a.vz - b.vz;
  const vn = rvx * nx + rvz * nz;
  out.impactSpeed = vn;
  if (vn <= 0) return out;

  const invA = 1 / a.mass;
  const invB = 1 / b.mass;

  // Normal impulse. restitution < 1: most of a car crash is deformation,
  // not bounce.
  const j = ((1 + c.restitution) * vn) / (invA + invB);

  out.avx -= j * invA * nx;
  out.avz -= j * invA * nz;
  out.bvx += j * invB * nx;
  out.bvz += j * invB * nz;

  // Tangential impulse: what turns a side-swipe into a scrape that drags
  // you along the other vehicle instead of a frictionless slide past it.
  const tx = -nz;
  const tz = nx;
  const vt = rvx * tx + rvz * tz;
  const jt = clamp(vt / (invA + invB), -c.slideFriction * j, c.slideFriction * j);

  out.avx -= jt * invA * tx;
  out.avz -= jt * invA * tz;
  out.bvx += jt * invB * tx;
  out.bvz += jt * invB * tz;

  // Torque about each centre. In this yaw convention (yaw = 0 faces -Z,
  // positive turns left) a force F applied at offset r produces yaw torque
  // r.z·F.x − r.x·F.z. Sanity check: clip something with your front right
  // corner and the impulse there is rearward, which swings the nose right —
  // a negative torque, and that is what this returns.
  leverArm(a, b.x - a.x, b.z - a.z, armA);
  leverArm(b, a.x - b.x, a.z - b.z, armB);

  // The impulse felt by A; B gets exactly the opposite.
  const fx = -(j * nx + jt * tx);
  const fz = -(j * nz + jt * tz);

  out.spinA = clamp(
    (armA[1] * fx - armA[0] * fz) / inertia(a),
    -c.maxSpinKick,
    c.maxSpinKick
  );
  out.spinB = clamp(
    (armB[0] * fz - armB[1] * fx) / inertia(b),
    -c.maxSpinKick,
    c.maxSpinKick
  );

  return out;
}

/** A fresh, reusable contact/resolution pair. */
export const makeContact = (): Contact => ({ nx: 0, nz: 0, depth: 0 });
export const makeResolution = (): Resolution => ({
  pushA: 0,
  pushB: 0,
  avx: 0,
  avz: 0,
  bvx: 0,
  bvz: 0,
  spinA: 0,
  spinB: 0,
  impactSpeed: 0,
});
