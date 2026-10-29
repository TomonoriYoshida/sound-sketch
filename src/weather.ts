import { clamp01 } from "./math";
import { syncNavQuery } from "./nav";
import { fillGroupedSelect } from "./select";
import { getLang, type L, onLangChange, t } from "./i18n";

// Open-Meteo（API キー不要）から現在地の天気を取り、音のパラメータに変換する。
// 天気 → スケール、気温 → 速さ、降水量 → 密度、風速 → ばらつき、雲量 → リバーブの深さ

export type Mood = {
  scaleId: string;
  icon: string;
  speed: number; // 0.75（寒い）〜1.25（暑い）。1 が標準
  density: number; // 1（降水なし）〜4（強い雨）
  spread: number; // 0（無風）〜1（強風）
  wetness: number; // 0（快晴）〜1（曇天）
};

// 天気をオフにしているときの値。各ページの元の挙動と一致するようにしてある
export const NEUTRAL_MOOD: Omit<Mood, "scaleId" | "icon"> = { speed: 1, density: 1, spread: 1 / 3, wetness: 0.5 };

type Current = {
  temperature_2m: number;
  weather_code: number;
  precipitation: number;
  wind_speed_10m: number;
  cloud_cover: number;
};
type Place = { name: L; latitude: number; longitude: number };
type Sky = "clear" | "cloudy" | "drizzle" | "rain" | "snow" | "thunder";

const FALLBACK: Place = {
  name: { ja: "東京（位置情報なし）", en: "Tokyo (no location)" },
  latitude: 35.68,
  longitude: 139.77,
};
const HERE = "here";
const HERE_NAME: L = { ja: "現在地", en: "Current location" };

// 地域の見出し。group は日本語のまま識別子として使う
const GROUP_NAMES: Record<string, L> = {
  日本: { ja: "日本", en: "Japan" },
  東アジア: { ja: "東アジア", en: "East Asia" },
  東南アジア: { ja: "東南アジア", en: "Southeast Asia" },
  南アジア: { ja: "南アジア", en: "South Asia" },
  "中東・アフリカ": { ja: "中東・アフリカ", en: "Middle East & Africa" },
  ヨーロッパ: { ja: "ヨーロッパ", en: "Europe" },
  北アメリカ: { ja: "北アメリカ", en: "North America" },
  南アメリカ: { ja: "南アメリカ", en: "South America" },
  オセアニア: { ja: "オセアニア", en: "Oceania" },
};

const LOADING: L = { ja: "取得中…", en: "Loading…" };
const FAILED: L = { ja: "天気を取得できませんでした", en: "Couldn't get the weather" };

function formatStatus(place: Place, mood: Mood, c: Current): string {
  const name = t(place.name);
  const temp = Math.round(c.temperature_2m);
  const wind = Math.round(c.wind_speed_10m);
  return getLang() === "ja"
    ? `${name} ${mood.icon} ${temp}℃ 降水${c.precipitation}mm 風${wind}km/h 雲${c.cloud_cover}%`
    : `${name} ${mood.icon} ${temp}°C rain ${c.precipitation}mm wind ${wind}km/h cloud ${c.cloud_cover}%`;
}

// 場所のプルダウンの選択肢。地域ごとに見出しを付ける。HERE はブラウザの位置情報を使う
const CITIES: Record<string, Place & { group: string }> = {
  sapporo: { group: "日本", name: { ja: "札幌", en: "Sapporo" }, latitude: 43.06, longitude: 141.35 },
  tokyo: { group: "日本", name: { ja: "東京", en: "Tokyo" }, latitude: 35.68, longitude: 139.77 },
  naha: { group: "日本", name: { ja: "那覇", en: "Naha" }, latitude: 26.21, longitude: 127.68 },
  seoul: { group: "東アジア", name: { ja: "ソウル", en: "Seoul" }, latitude: 37.57, longitude: 126.98 },
  beijing: { group: "東アジア", name: { ja: "北京", en: "Beijing" }, latitude: 39.9, longitude: 116.41 },
  shanghai: { group: "東アジア", name: { ja: "上海", en: "Shanghai" }, latitude: 31.23, longitude: 121.47 },
  taipei: { group: "東アジア", name: { ja: "台北", en: "Taipei" }, latitude: 25.03, longitude: 121.57 },
  hongkong: { group: "東アジア", name: { ja: "香港", en: "Hong Kong" }, latitude: 22.32, longitude: 114.17 },
  bangkok: { group: "東南アジア", name: { ja: "バンコク", en: "Bangkok" }, latitude: 13.76, longitude: 100.5 },
  singapore: { group: "東南アジア", name: { ja: "シンガポール", en: "Singapore" }, latitude: 1.35, longitude: 103.82 },
  jakarta: { group: "東南アジア", name: { ja: "ジャカルタ", en: "Jakarta" }, latitude: -6.21, longitude: 106.85 },
  denpasar: { group: "東南アジア", name: { ja: "デンパサール（バリ島）", en: "Denpasar (Bali)" }, latitude: -8.65, longitude: 115.22 },
  mumbai: { group: "南アジア", name: { ja: "ムンバイ", en: "Mumbai" }, latitude: 19.08, longitude: 72.88 },
  delhi: { group: "南アジア", name: { ja: "デリー", en: "Delhi" }, latitude: 28.61, longitude: 77.21 },
  istanbul: { group: "中東・アフリカ", name: { ja: "イスタンブール", en: "Istanbul" }, latitude: 41.01, longitude: 28.98 },
  dubai: { group: "中東・アフリカ", name: { ja: "ドバイ", en: "Dubai" }, latitude: 25.2, longitude: 55.27 },
  cairo: { group: "中東・アフリカ", name: { ja: "カイロ", en: "Cairo" }, latitude: 30.04, longitude: 31.24 },
  nairobi: { group: "中東・アフリカ", name: { ja: "ナイロビ", en: "Nairobi" }, latitude: -1.29, longitude: 36.82 },
  london: { group: "ヨーロッパ", name: { ja: "ロンドン", en: "London" }, latitude: 51.51, longitude: -0.13 },
  paris: { group: "ヨーロッパ", name: { ja: "パリ", en: "Paris" }, latitude: 48.86, longitude: 2.35 },
  berlin: { group: "ヨーロッパ", name: { ja: "ベルリン", en: "Berlin" }, latitude: 52.52, longitude: 13.4 },
  rome: { group: "ヨーロッパ", name: { ja: "ローマ", en: "Rome" }, latitude: 41.9, longitude: 12.5 },
  madrid: { group: "ヨーロッパ", name: { ja: "マドリード", en: "Madrid" }, latitude: 40.42, longitude: -3.7 },
  reykjavik: { group: "ヨーロッパ", name: { ja: "レイキャビク", en: "Reykjavík" }, latitude: 64.15, longitude: -21.94 },
  newyork: { group: "北アメリカ", name: { ja: "ニューヨーク", en: "New York" }, latitude: 40.71, longitude: -74.01 },
  losangeles: { group: "北アメリカ", name: { ja: "ロサンゼルス", en: "Los Angeles" }, latitude: 34.05, longitude: -118.24 },
  mexicocity: { group: "北アメリカ", name: { ja: "メキシコシティ", en: "Mexico City" }, latitude: 19.43, longitude: -99.13 },
  vancouver: { group: "北アメリカ", name: { ja: "バンクーバー", en: "Vancouver" }, latitude: 49.28, longitude: -123.12 },
  saopaulo: { group: "南アメリカ", name: { ja: "サンパウロ", en: "São Paulo" }, latitude: -23.55, longitude: -46.63 },
  buenosaires: { group: "南アメリカ", name: { ja: "ブエノスアイレス", en: "Buenos Aires" }, latitude: -34.6, longitude: -58.38 },
  lima: { group: "南アメリカ", name: { ja: "リマ", en: "Lima" }, latitude: -12.05, longitude: -77.04 },
  sydney: { group: "オセアニア", name: { ja: "シドニー", en: "Sydney" }, latitude: -33.87, longitude: 151.21 },
  auckland: { group: "オセアニア", name: { ja: "オークランド", en: "Auckland" }, latitude: -36.85, longitude: 174.76 },
};
const REFRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000; // 取得に失敗したときは、早めに取り直す

const SKY: Record<Sky, { icon: string; scale: (temp: number) => string }> = {
  clear: { icon: "☀", scale: (temp) => (temp >= 20 ? "ryukyu" : "lydian") },
  cloudy: { icon: "☁", scale: () => "ritsu" },
  drizzle: { icon: "☂", scale: () => "minyo" },
  rain: { icon: "☔", scale: () => "miyako" },
  snow: { icon: "❄", scale: () => "slendro" },
  thunder: { icon: "⚡", scale: () => "hijaz" },
};

// WMO の天気コードを大まかな空模様に分ける
function skyOf(code: number): Sky {
  if (code <= 1) return "clear";
  if (code <= 48) return "cloudy"; // 曇り・霧
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain"; // にわか雨
  if (code <= 86) return "snow"; // にわか雪
  return "thunder";
}

function moodOf(c: Current): Mood {
  const sky = SKY[skyOf(c.weather_code)];
  return {
    scaleId: sky.scale(c.temperature_2m),
    icon: sky.icon,
    speed: 0.75 + 0.5 * clamp01((c.temperature_2m + 5) / 40),
    density: 1 + Math.min(c.precipitation, 6) * 0.5,
    spread: clamp01(c.wind_speed_10m / 30),
    wetness: clamp01(c.cloud_cover / 100),
  };
}

const roundCoord = (v: number) => Math.round(v * 100) / 100;

function locate(): Promise<Place> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(FALLBACK);
    navigator.geolocation.getCurrentPosition(
      // 天気を調べるには約 1 km の精度で足りるので、細かい位置を外部に送らないよう小数点以下 2 桁に丸める
      (p) =>
        resolve({
          name: HERE_NAME,
          latitude: roundCoord(p.coords.latitude),
          longitude: roundCoord(p.coords.longitude),
        }),
      () => resolve(FALLBACK),
      { timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

async function fetchCurrent(place: Place): Promise<Current> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,weather_code,precipitation,wind_speed_10m,cloud_cover",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).current;
}

// 天気スイッチがオンの間、15 分ごと（取得に失敗したときは 1 分後）に天気を取り直して onMood に渡す。オフにすると null を渡す。
// 場所の選択は URL (?place=…) に残し、ページを移っても引き継ぐ
export function setupWeather(
  toggleEl: HTMLInputElement,
  placeEl: HTMLSelectElement,
  statusEl: HTMLElement,
  onMood: (mood: Mood | null) => void,
) {
  fillGroupedSelect(
    placeEl,
    [
      { value: HERE, name: HERE_NAME },
      ...Object.entries(CITIES).map(([id, city]) => ({ value: id, group: city.group, name: city.name })),
    ],
    GROUP_NAMES,
  );
  const placeParam = new URLSearchParams(location.search).get("place");
  placeEl.value = placeParam && placeParam in CITIES ? placeParam : HERE;

  let timer: number | undefined;
  let here: Promise<Place> | undefined; // 位置情報の許可ダイアログを何度も出さないよう、1 回だけ取る
  // 状態表示の中身。言語を切り替えたときに、取り直さずに表示だけ作り直す
  let status: { kind: "none" } | { kind: "text"; text: L } | { kind: "weather"; place: Place; mood: Mood; c: Current } =
    { kind: "none" };

  const renderStatus = () => {
    if (status.kind === "none") statusEl.textContent = "";
    else if (status.kind === "text") statusEl.textContent = t(status.text);
    else statusEl.textContent = formatStatus(status.place, status.mood, status.c);
  };
  const setStatus = (next: typeof status) => {
    status = next;
    renderStatus();
  };

  onLangChange(renderStatus);

  // 取りに行くたびに番号を振り、最新の番号の結果だけを使う。場所を素早く切り替えたときに古い結果が後から届いても、
  // 天気をオフにしたあとに結果や失敗が届いても、無視する
  let latestRequest = 0;

  // 取れたら 15 分後、失敗したら 1 分後に、次を取りに行く
  const refresh = async () => {
    const request = ++latestRequest;
    const isCurrent = () => request === latestRequest && toggleEl.checked;
    clearTimeout(timer);
    setStatus({ kind: "text", text: LOADING });
    try {
      const p = placeEl.value === HERE ? await (here ??= locate()) : CITIES[placeEl.value];
      const c = await fetchCurrent(p);
      if (!isCurrent()) return;
      const mood = moodOf(c);
      setStatus({ kind: "weather", place: p, mood, c });
      onMood(mood);
      timer = setTimeout(refresh, REFRESH_MS);
    } catch {
      if (!isCurrent()) return;
      setStatus({ kind: "text", text: FAILED });
      timer = setTimeout(refresh, RETRY_MS);
    }
  };

  placeEl.addEventListener("change", () => {
    const url = new URL(location.href);
    if (placeEl.value === HERE) url.searchParams.delete("place");
    else url.searchParams.set("place", placeEl.value);
    history.replaceState(null, "", url);
    syncNavQuery();
    if (toggleEl.checked) refresh();
  });

  toggleEl.addEventListener("change", () => {
    clearTimeout(timer);
    if (toggleEl.checked) {
      refresh();
    } else {
      latestRequest++;
      setStatus({ kind: "none" });
      onMood(null);
    }
  });
}
