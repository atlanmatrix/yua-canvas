import { memo, useEffect, useRef, useState } from "react";
import {
  Calculator,
  ArrowLeftRight,
  Thermometer,
  Ruler,
  CloudSun,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Search,
  Delete,
} from "lucide-react";
import type { Card } from "./storage";
import { PreviewBoundary } from "./PreviewBoundary";
import {
  TOOL_NAMES,
  CURRENCIES,
  DISTANCES,
  calculate,
  numberText,
  toolState,
  type ToolKind,
  type ToolState,
} from "./tools";
import { readToolCache, saveToolCache, toolJson } from "./toolData";
import { t as tr, locale, usePreferences } from "./i18n";
export const TOOL_ICONS = {
  calculator: Calculator,
  currency: ArrowLeftRight,
  temperature: Thermometer,
  distance: Ruler,
  weather: CloudSun,
  calendar: CalendarDays,
};
type Change = (next: Partial<ToolState>) => void;
const unitNames: Record<string, string> = {
  mm: "毫米",
  cm: "厘米",
  m: "米",
  km: "千米",
  in: "英寸",
  ft: "英尺",
  yd: "码",
  mi: "英里",
  nmi: "海里",
  C: "摄氏度",
  F: "华氏度",
};
function CalculatorTool({
  value,
  change,
}: {
  value: ToolState;
  change: Change;
}) {
  const [error, setError] = useState("");
  const expression = value.expression || "";
  const run = () => {
    try {
      const result = numberText(calculate(expression));
      change({
        expression: result,
        history: [`${expression} = ${result}`, ...(value.history || [])].slice(
          0,
          5,
        ),
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "表达式无效");
    }
  };
  const append = (key: string) => {
    change({
      expression:
        key === "AC"
          ? ""
          : key === "⌫"
            ? expression.slice(0, -1)
            : expression + key,
    });
    setError("");
  };
  return (
    <>
      <input
        className="calculator-display"
        aria-label={tr("计算表达式")}
        value={expression}
        placeholder="0"
        maxLength={2000}
        spellCheck={false}
        onChange={(e) => {
          change({ expression: e.target.value });
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            run();
          }
        }}
      />
      {error && (
        <p role="alert" className="tool-error">
          {tr(error)}
        </p>
      )}
      <div className="calculator-keys">
        {[
          "AC",
          "(",
          ")",
          "÷",
          "7",
          "8",
          "9",
          "×",
          "4",
          "5",
          "6",
          "−",
          "1",
          "2",
          "3",
          "+",
          "⌫",
          "0",
          ".",
          "=",
        ].map((key) => (
          <button
            key={key}
            className={key === "=" ? "primary" : ""}
            aria-label={
              key === "⌫" ? tr("退格") : key === "AC" ? tr("清空") : key
            }
            onClick={() => (key === "=" ? run() : append(key))}
          >
            {key === "⌫" ? <Delete size={16} /> : key}
          </button>
        ))}
      </div>
      <div className="calculator-history" aria-label={tr("计算历史")}>
        {value.history?.slice(0, 3).map((entry, i) => (
          <div key={i}>{entry}</div>
        ))}
      </div>
    </>
  );
}
type Rates = { base: string; date: string; rates: Record<string, number> };
function validRates(data: any, base: string): data is Rates {
  return (
    !!data &&
    data.base === base &&
    /^\d{4}-\d{2}-\d{2}$/.test(data.date) &&
    !!data.rates &&
    typeof data.rates === "object" &&
    !Array.isArray(data.rates) &&
    Object.values(data.rates).every(
      (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
    )
  );
}
function Converter({
  kind,
  value,
  change,
}: {
  kind: "currency" | "temperature" | "distance";
  value: ToolState;
  change: Change;
}) {
  const units =
    kind === "currency"
      ? CURRENCIES
      : kind === "temperature"
        ? ["C", "F"]
        : Object.keys(DISTANCES);
  const from =
      value.from ||
      (kind === "currency" ? "USD" : kind === "temperature" ? "C" : "m"),
    to =
      value.to ||
      (kind === "currency" ? "CNY" : kind === "temperature" ? "F" : "km");
  const [rates, setRates] = useState<Rates>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [stale, setStale] = useState(false),
    [revision, refresh] = useState(0);
  useEffect(() => {
    if (kind !== "currency") return;
    const controller = new AbortController(),
      key = "rates:" + from,
      stored = readToolCache<Rates>(key),
      cached = validRates(stored?.data, from) ? stored : undefined;
    setRates(cached?.data);
    setError("");
    setStale(!!cached);
    if (!revision && cached && Date.now() - cached.saved < 3600000) {
      setStale(false);
      return;
    }
    setLoading(true);
    toolJson(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}`,
      controller.signal,
    )
      .then((data) => {
        if (!validRates(data, from)) throw Error("汇率数据无效");
        if (!controller.signal.aborted) {
          saveToolCache(key, data);
          setRates(data);
          setStale(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(
            cached ? "离线缓存，数据可能已过期" : "暂时无法获取汇率，请重试",
          );
          setStale(!!cached);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, from, revision]);
  const amount = value.amount ?? "1",
    numeric = amount.trim() ? Number(amount) : NaN;
  const rate =
    from === to ? 1 : rates?.base === from ? rates.rates[to] : undefined;
  const result = !Number.isFinite(numeric)
    ? NaN
    : kind === "temperature"
      ? from === to
        ? numeric
        : from === "C"
          ? (numeric * 9) / 5 + 32
          : ((numeric - 32) * 5) / 9
      : kind === "distance"
        ? (numeric * DISTANCES[from as keyof typeof DISTANCES]) /
          DISTANCES[to as keyof typeof DISTANCES]
        : rate === undefined
          ? NaN
          : numeric * rate;
  const label = (unit: string) =>
    unitNames[unit]
      ? `${tr(unitNames[unit])} (${unit === "C" || unit === "F" ? "°" : ""}${unit})`
      : unit;
  return (
    <>
      <label className="tool-field">
        {tr("数值")}
        <input
          aria-label={tr("数值")}
          type="number"
          step="any"
          value={amount}
          onChange={(e) => change({ amount: e.target.value })}
        />
      </label>
      <div className="conversion-units">
        <label>
          {tr("从")}
          <select
            aria-label={tr("原始单位")}
            value={from}
            onChange={(e) => change({ from: e.target.value })}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {label(unit)}
              </option>
            ))}
          </select>
        </label>
        <button
          title={tr("交换单位")}
          aria-label={tr("交换单位")}
          onClick={() => change({ from: to, to: from })}
        >
          <ArrowLeftRight size={17} />
        </button>
        <label>
          {tr("到")}
          <select
            aria-label={tr("目标单位")}
            value={to}
            onChange={(e) => change({ to: e.target.value })}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {label(unit)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <output className="conversion-result" aria-label={tr("转换结果")}>
        {numberText(result)}{" "}
        <small>{to === "C" || to === "F" ? "°" + to : to}</small>
      </output>
      {kind === "currency" && (
        <div className="tool-data-status">
          <span>
            {loading
              ? tr("正在更新…")
              : error
                ? tr(error)
                : rates
                  ? tr("汇率日期：{0}", rates.date)
                  : ""}
            {stale && !error ? tr("（缓存）") : ""}
          </span>
          <button
            aria-label={tr("刷新汇率")}
            disabled={loading}
            onClick={() => refresh((n) => n + 1)}
          >
            <RotateCw size={14} />
          </button>
          <a
            href="https://frankfurter.dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            Frankfurter / ECB
          </a>
        </div>
      )}
    </>
  );
}
type WeatherData = {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    time: string;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  timezone: string;
};
type City = {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
};
function validWeather(data: any): data is WeatherData {
  const current = data?.current,
    daily = data?.daily;
  return (
    !!current &&
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
    ].every(
      (key) =>
        typeof current[key] === "number" && Number.isFinite(current[key]),
    ) &&
    Array.isArray(daily?.time) &&
    daily.time.length > 0 &&
    daily.time.length <= 14 &&
    daily.time.every(
      (date: unknown) =>
        typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date),
    ) &&
    [daily.temperature_2m_max, daily.temperature_2m_min].every(
      (values) =>
        Array.isArray(values) &&
        values.length === daily.time.length &&
        values.every(
          (v: unknown) => typeof v === "number" && Number.isFinite(v),
        ),
    )
  );
}
const weatherName = (code: number) =>
  code === 0
    ? "晴"
    : code <= 3
      ? "多云"
      : code <= 48
        ? "雾"
        : code <= 67
          ? "雨"
          : code <= 77
            ? "雪"
            : code <= 82
              ? "阵雨"
              : code <= 86
                ? "阵雪"
                : "雷暴";
function WeatherTool({ value, change }: { value: ToolState; change: Change }) {
  const { language } = usePreferences();
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
    if (!revision && cached && Date.now() - cached.saved < 1800000) return;
    setLoading(true);
    toolJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto`,
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
  return (
    <>
      <form
        className="weather-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label={tr("搜索城市")}
          placeholder={tr("搜索城市")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={120}
        />
        <button aria-label={tr("查找城市")} disabled={searching}>
          <Search size={16} />
        </button>
      </form>
      {searchError && (
        <p className="tool-error" role="status">
          {tr(searchError)}
        </p>
      )}
      {cities.length > 0 ? (
        <div className="weather-cities">
          {cities.map((city) => (
            <button
              key={city.id}
              onClick={() => {
                change({
                  city: [city.name, city.country].filter(Boolean).join(", "),
                  latitude: city.latitude,
                  longitude: city.longitude,
                });
                setCities([]);
                setQuery("");
              }}
            >
              {[city.name, city.admin1, city.country]
                .filter(Boolean)
                .join(" · ")}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="weather-location">
            <strong>{value.city || tr("北京")}</strong>
            <button
              aria-label={tr("刷新天气")}
              disabled={loading}
              onClick={() => refresh((n) => n + 1)}
            >
              <RotateCw size={14} />
            </button>
          </div>
          {data && (
            <>
              <div className="weather-current">
                <CloudSun size={35} />
                <strong>{numberText(data.current.temperature_2m)}°</strong>
                <span>{tr(weatherName(data.current.weather_code))}</span>
              </div>
              <div className="weather-details">
                <span>
                  {tr(
                    "体感 {0}°",
                    numberText(data.current.apparent_temperature),
                  )}
                </span>
                <span>
                  {tr("湿度 {0}%", data.current.relative_humidity_2m)}
                </span>
                <span>{tr("风速 {0} km/h", data.current.wind_speed_10m)}</span>
              </div>
              <div className="weather-forecast">
                {data.daily.time.map((date, i) => (
                  <div key={date}>
                    <span>
                      {new Intl.DateTimeFormat(locale(), {
                        weekday: "short",
                      }).format(new Date(date + "T12:00:00"))}
                    </span>
                    <strong>
                      {Math.round(data.daily.temperature_2m_max[i])}°
                    </strong>
                    <span>{Math.round(data.daily.temperature_2m_min[i])}°</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="tool-data-status" role="status">
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
          </p>
        </>
      )}
      <a
        className="tool-attribution"
        href="https://open-meteo.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open-Meteo · CC BY 4.0
      </a>
    </>
  );
}
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function CalendarTool({ value, change }: { value: ToolState; change: Change }) {
  const today = new Date(),
    currentMonth = value.month || dateKey(today).slice(0, 7),
    [year, month] = currentMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1),
    offset = (first.getDay() + 6) % 7,
    days = new Date(year, month, 0).getDate();
  const shift = (by: number) => {
    const next = new Date(year, month - 1 + by, 1);
    if (next.getFullYear() >= 1900 && next.getFullYear() <= 9999)
      change({ month: dateKey(next).slice(0, 7) });
  };
  return (
    <>
      <div className="calendar-heading">
        <button aria-label={tr("上个月")} onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </button>
        <strong aria-live="polite">
          {new Intl.DateTimeFormat(locale(), {
            year: "numeric",
            month: "long",
          }).format(first)}
        </strong>
        <button aria-label={tr("下个月")} onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="calendar-grid" role="grid" aria-label={tr("月历")}>
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={"day" + i}
            className="calendar-weekday"
            role="columnheader"
          >
            {new Intl.DateTimeFormat(locale(), { weekday: "narrow" }).format(
              new Date(2024, 0, i + 1),
            )}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"empty" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = `${currentMonth}-${String(i + 1).padStart(2, "0")}`;
          return (
            <button
              key={key}
              role="gridcell"
              aria-label={key}
              aria-selected={value.selected === key}
              aria-current={key === dateKey(today) ? "date" : undefined}
              onClick={() => change({ selected: key })}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="calendar-footer">
        <span>{value.selected || dateKey(today)}</span>
        <button
          onClick={() =>
            change({
              month: dateKey(today).slice(0, 7),
              selected: dateKey(today),
            })
          }
        >
          {tr("今天")}
        </button>
      </div>
    </>
  );
}
const Content = memo(function ToolContent({
  card,
  onChange,
}: {
  card: Card;
  onChange?: (text: string) => void;
}) {
  usePreferences();
  const [value, setValue] = useState(() => toolState(card.text)),
    latest = useRef(value);
  useEffect(() => {
    const next = toolState(card.text);
    latest.current = next;
    setValue(next);
  }, [card.text]);
  const change: Change = (next) => {
    const updated = { ...latest.current, ...next };
    latest.current = updated;
    setValue(updated);
    onChange?.(JSON.stringify(updated));
  };
  const kind = card.kind as ToolKind,
    Icon = TOOL_ICONS[kind];
  return (
    <section
      className={`tool-component tool-${kind}`}
      aria-label={tr(TOOL_NAMES[kind])}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header className="tool-heading">
        <Icon size={17} />
        <strong>{tr(TOOL_NAMES[kind])}</strong>
      </header>
      <div
        className="tool-body"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onWheel={(e) => {
          if (e.currentTarget.scrollHeight > e.currentTarget.clientHeight)
            e.stopPropagation();
        }}
      >
        {kind === "calculator" ? (
          <CalculatorTool value={value} change={change} />
        ) : kind === "weather" ? (
          <WeatherTool value={value} change={change} />
        ) : kind === "calendar" ? (
          <CalendarTool value={value} change={change} />
        ) : (
          <Converter kind={kind} value={value} change={change} />
        )}
      </div>
    </section>
  );
});
export function ToolCard(props: {
  card: Card;
  onChange?: (text: string) => void;
}) {
  return (
    <PreviewBoundary allowTiny>
      <Content {...props} />
    </PreviewBoundary>
  );
}
