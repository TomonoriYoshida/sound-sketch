// HTML や共通の部品に出す文言の辞書。キーは data-i18n / data-i18n-aria や tk() で使う。
// 説明文は help-texts.ts、スケール名は scales.ts、都市名は weather.ts にまとめてある

export const STRINGS: Record<string, { ja: string; en: string }> = {
  // 上のバー
  clear: { ja: "クリア", en: "Clear" },
  settings: { ja: "⚙ 設定", en: "⚙ Settings" },
  settingsPanel: { ja: "設定", en: "Settings" },
  settingsClose: { ja: "設定を閉じる", en: "Close settings" },
  showMenu: { ja: "メニューを表示", en: "Show menu" },
  help: { ja: "? 説明", en: "? Help" },
  helpClose: { ja: "閉じる", en: "Close" },
  helpAbout: { ja: "の説明", en: " — help" },
  record: { ja: "● 録音", en: "● Rec" },
  stop: { ja: "■ 停止", en: "■ Stop" },

  // 設定パネルの見出し
  "sec.sound": { ja: "音", en: "Sound" },
  "sec.loop": { ja: "ループ", en: "Loop" },
  "sec.weather": { ja: "天気", en: "Weather" },
  "sec.drift": { ja: "変化", en: "Drift" },
  "sec.auto": { ja: "自動", en: "Auto" },

  // 設定パネルの項目
  scale: { ja: "スケール", en: "Scale" },
  root: { ja: "主音", en: "Root" },
  register: { ja: "音域", en: "Register" },
  density: { ja: "密度", en: "Density" },
  mode: { ja: "種類", en: "Type" },
  "mode.note": { ja: "単音", en: "Single note" },
  "mode.phrase": { ja: "フレーズ", en: "Phrase" },
  phraseLength: { ja: "音数", en: "Notes" },
  tempo: { ja: "テンポ", en: "Tempo" },
  phraseNew: { ja: "フレーズを作り直す", en: "New phrase" },
  fade: { ja: "減衰", en: "Fade out" },
  useWeather: { ja: "天気を使う", en: "Use weather" },
  place: { ja: "場所", en: "Place" },
  driftOn: { ja: "ゆっくり変化させる", en: "Slowly evolve" },
  driftSpeed: { ja: "速さ", en: "Speed" },
  autoOn: { ja: "自動で置く", en: "Place automatically" },

  // キャンバスのページのヒント
  "hint.ripples": {
    ja: "クリックすると波紋が広がり、ぶつかると音が鳴ります",
    en: "Click to send out ripples. They make sounds when they collide.",
  },
  "hint.phase": {
    ja: "クリックで音を置く。縦の位置で音の高さ、横の位置でループの周期が決まります\n周期がわずかに違う音どうしは、少しずつずれていきます",
    en: "Click to place a note. Height sets the pitch, horizontal position sets the loop period.\nNotes with slightly different periods slowly drift apart.",
  },
  "hint.loops": {
    ja: "クリックでテープループを置く。縦の位置で音の高さ、横の位置でループの長さ（15〜35 秒）が決まります\n長さの違うループが重なり、同じ響きはほとんど二度と来ません。ループの中心をクリックすると外せます\n「録音」を押してクリックで演奏し、「停止」を押すと、そのフレーズが録音した長さのループになります",
    en: "Click to place a tape loop. Height sets the pitch, horizontal position sets the loop length (15–35 s).\nLoops of different lengths overlap, so the same harmony almost never returns. Click a loop's center to remove it.\nPress “Rec”, play by clicking, then press “Stop” to turn the phrase into a loop of the recorded length.",
  },

  // Keyboard
  instrument: { ja: "音源", en: "Instrument" },
  waveform: { ja: "波形", en: "Waveform" },
  volume: { ja: "音量", en: "Volume" },
  reverb: { ja: "リバーブ", en: "Reverb" },
  transpose: { ja: "トランスポーズ", en: "Transpose" },
  octave: { ja: "オクターブ", en: "Octave" },
  worklet: { ja: "Worklet（自作）", en: "Worklet (custom)" },
  "hint.keyboard": {
    ja: "クリック、または PC キーボードで演奏\n下段 Z S X D C V G B H N J M（C4〜B4）／ 上段 Q 2 W 3 E R 5 T 6 Y 7 U I（C5〜C6）",
    en: "Play by clicking or with your computer keyboard\nLower row Z S X D C V G B H N J M (C4–B4) / upper row Q 2 W 3 E R 5 T 6 Y 7 U I (C5–C6)",
  },
};
