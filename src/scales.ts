import { syncNavQuery } from "./nav";

// Ripples / Phase で共有するスケール定義と、選択 UI・音高ガイドの描画。
// steps は主音からの半音数。小数は四分音や平均律から外れた音（ガムランの近似など）。

export type Scale = { id: string; name: string; group: string; steps: number[] };
export type Pitch = { freq: number; label: string; isRoot: boolean };

export const SCALES: Scale[] = [
  { group: "日本", id: "miyako", name: "都節音階（陰音階）", steps: [0, 1, 5, 7, 8] },
  { group: "日本", id: "minyo", name: "民謡音階", steps: [0, 3, 5, 7, 10] },
  { group: "日本", id: "ritsu", name: "律音階", steps: [0, 2, 5, 7, 9] },
  { group: "日本", id: "ryukyu", name: "琉球音階", steps: [0, 4, 5, 7, 11] },
  { group: "日本", id: "iwato", name: "岩戸音階", steps: [0, 1, 5, 6, 10] },
  { group: "中国", id: "gong", name: "宮調", steps: [0, 2, 4, 7, 9] },
  { group: "中国", id: "shang", name: "商調", steps: [0, 2, 5, 7, 10] },
  { group: "中国", id: "jue", name: "角調", steps: [0, 3, 5, 8, 10] },
  { group: "中国", id: "zhi", name: "徴調", steps: [0, 2, 5, 7, 9] },
  { group: "中国", id: "yu", name: "羽調", steps: [0, 3, 5, 7, 10] },
  { group: "中近東", id: "hijaz", name: "ヒジャーズ", steps: [0, 1, 4, 5, 7, 8, 10] },
  { group: "中近東", id: "hijaz-kar", name: "ヒジャーズ・カール", steps: [0, 1, 4, 5, 7, 8, 11] },
  { group: "中近東", id: "rast", name: "ラスト（四分音）", steps: [0, 2, 3.5, 5, 7, 9, 10.5] },
  { group: "中近東", id: "bayati", name: "バヤーティ（四分音）", steps: [0, 1.5, 3, 5, 7, 8, 10] },
  { group: "中近東", id: "saba", name: "サバー（四分音）", steps: [0, 1.5, 3, 4, 7, 8, 10] },
  { group: "インド", id: "yaman", name: "ヤマン", steps: [0, 2, 4, 6, 7, 9, 11] },
  { group: "インド", id: "bhairav", name: "バイラヴ", steps: [0, 1, 4, 5, 7, 8, 11] },
  { group: "インド", id: "bhairavi", name: "バイラヴィ", steps: [0, 1, 3, 5, 7, 8, 10] },
  { group: "インド", id: "todi", name: "トーディ", steps: [0, 1, 3, 6, 7, 8, 11] },
  { group: "インド", id: "marwa", name: "マルワ", steps: [0, 1, 4, 6, 9, 11] },
  { group: "バリ島", id: "pelog-selisir", name: "ペロッグ・スリシール", steps: [0, 1, 3, 7, 8] },
  { group: "バリ島", id: "pelog", name: "ペロッグ（7音・ガムラン調律の近似）", steps: [0, 1.2, 2.7, 5.4, 6.7, 7.85, 9.5] },
  { group: "バリ島", id: "slendro", name: "スレンドロ（オクターブ5等分）", steps: [0, 2.4, 4.8, 7.2, 9.6] },
  { group: "西洋", id: "major-pentatonic", name: "メジャーペンタトニック", steps: [0, 2, 4, 7, 9] },
  { group: "西洋", id: "lydian", name: "リディアン", steps: [0, 2, 4, 6, 7, 9, 11] },
];

export const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const OCTAVES = [3, 4, 5];

// 低い順に並んだ音高の一覧。音名は最も近い平均律の音で、ずれていれば ↑↓ を付ける
export function pitchesOf(scale: Scale, root: string): Pitch[] {
  const rootIndex = ROOTS.indexOf(root);
  return OCTAVES.flatMap((oct) =>
    scale.steps.map((step) => {
      const midi = 12 * (oct + 1) + rootIndex + step;
      const nearest = Math.round(midi);
      const diff = midi - nearest;
      const mark = Math.abs(diff) < 0.05 ? "" : diff > 0 ? "↑" : "↓";
      return {
        freq: 440 * 2 ** ((midi - 69) / 12),
        label: `${ROOTS[nearest % 12]}${Math.floor(nearest / 12) - 1}${mark}`,
        isRoot: step === 0,
      };
    }),
  );
}

// 画面を音高の数で縦に等分し、上ほど高い音にする
export function pitchIndexAt(y: number, height: number, count: number): number {
  return Math.floor((1 - y / height) * count);
}

export function pitchAt(pitches: Pitch[], index: number): Pitch {
  return pitches[Math.min(Math.max(index, 0), pitches.length - 1)];
}

// 各音高の帯の中央に薄い横線と音名を描く。主音の線だけ少し明るくする
export function drawPitchGuides(g: CanvasRenderingContext2D, width: number, height: number, pitches: Pitch[]) {
  const band = height / pitches.length;
  g.font = "10px system-ui, sans-serif";
  g.textAlign = "left";
  g.lineWidth = 1;
  pitches.forEach((p, i) => {
    const y = height - (i + 0.5) * band;
    g.strokeStyle = p.isRoot ? "rgba(108, 196, 255, 0.10)" : "rgba(255, 255, 255, 0.035)";
    g.beginPath();
    g.moveTo(44, y);
    g.lineTo(width, y);
    g.stroke();
    g.fillStyle = p.isRoot ? "rgba(108, 196, 255, 0.45)" : "rgba(255, 255, 255, 0.22)";
    g.fillText(p.label, 10, y + 3);
  });
}

// スケールと主音のプルダウンを用意し、選択を URL (?scale=…&root=…) と同期する。
// setScale はプログラムからスケールを変えるとき（天気など）に使う
export function setupScalePicker(
  scaleEl: HTMLSelectElement,
  rootEl: HTMLSelectElement,
  defaults: { scale: string; root: string },
  onChange: (pitches: Pitch[]) => void,
): { pitches: Pitch[]; setScale: (id: string) => void } {
  for (const group of new Set(SCALES.map((s) => s.group))) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    for (const s of SCALES.filter((s) => s.group === group)) optgroup.append(new Option(s.name, s.id));
    scaleEl.append(optgroup);
  }
  for (const r of ROOTS) rootEl.append(new Option(r, r));

  const params = new URLSearchParams(location.search);
  const scaleParam = params.get("scale");
  const rootParam = params.get("root");
  scaleEl.value = SCALES.some((s) => s.id === scaleParam) ? scaleParam! : defaults.scale;
  rootEl.value = rootParam && ROOTS.includes(rootParam) ? rootParam : defaults.root;

  const current = () => pitchesOf(SCALES.find((s) => s.id === scaleEl.value)!, rootEl.value);
  // 初期値も URL に書いておき、別ページへ移ったときにそのページの初期値で上書きされないようにする
  const writeUrl = () => {
    const url = new URL(location.href);
    url.searchParams.set("scale", scaleEl.value);
    url.searchParams.set("root", rootEl.value);
    history.replaceState(null, "", url);
    syncNavQuery();
  };
  const update = () => {
    writeUrl();
    onChange(current());
  };
  scaleEl.addEventListener("change", update);
  rootEl.addEventListener("change", update);
  writeUrl();
  const setScale = (id: string) => {
    if (scaleEl.value === id) return;
    scaleEl.value = id;
    update();
  };
  return { pitches: current(), setScale };
}
