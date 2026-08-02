"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { pavementOuter, pavementY, roadHalfWidth } from "@/lib/config";
import { UPDATE_ORDER } from "@/lib/controls";
import { cityness } from "@/lib/journey";
import { roadPoint, roadYaw, sFromZ } from "@/lib/road";
import { useGame } from "@/stores/useGame";
import { makeLimbs, Person, type Limbs } from "./Person";

/**
 * Pedestrians
 * -----------
 * People walking the footpaths, pooled and recycled around the player in
 * exactly the way <Traffic/> handles vehicles: a fixed set of figures whose
 * positions are reassigned when they fall out of range, so the React tree
 * never changes and the whole system is one useFrame of transform writes.
 *
 * Two things sell it. They walk on the pavement, along the road, in both
 * directions — a crowd that all faces the same way reads as a parade. And
 * their legs and arms actually swing, out of phase and at a cadence tied to
 * their own walking speed, because a figure sliding along the ground with
 * rigid legs is worse than no figure at all.
 *
 * They exist only where there is a footpath to walk on, which is to say
 * only once the road has become a city street.
 */

const COUNT = 22;
const AHEAD = 130;
const BEHIND = 60;

interface Walker {
  s: number;
  /** Lateral offset — which side of the street and how far from the kerb. */
  u: number;
  /** +1 walking the way the road runs, -1 the other way. */
  direction: number;
  speed: number;
  outfit: number;
  hat: boolean;
  /** Gait phase, advanced by distance covered so the stride matches. */
  stride: number;
  /** Someone stopped to talk. Counts down; while it runs they stand still. */
  pause: number;
}

/** The strip of pavement that is actually walkable. */
const walkRange = () => {
  const inner = roadHalfWidth() + 0.9;
  const outer = pavementOuter() - 0.5;
  return { inner, span: outer - inner };
};

export function Pedestrians() {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const limbRefs = useRef<Limbs[]>([]);

  const walkers = useMemo<Walker[]>(() => {
    const { inner, span } = walkRange();
    return Array.from({ length: COUNT }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      return {
        s: (i / COUNT) * (AHEAD + BEHIND) - BEHIND,
        u: side * (inner + Math.random() * span),
        direction: Math.random() < 0.5 ? 1 : -1,
        speed: 1.1 + Math.random() * 0.6,
        outfit: Math.floor(Math.random() * 6),
        hat: Math.random() < 0.2,
        stride: Math.random() * Math.PI * 2,
        pause: 0,
      };
    });
  }, []);

  // One limb record per figure, handed to <Person/> so this component can
  // pose it every frame without React ever seeing the change.
  const limbs = useMemo(() => walkers.map(() => makeLimbs()), [walkers]);
  limbRefs.current = limbs;

  const scratch = useRef({ p: { x: 0, y: 0, z: 0 } }).current;

  useFrame((_, dt) => {
    const car = useGame.getState().vehicle;
    const playerS = sFromZ(car.position.z);
    const urban = cityness(playerS);
    const lift = pavementY();

    // No pavement, nobody on it.
    if (urban < 0.15) {
      for (const group of groupRefs.current) if (group) group.visible = false;
      return;
    }

    const { inner, span } = walkRange();

    walkers.forEach((w, i) => {
      const group = groupRefs.current[i];
      if (!group) return;

      // Thin the crowd out at the edge of town rather than switching it on.
      const active = i / COUNT < urban;
      group.visible = active;
      if (!active) return;

      // Recycle out of the band. Where they walk and how fast is re-rolled;
      // what they are wearing is not, since that is a React prop and
      // changing it would re-render the tree mid-drive for no visible gain.
      const relative = w.s - playerS;
      if (relative > AHEAD || relative < -BEHIND) {
        const side = Math.random() < 0.5 ? -1 : 1;
        w.s = relative > AHEAD ? playerS - BEHIND : playerS + AHEAD;
        w.u = side * (inner + Math.random() * span);
        w.direction = Math.random() < 0.5 ? 1 : -1;
        w.speed = 1.1 + Math.random() * 0.6;
        w.pause = 0;
      }

      // Every so often somebody just stops.
      if (w.pause > 0) {
        w.pause -= dt;
      } else if (Math.random() < 0.06 * dt) {
        w.pause = 1.5 + Math.random() * 4;
      }

      const moving = w.pause <= 0;
      if (moving) {
        w.s += w.speed * w.direction * dt;
        // Cadence from distance, not from time: slower walkers take slower
        // steps, and nobody moonwalks.
        w.stride += (w.speed / 0.75) * dt;
      }

      roadPoint(w.u, w.s, scratch.p);
      group.position.set(scratch.p.x, scratch.p.y + lift, scratch.p.z);
      group.rotation.y = roadYaw(w.s) + (w.direction > 0 ? 0 : Math.PI);

      // Swing the limbs. Arms oppose the leg on the same side, which is the
      // detail that makes a walk cycle read even at this level of detail.
      const limbs = limbRefs.current[i];
      const swing = moving ? Math.sin(w.stride) * 0.55 : 0;
      if (limbs.legL) limbs.legL.rotation.x = swing;
      if (limbs.legR) limbs.legR.rotation.x = -swing;
      if (limbs.armL) limbs.armL.rotation.x = -swing * 0.7;
      if (limbs.armR) limbs.armR.rotation.x = swing * 0.7;

      // A small vertical bob at twice the stride rate — the body rises over
      // each planted leg.
      group.position.y += moving ? Math.abs(Math.cos(w.stride)) * 0.035 : 0;
    });
  }, UPDATE_ORDER.road);

  return (
    <group>
      {walkers.map((w, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          visible={false}
        >
          <Person
            outfit={w.outfit}
            hat={w.hat}
            limbs={{ current: limbRefs.current[i] }}
          />
        </group>
      ))}
    </group>
  );
}
