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

// 場所のプルダウンの選択肢。HERE はブラウザの位置情報を使う
const CITIES: Record<string, Place> = {
  sapporo: { name: "札幌", latitude: 43.06, longitude: 141.35 },
  sendai: { name: "仙台", latitude: 38.27, longitude: 140.87 },
  tokyo: { name: "東京", latitude: 35.68, longitude: 139.77 },
  yokohama: { name: "横浜", latitude: 35.44, longitude: 139.64 },
  nagoya: { name: "名古屋", latitude: 35.18, longitude: 136.91 },
  kanazawa: { name: "金沢", latitude: 36.56, longitude: 136.66 },
  kyoto: { name: "京都", latitude: 35.01, longitude: 135.77 },
  osaka: { name: "大阪", latitude: 34.69, longitude: 135.5 },
  hiroshima: { name: "広島", latitude: 34.39, longitude: 132.46 },
  takamatsu: { name: "高松", latitude: 34.34, longitude: 134.05 },
  fukuoka: { name: "福岡", latitude: 33.59, longitude: 130.4 },
  kagoshima: { name: "鹿児島", latitude: 31.6, longitude: 130.56 },
  naha: { name: "那覇", latitude: 26.21, longitude: 127.68 },
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
  for (const [id, city] of Object.entries(CITIES)) placeEl.append(new Option(city.name, id));
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
