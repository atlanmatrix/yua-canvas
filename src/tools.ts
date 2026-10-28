export const TOOL_KINDS = [
  "calculator",
  "currency",
  "temperature",
  "distance",
  "weather",
  "calendar",
] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
export const TOOL_NAMES: Record<ToolKind, string> = {
  calculator: "计算器",
  currency: "汇率计算",
  temperature: "摄氏度 / 华氏度",
  distance: "距离单位转换",
  weather: "天气",
  calendar: "日历",
};
export const isToolKind = (kind: string): kind is ToolKind =>
  (TOOL_KINDS as readonly string[]).includes(kind);
export type ToolState = {
  expression?: string;
  history?: string[];
  amount?: string;
  from?: string;
  to?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  month?: string;
  selected?: string;
};
export const CURRENCIES = [
  "USD",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "HKD",
  "AUD",
  "CAD",
  "CHF",
  "SGD",
  "KRW",
  "NZD",
  "INR",
  "THB",
  "MYR",
  "IDR",
  "PHP",
  "BRL",
  "MXN",
  "ZAR",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "TRY",
  "ILS",
  "ISK",
];
export const DISTANCES = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
  nmi: 1852,
};
export function toolState(text: string): ToolState {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
export function validToolText(kind: ToolKind, text: unknown): boolean {
  if (typeof text !== "string" || text.length > 16000) return false;
  let state: ToolState;
  try {
    state = JSON.parse(text);
  } catch {
    return false;
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  if (
    Object.keys(state).some(
      (k) =>
        ![
          "expression",
          "history",
          "amount",
          "from",
          "to",
          "city",
          "latitude",
          "longitude",
          "month",
          "selected",
        ].includes(k),
    )
  )
    return false;
  for (const key of [
    "expression",
    "amount",
    "city",
    "month",
    "selected",
  ] as const)
    if (
      state[key] !== undefined &&
      (typeof state[key] !== "string" || state[key]!.length > 2000)
    )
      return false;
  if (
    state.history !== undefined &&
    (!Array.isArray(state.history) ||
      state.history.length > 8 ||
      state.history.some((s) => typeof s !== "string" || s.length > 2500))
  )
    return false;
  if (
    state.latitude !== undefined &&
    (!Number.isFinite(state.latitude) || Math.abs(state.latitude) > 90)
  )
    return false;
  if (
    state.longitude !== undefined &&
    (!Number.isFinite(state.longitude) || Math.abs(state.longitude) > 180)
  )
    return false;
  const units =
    kind === "currency"
      ? CURRENCIES
      : kind === "distance"
        ? Object.keys(DISTANCES)
        : kind === "temperature"
          ? ["C", "F"]
          : [];
  if ([state.from, state.to].some((v) => v !== undefined && !units.includes(v)))
    return false;
  if (state.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(state.month))
    return false;
  if (
    state.selected !== undefined &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(state.selected) ||
      !Number.isFinite(Date.parse(state.selected)))
  )
    return false;
  return true;
}
export const numberText = (value: number) =>
  Number.isFinite(value) ? Number(value.toPrecision(12)).toString() : "—";

// Small expression parser: pasted expressions never execute JavaScript.
export function calculate(input: string): number {
  const source = input
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replaceAll("π", "pi")
    .toLowerCase();
  if (source.length > 2000) throw Error("表达式过长");
  const tokens =
    source.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+*/%^\-]|\S/g,
    ) || [];
  let at = 0,
    depth = 0;
  const primary = (): number => {
    if (++depth > 80) throw Error("表达式过深");
    let value: number;
    const token = tokens[at++];
    if (token === "(") {
      value = expression();
      if (tokens[at++] !== ")") throw Error("缺少右括号");
    } else if (token === "pi" || token === "e")
      value = token === "pi" ? Math.PI : Math.E;
    else if (/^(sqrt|abs|sin|cos|tan|log|ln)$/.test(token || "")) {
      if (tokens[at++] !== "(") throw Error("函数需要括号");
      const arg = expression();
      if (tokens[at++] !== ")") throw Error("缺少右括号");
      const functions: Record<string, (n: number) => number> = {
        sqrt: Math.sqrt,
        abs: Math.abs,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        log: Math.log10,
        ln: Math.log,
      };
      value = functions[token](arg);
    } else if (/^(?:\d|\.)/.test(token || "")) value = Number(token);
    else throw Error("表达式无效");
    while (tokens[at] === "%") {
      at++;
      value /= 100;
    }
    depth--;
    return value;
  };
  const power = (): number => {
    const left = primary();
    return tokens[at] === "^" ? (at++, left ** unary()) : left;
  };
  const unary = (): number =>
    tokens[at] === "+"
      ? (at++, unary())
      : tokens[at] === "-"
        ? (at++, -unary())
        : power();
  const term = (): number => {
    let value = unary();
    while (["*", "/"].includes(tokens[at])) {
      const op = tokens[at++],
        right = unary();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const expression = (): number => {
    let value = term();
    while (["+", "-"].includes(tokens[at])) {
      const op = tokens[at++],
        right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = expression();
  if (at !== tokens.length || !Number.isFinite(value))
    throw Error("无法计算，请检查表达式");
  return value;
}
