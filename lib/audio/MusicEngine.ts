import type { Phrase, Taal, Track } from "../music/tracks";

/**
 * MusicEngine
 * ===========
 * The car stereo. Plays the arrangements in `lib/music/tracks.ts` live,
 * out of oscillators, on the same AudioContext as the engine note — so the
 * mute key silences both and there is never a second context fighting the
 * first for the output device.
 *
 * Voices
 * ------
 *  lead    a bansuri: triangle wave, soft attack, gentle vibrato, through
 *          a lowpass that opens with the note's velocity. Breathy rather
 *          than bright, which is most of what makes a flute a flute.
 *  bass    sine an octave and a half down, long release
 *  drone   two detuned sawtooths a fifth apart at very low level — the
 *          harmonium bed under nearly all Nepali folk. Almost inaudible on
 *          its own and immediately missed when it is gone.
 *  madal   the two-headed drum: a pitched `dhin` from a sine with a fast
 *          pitch drop, and a `na` slap from filtered noise
 *
 * Scheduling
 * ----------
 * Web Audio's clock is sample-accurate but JavaScript's is not, so notes
 * are scheduled *ahead* — a 25 ms timer walks a cursor forward and books
 * everything falling inside the next quarter second at exact context times.
 * Trying to trigger notes on a timer directly gives audible jitter on any
 * frame the main thread is busy, which in a 3D game is most of them.
 *
 * The radio is the same synth through a bandpass and a noise floor, which
 * is genuinely how an FM station differs from the same music on a phone.
 */

const LOOKAHEAD = 0.25; // seconds of music booked in advance
const TIMER_MS = 25;

/** Equal temperament, A440. */
const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Madal patterns: [beat within the cycle, "dhin" | "na", level]. */
const TAALS: Record<Taal, { beats: number; hits: [number, "dhin" | "na", number][] }> = {
  // 6/8 lilt: the hill folk feel, accent on 1 and 4.
  jhyaure: {
    beats: 3,
    hits: [
      [0, "dhin", 1], [0.5, "na", 0.45], [1, "na", 0.5],
      [1.5, "dhin", 0.75], [2, "na", 0.5], [2.5, "na", 0.4],
    ],
  },
  khyali: {
    beats: 2,
    hits: [
      [0, "dhin", 1], [0.5, "na", 0.4], [1, "na", 0.7], [1.5, "na", 0.45],
    ],
  },
  sparse: {
    beats: 4,
    hits: [[0, "dhin", 0.6], [2.5, "na", 0.35]],
  },
};

interface Cursor {
  index: number;
  time: number;
}

export class MusicEngine {
  private ctx: AudioContext;
  private out: GainNode;
  /** Everything musical passes through here, so the radio can colour it. */
  private colour: BiquadFilterNode;
  private noiseFloor: GainNode;
  private noiseBuffer: AudioBuffer;

  private track: Track | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private melody: Cursor = { index: 0, time: 0 };
  private bass: Cursor = { index: 0, time: 0 };
  private perc = { time: 0, beat: 0 };
  private droneNodes: OscillatorNode[] = [];

  private radioMode = false;
  private volume = 0.7;

  constructor(context: AudioContext, destination: AudioNode) {
    this.ctx = context;

    this.out = context.createGain();
    this.out.gain.value = 0;

    this.colour = context.createBiquadFilter();
    this.colour.type = "bandpass";
    // Wide open by default: in music mode this should not colour anything.
    this.colour.frequency.value = 1200;
    this.colour.Q.value = 0.0001;

    this.colour.connect(this.out).connect(destination);

    // Shared noise, used for the madal slap and the FM hiss.
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    const hiss = context.createBufferSource();
    hiss.buffer = buffer;
    hiss.loop = true;
    const hissFilter = context.createBiquadFilter();
    hissFilter.type = "highpass";
    hissFilter.frequency.value = 2400;
    this.noiseFloor = context.createGain();
    this.noiseFloor.gain.value = 0;
    hiss.connect(hissFilter).connect(this.noiseFloor).connect(destination);
    hiss.start();
  }

  get playing() {
    return this.track !== null;
  }

  get currentTrack() {
    return this.track;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.track) this.ramp(this.out.gain, v * 0.5);
  }

  /**
   * Radio mode: band-limit the music to roughly a broadcast channel and add
   * the hiss that sits under every FM signal. `talk` narrows it further.
   */
  setRadio(on: boolean, character: "music" | "talk" = "music") {
    this.radioMode = on;
    if (!on) {
      this.ramp(this.colour.frequency, 1200, 0.1);
      this.colour.Q.value = 0.0001;
      this.ramp(this.noiseFloor.gain, 0, 0.2);
      return;
    }
    this.ramp(this.colour.frequency, character === "talk" ? 1500 : 1800, 0.1);
    this.colour.Q.value = character === "talk" ? 1.1 : 0.55;
    this.ramp(this.noiseFloor.gain, character === "talk" ? 0.012 : 0.006, 0.3);
  }

  /** A burst of static, for changing station. */
  tuningNoise(duration = 0.35) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.09 * this.volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter).connect(gain).connect(this.out);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  play(track: Track) {
    this.stopVoices();
    this.track = track;

    const start = this.ctx.currentTime + 0.12;
    this.melody = { index: 0, time: start };
    this.bass = { index: 0, time: start };
    this.perc = { time: start, beat: 0 };

    this.startDrone(track);
    this.ramp(this.out.gain, this.volume * 0.5, 0.4);

    if (!this.timer) {
      this.timer = setInterval(() => this.schedule(), TIMER_MS);
    }
  }

  stop() {
    this.ramp(this.out.gain, 0, 0.25);
    this.track = null;
    this.stopVoices();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose() {
    this.stop();
    this.ramp(this.noiseFloor.gain, 0, 0.05);
  }

  // ------------------------------------------------------------ internals

  private ramp(param: AudioParam, value: number, time = 0.05) {
    param.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  private stopVoices() {
    for (const osc of this.droneNodes) {
      try {
        osc.stop();
      } catch {
        // Already stopped — harmless, and cheaper than tracking state.
      }
    }
    this.droneNodes = [];
  }

  /** The harmonium bed: tonic and fifth, barely there. */
  private startDrone(track: Track) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.colour);
    this.ramp(gain.gain, track.taal === "sparse" ? 0.045 : 0.022, 1.2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(gain);

    for (const [semitone, detune] of [[0, -6], [7, 5], [0, 9]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq(track.root - 12 + semitone);
      osc.detune.value = detune;
      const level = this.ctx.createGain();
      level.gain.value = 0.3;
      osc.connect(level).connect(filter);
      osc.start();
      this.droneNodes.push(osc);
    }
  }

  /**
   * Book everything that starts inside the lookahead window. Each voice
   * keeps its own cursor and loops its phrase independently, so a melody
   * and a bass line of different lengths drift against each other the way
   * a real arrangement does.
   */
  private schedule() {
    const track = this.track;
    if (!track) return;

    const beat = 60 / track.bpm;
    const horizon = this.ctx.currentTime + LOOKAHEAD;

    this.advance(this.melody, track.melody, horizon, beat, (semitone, at, length) =>
      this.lead(freq(track.root + semitone), at, length)
    );

    this.advance(this.bass, track.bass, horizon, beat, (semitone, at, length) =>
      this.bassNote(freq(track.root - 24 + semitone), at, length)
    );

    // Percussion runs on the taal cycle rather than on a phrase.
    const taal = TAALS[track.taal];
    while (this.perc.time < horizon) {
      const cycleStart = this.perc.time;
      for (const [offset, kind, level] of taal.hits) {
        this.madal(kind, cycleStart + offset * beat, level);
      }
      this.perc.time += taal.beats * beat;
      this.perc.beat += taal.beats;
    }
  }

  private advance(
    cursor: Cursor,
    phrase: Phrase,
    horizon: number,
    beat: number,
    emit: (semitone: number, at: number, length: number) => void
  ) {
    let guard = 0;
    while (cursor.time < horizon && guard++ < 64) {
      const [semitone, beats] = phrase[cursor.index % phrase.length];
      const length = beats * beat;
      if (semitone !== null) emit(semitone, cursor.time, length);
      cursor.time += length;
      cursor.index += 1;
    }
  }

  /** Bansuri-ish lead. */
  private lead(frequency: number, at: number, length: number) {
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = frequency;

    // Vibrato, coming in slightly after the attack the way a player's does.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0, at);
    lfoGain.gain.linearRampToValueAtTime(7, at + Math.min(0.35, length));
    lfo.connect(lfoGain).connect(osc.detune);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, at);
    filter.frequency.linearRampToValueAtTime(2600, at + 0.06);
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    const hold = Math.max(0.08, length * 0.82);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.16, at + 0.05);
    gain.gain.setValueAtTime(0.16, at + hold * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + hold);

    // A whisper of breath noise over the attack.
    const breath = this.ctx.createBufferSource();
    breath.buffer = this.noiseBuffer;
    breath.loop = true;
    const breathBand = this.ctx.createBiquadFilter();
    breathBand.type = "bandpass";
    breathBand.frequency.value = frequency * 2;
    breathBand.Q.value = 2;
    const breathGain = this.ctx.createGain();
    breathGain.gain.setValueAtTime(0.02, at);
    breathGain.gain.exponentialRampToValueAtTime(0.0005, at + 0.12);
    breath.connect(breathBand).connect(breathGain).connect(this.colour);

    osc.connect(filter).connect(gain).connect(this.colour);
    osc.start(at);
    lfo.start(at);
    breath.start(at);
    osc.stop(at + hold + 0.08);
    lfo.stop(at + hold + 0.08);
    breath.stop(at + 0.2);
  }

  private bassNote(frequency: number, at: number, length: number) {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;

    const gain = this.ctx.createGain();
    const hold = Math.max(0.12, length * 0.9);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + hold);

    osc.connect(gain).connect(this.colour);
    osc.start(at);
    osc.stop(at + hold + 0.05);
  }

  /**
   * Madal. `dhin` is the low resonant head — a sine dropping in pitch, which
   * is what a struck drumhead does. `na` is the sharp slap off the small
   * head, which is nearly all noise.
   */
  private madal(kind: "dhin" | "na", at: number, level: number) {
    const gain = this.ctx.createGain();
    gain.connect(this.colour);

    if (kind === "dhin") {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(190, at);
      osc.frequency.exponentialRampToValueAtTime(72, at + 0.12);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.14 * level, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + 0.32);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1900;
    filter.Q.value = 1.6;

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.06 * level, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);

    source.connect(filter).connect(gain);
    source.start(at);
    source.stop(at + 0.14);
  }
}
