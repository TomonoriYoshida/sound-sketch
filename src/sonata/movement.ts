import * as Tone from "tone";
import type { L } from "../i18n";
import type { Pitch } from "../scales";

// ソナタの楽章に共通の形。楽章は始まりから終わりまでの流れを自分で持ち、終わったら finished() が true になる。
// ページ（main.ts）は、終わった楽章を止めて次の楽章を始め、III が終わったらソナタを終える

export type MovementContext = {
  piano: Tone.Sampler;
  transport: ReturnType<typeof Tone.getTransport>;
  pitches: () => Pitch[]; // 画面に割り当てている音高（低い順）
  density: () => number; // 密度の段階・天気・変化を掛け合わせた頻度の倍率（標準 1）
  bpm: () => number; // 速い楽章のテンポ（設定 × 天気）
};

export type MovementRun = {
  pointer: (x: number, y: number, height: number) => void;
  draw: (g: CanvasRenderingContext2D, width: number, height: number) => void;
  finished: () => boolean;
  stop: () => void;
};

export type Movement = {
  title: L;
  duration: number; // 目安の長さ（秒）。終わり方は楽章ごとに違うので、少し前後する
  start: (ctx: MovementContext) => MovementRun;
};

export type Sonata = { id: string; composer: L; movements: Movement[] };

export const MARGIN_LEFT = 56;
export const MARGIN_RIGHT = 24;

export function yOf(index: number, height: number, count: number): number {
  return height - (index + 0.5) * (height / count);
}

export function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
