import * as Tone from "tone";
import "../ripples/style.css";
import { drawPitchGuides } from "../scales";
import { reverbWet, setupCanvas, setupGenerativePage, type SoundParams } from "../generative";
import { onLangChange, t } from "../i18n";
import { setupLevel } from "../levels";
import { syncNavQuery } from "../nav";
import { eno } from "./eno";
import { ichiyanagi } from "./ichiyanagi";
import { nancarrow } from "./nancarrow";
import { paert } from "./paert";
import { reich } from "./reich";
import type { MovementContext, MovementRun, Sonata } from "./movement";

// 作曲家ごとに独立したピアノソナタ（3 楽章）。作曲家を選ぶと、I → II → III がその作曲家の作り方で続けて鳴り、
// III が終わるとソナタも終わる。楽章は自分の流れ（始まり・盛り上がり・終わり）を持つ

const SONATAS: Sonata[] = [ichiyanagi, reich, eno, paert, nancarrow];
const GAP_BETWEEN = 4; // 楽章のあいだの沈黙（秒）

// 試すとき用: ?short を付けると、どの楽章も 5 分の 1 の長さになる（終わり方をすぐ確かめられる）
if (new URLSearchParams(location.search).has("short"))
  for (const s of SONATAS) for (const m of s.movements) m.duration /= 5;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const composerEl = document.querySelector<HTMLSelectElement>("#composer")!;
const movementEl = document.querySelector<HTMLSelectElement>("#movement")!;
const restartEl = document.querySelector<HTMLButtonElement>("#restart")!;
const reverbEl = document.querySelector<HTMLInputElement>("#reverb")!;
const reverbValueEl = document.querySelector<HTMLOutputElement>("#reverb-value")!;
const swayEl = document.querySelector<HTMLInputElement>("#sway")!;
const swayValueEl = document.querySelector<HTMLOutputElement>("#sway-value")!;
const tuningEl = document.querySelector<HTMLSelectElement>("#tuning")!;
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
// 時間の揺らぎ。1 音ごとのでたらめなずれではなく、ずれ自体がゆっくり変わる（しばらく前のめり、やがてもたる）。
// - 全体の揺れ: 速さの違う 2 つの揺れ（約 1.5 秒と約 6 秒の節目を、なめらかにつなぐ）を重ねる
// - 手の揺れ: 右手と左手（真ん中の C で分ける）が、それぞれ別にゆっくり揺れ、両手が重なる所がぴったりそろわない
// - 和音の崩し: 同時に鳴る音は、低い音から順に少しずつ遅らせる
// - 強さと時間: 強い音はほんの少し早く、弱い音は少し遅く（強さ 0.5 を境に、最大 ±VELOCITY_DEPTH）
// 揺らぎの量は設定の「揺らぎ」（1〜5）で決まり、下の長さはすべて 3（標準）のときの値。1 で揺らぎなし、5 で 2 倍。
// 音は早めには鳴らせないので、全体を揺らぎの量に合わせて遅らせ（swayBase）、その前後で動かす
const SWAY_FACTORS = [0, 0.5, 1, 1.5, 2];
let swayFactor = 1;
const swayBase = () => 0.005 + 0.045 * swayFactor;
const SWAY_DEPTH = 0.025;
const HAND_DEPTH = 0.012;
const VELOCITY_DEPTH = 0.012;
const ROLL = 0.01; // 和音で、1 音ごとに遅らせる長さ（秒。少し揺らす）
const SPLIT = 261.63; // 右手と左手の分け目（C4 の周波数）
const swaySeed = Math.random() * 1000;
// 整数 i ごとに決まる -1〜1 の値（同じ時刻には同じずれになるよう、記憶せずに計算で出す）
const knot = (i: number) => {
  const x = Math.sin(i * 12.9898 + swaySeed) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
const smoothNoise = (t: number) => {
  const i = Math.floor(t);
  const f = (1 - Math.cos((t - i) * Math.PI)) / 2;
  return knot(i) * (1 - f) + knot(i + 1) * f;
};
const swayAt = (time: number, freq: number, velocity: number) =>
  swayBase() +
  swayFactor *
    (-VELOCITY_DEPTH * Math.min(Math.max((velocity - 0.5) * 2, -1), 1) +
      SWAY_DEPTH * (0.6 * smoothNoise(time / 1.5) + 0.4 * smoothNoise(time / 6 + 500)) +
      HAND_DEPTH * smoothNoise(time / 1.2 + (freq < SPLIT ? 1000 : 2000)));

// 調律: 鍵ごとに決まった分だけ音程を外す（同じ鍵はいつも同じずれ）。古いピアノでは、1 つの鍵の弦どうしもそろわず、
// わずかに高い音を重ねてうなりを出す（酒場のピアノのような響き）。ずれはセント（半音の 100 分の 1）
const TUNINGS: Record<string, { spread: number; unison: number }> = {
  exact: { spread: 0, unison: 0 },
  loose: { spread: 8, unison: 0 },
  old: { spread: 14, unison: 12 },
};
let tuning = TUNINGS.exact;
const tuningSeed = Math.random() * 1000;
const keyOffset = (freq: number) => {
  const key = Math.round(12 * Math.log2(freq / 440) + 69);
  const x = Math.sin(key * 78.233 + tuningSeed) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
const cents = (freq: number, amount: number) => freq * 2 ** (amount / 1200);

type Strike = { freq: number; seconds: number; at: number; velocity?: number };

// 楽章が指定した音の長さに、空模様による倍率を掛け、時刻に揺らぎを足して鳴らす（雨で短く、雪で長く）。
// 和音を崩すには同時に鳴る音がそろっている必要があるので、同じ処理の中で頼まれた音をいったん貯め、まとめて鳴らす
let sustain = 1;
class Piano extends Tone.Sampler {
  private batch: Strike[] = [];

  triggerAttackRelease(...[notes, duration, time, velocity]: Parameters<Tone.Sampler["triggerAttackRelease"]>) {
    const at = time === undefined ? Tone.now() : Tone.Time(time).toSeconds();
    const list = Array.isArray(notes) ? notes : [notes];
    list.forEach((note, i) => {
      const length = Array.isArray(duration) ? duration[Math.min(i, duration.length - 1)] : duration;
      this.batch.push({ freq: Tone.Frequency(note).toFrequency(), seconds: Tone.Time(length).toSeconds() * sustain, at, velocity });
    });
    if (this.batch.length === list.length) queueMicrotask(() => this.flush());
    return this;
  }

  // 頼まれた時刻が 10 ミリ秒以内の音を和音とみなし、低い音から順に遅らせる
  private flush() {
    const strikes = this.batch.sort((a, b) => a.at - b.at);
    this.batch = [];
    const chords: Strike[][] = [];
    for (const strike of strikes) {
      const chord = chords.at(-1);
      if (chord && strike.at - chord[0].at < 0.01) chord.push(strike);
      else chords.push([strike]);
    }
    for (const chord of chords) {
      chord.sort((a, b) => a.freq - b.freq);
      const roll = swayFactor * ROLL * (0.7 + 0.6 * Math.random());
      chord.forEach((s, i) => {
        const at = s.at + swayAt(s.at, s.freq, s.velocity ?? 1) + i * roll;
        const freq = cents(s.freq, tuning.spread * keyOffset(s.freq));
        const velocity = s.velocity ?? 1;
        if (tuning.unison === 0) super.triggerAttackRelease(freq, s.seconds, at, velocity);
        else {
          super.triggerAttackRelease(freq, s.seconds, at, velocity * 0.85);
          super.triggerAttackRelease(cents(freq, tuning.unison), s.seconds, at, velocity * 0.6);
        }
      });
    }
  }
}
const piano = new Piano({ urls, baseUrl: `${import.meta.env.BASE_URL}samples/piano/`, release: 0.6 }).connect(filter);
piano.volume.value = -4;

// 天気: 空模様で音色の明るさと音の長さ、気温で刻みのある楽章のテンポ、雨（と密度）で音の変わる頻度、雲でリバーブが変わる。
// 変化: 天気で決まった値を中心に、音域・音色の明るさ・リバーブがゆっくり揺れ、20 分ごとに 5 度上へ転調する
let speed = 1;

// 響き（1〜5）: リバーブの深さの基準と残響の長さ。天気（雲）と変化は、この基準を中心に揺らす。3 が今までの響き
const REVERB_BASES = [-0.22, -0.1, 0.05, 0.2, 0.35]; // 天気を使わないときの深さは、およそ 0.03・0.15・0.3・0.45・0.6
const REVERB_DECAYS = [1.5, 2.5, 3.5, 5, 7];
let lastParams: SoundParams | null = null;
const applyReverb = (level: number, params: SoundParams) => {
  reverb.wet.rampTo(reverbWet(REVERB_BASES[level - 1], params), params.ramp);
  if (reverb.decay !== REVERB_DECAYS[level - 1]) reverb.decay = REVERB_DECAYS[level - 1];
};
let reverbLevel = setupLevel(reverbEl, reverbValueEl, "reverb", (level) => {
  reverbLevel = level;
  if (lastParams) applyReverb(level, { ...lastParams, ramp: 0.5 });
});

// スケールで「指定しない」を選ぶと、今の作曲家の音階を使う（作曲家を変えると音階も変わる）
let sonata = SONATAS[0];
// 初めて開いたときは「指定しない」（作曲家ごとの音階）にしておく
const page = setupGenerativePage({
  defaults: { scale: "composer", root: "D" },
  freeScale: { id: "composer", name: { ja: "指定しない（作曲家にまかせる）", en: "None (composer's choice)" }, scale: () => sonata.scale },
  applyParams: (params) => {
    lastParams = params;
    applyReverb(reverbLevel, params);
    filter.frequency.rampTo(6000 * 2 ** (params.drift.brightness + params.mood.brightness), params.ramp);
    speed = params.mood.speed;
    sustain = params.mood.sustain;
  },
});
const { transport } = page;

const swayLevel = setupLevel(swayEl, swayValueEl, "sway", (level) => (swayFactor = SWAY_FACTORS[level - 1]));
swayFactor = SWAY_FACTORS[swayLevel - 1];

// 調律の選択は、ほかの設定と同じく URL (?tuning=…) に残す。選べるのは tunable の作曲家だけで、
// ほかの作曲家では設定を隠し、ぴったりで鳴らす（選んだ値は残しておき、戻ったときに使う）
const tuningFromUrl = new URLSearchParams(location.search).get("tuning");
if (tuningFromUrl && tuningFromUrl in TUNINGS) tuningEl.value = tuningFromUrl;
const applyTuning = () => {
  tuningEl.closest("label")!.hidden = !sonata.tunable;
  tuning = sonata.tunable ? (TUNINGS[tuningEl.value] ?? TUNINGS.exact) : TUNINGS.exact;
  const url = new URL(location.href);
  url.searchParams.set("tuning", tuningEl.value);
  history.replaceState(null, "", url);
  syncNavQuery();
};
tuningEl.addEventListener("change", applyTuning);
applyTuning();

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

// 選択の表示は、いま鳴らしているソナタ（sonata）に合わせる。
// ブラウザが再読み込みや「戻る」で選択だけを前の値に戻すことがあるので、autocomplete="off" でも防いでいる
function fillSelects() {
  // 頭文字で出し、フルネームは選択肢に重ねたときの表示（title）に残す
  composerEl.replaceChildren(
    ...SONATAS.map((s) => {
      const option = new Option(s.initials, s.id);
      option.title = t(s.composer);
      return option;
    }),
  );
  composerEl.value = sonata.id;
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

// 鳴らすよう頼まれた楽章。音を出せる状態になり、ピアノの録音を読み終えたところで始める（null なら頼まれていない）。
// iPhone では、触れた瞬間でなく指を離したときに音を出せるようになるなど、頼んだ時点ではまだ始められないことがある
let requested: number | null = null;
let pianoReady = false;
Tone.loaded().then(
  () => (pianoReady = true),
  (e) => {
    console.warn(e); // 読めなかった録音があっても、読めた録音で鳴らす（近い録音の速さを変えて作る）
    pianoReady = true;
  },
);

function request(i: number) {
  requested = i;
  movementEl.value = String(i);
  void page.ensureStarted();
}
// 始める前は選ぶだけ。鳴っている（または頼まれている）ときは、選んだところから鳴らし直す
const playing = () => run !== null || requested !== null || nextAt !== Infinity || ended;

composerEl.addEventListener("change", () => {
  sonata = SONATAS.find((s) => s.id === composerEl.value) ?? SONATAS[0];
  movementEl.value = "0";
  fillSelects();
  page.refreshScale();
  applyTuning();
  if (playing()) request(0);
});
movementEl.addEventListener("change", () => {
  if (playing()) request(Number(movementEl.value));
});
restartEl.addEventListener("click", () => {
  if (playing()) request(0);
  else movementEl.value = "0";
});

// 楽章の始まり・終わりと、次の楽章への移り。requestAnimationFrame は画面が隠れていると止まるので、音の時計で見張る
page.transport.scheduleRepeat(() => {
  if (requested !== null && page.started() && pianoReady) {
    const i = requested;
    requested = null;
    startMovement(i);
    return;
  }
  if (run?.finished()) {
    run.stop();
    run = null;
    if (index < sonata.movements.length - 1) nextAt = Tone.now() + GAP_BETWEEN;
    else ended = true;
  }
  if (!run && requested === null && Tone.now() >= nextAt) startMovement(index + 1);
}, 0.25);

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
  const status = requested !== null
    ? t({ ja: "準備中…", en: "Getting ready…" })
    : ended
    ? t({ ja: "終わり — クリックでもう一度", en: "Fine — click to play again" })
    : run
      ? `${clock(Tone.now() - startedAt)} / ${clock(movement.duration)}`
      : "";
  g.fillText(`${t(sonata.composer)}  ${t(movement.title)}  ${status}`, width - 24, height - 40);
}

function frame() {
  draw();
  requestAnimationFrame(frame);
}

// 最初のクリックで、選んでいる楽章を頼む。終わったあとのクリックは、I から始め直す
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (run) {
    run.pointer(e.clientX, e.clientY, height);
    return;
  }
  if (ended) request(0);
  else if (requested === null && nextAt === Infinity) request(Number(movementEl.value));
  else void page.ensureStarted(); // 頼んであるが、まだ音を出せていない
});

requestAnimationFrame(frame);
