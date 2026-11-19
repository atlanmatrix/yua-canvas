import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  MoonStar,
  Sun,
} from "lucide-react";
import { RotateCw, Search, X } from "./icons";
import { locale, t as tr, usePreferences } from "./i18n";
import { readToolCache, saveToolCache, toolJson } from "./toolData";
import type { ToolState } from "./tools";

type WeatherData = {
  current: {
    temperature_2m: number;
    weather_code: number;
    is_day: number;
    time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    is_day: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
};
type City = {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
};

const hourStamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const dayStamp = /^\d{4}-\d{2}-\d{2}$/;
function validSeries(series: any, dates: RegExp, fields: string[]) {
  return (
    Array.isArray(series?.time) &&
    series.time.every(
      (time: unknown) =>
        typeof time === "string" &&
        dates.test(time) &&
        Number.isFinite(Date.parse(time)),
    ) &&
    fields.every(
      (key) =>
        Array.isArray(series[key]) &&
        series[key].length === series.time.length &&
        series[key].every(Number.isFinite),
    )
  );
}
function firstHour(data: WeatherData) {
  // Both timestamps use the city's local clock, including across midnight.
  return data.hourly.time.indexOf(data.current.time.slice(0, 13) + ":00");
}
function validWeather(data: any): data is WeatherData {
  if (
    !Number.isFinite(data?.current?.temperature_2m) ||
    !Number.isFinite(data.current.weather_code) ||
    ![0, 1].includes(data.current.is_day) ||
    typeof data.current.time !== "string" ||
    !hourStamp.test(data.current.time) ||
    !validSeries(data.hourly, hourStamp, [
      "temperature_2m",
      "weather_code",
      "is_day",
    ]) ||
    !validSeries(data.daily, dayStamp, [
      "temperature_2m_min",
      "temperature_2m_max",
      "weather_code",
    ])
  )
    return false;
  const start = firstHour(data);
  return (
    start >= 0 &&
    data.hourly.time.length >= start + 6 &&
    data.daily.time.length >= 6 &&
    data.daily.time[0] === data.current.time.slice(0, 10)
  );
}
function condition(code: number, day: number) {
  if (code === 0) return { name: "晴", Icon: day ? Sun : MoonStar };
  if (code === 1) return { name: "大部晴朗", Icon: day ? Sun : MoonStar };
  if (code === 2) return { name: "局部多云", Icon: day ? CloudSun : CloudMoon };
  if (code === 3) return { name: "阴", Icon: Cloud };
  if (code <= 48) return { name: "雾", Icon: CloudFog };
  if (code <= 67) return { name: "雨", Icon: CloudRain };
  if (code <= 77) return { name: "雪", Icon: CloudSnow };
  if (code <= 82) return { name: "阵雨", Icon: CloudRain };
  if (code <= 86) return { name: "阵雪", Icon: CloudSnow };
  return { name: "雷暴", Icon: CloudLightning };
}
const degrees = (temperature: number) => Math.round(temperature) + "°";

function Forecast({
  data,
  showDaily,
}: {
  data: WeatherData;
  showDaily: boolean;
}) {
  const { current, hourly, daily } = data;
  const start = firstHour(data);
  const { name, Icon } = condition(current.weather_code, current.is_day);
  const low = Math.min(...daily.temperature_2m_min.slice(1, 6));
  const high = Math.max(...daily.temperature_2m_max.slice(1, 6));
  const weekday = new Intl.DateTimeFormat(locale(), {
    weekday: "short",
    timeZone: "UTC",
  });
  return (
    <>
      <div className="weather-current">
        <strong>{degrees(current.temperature_2m)}</strong>
        <div className="weather-summary">
          <span>
            <Icon size={18} />
            {tr(name)}
          </span>
          <span>
            {tr(
              "最高 {0} · 最低 {1}",
              degrees(daily.temperature_2m_max[0]),
              degrees(daily.temperature_2m_min[0]),
            )}
          </span>
        </div>
      </div>
      <div
        className="weather-hourly"
        role="group"
        aria-label={tr("逐小时预报")}
      >
        {hourly.time.slice(start, start + 6).map((time, i) => {
          const index = start + i;
          const { name, Icon } = condition(
            hourly.weather_code[index],
            hourly.is_day[index],
          );
          return (
            <div key={index}>
              <time dateTime={time}>{time.slice(11, 13)}</time>
              <Icon size={18} role="img" aria-label={tr(name)} />
              <strong>{degrees(hourly.temperature_2m[index])}</strong>
            </div>
          );
        })}
      </div>
      {showDaily && (
        <div
          className="weather-daily"
          role="group"
          aria-label={tr("未来五天预报")}
        >
          {daily.time.slice(1, 6).map((date, i) => {
            const index = i + 1;
            const min = daily.temperature_2m_min[index],
              max = daily.temperature_2m_max[index];
            const { name, Icon } = condition(daily.weather_code[index], 1);
            return (
              <div key={date}>
                <time dateTime={date}>{weekday.format(new Date(date))}</time>
                <Icon size={16} role="img" aria-label={tr(name)} />
                <span>{degrees(min)}</span>
                <div className="weather-range" aria-hidden="true">
                  <i
                    style={{
                      left:
                        high === low
                          ? "50%"
                          : ((min - low) / (high - low)) * 100 + "%",
                      right:
                        high === low
                          ? "50%"
                          : ((high - max) / (high - low)) * 100 + "%",
                    }}
                  />
                </div>
                <strong>{degrees(max)}</strong>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
export function WeatherTool({
  value,
  change,
  showDaily,
}: {
  value: ToolState;
  change: (next: Partial<ToolState>) => void;
  showDaily: boolean;
}) {
  const { language } = usePreferences();
  const [choosingCity, setChoosingCity] = useState(false);
  const [query, setQuery] = useState(""),
    [cities, setCities] = useState<City[]>([]),
    [searchError, setSearchError] = useState(""),
    [searching, setSearching] = useState(false);
  const [data, setData] = useState<WeatherData>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, refresh] = useState(0),
    [saved, setSaved] = useState(0);
  const searchController = useRef<AbortController>(undefined);
  const lat = value.latitude ?? 39.9042,
    lon = value.longitude ?? 116.4074;
  useEffect(() => () => searchController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(),
      key = `weather:${lat.toFixed(3)}:${lon.toFixed(3)}`,
      stored = readToolCache<WeatherData>(key),
      cached = validWeather(stored?.data) ? stored : undefined;
    setData(cached?.data);
    setSaved(cached?.saved || 0);
    setError("");
    if (!revision && cached && Date.now() - cached.saved < 1800000) {
      setLoading(false);
      return;
    }
    setLoading(true);
    toolJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=6&timezone=auto`,
      controller.signal,
    )
      .then((data) => {
        if (!validWeather(data)) throw Error("天气数据无效");
        if (!controller.signal.aborted) {
          const cache = saveToolCache(key, data);
          setData(data);
          setSaved(cache.saved);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            cached ? "离线缓存，数据可能已过期" : "暂时无法获取天气，请重试",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [lat, lon, revision]);
  const search = async () => {
    if (!query.trim()) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearchError("");
    setCities([]);
    try {
      const data = await toolJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=${language}&format=json`,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        const cities: City[] = (data.results || []).filter(
          (city: City) =>
            typeof city.name === "string" &&
            Number.isFinite(city.latitude) &&
            Math.abs(city.latitude) <= 90 &&
            Number.isFinite(city.longitude) &&
            Math.abs(city.longitude) <= 180,
        );
        setCities(cities);
        if (!cities.length) setSearchError("未找到城市");
      }
    } catch {
      if (!controller.signal.aborted) setSearchError("城市搜索失败，请重试");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };
  const closeSearch = () => {
    searchController.current?.abort();
    setChoosingCity(false);
    setSearching(false);
    setSearchError("");
    setCities([]);
    setQuery("");
  };
  return (
    <>
      {choosingCity ? (
        <>
          <form
            className="weather-search"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              autoFocus
              aria-label={tr("搜索城市")}
              placeholder={tr("搜索城市")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={120}
            />
            <button aria-label={tr("查找城市")} disabled={searching}>
              <Search size={16} />
            </button>
            <button type="button" aria-label={tr("关闭")} onClick={closeSearch}>
              <X size={16} />
            </button>
          </form>
          {searchError && (
            <p className="tool-error" role="status">
              {tr(searchError)}
            </p>
          )}
          {cities.length > 0 && (
            <div className="weather-cities">
              {cities.map((city) => (
                <button
                  key={city.id}
                  onClick={() => {
                    change({
                      city: [city.name, city.country]
                        .filter(Boolean)
                        .join(", "),
                      latitude: city.latitude,
                      longitude: city.longitude,
                    });
                    closeSearch();
                  }}
                >
                  {[city.name, city.admin1, city.country]
                    .filter(Boolean)
                    .join(" · ")}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="weather-location">
            <button
              aria-label={tr("搜索城市")}
              title={tr("搜索城市")}
              onClick={() => setChoosingCity(true)}
            >
              <strong>{value.city || tr("北京")}</strong>
              <Search size={13} />
            </button>
            <button
              aria-label={tr("刷新天气")}
              disabled={loading}
              onClick={() => refresh((n) => n + 1)}
            >
              <RotateCw size={14} motionBusy={loading} />
            </button>
          </div>
          {data && <Forecast data={data} showDaily={showDaily} />}
        </>
      )}
      <div className="weather-footer">
        <span role="status">
          {loading
            ? tr("正在更新…")
            : error
              ? tr(error)
              : saved
                ? tr(
                    "更新于 {0}",
                    new Date(saved).toLocaleTimeString(locale(), {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  )
                : ""}
        </span>
        <a
          className="tool-attribution"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open-Meteo · CC BY 4.0
        </a>
      </div>
    </>
  );
}
