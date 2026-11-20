import { FullContentExportContext } from "./ExportPreviewContext";
import { memo, useContext, useEffect, useRef, useState } from "react";
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
  Delete,
} from "./icons";
import { GameCard, GAME_ICONS } from "./GameCard";
import { isGameKind, type GameKind } from "./relaxGames";
import { WeatherTool } from "./WeatherTool";
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
  ...GAME_ICONS,
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
const basicKeyRows = [
  ["AC", "(", ")", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["⌫", "0", ".", "="],
];
const scientificKeyRows = [
  ["sin", "cos"],
  ["tan", "√"],
  ["log", "ln"],
  ["x²", "xʸ"],
  ["π", "e"],
];
const scientificTokens: Record<string, string> = {
  sin: "sin(",
  cos: "cos(",
  tan: "tan(",
  "√": "sqrt(",
  log: "log(",
  ln: "ln(",
  "x²": "^2",
  xʸ: "^",
};

function CalculatorTool({
  value,
  change,
  scientific,
}: {
  value: ToolState;
  change: Change;
  scientific: boolean;
}) {
  const full = useContext(FullContentExportContext);
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
            : (expression + (scientificTokens[key] ?? key)).slice(0, 2000),
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
      <div
        className={
          scientific ? "calculator-keys scientific-keys" : "calculator-keys"
        }
      >
        {basicKeyRows
          .flatMap((row, i) =>
            scientific ? [...scientificKeyRows[i], ...row] : row,
          )
          .map((key) => (
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
        {(full ? value.history : value.history?.slice(0, 3))?.map(
          (entry, i) => (
            <div key={i}>{entry}</div>
          ),
        )}
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
            <RotateCw size={14} motionBusy={loading} />
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
  const kind = card.kind as Exclude<ToolKind, GameKind>,
    Icon = TOOL_ICONS[kind];
  const large =
    card.displayMode === "large" ||
    (card.displayMode === "custom" && card.customSize?.base === "large");
  const scientific = kind === "calculator" && large;
  const title = tr(scientific ? "科学计算器" : TOOL_NAMES[kind]);
  return (
    <section
      className={`tool-component tool-${kind}`}
      aria-label={title}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header className="tool-heading">
        <Icon size={17} />
        <strong>{title}</strong>
        {scientific && (
          <span className="calculator-angle" title={tr("弧度")}>
            RAD
          </span>
        )}
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
          <CalculatorTool
            value={value}
            change={change}
            scientific={scientific}
          />
        ) : kind === "weather" ? (
          <WeatherTool value={value} change={change} showDaily={large} />
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
      {isGameKind(props.card.kind) ? (
        <GameCard kind={props.card.kind} text={props.card.text} onChange={props.onChange} />
      ) : <Content {...props} />}
    </PreviewBoundary>
  );
}
