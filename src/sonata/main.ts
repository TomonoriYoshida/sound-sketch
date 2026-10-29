import * as Tone from "tone";
import "../ripples/style.css";
import { drawPitchGuides } from "../scales";
import { reverbWet, setupCanvas, setupGenerativePage } from "../generative";
import { type L, onLangChange, t } from "../i18n";
import { ichiyanagi } from "./ichiyanagi";
import { reich } from "./reich";
import type { MovementContext, MovementRun, Sonata } from "./movement";

// 作曲家ごとに独立したピアノソナタ（3 楽章）。作曲家を選ぶと、I → II → III がその作曲家の作り方で続けて鳴り、
// III が終わるとソナタも終わる。楽章は自分の流れ（始まり・盛り上がり・終わり）を持つ。
// まだ作っていない作曲家は「準備中」として選べないようにしておく

const SONATAS: Sonata[] = [ichiyanagi, reich];
const COMING: { id: string; composer: L }[] = [
  { id: "eno", composer: { ja: "ブライアン・イーノ", en: "Brian Eno" } },
];
const GAP_BETWEEN = 4; // 楽章のあいだの沈黙（秒）

// 試すとき用: ?short を付けると、どの楽章も 5 分の 1 の長さになる（終わり方をすぐ確かめられる）
if (new URLSearchParams(location.search).has("short"))
  for (const s of SONATAS) for (const m of s.movements) m.duration /= 5;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const composerEl = document.querySelector<HTMLSelectElement>("#composer")!;
const movementEl = document.querySelector<HTMLSelectElement>("#movement")!;
const restartEl = document.querySelector<HTMLButtonElement>("#restart")!;
const tempoEl = document.querySelector<HTMLInputElement>("#tempo")!;
const tempoValueEl = document.querySelector<HTMLOutputElement>("#tempo-value")!;

// --- 音 ---

// Salamander Grand Piano の録音（短 3 度ごと）。間の音は、近い録音の速さを変えて作る（Tone.Sampler）
const SAMPLE_NOTES: [string, string][] = [
  ["C", "C"],
  ["D#", "Ds"],
  ["F#", "Fs"],
  ["A", "A"],
];
const urls: Record<string, string> = { A0: "A0.mp3", C8: "C8.mp3" };
for (let octave = 1; octave <= 7; octave++)
  for (const [note, file] of SAMPLE_NOTES) urls[`${note}${octave}`] = `${file}${octave}.mp3`;

const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.15 }).toDestination();
const filter = new Tone.Filter({ type: "lowpass", frequency: 6000, rolloff: -12 }).connect(reverb);
const piano = new Tone.Sampler({ urls, baseUrl: `${import.meta.env.BASE_URL}samples/piano/`, release: 0.6 }).connect(filter);
piano.volume.value = -4;

// 天気: 気温で速い楽章のテンポ、雨（と密度）で音の変わる頻度、雲でリバーブが変わる。
// 変化: 天気で決まった値を中心に、音域・音色の明るさ・リバーブがゆっくり揺れ、20 分ごとに 5 度上へ転調する
let speed = 1;
const page = setupGenerativePage({
  defaults: { scale: "ritsu", root: "D" },
  applyParams: (params) => {
    reverb.wet.rampTo(reverbWet(0.05, params), params.ramp);
    filter.frequency.rampTo(6000 * 2 ** params.drift.brightness, params.ramp);
    speed = params.mood.speed;
  },
});
const { transport } = page;

tempoEl.addEventListener("input", () => (tempoValueEl.value = tempoEl.value));
tempoValueEl.value = tempoEl.value;

const context: MovementContext = {
  piano,
  transport,
  pitches: page.pitches,
  density: page.autoDensity,
  bpm: () => Number(tempoEl.value) * speed,
};

// --- 作曲家と楽章 ---

let sonata = SONATAS[0];

function fillSelects() {
  const composer = composerEl.value || sonata.id;
  composerEl.replaceChildren(
    ...SONATAS.map((s) => new Option(t(s.composer), s.id)),
    ...COMING.map((c) => {
      const option = new Option(`${t(c.composer)} ${t({ ja: "（準備中）", en: "(coming)" })}`, c.id);
      option.disabled = true;
      return option;
    }),
  );
  composerEl.value = composer;
  const movement = movementEl.value || "0";
  movementEl.replaceChildren(...sonata.movements.map((m, i) => new Option(t(m.title), String(i))));
  movementEl.value = movement;
}
fillSelects();
onLangChange(fillSelects);

// 今の楽章。null のときは、始まる前か、ソナタが終わったあと
let index = 0;
let run: MovementRun | null = null;
let startedAt = 0;
let nextAt = Infinity; // 楽章のあいだの沈黙が明ける時刻
let ended = false;

function startMovement(i: number) {
  run?.stop();
  piano.releaseAll();
  index = i;
  movementEl.value = String(i);
  run = sonata.movements[i].start(context);
  startedAt = Tone.now();
  nextAt = Infinity;
  ended = false;
}

composerEl.addEventListener("change", () => {
  sonata = SONATAS.find((s) => s.id === composerEl.value) ?? SONATAS[0];
  movementEl.value = "0";
  fillSelects();
  if (page.started()) startMovement(0);
});
movementEl.addEventListener("change", () => {
  if (page.started()) startMovement(Number(movementEl.value));
});
restartEl.addEventListener("click", () => {
  if (page.started()) startMovement(0);
  else movementEl.value = "0";
});

// --- 画面 ---

let width = 0;
let height = 0;
const g = setupCanvas(canvas, (w, h) => {
  width = w;
  height = h;
});

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function draw() {
  g.fillStyle = "rgba(27, 29, 35, 0.35)";
  g.fillRect(0, 0, width, height);
  drawPitchGuides(g, width, height, page.pitches());
  run?.draw(g, width, height);

  // 右下: 作曲家・楽章・経過時間
  g.font = "13px system-ui, sans-serif";
  g.textAlign = "right";
  g.fillStyle = "rgba(255, 255, 255, 0.55)";
  const movement = sonata.movements[index];
  const status = ended
    ? t({ ja: "終わり — クリックでもう一度", en: "Fine — click to play again" })
    : run
      ? `${clock(Tone.now() - startedAt)} / ${clock(movement.duration)}`
      : "";
  g.fillText(`${t(sonata.composer)}  ${t(movement.title)}  ${status}`, width - 24, height - 40);
}

function frame() {
  if (run?.finished()) {
    run.stop();
    run = null;
    if (index < sonata.movements.length - 1) nextAt = Tone.now() + GAP_BETWEEN;
    else ended = true;
  }
  if (!run && Tone.now() >= nextAt) startMovement(index + 1);

  draw();
  requestAnimationFrame(frame);
}

// 最初の操作で、ピアノの録音を読み込み終えてから、選んでいる楽章を始める。終わったあとのクリックは、I から始め直す
let loading = false;

canvas.addEventListener("pointerdown", async (e) => {
  if (e.button !== 0) return;
  if (run) {
    run.pointer(e.clientX, e.clientY, height);
    return;
  }
  if (ended) {
    startMovement(0);
    return;
  }
  if (loading || nextAt !== Infinity) return;
  loading = true;
  await page.ensureStarted();
  if (page.started()) {
    await Tone.loaded();
    startMovement(Number(movementEl.value));
  }
  loading = false;
});

requestAnimationFrame(frame);
