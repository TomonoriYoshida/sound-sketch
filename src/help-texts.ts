import type { L } from "./i18n";

// 説明文。キーは対象のコントロールを指すセレクタ。
// 現在のページへのナビのリンク（a[aria-current="page"]）には、そのページの遊び方を書く。

export type HelpText = { title: L; text: L };

const PAGE_GUIDE = '.nav a[aria-current="page"]';

// キャンバスのページの遊び方の最後に足す、バーの隠れ方の説明
const BAR_NOTE: L = {
  ja: "上のバーは、演奏を始めてから 3 秒操作しないと隠れます。左上の「≡」か H キーで戻せます。",
  en: " The top bar hides after 3 seconds without interaction once you start playing. Bring it back with “≡” at the top left or the H key.",
};

const withBarNote = (text: L): L => ({ ja: text.ja + BAR_NOTE.ja, en: text.en + BAR_NOTE.en });

// Ripples / Phase / Loops に共通のコントロール
export const HELP_COMMON: Record<string, HelpText> = {
  "#settings-toggle": {
    title: { ja: "設定", en: "Settings" },
    text: {
      ja: "スケールや天気などの設定パネルを開け閉めします。パネルを開いたままでも演奏できます。パネル右上の「×」か Esc でも閉じます。",
      en: "Opens and closes the settings panel for scale, weather and more. You can keep playing while it is open. The “×” at its top right or Esc also closes it.",
    },
  },
  '[data-section="sound"] h2': {
    title: { ja: "音", en: "Sound" },
    text: {
      ja: "音の高さと、自動で鳴る音の多さの設定です。",
      en: "Settings for pitch and for how many sounds are placed automatically.",
    },
  },
  '[data-section="weather"] h2': {
    title: { ja: "天気", en: "Weather" },
    text: {
      ja: "選んだ場所の今の天気で、音を変える設定です。",
      en: "Settings for shaping the sound by the current weather at a chosen place.",
    },
  },
  '[data-section="drift"] h2': {
    title: { ja: "変化", en: "Drift" },
    text: {
      ja: "何分もかけて、音がゆっくり移り変わるようにする設定です。",
      en: "Settings for letting the sound slowly evolve over many minutes.",
    },
  },
  '[data-section="auto"] h2': {
    title: { ja: "自動", en: "Auto" },
    text: {
      ja: "操作しなくても、音がひとりでに置かれて鳴り続けるようにする設定です。",
      en: "Settings for letting sounds place themselves and keep playing without you.",
    },
  },
  "#scale": {
    title: { ja: "スケール", en: "Scale" },
    text: {
      ja: "音の高さの選び方（音階）です。日本、中国、中近東、インド、バリ島、西洋から選べます。四分音やガムランの調律のように、ピアノの鍵盤にない音を含むものもあります。",
      en: "The set of pitches to use. Choose from Japan, China, the Middle East, India, Bali and the West. Some include notes that a piano can't play, such as quarter tones or gamelan tunings.",
    },
  },
  "#root": {
    title: { ja: "主音", en: "Root" },
    text: {
      ja: "スケールの基準になる音です。変えると、曲全体の高さが移ります（転調）。",
      en: "The base note of the scale. Changing it shifts the whole piece (a key change).",
    },
  },
  "#register": {
    title: { ja: "音域", en: "Register" },
    text: {
      ja: "画面に割り当てる音の高さの範囲です。1 で 1 オクターブ低く、5 で 1 オクターブ高くなります。3 が標準です。",
      en: "The pitch range mapped to the screen. 1 is an octave lower, 5 is an octave higher, and 3 is the default.",
    },
  },
  "#density": {
    title: { ja: "密度", en: "Density" },
    text: {
      ja: "自動で音が置かれる頻度です。1 でまばらに、5 で多くなります。手でクリックして置く分には影響しません。",
      en: "How often sounds are placed automatically. 1 is sparse, 5 is busy. It doesn't affect what you place by clicking.",
    },
  },
  "#weather": {
    title: { ja: "天気", en: "Weather" },
    text: {
      ja: "オンにすると、選んだ場所の今の天気で音が変わります。天気でスケール、気温で速さ、雨で音の多さ、風でずれ方、雲で響きの深さが決まります。15 分ごとに更新します。",
      en: "When on, the current weather at the chosen place shapes the sound: the sky picks the scale, temperature the speed, rain the density, wind the spread and clouds the reverb depth. Updates every 15 minutes.",
    },
  },
  "#place": {
    title: { ja: "場所", en: "Place" },
    text: {
      ja: "天気を取る場所です。「現在地」はブラウザの位置情報を使います。許可しない場合は東京の天気を使います。",
      en: "Where to get the weather from. “Current location” uses your browser's location; if you don't allow it, Tokyo's weather is used.",
    },
  },
  "#drift": {
    title: { ja: "変化", en: "Drift" },
    text: {
      ja: "オンにすると、音域・密度・音色の明るさ・響きが何分もかけてゆっくり揺れ、20 分ごとに 5 度上へ転調します。",
      en: "When on, register, density, brightness and reverb sway slowly over many minutes, and the key moves up a fifth every 20 minutes.",
    },
  },
  "#drift-speed": {
    title: { ja: "変化の速さ", en: "Drift speed" },
    text: {
      ja: "変化が進む速さです。×60 にすると、1 時間分の変化を 1 分で聴けます。",
      en: "How fast the drift advances. At ×60 you hear an hour of change in one minute.",
    },
  },
};

export const HELP_BY_PAGE: Record<string, Record<string, HelpText>> = {
  keyboard: {
    [PAGE_GUIDE]: {
      title: { ja: "Keyboard の使い方", en: "How to use Keyboard" },
      text: {
        ja: "Tone.js の音源やエフェクトを試す場所です。鍵盤をクリックするか、PC キーボード（下段 Z〜M、上段 Q〜I）で弾けます。",
        en: "A place to try Tone.js instruments and effects. Click the keys or play with your computer keyboard (lower row Z–M, upper row Q–I).",
      },
    },
    "#instrument": {
      title: { ja: "音源", en: "Instrument" },
      text: {
        ja: "音を作る仕組みを選びます。Worklet（自作）は、自作の処理で 1 サンプルずつ波形を計算する音源です。",
        en: "Chooses how the sound is generated. Worklet (custom) computes the waveform sample by sample with our own code.",
      },
    },
    "#waveform": {
      title: { ja: "波形", en: "Waveform" },
      text: {
        ja: "音のもとになる波の形です。sine は柔らかく、sawtooth は明るく派手な音になります。PluckSynth では使えません。",
        en: "The shape of the underlying wave. sine is soft, sawtooth is bright and buzzy. Not available for PluckSynth.",
      },
    },
    "#volume": { title: { ja: "音量", en: "Volume" }, text: { ja: "全体の音量です。", en: "Overall volume." } },
    "#reverb": {
      title: { ja: "リバーブ", en: "Reverb" },
      text: { ja: "響き（残響）の深さです。", en: "How much reverberation is added." },
    },
    "#transpose": {
      title: { ja: "トランスポーズ", en: "Transpose" },
      text: {
        ja: "鳴る音の高さを半音単位でずらします。鍵盤の見た目は変わりません。",
        en: "Shifts the sounding pitch in semitones. The on-screen keys stay the same.",
      },
    },
    "#octave": {
      title: { ja: "オクターブ", en: "Octave" },
      text: { ja: "鳴る音の高さを 1 オクターブ単位でずらします。", en: "Shifts the sounding pitch in octaves." },
    },
    "#fx-distortion": { title: { ja: "Distortion", en: "Distortion" }, text: { ja: "音を歪ませます。", en: "Distorts the sound." } },
    "#fx-chorus": {
      title: { ja: "Chorus", en: "Chorus" },
      text: { ja: "音を揺らして厚みを出します。", en: "Adds width by gently wobbling the sound." },
    },
    "#fx-delay": {
      title: { ja: "Delay", en: "Delay" },
      text: { ja: "音を 8 分音符の間隔で繰り返します。", en: "Repeats the sound every eighth note." },
    },
  },
  ripples: {
    [PAGE_GUIDE]: {
      title: { ja: "Ripples の遊び方", en: "How to play Ripples" },
      text: withBarNote({
        ja: "クリックした場所から波紋が広がり、画面の端や別の波紋にぶつかると音が鳴ります。鳴るタイミングは 16 分音符に揃うので、どこをクリックしてもリズムが崩れません。画面の上ほど高い音です。",
        en: "Ripples spread from where you click and make sounds when they hit the screen edge or each other. Notes snap to sixteenth notes, so the rhythm holds wherever you click. Higher on the screen means higher pitch.",
      }),
    },
    "#auto": {
      title: { ja: "自動", en: "Auto" },
      text: {
        ja: "オンにすると、平均 4 秒ごとに波紋がひとりでに生まれます。",
        en: "When on, a ripple appears by itself about every 4 seconds.",
      },
    },
    "#clear": {
      title: { ja: "クリア", en: "Clear" },
      text: { ja: "画面上の波紋をすべて消します。", en: "Removes all ripples." },
    },
  },
  phase: {
    [PAGE_GUIDE]: {
      title: { ja: "Phase の遊び方", en: "How to play Phase" },
      text: withBarNote({
        ja: "クリックした場所に音の種を置くと、種が自分の周期で鳴り続けます。縦の位置で音の高さ、横の位置で周期が決まり、周期がわずかに違う種どうしは少しずつずれていきます（スティーヴ・ライヒのフェイジング）。",
        en: "Click to plant a seed that keeps sounding at its own period. Height sets the pitch and horizontal position the period, so seeds with slightly different periods slowly drift apart (Steve Reich's phasing).",
      }),
    },
    '[data-section="loop"] h2': {
      title: { ja: "ループ", en: "Loop" },
      text: {
        ja: "種がどう鳴るかの設定です。音数・テンポ・フレーズを作り直すは、種類が「フレーズ」のときだけ効きます。",
        en: "Settings for how seeds sound. Notes, Tempo and New phrase only apply when Type is “Phrase”.",
      },
    },
    "#mode": {
      title: { ja: "ループ", en: "Loop type" },
      text: {
        ja: "単音は 1 周に 1 音を鳴らします。フレーズは、すべての種が同じフレーズを鳴らします。同じ高さで横に少し離して 2 つ置くと、『Piano Phase』のようなずれが聴けます。",
        en: "Single note plays one note per cycle. Phrase makes every seed play the same phrase. Place two seeds at the same height, slightly apart, to hear Piano Phase–style drifting.",
      },
    },
    "#phrase-length": {
      title: { ja: "音数", en: "Notes" },
      text: {
        ja: "フレーズの音の数です。変えると、新しいフレーズを作ります。",
        en: "The number of notes in the phrase. Changing it creates a new phrase.",
      },
    },
    "#phrase-tempo": {
      title: { ja: "テンポ", en: "Tempo" },
      text: {
        ja: "フレーズの速さ（1 分あたりの音数）です。置いてある種にもすぐ効きます。",
        en: "Phrase speed in notes per minute. Applies to existing seeds immediately.",
      },
    },
    "#phrase-new": {
      title: { ja: "フレーズを作り直す", en: "New phrase" },
      text: {
        ja: "新しいフレーズをランダムに作ります。置いてある種も、次の周から新しいフレーズで鳴ります。",
        en: "Creates a new random phrase. Existing seeds switch to it from their next cycle.",
      },
    },
    "#fade": {
      title: { ja: "減衰", en: "Fade out" },
      text: {
        ja: "オンにすると、種は鳴るたびに少しずつ弱まり、16 回鳴ると消えます。オフにすると鳴り続けます。",
        en: "When on, seeds get quieter each time and disappear after 16 plays. When off, they play forever.",
      },
    },
    "#auto": {
      title: { ja: "自動", en: "Auto" },
      text: {
        ja: "オンにすると、しばらく操作がないときに種がひとりでに置かれます。",
        en: "When on, seeds are planted by themselves after a while without interaction.",
      },
    },
    "#clear": {
      title: { ja: "クリア", en: "Clear" },
      text: { ja: "置いてある種をすべて消します。", en: "Removes all seeds." },
    },
  },
  sonata: {
    [PAGE_GUIDE]: {
      title: { ja: "Sonata の遊び方", en: "How to play Sonata" },
      text: withBarNote({
        ja: "作曲家がピアノソナタを書いたら、という試みです。作曲家ごとに独立した 3 楽章のソナタで、曲そのものは引用せず、作り方だけを借りています。楽章はそれぞれ数分の流れ（始まり・盛り上がり・終わり）を持ち、I → II → III と続けて鳴ります。演奏中にクリックすると、その高さの音が音楽に加わります。",
        en: "What if these composers wrote a piano sonata? Each composer has an independent three-movement sonata that borrows their methods, not their pieces. Each movement has its own few-minute arc and they play I → II → III in turn. Click while it plays to add a note at that height.",
      }),
    },
    "#composer": {
      title: { ja: "作曲家", en: "Composer" },
      text: {
        ja: "どの作曲家のソナタを鳴らすかです。一柳慧: I. 反復のずれ（両手の長さの違う型がずれていき、頭がそろって終わる）、II. 間（偶然で決めた音と長い沈黙）、III. トッカータ（1 音ずつ伸びる速い旋律が、広がりながら加速する）。スティーヴ・ライヒ: I. フェイズ（両手が同じ型を弾き、片方が 1 音ずつ前へずれて、12 回でまたそろう）、II. 脈動する和音（刻み続ける和音が息の長さでふくらんで消え、少しずつ移って最初の和音に帰る）、III. 積み上げ（休符を 1 つずつ音に置き換え、ずらした位置で別の手も同じ型を積み、最後は休符に戻す）。",
        en: "Whose sonata to play. Toshi Ichiyanagi: I. Shifting repetitions (two hands' patterns of different lengths drift apart and end when their starts meet), II. Ma (chance notes and long silences), III. Toccata (a fast line grows one note at a time, widening and speeding up). Steve Reich: I. Phase (both hands play the same pattern; one creeps ahead a note at a time until they meet again after 12 shifts), II. Pulsing chords (repeated chords swell and fade over a breath, moving step by step back to the first chord), III. Build-up (rests become notes one at a time, other hands build the same pattern at an offset, then it thins back to rests).",
      },
    },
    "#movement": {
      title: { ja: "楽章", en: "Movement" },
      text: {
        ja: "今の楽章です。選ぶと、その楽章の始めから鳴らします。そこから先の楽章も続けて鳴ります。",
        en: "The current movement. Choosing one plays it from the start, and the following movements continue after it.",
      },
    },
    "#restart": {
      title: { ja: "最初から", en: "From the top" },
      text: { ja: "ソナタを I 楽章の始めから鳴らし直します。", en: "Plays the sonata again from the start of movement I." },
    },
    '[data-section="repeat"] h2': {
      title: { ja: "反復", en: "Repetition" },
      text: {
        ja: "速い楽章の刻みの設定です。",
        en: "Settings for the pulse of the fast movements.",
      },
    },
    "#tempo": {
      title: { ja: "テンポ", en: "Tempo" },
      text: {
        ja: "4 分音符の速さです。一柳慧の I と III、ライヒの I は 16 分音符、ライヒの II と III は 8 分音符で刻みます。天気を使うと、気温でさらに速くなったり遅くなったりします。",
        en: "Quarter-note tempo. Ichiyanagi I and III and Reich I move in sixteenths, Reich II and III in eighths. With weather on, temperature makes it faster or slower.",
      },
    },
  },
  loops: {
    [PAGE_GUIDE]: {
      title: { ja: "Loops の遊び方", en: "How to play Loops" },
      text: withBarNote({
        ja: "クリックした場所にテープループを置きます。縦の位置で音の高さ、横の位置でループの長さ（15〜35 秒）が決まります。長さの違うループが重なるので、同じ響きはほとんど二度と来ません（ブライアン・イーノ『Music for Airports』の手法）。ループの中心をクリックすると外せます。",
        en: "Click to place a tape loop. Height sets the pitch and horizontal position the loop length (15–35 s). Loops of different lengths overlap, so the same harmony almost never returns (the technique of Brian Eno's Music for Airports). Click a loop's center to remove it.",
      }),
    },
    "#density": {
      title: { ja: "密度", en: "Density" },
      text: {
        ja: "自動で音が置かれる頻度です。1 でまばらに、5 で多くなります。Loops では、自動で置くループの上限本数（4〜10 本）も変わります。",
        en: "How often sounds are placed automatically. 1 is sparse, 5 is busy. In Loops it also sets how many loops can be placed automatically (4–10).",
      },
    },
    "#record": {
      title: { ja: "録音", en: "Record" },
      text: {
        ja: "押してからクリックで演奏し、「停止」を押すと、そのフレーズが録音した長さのループになります。最短 4 秒で、40 秒か 16 音に達すると自動で止まります。",
        en: "Press it, play by clicking, then press “Stop” to turn the phrase into a loop of the recorded length. Loops are at least 4 s, and recording stops automatically at 40 s or 16 notes.",
      },
    },
    "#auto": {
      title: { ja: "自動", en: "Auto" },
      text: {
        ja: "オンにすると、しばらく操作がないときに 1 音のループがひとりでに置かれます。",
        en: "When on, single-note loops are placed by themselves after a while without interaction.",
      },
    },
    "#clear": {
      title: { ja: "クリア", en: "Clear" },
      text: { ja: "置いてあるループをすべて消します。", en: "Removes all loops." },
    },
  },
};
