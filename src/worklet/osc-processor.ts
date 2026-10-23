// AudioWorklet 上で 1 サンプルずつ波形を計算する自作ポリシンセ。
// メインスレッドとは port.postMessage でやり取りする。

// AudioWorkletGlobalScope の型は DOM の lib に含まれないので、使う分だけ宣言する
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;

export type Waveform = "sine" | "triangle" | "square" | "sawtooth";
export type OscMessage =
  | { type: "noteOn"; freq: number }
  | { type: "noteOff"; freq: number }
  | { type: "waveform"; value: Waveform };

const ATTACK = 0.01;
const DECAY = 0.2;
const SUSTAIN = 0.4;
const RELEASE = 0.8;
const VOICE_GAIN = 0.5;

type Voice = {
  freq: number;
  phase: number; // 0〜1
  level: number;
  stage: "attack" | "decay" | "sustain" | "release";
  releaseStep: number;
};

// 不連続点の前後を多項式でならし、矩形波・ノコギリ波の折り返しノイズを抑える
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

function oscillate(waveform: Waveform, t: number, dt: number): number {
  switch (waveform) {
    case "sine":
      return Math.sin(2 * Math.PI * t);
    case "triangle":
      return 1 - 4 * Math.abs(t - 0.5);
    case "square":
      return (t < 0.5 ? 1 : -1) + polyBlep(t, dt) - polyBlep((t + 0.5) % 1, dt);
    case "sawtooth":
      return 2 * t - 1 - polyBlep(t, dt);
  }
}

class OscProcessor extends AudioWorkletProcessor {
  private voices: Voice[] = [];
  private waveform: Waveform = "sine";

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<OscMessage>) => {
      const msg = e.data;
      if (msg.type === "noteOn") {
        this.voices.push({ freq: msg.freq, phase: 0, level: 0, stage: "attack", releaseStep: 0 });
      } else if (msg.type === "noteOff") {
        for (const v of this.voices) {
          if (v.freq === msg.freq && v.stage !== "release") {
            v.stage = "release";
            v.releaseStep = v.level / (RELEASE * sampleRate);
          }
        }
      } else {
        this.waveform = msg.value;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0][0];
    out.fill(0);
    const attackStep = 1 / (ATTACK * sampleRate);
    const decayStep = (1 - SUSTAIN) / (DECAY * sampleRate);

    for (const v of this.voices) {
      const dt = v.freq / sampleRate;
      for (let i = 0; i < out.length; i++) {
        if (v.stage === "attack") {
          v.level += attackStep;
          if (v.level >= 1) {
            v.level = 1;
            v.stage = "decay";
          }
        } else if (v.stage === "decay") {
          v.level -= decayStep;
          if (v.level <= SUSTAIN) {
            v.level = SUSTAIN;
            v.stage = "sustain";
          }
        } else if (v.stage === "release") {
          v.level = Math.max(0, v.level - v.releaseStep);
        }
        out[i] += oscillate(this.waveform, v.phase, dt) * v.level * VOICE_GAIN;
        v.phase += dt;
        if (v.phase >= 1) v.phase -= 1;
      }
    }

    this.voices = this.voices.filter((v) => !(v.stage === "release" && v.level <= 0));
    return true;
  }
}

registerProcessor("osc-processor", OscProcessor);
