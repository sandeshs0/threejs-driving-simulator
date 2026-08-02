import { CONFIG } from "../config";
import type { VehicleState } from "@/stores/useGame";

/**
 * AudioEngine
 * ===========
 * Every sound in the simulator is synthesized live with the Web Audio API —
 * there are no audio files to download, which keeps the "no heavy assets"
 * constraint and lets the sounds respond continuously to the physics.
 *
 * Voices
 * ------
 *  engine   stack of sawtooth harmonics whose fundamental tracks engine
 *           firing frequency (rpm / 30 for a four-cylinder), shaped by a
 *           lowpass whose cutoff opens with throttle → the classic
 *           "load" character, including the drop on each gear change
 *  intake   breathy noise band that swells with throttle
 *  tyres    band-passed noise following speed; the band drops and widens
 *           on gravel so leaving the asphalt is audible
 *  wind     high-passed noise rising with the square of speed
 *  squeal   narrow resonant noise band under heavy braking
 *  screech  broader resonant band driven by tyre slip in hard corners
 *  ambience slow-breathing low noise bed for the world
 *  horn     two detuned saws a major third apart, gated by the H key
 *  crash    bright noise crunch of folding panels over a low body blow,
 *           both gated by the impact flash the collision solver writes
 *
 * All parameters are driven through `setTargetAtTime` so they glide
 * instead of zipper-clicking.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;

  // Voice gain nodes
  private engineGain!: GainNode;
  private intakeGain!: GainNode;
  private tyreGain!: GainNode;
  private windGain!: GainNode;
  private squealGain!: GainNode;
  private screechGain!: GainNode;
  private ambienceGain!: GainNode;
  private hornGain!: GainNode;
  private crashGain!: GainNode;
  private thudGain!: GainNode;

  // Filters we modulate per frame
  private engineFilter!: BiquadFilterNode;
  private tyreFilter!: BiquadFilterNode;

  private oscillators: { osc: OscillatorNode; mult: number }[] = [];
  private hornOscs: OscillatorNode[] = [];

  private lastGear = 1;
  private shiftTimer = 0;
  private elapsed = 0;
  private running = false;

  get isRunning() {
    return this.running;
  }

  /**
   * The shared context and the bus the stereo plugs into.
   *
   * The music engine hangs off these rather than opening a context of its
   * own: a second AudioContext is a second clock and a second output
   * stream, and on most browsers it also means the mute key silences the
   * engine while the radio plays merrily on. Routing through `master` gets
   * muting and the master volume for free.
   */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get mediaBus(): GainNode | null {
    return this.running ? this.master : null;
  }

  /** Must be called from a user gesture — browsers block audio otherwise. */
  async start() {
    if (this.running) return;

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    await ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = CONFIG.audio.masterVolume;
    this.master.connect(ctx.destination);

    this.buildEngine(ctx);
    this.buildNoiseVoices(ctx);
    this.buildHorn(ctx);

    this.running = true;
  }

  // ---------------------------------------------------------------- engine

  private buildEngine(ctx: AudioContext) {
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 500;
    this.engineFilter.Q.value = 1.2;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineFilter.connect(this.engineGain).connect(this.master);

    // Harmonic stack: [multiplier of firing frequency, relative level].
    const harmonics: [number, number][] = [
      [1, 0.55],
      [2, 0.42],
      [3, 0.3],
      [4, 0.2],
      [6, 0.12],
      [8, 0.07],
    ];

    for (const [mult, level] of harmonics) {
      const osc = ctx.createOscillator();
      osc.type = mult <= 2 ? "sawtooth" : "square";
      // Slight detune per harmonic makes the note beat like a real engine.
      osc.detune.value = (mult % 3) * 7 - 7;
      osc.frequency.value = 30 * mult;

      const g = ctx.createGain();
      g.gain.value = level;

      osc.connect(g).connect(this.engineFilter);
      osc.start();
      this.oscillators.push({ osc, mult });
    }
  }

  // ----------------------------------------------------------- noise voices

  /** One second of white noise, looped and shared by every noise voice. */
  private makeNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }

  private buildNoiseVoices(ctx: AudioContext) {
    const noise = this.makeNoiseSource(ctx);

    const band = (
      type: BiquadFilterType,
      freq: number,
      q: number
    ): [BiquadFilterNode, GainNode] => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      noise.connect(filter).connect(gain).connect(this.master);
      return [filter, gain];
    };

    [this.tyreFilter, this.tyreGain] = band("bandpass", 420, 0.9);
    [, this.windGain] = band("highpass", 850, 0.7);
    [, this.squealGain] = band("bandpass", 2900, 14);
    [, this.screechGain] = band("bandpass", 1350, 6);
    [, this.ambienceGain] = band("lowpass", 380, 0.6);
    [, this.intakeGain] = band("bandpass", 700, 1.1);
    // Crash: a bright band for the crunch of panels and glass, and a low
    // one for the blow you feel through the seat. Two voices because a
    // single band reads as static rather than as an accident.
    [, this.crashGain] = band("bandpass", 2100, 1.1);
    [, this.thudGain] = band("lowpass", 140, 0.8);
  }

  // ------------------------------------------------------------------ horn

  private buildHorn(ctx: AudioContext) {
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;

    const shaper = ctx.createBiquadFilter();
    shaper.type = "lowpass";
    shaper.frequency.value = 2200;

    shaper.connect(this.hornGain).connect(this.master);

    // A real car horn is two reeds roughly a major third apart.
    for (const freq of [440, 554.37]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(shaper);
      osc.start();
      this.hornOscs.push(osc);
    }
  }

  // ---------------------------------------------------------------- update

  /** Smoothly glide an AudioParam toward a target. */
  private glide(param: AudioParam, value: number, time = 0.05) {
    if (!this.ctx) return;
    param.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  /**
   * Drive every voice from the current vehicle state. Called once per frame.
   */
  update(v: VehicleState, dt: number, horn: boolean, muted: boolean) {
    if (!this.running || !this.ctx) return;
    const a = CONFIG.audio;
    const cfg = CONFIG.vehicle;

    this.elapsed += dt;
    this.glide(this.master.gain, muted ? 0 : a.masterVolume, 0.08);

    const speed = Math.abs(v.speed);
    const speedNorm = Math.min(speed / cfg.maxSpeed, 1);
    const rpmNorm = Math.min(
      Math.max((v.rpm - cfg.idleRpm) / (cfg.redlineRpm - cfg.idleRpm), 0),
      1
    );
    const throttle = Math.max(v.throttle, 0);

    // Brief torque interruption on each shift, like a real gearbox.
    if (v.gear !== this.lastGear) {
      this.shiftTimer = 0.14;
      this.lastGear = v.gear;
    }
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const shiftCut = this.shiftTimer > 0 ? 0.45 : 1;

    // ---- Engine ----
    // Four-stroke, four-cylinder firing frequency.
    const fundamental = Math.max(v.rpm / 30, 12);
    for (const { osc, mult } of this.oscillators) {
      this.glide(osc.frequency, fundamental * mult, 0.035);
    }
    this.glide(
      this.engineFilter.frequency,
      320 + throttle * 2400 + rpmNorm * 1800,
      0.06
    );
    const engineLevel = (0.05 + throttle * 0.1 + rpmNorm * 0.14) * shiftCut;
    this.glide(this.engineGain.gain, engineLevel * a.engineVolume, 0.05);

    // ---- Intake ----
    this.glide(
      this.intakeGain.gain,
      throttle * (0.05 + rpmNorm * 0.09) * a.engineVolume * shiftCut,
      0.06
    );

    // ---- Tyres on the surface ----
    // Gravel is lower and louder than asphalt.
    this.glide(this.tyreFilter.frequency, v.offRoad ? 190 : 430, 0.15);
    this.glide(this.tyreFilter.Q, v.offRoad ? 0.5 : 0.9, 0.15);
    const tyreLevel = speedNorm * (v.offRoad ? 0.34 : 0.16);
    this.glide(this.tyreGain.gain, tyreLevel * a.tyreVolume, 0.08);

    // ---- Wind ----
    this.glide(
      this.windGain.gain,
      speedNorm * speedNorm * 0.3 * a.windVolume,
      0.1
    );

    // ---- Brake squeal: only when actually hauling the car down ----
    const squeal =
      v.braking && speed > 3 ? Math.min((speed - 3) / 14, 1) * 0.05 : 0;
    this.glide(this.squealGain.gain, squeal, 0.05);

    // ---- Tyre scrub in hard corners ----
    this.glide(this.screechGain.gain, v.slip * 0.16, 0.07);

    // ---- Ambience: slow breathing wind bed ----
    const breath = 0.6 + 0.4 * Math.sin(this.elapsed * 0.19);
    this.glide(this.ambienceGain.gain, 0.05 * breath * a.ambienceVolume, 0.3);

    // ---- Horn ----
    this.glide(this.hornGain.gain, horn ? a.hornVolume * 0.35 : 0, horn ? 0.008 : 0.03);

    // ---- Crash ----
    // `impact` is already a decaying flash, so the envelope comes for free;
    // all this has to do is attack fast enough that the hit lands on the
    // frame it happened. Squared, because a light tap should be a tap.
    const impact = v.impact * v.impact;
    this.glide(this.crashGain.gain, impact * 0.5 * a.crashVolume, 0.004);
    this.glide(this.thudGain.gain, impact * 0.9 * a.crashVolume, 0.006);
  }

  dispose() {
    if (!this.ctx) return;
    for (const { osc } of this.oscillators) osc.stop();
    for (const osc of this.hornOscs) osc.stop();
    this.ctx.close();
    this.ctx = null;
    this.running = false;
  }
}
