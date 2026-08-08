"use client";

import { useControls, folder, Leva } from "leva";
import { CONFIG } from "@/lib/config";
import { CLOCK, WEATHER } from "@/lib/weather";

/**
 * TuningPanel
 * -----------
 * Leva dev panel for live-tuning the driving feel. Values are written
 * straight into the mutable CONFIG singleton that the physics, camera and
 * audio systems read every frame — no React re-renders involved.
 *
 * Collapsed by default so it stays out of the way.
 */
export function TuningPanel() {
  useControls({
    Vehicle: folder(
      {
        maxSpeed: {
          value: CONFIG.vehicle.maxSpeed, min: 10, max: 80, step: 1,
          onChange: (v: number) => (CONFIG.vehicle.maxSpeed = v),
        },
        engineAccel: {
          value: CONFIG.vehicle.engineAccel, min: 2, max: 25, step: 0.5,
          onChange: (v: number) => (CONFIG.vehicle.engineAccel = v),
        },
        brakeDecel: {
          value: CONFIG.vehicle.brakeDecel, min: 5, max: 40, step: 0.5,
          onChange: (v: number) => (CONFIG.vehicle.brakeDecel = v),
        },
        maxSteerAngle: {
          value: CONFIG.vehicle.maxSteerAngle, min: 0.2, max: 1, step: 0.01,
          onChange: (v: number) => (CONFIG.vehicle.maxSteerAngle = v),
        },
        steerSpeedFalloff: {
          value: CONFIG.vehicle.steerSpeedFalloff, min: 0, max: 0.15, step: 0.005,
          onChange: (v: number) => (CONFIG.vehicle.steerSpeedFalloff = v),
        },
        offRoadDrag: {
          value: CONFIG.vehicle.offRoadDrag, min: 0, max: 12, step: 0.2,
          onChange: (v: number) => (CONFIG.vehicle.offRoadDrag = v),
        },
      },
      { collapsed: true }
    ),
    Camera: folder(
      {
        seatHeight: {
          value: CONFIG.camera.eyeOffset.y, min: 1.05, max: 1.55, step: 0.01,
          onChange: (v: number) => (CONFIG.camera.eyeOffset.y = v),
        },
        rotationLerp: {
          value: CONFIG.camera.rotationLerp, min: 1, max: 20, step: 0.5,
          onChange: (v: number) => (CONFIG.camera.rotationLerp = v),
        },
        mouseMaxYaw: {
          value: CONFIG.camera.mouseMaxYaw, min: 0, max: 1.5, step: 0.05,
          onChange: (v: number) => (CONFIG.camera.mouseMaxYaw = v),
        },
        leanStrength: {
          value: CONFIG.camera.leanStrength, min: 0, max: 0.06, step: 0.002,
          onChange: (v: number) => (CONFIG.camera.leanStrength = v),
        },
        shakeStrength: {
          value: CONFIG.camera.shakeStrength, min: 0, max: 3, step: 0.1,
          onChange: (v: number) => (CONFIG.camera.shakeStrength = v),
        },
      },
      { collapsed: true }
    ),
    World: folder(
      {
        terrainAmplitude: {
          value: CONFIG.terrain.amplitude, min: 0, max: 3, step: 0.1,
          onChange: (v: number) => (CONFIG.terrain.amplitude = v),
        },
        fogFar: {
          value: CONFIG.sky.fogFar, min: 120, max: 800, step: 10,
          onChange: (v: number) => (CONFIG.sky.fogFar = v),
        },
      },
      { collapsed: true }
    ),
    // The keys (T / K / L) cover the common cases; this is for pinning the
    // sky to one exact minute, which is what you want when you are lighting
    // a scene rather than driving through it.
    Sky: folder(
      {
        hour: {
          value: CLOCK.hour, min: 0, max: 24, step: 0.05,
          onChange: (v: number) => (CLOCK.hour = v),
        },
        minutesPerSecond: {
          value: CLOCK.rate, min: 0, max: 240, step: 5,
          onChange: (v: number) => (CLOCK.rate = v),
        },
        weather: {
          value: WEATHER[CLOCK.weather].name,
          options: WEATHER.map((w) => w.name),
          onChange: (v: string) => {
            const i = WEATHER.findIndex((w) => w.name === v);
            if (i >= 0) CLOCK.weather = i;
          },
        },
        headlights: {
          value: CONFIG.lighting.headlightIntensity, min: 0, max: 900, step: 10,
          onChange: (v: number) => (CONFIG.lighting.headlightIntensity = v),
        },
      },
      { collapsed: true }
    ),
    Audio: folder(
      {
        master: {
          value: CONFIG.audio.masterVolume, min: 0, max: 1, step: 0.05,
          onChange: (v: number) => (CONFIG.audio.masterVolume = v),
        },
        engine: {
          value: CONFIG.audio.engineVolume, min: 0, max: 1.5, step: 0.05,
          onChange: (v: number) => (CONFIG.audio.engineVolume = v),
        },
        tyres: {
          value: CONFIG.audio.tyreVolume, min: 0, max: 1.5, step: 0.05,
          onChange: (v: number) => (CONFIG.audio.tyreVolume = v),
        },
        wind: {
          value: CONFIG.audio.windVolume, min: 0, max: 1.5, step: 0.05,
          onChange: (v: number) => (CONFIG.audio.windVolume = v),
        },
      },
      { collapsed: true }
    ),
  });

  return <Leva collapsed titleBar={{ title: "Tuning" }} />;
}
