import * as Tone from "tone";
import "../ripples/style.css";
import { drawPitchGuides, pitchAt, pitchIndexAt, setupScalePicker, visiblePitches } from "../scales";
import { type Mood, NEUTRAL_MOOD, setupWeather } from "../weather";
import { type Drift, densityFactor, NEUTRAL_DRIFT, setupDrift } from "../drift";
import { densityLevelFactor, registerOffset, setupLevel } from "../levels";

// 長さが大きく違うテープループを重ねる（イーノ『Music for Airports』の手法）。
// 1 本のループには長く柔らかい音が 1 つだけ入っていて、ループどうしの長さが割り切れないので
// 重なり方がほとんど二度と同じにならない。

type TapeLoop = {
  x: number;
  y: number;
  period: number; // 秒
  t0: number; // 最初に鳴った AudioContext 時刻
  hue: number;
  loop: Tone.Loop;
};
type Glow = { loop: TapeLoop; life: number };

const CENTER_PERIOD = 25; // 画面中央のループの長さ (秒)
const HALF_RANGE = 10; // 標準では左端 15 秒〜右端 35 秒
const MIN_PERIOD = 8;
const NOTE_LENGTH = 4; // 1 回に鳴らす長さ (秒)
const MAX_LOOPS = 10;
const AUTO_MAX_LOOPS = 6; // 密度 3 のとき、自動で置くのはここまで
const IDLE_BEFORE_AUTO = 10;
const AUTO_INTERVAL = 20;
const HIT_RADIUS = 16; // ループの中心からこの距離以内のクリックで外す

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const g = canvas.getContext("2d")!;
const autoEl = document.querySelector<HTMLInputElement>("#auto")!;
const clearEl = document.querySelector<HTMLButtonElement>("#clear")!;
const hintEl = document.querySelector<HTMLParagraphElement>("#hint")!;

// ループは縦位置だけを持ち、鳴るたびに今のスケールで音を決める
const scalePicker = setupScalePicker(
  document.querySelector<HTMLSelectElement>("#scale")!,
  document.querySelector<HTMLSelectElement>("#root")!,
  { scale: "major-pentatonic", root: "F" },
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

// ゆっくり立ち上がって長く消える、柔らかいパッド
const reverb = new Tone.Reverb({ decay: 10, wet: 0.6 }).toDestination();
const filter = new Tone.Filter({ type: "lowpass", frequency: 1800, Q: 0.5 }).connect(reverb);
const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fattriangle", count: 3, spread: 18 },
  envelope: { attack: 2.5, decay: 1, sustain: 0.6, release: 6 },
}).connect(filter);
synth.maxPolyphony = 32;
synth.volume.value = -20;

// 天気: 気温でループの長さ、風で長さの幅、雨で自動の頻度、雲でリバーブが変わる。長さはこれから置くループから変わる。
// 変化: 天気で決まった値を中心に、音域・密度・フィルターの明るさ・リバーブが経過時間でゆっくり揺れ、
// 20 分ごとに 5 度上へ転調する。音域と転調は置いてあるループにも効く
let weather: Mood | null = null;
let drift: Drift | null = null;

function applyParams(ramp: number) {
  const m = weather ?? NEUTRAL_MOOD;
  const d = drift ?? NEUTRAL_DRIFT;
  reverb.wet.rampTo(Math.min(Math.max(0.35 + 0.5 * m.wetness + 0.15 * d.reverb, 0), 1), ramp);
  filter.frequency.rampTo(1800 * 2 ** d.brightness, ramp);
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

// --- ループ ---

let width = 0;
let height = 0;
let loops: TapeLoop[] = [];
let glows: Glow[] = [];

function pitchOf(l: TapeLoop) {
  return pitchAt(pitches, pitchIndexAt(l.y, height, pitches.length));
}

function periodAt(x: number): number {
  const m = weather ?? NEUTRAL_MOOD;
  const halfRange = HALF_RANGE * (0.5 + 1.5 * m.spread);
  return Math.max(MIN_PERIOD, (CENTER_PERIOD + (x / width * 2 - 1) * halfRange) / m.speed);
}

// 密度が高いほど、自動で置くループの上限を増やす（4〜10 本）
function autoMaxLoops(): number {
  return Math.min(MAX_LOOPS, Math.round(AUTO_MAX_LOOPS * Math.sqrt(densityLevelFactor(densityLevel))));
}

function ringRadius(l: TapeLoop): number {
  return 20 + l.period * 3;
}

function removeLoop(l: TapeLoop) {
  l.loop.dispose();
  loops = loops.filter((other) => other !== l);
}

function place(x: number, y: number) {
  const l: TapeLoop = {
    x,
    y,
    period: periodAt(x),
    t0: Tone.now(),
    hue: 30 + (x / width) * 60,
    loop: undefined!,
  };
  l.loop = new Tone.Loop((time) => {
    synth.triggerAttackRelease(pitchOf(l).freq, NOTE_LENGTH, time, 0.6 + Math.random() * 0.3);
    Tone.getDraw().schedule(() => glows.push({ loop: l, life: 1 }), time);
  }, l.period).start(transport.seconds);

  loops.push(l);
  if (loops.length > MAX_LOOPS) removeLoop(loops[0]);
}

function draw() {
  g.fillStyle = "rgba(27, 29, 35, 0.3)";
  g.fillRect(0, 0, width, height);
  drawPitchGuides(g, width, height, pitches);

  const now = Tone.immediate();
  for (const l of loops) {
    const r = ringRadius(l);
    const phase = (((now - l.t0) / l.period) % 1 + 1) % 1;
    const angle = -Math.PI / 2 + phase * Math.PI * 2;

    g.strokeStyle = `hsla(${l.hue}, 50%, 65%, 0.18)`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(l.x, l.y, r, 0, Math.PI * 2);
    g.stroke();

    // テープの針。真上に来たときに鳴る
    g.fillStyle = `hsla(${l.hue}, 80%, 75%, 0.9)`;
    g.beginPath();
    g.arc(l.x + Math.cos(angle) * r, l.y + Math.sin(angle) * r, 3, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = `hsla(${l.hue}, 80%, 80%, 0.9)`;
    g.beginPath();
    g.arc(l.x, l.y, 3, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = `hsla(${l.hue}, 20%, 70%, 0.6)`;
    g.font = "11px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(`${pitchOf(l).label}  ${l.period.toFixed(1)}s`, l.x, l.y + 18);
  }

  // 鳴っている間、リングがふわっと光る
  for (const gl of glows) {
    if (!loops.includes(gl.loop)) continue;
    g.strokeStyle = `hsla(${gl.loop.hue}, 80%, 70%, ${gl.life * 0.6})`;
    g.lineWidth = 2 + gl.life * 4;
    g.beginPath();
    g.arc(gl.loop.x, gl.loop.y, ringRadius(gl.loop), 0, Math.PI * 2);
    g.stroke();
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
  if (started && autoEl.checked && idle > IDLE_BEFORE_AUTO && loops.length < autoMaxLoops()) {
    untilAuto -= dt;
    if (untilAuto <= 0) {
      place(Math.random() * width, height * (0.15 + Math.random() * 0.7));
      const density =
        (weather ?? NEUTRAL_MOOD).density * densityFactor(drift ?? NEUTRAL_DRIFT) * densityLevelFactor(densityLevel);
      untilAuto = (AUTO_INTERVAL / density) * (0.5 + Math.random());
    }
  }

  for (const gl of glows) gl.life -= dt / NOTE_LENGTH;
  glows = glows.filter((gl) => gl.life > 0);

  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", async (e) => {
  await ensureStarted();
  idle = 0;
  const hit = loops.find((l) => Math.hypot(l.x - e.clientX, l.y - e.clientY) <= HIT_RADIUS);
  if (hit) removeLoop(hit);
  else place(e.clientX, e.clientY);
});

clearEl.addEventListener("click", () => {
  for (const l of [...loops]) removeLoop(l);
  glows = [];
});

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
