import { syncNavQuery } from "./nav";

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
type Place = { name: string; latitude: number; longitude: number };
type Sky = "clear" | "cloudy" | "drizzle" | "rain" | "snow" | "thunder";

const FALLBACK: Place = { name: "東京（位置情報なし）", latitude: 35.68, longitude: 139.77 };
const HERE = "here";

// 場所のプルダウンの選択肢。地域ごとに見出しを付ける。HERE はブラウザの位置情報を使う
const CITIES: Record<string, Place & { group: string }> = {
  sapporo: { group: "日本", name: "札幌", latitude: 43.06, longitude: 141.35 },
  tokyo: { group: "日本", name: "東京", latitude: 35.68, longitude: 139.77 },
  naha: { group: "日本", name: "那覇", latitude: 26.21, longitude: 127.68 },
  seoul: { group: "東アジア", name: "ソウル", latitude: 37.57, longitude: 126.98 },
  beijing: { group: "東アジア", name: "北京", latitude: 39.9, longitude: 116.41 },
  shanghai: { group: "東アジア", name: "上海", latitude: 31.23, longitude: 121.47 },
  taipei: { group: "東アジア", name: "台北", latitude: 25.03, longitude: 121.57 },
  hongkong: { group: "東アジア", name: "香港", latitude: 22.32, longitude: 114.17 },
  bangkok: { group: "東南アジア", name: "バンコク", latitude: 13.76, longitude: 100.5 },
  singapore: { group: "東南アジア", name: "シンガポール", latitude: 1.35, longitude: 103.82 },
  jakarta: { group: "東南アジア", name: "ジャカルタ", latitude: -6.21, longitude: 106.85 },
  denpasar: { group: "東南アジア", name: "デンパサール（バリ島）", latitude: -8.65, longitude: 115.22 },
  mumbai: { group: "南アジア", name: "ムンバイ", latitude: 19.08, longitude: 72.88 },
  delhi: { group: "南アジア", name: "デリー", latitude: 28.61, longitude: 77.21 },
  istanbul: { group: "中東・アフリカ", name: "イスタンブール", latitude: 41.01, longitude: 28.98 },
  dubai: { group: "中東・アフリカ", name: "ドバイ", latitude: 25.2, longitude: 55.27 },
  cairo: { group: "中東・アフリカ", name: "カイロ", latitude: 30.04, longitude: 31.24 },
  nairobi: { group: "中東・アフリカ", name: "ナイロビ", latitude: -1.29, longitude: 36.82 },
  london: { group: "ヨーロッパ", name: "ロンドン", latitude: 51.51, longitude: -0.13 },
  paris: { group: "ヨーロッパ", name: "パリ", latitude: 48.86, longitude: 2.35 },
  berlin: { group: "ヨーロッパ", name: "ベルリン", latitude: 52.52, longitude: 13.4 },
  rome: { group: "ヨーロッパ", name: "ローマ", latitude: 41.9, longitude: 12.5 },
  madrid: { group: "ヨーロッパ", name: "マドリード", latitude: 40.42, longitude: -3.7 },
  reykjavik: { group: "ヨーロッパ", name: "レイキャビク", latitude: 64.15, longitude: -21.94 },
  newyork: { group: "北アメリカ", name: "ニューヨーク", latitude: 40.71, longitude: -74.01 },
  losangeles: { group: "北アメリカ", name: "ロサンゼルス", latitude: 34.05, longitude: -118.24 },
  mexicocity: { group: "北アメリカ", name: "メキシコシティ", latitude: 19.43, longitude: -99.13 },
  vancouver: { group: "北アメリカ", name: "バンクーバー", latitude: 49.28, longitude: -123.12 },
  saopaulo: { group: "南アメリカ", name: "サンパウロ", latitude: -23.55, longitude: -46.63 },
  buenosaires: { group: "南アメリカ", name: "ブエノスアイレス", latitude: -34.6, longitude: -58.38 },
  lima: { group: "南アメリカ", name: "リマ", latitude: -12.05, longitude: -77.04 },
  sydney: { group: "オセアニア", name: "シドニー", latitude: -33.87, longitude: 151.21 },
  auckland: { group: "オセアニア", name: "オークランド", latitude: -36.85, longitude: 174.76 },
};
const REFRESH_MS = 15 * 60 * 1000;

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

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

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

function locate(): Promise<Place> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(FALLBACK);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ name: "現在地", latitude: p.coords.latitude, longitude: p.coords.longitude }),
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

// 天気スイッチがオンの間、15 分ごとに天気を取り直して onMood に渡す。オフにすると null を渡す。
// 場所の選択は URL (?place=…) に残し、ページを移っても引き継ぐ
export function setupWeather(
  toggleEl: HTMLInputElement,
  placeEl: HTMLSelectElement,
  statusEl: HTMLElement,
  onMood: (mood: Mood | null) => void,
) {
  placeEl.append(new Option("現在地", HERE));
  for (const group of new Set(Object.values(CITIES).map((c) => c.group))) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    for (const [id, city] of Object.entries(CITIES)) if (city.group === group) optgroup.append(new Option(city.name, id));
    placeEl.append(optgroup);
  }
  const placeParam = new URLSearchParams(location.search).get("place");
  placeEl.value = placeParam && placeParam in CITIES ? placeParam : HERE;

  let timer: number | undefined;
  let here: Promise<Place> | undefined; // 位置情報の許可ダイアログを何度も出さないよう、1 回だけ取る

  const refresh = async () => {
    statusEl.textContent = "取得中…";
    try {
      const p = placeEl.value === HERE ? await (here ??= locate()) : CITIES[placeEl.value];
      const c = await fetchCurrent(p);
      if (!toggleEl.checked) return;
      const mood = moodOf(c);
      statusEl.textContent =
        `${p.name} ${mood.icon} ${Math.round(c.temperature_2m)}℃ ` +
        `降水${c.precipitation}mm 風${Math.round(c.wind_speed_10m)}km/h 雲${c.cloud_cover}%`;
      onMood(mood);
    } catch {
      statusEl.textContent = "天気を取得できませんでした";
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
    clearInterval(timer);
    if (toggleEl.checked) {
      refresh();
      timer = setInterval(refresh, REFRESH_MS);
    } else {
      statusEl.textContent = "";
      onMood(null);
    }
  });
}
