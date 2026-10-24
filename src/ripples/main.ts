import * as Tone from "tone";
import "./style.css";
import { drawPitchGuides, pitchAt, pitchIndexAt, setupScalePicker, visiblePitches } from "../scales";
import { type Mood, NEUTRAL_MOOD, setupWeather } from "../weather";
import { type Drift, densityFactor, NEUTRAL_DRIFT, setupDrift } from "../drift";

// クリックした場所から波紋が広がり、画面の端や他の波紋にぶつかると音が鳴る。
// 発音は Transport の 16 分音符に揃えるので、どこを叩いてもリズムが崩れない。

type Edge = "left" | "right" | "top" | "bottom";
type Ripple = {
  id: number;
  x: number;
  y: number;
  r: number;
  speed: number; // px/秒
  maxR: number;
  hue: number;
  edgesHit: Set<Edge>;
  touched: Set<number>; // すでにぶつかった波紋の id
};
type Flash = { x: number; y: number; life: number; hue: number };

const BPM = 90;
const SPEED = 90; // 波紋の広がる速さ (px/秒)
const MAX_RIPPLES = 12;
const MAX_NOTES_PER_STEP = 3;
const AUTO_INTERVAL = 4; // 自動で波紋が生まれる平均間隔 (秒)

// 同じ波紋でも、どの端に当たったかで少し音をずらしてフレーズにする
const EDGE_OFFSET: Record<Edge, number> = { left: 0, right: 1, top: 2, bottom: -1 };

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const g = canvas.getContext("2d")!;
const autoEl = document.querySelector<HTMLInputElement>("#auto")!;
const clearEl = document.querySelector<HTMLButtonElement>("#clear")!;
const hintEl = document.querySelector<HTMLParagraphElement>("#hint")!;

// スケールを変えると、これから鳴る音から切り替わる
const scalePicker = setupScalePicker(
  document.querySelector<HTMLSelectElement>("#scale")!,
  document.querySelector<HTMLSelectElement>("#root")!,
  { scale: "major-pentatonic", root: "C" },
  (next) => {
    allPitches = next;
    pitches = visiblePitches(allPitches, (drift ?? NEUTRAL_DRIFT).register);
  },
);
let allPitches = scalePicker.pitches;
let pitches = visiblePitches(allPitches, 0);

// --- 音 ---

const reverb = new Tone.Reverb({ decay: 6, wet: 0.45 }).toDestination();
const delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.3, wet: 0.25 }).connect(reverb);

// 端に当たったとき: はじくような音
const pluck = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "triangle" },
  envelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 1.2 },
}).connect(delay);
pluck.volume.value = -14;

// 波紋どうしがぶつかったとき: ベルのような音
const bell = new Tone.PolySynth(Tone.FMSynth, {
  harmonicity: 3,
  modulationIndex: 8,
  envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 1.5 },
  modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0, release: 0.5 },
}).connect(delay);
bell.volume.value = -18;

const transport = Tone.getTransport();
transport.bpm.value = BPM;

// 天気: 気温でテンポと波紋の速さ、風で波紋ごとの速さのばらつき、雨で自動の頻度、雲でリバーブが変わる。
// 変化: 天気で決まった値を中心に、音域・密度・ベルの明るさ・リバーブが経過時間でゆっくり揺れ、20 分ごとに 5 度上へ転調する
let weather: Mood | null = null;
let drift: Drift | null = null;

function applyParams(ramp: number) {
  const m = weather ?? NEUTRAL_MOOD;
  const d = drift ?? NEUTRAL_DRIFT;
  transport.bpm.rampTo(BPM * m.speed, ramp);
  reverb.wet.rampTo(Math.min(Math.max(0.2 + 0.5 * m.wetness + 0.15 * d.reverb, 0), 1), ramp);
  bell.set({ modulationIndex: 8 * 2 ** d.brightness });
  pitches = visiblePitches(allPitches, d.register);
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

// 16 分音符ごとの発音数を数え、同時に鳴りすぎないようにする
const notesByStep = new Map<number, Set<number>>();

function play(synth: Tone.PolySynth<any>, pitchIndex: number, flash: Omit<Flash, "life">) {
  const freq = pitchAt(pitches, pitchIndex).freq;
  const time = transport.nextSubdivision("16n");
  const step = Math.round(time * 1000);
  const notes = notesByStep.get(step) ?? new Set<number>();
  if (notes.size >= MAX_NOTES_PER_STEP || notes.has(freq)) return;
  notes.add(freq);
  notesByStep.set(step, notes);

  synth.triggerAttackRelease(freq, "16n", time);
  Tone.getDraw().schedule(() => flashes.push({ ...flash, life: 1 }), time);

  if (notesByStep.size > 64) {
    const now = Math.round(Tone.now() * 1000);
    for (const s of notesByStep.keys()) if (s < now) notesByStep.delete(s);
  }
}

function indexAt(y: number): number {
  return pitchIndexAt(y, height, pitches.length);
}

let started = false;

async function ensureStarted() {
  if (started) return;
  started = true;
  await Tone.start();
  transport.start();
  hintEl.classList.add("hidden");
}

// --- 波紋 ---

let width = 0;
let height = 0;
let nextId = 0;
let ripples: Ripple[] = [];
let flashes: Flash[] = [];

function spawn(x: number, y: number) {
  const maxR = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
  const m = weather ?? NEUTRAL_MOOD;
  const variance = weather ? 0.3 * weather.spread : 0;
  const speed = SPEED * m.speed * (1 + (Math.random() * 2 - 1) * variance);
  ripples.push({ id: nextId++, x, y, r: 0, speed, maxR, hue: 180 + Math.random() * 120, edgesHit: new Set(), touched: new Set() });
  if (ripples.length > MAX_RIPPLES) ripples.shift();
}

function update(dt: number) {
  for (const rp of ripples) rp.r += rp.speed * dt;

  for (const rp of ripples) {
    const edges: [Edge, number, number, number][] = [
      ["left", rp.x, 0, rp.y],
      ["right", width - rp.x, width, rp.y],
      ["top", rp.y, rp.x, 0],
      ["bottom", height - rp.y, rp.x, height],
    ];
    for (const [edge, dist, hx, hy] of edges) {
      if (rp.edgesHit.has(edge) || rp.r < dist) continue;
      rp.edgesHit.add(edge);
      play(pluck, indexAt(rp.y) + EDGE_OFFSET[edge], { x: hx, y: hy, hue: rp.hue });
    }
  }

  for (let i = 0; i < ripples.length; i++) {
    for (let j = i + 1; j < ripples.length; j++) {
      const a = ripples[i];
      const b = ripples[j];
      if (a.touched.has(b.id)) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (a.r + b.r < d) continue;
      a.touched.add(b.id);
      b.touched.add(a.id);
      const t = d === 0 ? 0 : a.r / (a.r + b.r);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      play(bell, indexAt(y), { x, y, hue: (a.hue + b.hue) / 2 });
    }
  }

  ripples = ripples.filter((rp) => rp.r < rp.maxR);
  for (const f of flashes) f.life -= dt * 1.5;
  flashes = flashes.filter((f) => f.life > 0);
}

function draw() {
  // 少しだけ前のフレームを残して残像にする
  g.fillStyle = "rgba(27, 29, 35, 0.35)";
  g.fillRect(0, 0, width, height);
  drawPitchGuides(g, width, height, pitches);

  for (const rp of ripples) {
    const alpha = 1 - rp.r / rp.maxR;
    g.strokeStyle = `hsla(${rp.hue}, 80%, 65%, ${alpha})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
    g.stroke();

    g.fillStyle = `hsla(${rp.hue}, 80%, 75%, ${alpha})`;
    g.beginPath();
    g.arc(rp.x, rp.y, 3, 0, Math.PI * 2);
    g.fill();
  }

  for (const f of flashes) {
    g.fillStyle = `hsla(${f.hue}, 90%, 80%, ${f.life})`;
    g.beginPath();
    g.arc(f.x, f.y, 4 + (1 - f.life) * 18, 0, Math.PI * 2);
    g.fill();
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
let untilAuto = AUTO_INTERVAL;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (started && autoEl.checked) {
    untilAuto -= dt;
    if (untilAuto <= 0) {
      spawn(Math.random() * width, Math.random() * height);
      const density = (weather ?? NEUTRAL_MOOD).density * densityFactor(drift ?? NEUTRAL_DRIFT);
      untilAuto = (AUTO_INTERVAL / density) * (0.5 + Math.random());
    }
  }

  update(dt);
  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", async (e) => {
  await ensureStarted();
  spawn(e.clientX, e.clientY);
});

clearEl.addEventListener("click", () => {
  ripples = [];
  flashes = [];
});

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
