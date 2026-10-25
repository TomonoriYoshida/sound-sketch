import * as Tone from "tone";
import "../ripples/style.css";
import { drawPitchGuides, pitchAt, pitchIndexAt, setupScalePicker, visiblePitches } from "../scales";
import { type Mood, NEUTRAL_MOOD, setupWeather } from "../weather";
import { type Drift, densityFactor, NEUTRAL_DRIFT, setupDrift } from "../drift";
import { densityLevelFactor, registerOffset, setupLevel } from "../levels";
import { setupHelp } from "../help";

// 長さが大きく違うテープループを重ねる（イーノ『Music for Airports』の手法）。
// クリックで置くループには長く柔らかい音が 1 つだけ入り、録音したループにはフレーズが入る。
// ループどうしの長さが割り切れないので、重なり方がほとんど二度と同じにならない。

type LoopNote = { offset: number; y: number }; // offset はループの頭からの秒数
type TapeLoop = {
  kind: "note" | "phrase";
  x: number;
  y: number;
  period: number; // 秒
  notes: LoopNote[];
  hue: number;
  loop: Tone.Loop;
};
type Glow = { loop: TapeLoop; offset: number; life: number };
// points は録音中の表示用。クリックした場所を順に持つ
type Recording = { start: number | null; x: number; y: number; notes: LoopNote[]; points: { x: number; y: number }[] };

const CENTER_PERIOD = 25; // 画面中央のループの長さ (秒)
const HALF_RANGE = 10; // 標準では左端 15 秒〜右端 35 秒
const MIN_PERIOD = 8;
const NOTE_LENGTH = 4; // 1 音のループで 1 回に鳴らす長さ (秒)
const PHRASE_NOTE_LENGTH = 0.8; // フレーズの 1 音の長さ (秒)
const MIN_PHRASE_PERIOD = 4; // 録音が短くても、ループはこれより短くしない
const MAX_RECORD_SECONDS = 40;
const MAX_PHRASE_NOTES = 16;
const MAX_LOOPS = 10;
const AUTO_MAX_LOOPS = 6; // 密度 3 のとき、自動で置くのはここまで
const IDLE_BEFORE_AUTO = 10;
const AUTO_INTERVAL = 20;
const HIT_RADIUS = 16; // ループの中心からこの距離以内のクリックで外す

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const g = canvas.getContext("2d")!;
const autoEl = document.querySelector<HTMLInputElement>("#auto")!;
const clearEl = document.querySelector<HTMLButtonElement>("#clear")!;
const recordEl = document.querySelector<HTMLButtonElement>("#record")!;
const recordStatusEl = document.querySelector<HTMLElement>("#record-status")!;
const hintEl = document.querySelector<HTMLParagraphElement>("#hint")!;

setupHelp();

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

const reverb = new Tone.Reverb({ decay: 10, wet: 0.6 }).toDestination();
const filter = new Tone.Filter({ type: "lowpass", frequency: 1800, Q: 0.5 }).connect(reverb);

// 1 音のループ: ゆっくり立ち上がって長く消える、柔らかいパッド
const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fattriangle", count: 3, spread: 18 },
  envelope: { attack: 2.5, decay: 1, sustain: 0.6, release: 6 },
}).connect(filter);
synth.maxPolyphony = 32;
synth.volume.value = -20;

// フレーズ: 弾いたタイミングがわかるよう、立ち上がりの速い柔らかい音
const phraseSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fatsine", count: 2, spread: 10 },
  envelope: { attack: 0.02, decay: 1.2, sustain: 0.2, release: 3 },
}).connect(filter);
phraseSynth.maxPolyphony = 48;
phraseSynth.volume.value = -14;

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

function pitchAtY(y: number) {
  return pitchAt(pitches, pitchIndexAt(y, height, pitches.length));
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

// delay 秒後に最初の頭が来るようにループを始める
function addLoop(kind: TapeLoop["kind"], x: number, y: number, period: number, notes: LoopNote[], delay = 0) {
  // 1 音のループは暖色、フレーズは紫系にして見分けやすくする
  const hue = kind === "note" ? 30 + (x / width) * 60 : 300 + (x / width) * 50;
  const l: TapeLoop = { kind, x, y, period, notes, hue, loop: undefined! };
  l.loop = new Tone.Loop((time) => {
    for (const n of l.notes) {
      const at = time + n.offset;
      const freq = pitchAtY(n.y).freq;
      if (kind === "note") synth.triggerAttackRelease(freq, NOTE_LENGTH, at, 0.6 + Math.random() * 0.3);
      else phraseSynth.triggerAttackRelease(freq, PHRASE_NOTE_LENGTH, at, 0.6 + Math.random() * 0.2);
      Tone.getDraw().schedule(() => glows.push({ loop: l, offset: n.offset, life: 1 }), at);
    }
  }, period).start(transport.seconds + delay);

  loops.push(l);
  if (loops.length > MAX_LOOPS) removeLoop(loops[0]);
}

function place(x: number, y: number) {
  addLoop("note", x, y, periodAt(x), [{ offset: 0, y }]);
}

// --- 録音 ---

let recording: Recording | null = null;

function startRecording() {
  recording = { start: null, x: 0, y: 0, notes: [], points: [] };
  recordEl.textContent = "■ 停止";
  recordEl.classList.add("recording");
}

function recordNote(x: number, y: number) {
  const rec = recording!;
  const now = Tone.now();
  if (rec.start === null) {
    rec.start = now;
    rec.x = x;
    rec.y = y;
  }
  rec.notes.push({ offset: now - rec.start, y });
  rec.points.push({ x, y });
  phraseSynth.triggerAttackRelease(pitchAtY(y).freq, PHRASE_NOTE_LENGTH, now, 0.8);
  if (rec.notes.length >= MAX_PHRASE_NOTES) stopRecording();
}

// 最初の音から停止までの長さでループにする。停止した瞬間に頭へ戻るので、弾いた流れのまま続く
function stopRecording() {
  const rec = recording!;
  recording = null;
  recordEl.textContent = "● 録音";
  recordEl.classList.remove("recording");
  recordStatusEl.textContent = "";
  if (rec.start === null) return;

  const elapsed = Tone.now() - rec.start;
  const period = Math.max(MIN_PHRASE_PERIOD, elapsed);
  addLoop("phrase", rec.x, rec.y, period, rec.notes, period - elapsed);
}

recordEl.addEventListener("click", async () => {
  await ensureStarted();
  idle = 0;
  if (recording) stopRecording();
  else startRecording();
});

// --- 描画 ---

function angleAt(l: TapeLoop, offset: number): number {
  return -Math.PI / 2 + (offset / l.period) * Math.PI * 2;
}

function draw() {
  g.fillStyle = "rgba(27, 29, 35, 0.3)";
  g.fillRect(0, 0, width, height);
  drawPitchGuides(g, width, height, pitches);

  for (const l of loops) {
    const r = ringRadius(l);
    const angle = -Math.PI / 2 + l.loop.progress * Math.PI * 2;

    g.strokeStyle = `hsla(${l.hue}, 50%, 65%, 0.18)`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(l.x, l.y, r, 0, Math.PI * 2);
    g.stroke();

    // フレーズの各音が鳴る位置
    if (l.kind === "phrase") {
      g.fillStyle = `hsla(${l.hue}, 50%, 70%, 0.45)`;
      for (const n of l.notes) {
        const a = angleAt(l, n.offset);
        g.beginPath();
        g.arc(l.x + Math.cos(a) * r, l.y + Math.sin(a) * r, 2, 0, Math.PI * 2);
        g.fill();
      }
    }

    // テープの針。音の位置に来たときに鳴る
    g.fillStyle = `hsla(${l.hue}, 80%, 75%, 0.9)`;
    g.beginPath();
    g.arc(l.x + Math.cos(angle) * r, l.y + Math.sin(angle) * r, 3, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = `hsla(${l.hue}, 80%, 80%, 0.9)`;
    g.beginPath();
    g.arc(l.x, l.y, 3, 0, Math.PI * 2);
    g.fill();

    const label = l.kind === "note" ? pitchAtY(l.y).label : `${l.notes.length} 音`;
    g.fillStyle = `hsla(${l.hue}, 20%, 70%, 0.6)`;
    g.font = "11px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(`${label}  ${l.period.toFixed(1)}s`, l.x, l.y + 18);
  }

  // 鳴っている間、1 音のループはリング全体が、フレーズは鳴った音の位置がふわっと光る
  for (const gl of glows) {
    const l = gl.loop;
    if (!loops.includes(l)) continue;
    const r = ringRadius(l);
    if (l.kind === "note") {
      g.strokeStyle = `hsla(${l.hue}, 80%, 70%, ${gl.life * 0.6})`;
      g.lineWidth = 2 + gl.life * 4;
      g.beginPath();
      g.arc(l.x, l.y, r, 0, Math.PI * 2);
      g.stroke();
    } else {
      const a = angleAt(l, gl.offset);
      g.fillStyle = `hsla(${l.hue}, 80%, 75%, ${gl.life * 0.8})`;
      g.beginPath();
      g.arc(l.x + Math.cos(a) * r, l.y + Math.sin(a) * r, 3 + (1 - gl.life) * 14, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 録音中のフレーズ。クリックした場所を弾いた順に線でつなぐ。停止すると recording が消えるので表示も消える
  if (recording && recording.points.length > 0) {
    const points = recording.points;
    g.strokeStyle = "rgba(255, 107, 107, 0.35)";
    g.lineWidth = 1;
    g.beginPath();
    points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.stroke();

    g.fillStyle = "rgba(255, 107, 107, 0.85)";
    g.font = "10px system-ui, sans-serif";
    g.textAlign = "center";
    points.forEach((p, i) => {
      g.beginPath();
      g.arc(p.x, p.y, i === 0 ? 5 : 4, 0, Math.PI * 2);
      g.fill();
      g.fillText(String(i + 1), p.x, p.y - 9);
    });
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

  if (recording) {
    idle = 0;
    const elapsed = recording.start === null ? 0 : Tone.now() - recording.start;
    recordStatusEl.textContent = `録音中 ${recording.notes.length} 音 ${elapsed.toFixed(1)}s`;
    if (elapsed >= MAX_RECORD_SECONDS) stopRecording();
  }

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

  for (const gl of glows) gl.life -= dt / (gl.loop.kind === "note" ? NOTE_LENGTH : 1.2);
  glows = glows.filter((gl) => gl.life > 0);

  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", async (e) => {
  await ensureStarted();
  idle = 0;
  if (recording) {
    recordNote(e.clientX, e.clientY);
    return;
  }
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
