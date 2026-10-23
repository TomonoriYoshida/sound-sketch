import * as Tone from "tone";
import "./style.css";

type Key = { note: string; pcKey: string; black: boolean };

// C4〜C6 の 2 オクターブ。下段 (Z 列) が C4〜B4、上段 (Q 列) が C5〜C6
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PC_KEYS = [..."zsxdcvgbhnjm", ..."q2w3er5t6y7ui"];

const KEYS: Key[] = PC_KEYS.map((pcKey, i) => {
  const name = NOTE_NAMES[i % 12];
  return { note: `${name}${4 + Math.floor(i / 12)}`, pcKey, black: name.endsWith("#") };
});

const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.3 }).toDestination();
const instrument = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "sine" },
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.8 },
}).connect(reverb);
instrument.volume.value = -12;

const keyboardEl = document.querySelector<HTMLDivElement>("#keyboard")!;
const waveformEl = document.querySelector<HTMLSelectElement>("#waveform")!;
const volumeEl = document.querySelector<HTMLInputElement>("#volume")!;
const reverbEl = document.querySelector<HTMLInputElement>("#reverb")!;
const transposeEl = document.querySelector<HTMLInputElement>("#transpose")!;
const transposeValueEl = document.querySelector<HTMLOutputElement>("#transpose-value")!;
const octaveEl = document.querySelector<HTMLInputElement>("#octave")!;
const octaveValueEl = document.querySelector<HTMLOutputElement>("#octave-value")!;

const keyEls = new Map<string, HTMLButtonElement>();
// 鍵盤の音名 → 実際に鳴らした周波数。押している間にトランスポーズが変わっても正しく止めるため
const pressed = new Map<string, number>();
let transpose = 0;
let octave = 0;

async function noteOn(note: string) {
  if (pressed.has(note)) return;
  const freq = Tone.Frequency(note).transpose(transpose + octave * 12).toFrequency();
  pressed.set(note, freq);
  keyEls.get(note)?.classList.add("active");
  await Tone.start(); // 自動再生制限の解除（初回操作時のみ実際に効く）
  instrument.triggerAttack(freq);
}

function noteOff(note: string) {
  const freq = pressed.get(note);
  if (freq === undefined) return;
  pressed.delete(note);
  keyEls.get(note)?.classList.remove("active");
  instrument.triggerRelease(freq);
}

for (const key of KEYS) {
  const el = document.createElement("button");
  el.className = key.black ? "key black" : "key white";
  el.innerHTML = `<span>${key.pcKey.toUpperCase()}</span>`;
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    noteOn(key.note);
  });
  el.addEventListener("pointerup", () => noteOff(key.note));
  el.addEventListener("pointercancel", () => noteOff(key.note));
  keyboardEl.appendChild(el);
  keyEls.set(key.note, el);
}

const noteByPcKey = new Map(KEYS.map((k) => [k.pcKey, k.note]));

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const note = noteByPcKey.get(e.key.toLowerCase());
  if (note) noteOn(note);
});

window.addEventListener("keyup", (e) => {
  const note = noteByPcKey.get(e.key.toLowerCase());
  if (note) noteOff(note);
});

waveformEl.addEventListener("change", () => {
  instrument.set({ oscillator: { type: waveformEl.value as OscillatorType } });
});

volumeEl.addEventListener("input", () => {
  instrument.volume.value = Number(volumeEl.value);
});

reverbEl.addEventListener("input", () => {
  reverb.wet.value = Number(reverbEl.value);
});

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

transposeEl.addEventListener("input", () => {
  transpose = Number(transposeEl.value);
  transposeValueEl.value = signed(transpose);
});

octaveEl.addEventListener("input", () => {
  octave = Number(octaveEl.value);
  octaveValueEl.value = signed(octave);
});
