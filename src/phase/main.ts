import * as Tone from "tone";
import "../ripples/style.css";
import { drawPitchGuides, pitchAt, pitchIndexAt, setupScalePicker, visiblePitches } from "../scales";
import { type Mood, NEUTRAL_MOOD, setupWeather } from "../weather";
import { type Drift, densityFactor, NEUTRAL_DRIFT, setupDrift } from "../drift";
import { densityLevelFactor, registerOffset, setupLevel } from "../levels";

// 置いた音が、それぞれ少しずつ違う周期でループする。
// 周期のわずかな差で音どうしの重なり方がゆっくりずれていく（スティーヴ・ライヒのフェイジング）。

type Seed = {
  x: number;
  y: number;
  period: number; // 秒
  t0: number; // 最初に鳴った AudioContext 時刻
  plays: number;
  hue: number;
  loop: Tone.Loop;
};
type Bloom = { x: number; y: number; life: number; hue: number; strength: number };

const CENTER_PERIOD = 2.3; // 画面中央の周期 (秒)
const HALF_RANGE = 0.3; // 標準では左端 2.0 秒〜右端 2.6 秒
const MAX_SEEDS = 16;
const FADE_PLAYS = 16; // 減衰オンのとき、何回鳴ったら消えるか
const IDLE_BEFORE_AUTO = 8; // 操作がない状態が何秒続いたら自動で置き始めるか
const AUTO_INTERVAL = 3;
const RING_RADIUS = 14;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const g = canvas.getContext("2d")!;
const fadeEl = document.querySelector<HTMLInputElement>("#fade")!;
const autoEl = document.querySelector<HTMLInputElement>("#auto")!;
const clearEl = document.querySelector<HTMLButtonElement>("#clear")!;
const hintEl = document.querySelector<HTMLParagraphElement>("#hint")!;

// 種は縦位置だけを持ち、鳴るたびに今のスケールで音を決める。
// そのためスケールを変えると、置いてある種もその場で新しいスケールの音に置き換わる
const scalePicker = setupScalePicker(
  document.querySelector<HTMLSelectElement>("#scale")!,
  document.querySelector<HTMLSelectElement>("#root")!,
  { scale: "major-pentatonic", root: "D" },
  (next) => {
    allPitches = next;
    pitches = visiblePitches(allPitches, currentRegister());
  },
);
let allPitches = scalePicker.pitches;

// 音域と密度の 5 段階。音域は変化の揺れの中心になり、密度は天気・変化の倍率に掛け合わせる
let registerLevel = setupLevel(
  document.querySelector<HTMLInputElement>("#register")!,
  document.querySelector<HTMLOutputElement>("#register-value")!,
  "register",
  (level) => {
    registerLevel = level;
    pitches = visiblePitches(allPitches, currentRegister());
  },
);
let densityLevel = setupLevel(
  document.querySelector<HTMLInputElement>("#density")!,
  document.querySelector<HTMLOutputElement>("#density-value")!,
  "density",
  (level) => (densityLevel = level),
);
let pitches = visiblePitches(allPitches, registerOffset(registerLevel));

function currentRegister(): number {
  return registerOffset(registerLevel) + (drift ?? NEUTRAL_DRIFT).register;
}

// --- 音 ---

const reverb = new Tone.Reverb({ decay: 8, wet: 0.5 }).toDestination();
const synth = new Tone.PolySynth(Tone.FMSynth, {
  harmonicity: 2,
  modulationIndex: 2.5,
  envelope: { attack: 0.01, decay: 2, sustain: 0, release: 2 },
  modulationEnvelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 1 },
}).connect(reverb);
synth.maxPolyphony = 48;
synth.volume.value = -16;

// 天気: 気温で周期の長さ、風で周期の幅（ずれの速さ）、雨で自動の頻度、雲でリバーブが変わる。
// 周期はこれから置く種から変わり、置いてある種はそのまま。
// 変化: 天気で決まった値を中心に、音域・密度・FM の明るさ・リバーブが経過時間でゆっくり揺れ、
// 20 分ごとに 5 度上へ転調する。音域と転調は置いてある種にも効く
let weather: Mood | null = null;
let drift: Drift | null = null;

function applyParams(ramp: number) {
  const m = weather ?? NEUTRAL_MOOD;
  const d = drift ?? NEUTRAL_DRIFT;
  reverb.wet.rampTo(Math.min(Math.max(0.25 + 0.5 * m.wetness + 0.15 * d.reverb, 0), 1), ramp);
  synth.set({ modulationIndex: 2.5 * 2 ** d.brightness });
  pitches = visiblePitches(allPitches, currentRegister());
}

setupWeather(
  document.querySelector<HTMLInputElement>("#weather")!,
  document.querySelector<HTMLSelectElement>("#place")!,
  document.querySelector<HTMLElement>("#weather-status")!,
  (next) => {
    weather = next;
    applyParams(4);
    if (next) scalePicker.setScale(next.scaleId);
  },
);

setupDrift(
  document.querySelector<HTMLInputElement>("#drift")!,
  document.querySelector<HTMLSelectElement>("#drift-speed")!,
  document.querySelector<HTMLElement>("#drift-status")!,
  {
    apply: (next) => {
      drift = next;
      applyParams(1);
    },
    modulate: () => scalePicker.transposeRoot(7),
    root: scalePicker.root,
  },
);

const transport = Tone.getTransport();
let started = false;

async function ensureStarted() {
  if (started) return;
  started = true;
  await Tone.start();
  transport.start();
  hintEl.classList.add("hidden");
}

// --- 種 ---

let width = 0;
let height = 0;
let seeds: Seed[] = [];
let blooms: Bloom[] = [];

function pitchOf(seed: Seed) {
  return pitchAt(pitches, pitchIndexAt(seed.y, height, pitches.length));
}

function periodAt(x: number): number {
  const m = weather ?? NEUTRAL_MOOD;
  const halfRange = HALF_RANGE * (0.5 + 1.5 * m.spread);
  return (CENTER_PERIOD + (x / width * 2 - 1) * halfRange) / m.speed;
}

function removeSeed(seed: Seed) {
  seed.loop.dispose();
  seeds = seeds.filter((s) => s !== seed);
}

function plant(x: number, y: number) {
  const seed: Seed = {
    x,
    y,
    period: periodAt(x),
    t0: Tone.now(),
    plays: 0,
    hue: 160 + (x / width) * 140,
    loop: undefined!,
  };
  seed.loop = new Tone.Loop((time) => {
    const strength = fadeEl.checked ? 1 - seed.plays / FADE_PLAYS : 1;
    if (strength <= 0) {
      Tone.getDraw().schedule(() => removeSeed(seed), time);
      return;
    }
    seed.plays++;
    synth.triggerAttackRelease(pitchOf(seed).freq, "8n", time, 0.3 + 0.7 * strength);
    Tone.getDraw().schedule(() => blooms.push({ x: seed.x, y: seed.y, life: 1, hue: seed.hue, strength }), time);
  }, seed.period).start(transport.seconds);

  seeds.push(seed);
  if (seeds.length > MAX_SEEDS) removeSeed(seeds[0]);
}

function draw() {
  g.fillStyle = "rgba(27, 29, 35, 0.25)";
  g.fillRect(0, 0, width, height);
  drawPitchGuides(g, width, height, pitches);

  for (const b of blooms) {
    const r = RING_RADIUS + (1 - b.life) * (60 + 80 * b.strength);
    g.strokeStyle = `hsla(${b.hue}, 80%, 70%, ${b.life * (0.3 + 0.7 * b.strength)})`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(b.x, b.y, r, 0, Math.PI * 2);
    g.stroke();
  }

  const now = Tone.immediate();
  for (const s of seeds) {
    const phase = (((now - s.t0) / s.period) % 1 + 1) % 1;
    const alpha = fadeEl.checked ? Math.max(0.15, 1 - s.plays / FADE_PLAYS) : 1;

    g.strokeStyle = `hsla(${s.hue}, 30%, 60%, ${alpha * 0.4})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(s.x, s.y, RING_RADIUS, 0, Math.PI * 2);
    g.stroke();

    // 12 時の位置から時計回りに、ループの進み具合を描く
    g.strokeStyle = `hsla(${s.hue}, 80%, 70%, ${alpha})`;
    g.beginPath();
    g.arc(s.x, s.y, RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + phase * Math.PI * 2);
    g.stroke();

    g.fillStyle = `hsla(${s.hue}, 80%, 80%, ${alpha})`;
    g.beginPath();
    g.arc(s.x, s.y, 3, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = `hsla(${s.hue}, 20%, 70%, ${alpha * 0.6})`;
    g.font = "11px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(`${pitchOf(s).label}  ${s.period.toFixed(2)}s`, s.x, s.y + RING_RADIUS + 16);
  }
}

// --- 画面とループ ---

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let last = performance.now();
let idle = 0;
let untilAuto = 0;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  idle += dt;
  if (started && autoEl.checked && idle > IDLE_BEFORE_AUTO) {
    untilAuto -= dt;
    if (untilAuto <= 0) {
      plant(Math.random() * width, height * (0.15 + Math.random() * 0.7));
      const density =
        (weather ?? NEUTRAL_MOOD).density * densityFactor(drift ?? NEUTRAL_DRIFT) * densityLevelFactor(densityLevel);
      untilAuto = (AUTO_INTERVAL / density) * (0.5 + Math.random());
    }
  }

  for (const b of blooms) b.life -= dt * 0.6;
  blooms = blooms.filter((b) => b.life > 0);

  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", async (e) => {
  await ensureStarted();
  idle = 0;
  plant(e.clientX, e.clientY);
});

clearEl.addEventListener("click", () => {
  for (const s of [...seeds]) removeSeed(s);
  blooms = [];
});

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
