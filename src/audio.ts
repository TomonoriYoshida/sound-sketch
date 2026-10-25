import * as Tone from "tone";

// 出力の最後にリミッターを入れ、音が重なっても大きくなりすぎたり割れたりしないようにする。各ページで最初に 1 回呼ぶ
export function protectOutput() {
  Tone.getDestination().chain(new Tone.Limiter(-3));
}
