"use strict";

// ---------- Persistence (best effort: storage can be blocked) ----------

const STORAGE = {
  history: "calc.history",
  mode: "calc.mode",
  theme: "calc.theme",
  angle: "calc.angle",
  memory: "calc.memory",
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: the calculator works fine without storage.
  }
}

// ---------- State ----------
// The expression is a list of tokens:
//   { t: "num", v: "12.5", fixed? }  fixed = came from a result, not typed
//   { t: "op", v: "+" | "-" | "*" | "/" | "^" | "mod" }
//   { t: "func", v: "sin" }          a function name plus its opening "("
//   { t: "lp" } / { t: "rp" }        parentheses
//   { t: "const", v: "pi" | "e" | "ans" }
//   { t: "post", v: "fact" | "sq" | "cube" | "inv" | "pct" }

const state = {
  tokens: [],
  justEvaluated: false,
  error: null,
  lastAnswer: 0,
  memory: load(STORAGE.memory, null),
  angle: load(STORAGE.angle, "deg"),
  second: false,
  history: load(STORAGE.history, []),
};

// ---------- Math ----------

class CalcError extends Error {}

const toRad = (x) => (state.angle === "deg" ? (x * Math.PI) / 180 : x);
const fromRad = (x) => (state.angle === "deg" ? (x * 180) / Math.PI : x);
// sin(180°) is 1.2e-16 in floating point; call that 0.
const snap = (x) => (Math.abs(x) < 1e-12 ? 0 : x);

const OPS = {
  "+": " + ",
  "-": " − ",
  "*": " × ",
  "/": " ÷ ",
  "^": "^",
  mod: " mod ",
};

const FUNCS = {
  sin: { label: "sin", run: (x) => snap(Math.sin(toRad(x))) },
  cos: { label: "cos", run: (x) => snap(Math.cos(toRad(x))) },
  tan: {
    label: "tan",
    run: (x) => {
      if (state.angle === "deg" && Math.abs(x % 180) === 90) throw new CalcError("Undefined");
      return snap(Math.tan(toRad(x)));
    },
  },
  asin: { label: "sin⁻¹", run: (x) => fromRad(Math.asin(x)) },
  acos: { label: "cos⁻¹", run: (x) => fromRad(Math.acos(x)) },
  atan: { label: "tan⁻¹", run: (x) => fromRad(Math.atan(x)) },
  ln: { label: "ln", run: Math.log },
  log: { label: "log", run: Math.log10 },
  sqrt: { label: "√", run: Math.sqrt },
  cbrt: { label: "∛", run: Math.cbrt },
  abs: { label: "abs", run: Math.abs },
};

const CONSTS = {
  pi: { label: "π", value: () => Math.PI },
  e: { label: "e", value: () => Math.E },
  ans: { label: "Ans", value: () => state.lastAnswer },
};

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) throw new CalcError("Factorial needs a whole number ≥ 0");
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

const POSTFIX = {
  fact: { label: "!", run: factorial },
  sq: { label: "²", run: (x) => x * x },
  cube: { label: "³", run: (x) => x ** 3 },
  inv: { label: "⁻¹", run: (x) => 1 / x },
  pct: { label: "%", run: (x) => x / 100 },
};

// Recursive-descent parser. Precedence, lowest to highest:
//   + −  →  × ÷ mod (and implicit, e.g. 2π)  →  unary −  →  ^  →  ! ² %  →  numbers, ( ), functions
function evaluate(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (tk, ...ops) => tk && tk.t === "op" && ops.includes(tk.v);
  const startsValue = (tk) => tk && ["num", "const", "func", "lp"].includes(tk.t);
  const incomplete = () => {
    throw new CalcError("Incomplete expression");
  };

  function expr() {
    let v = term();
    while (isOp(peek(), "+", "-")) {
      const op = tokens[i++].v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  function term() {
    let v = unary();
    for (;;) {
      const tk = peek();
      if (isOp(tk, "*", "/", "mod")) {
        i++;
        const r = unary();
        if (tk.v === "*") v *= r;
        else if (r === 0) throw new CalcError("Can't divide by zero");
        else if (tk.v === "/") v /= r;
        else v = ((v % r) + r) % r;
      } else if (startsValue(tk)) {
        v *= unary();
      } else {
        return v;
      }
    }
  }

  function unary() {
    if (isOp(peek(), "-", "+")) {
      const op = tokens[i++].v;
      const v = unary();
      return op === "-" ? -v : v;
    }
    return power();
  }

  function power() {
    const base = postfix();
    if (isOp(peek(), "^")) {
      i++;
      return base ** unary();
    }
    return base;
  }

  function postfix() {
    let v = primary();
    while (peek() && peek().t === "post") v = POSTFIX[tokens[i++].v].run(v);
    return v;
  }

  function primary() {
    const tk = tokens[i++];
    if (!tk) incomplete();
    if (tk.t === "num") {
      const v = parseFloat(tk.v);
      if (Number.isNaN(v)) incomplete();
      return v;
    }
    if (tk.t === "const") return CONSTS[tk.v].value();
    if (tk.t === "lp" || tk.t === "func") {
      const v = expr();
      // A missing ")" at the very end is closed automatically.
      if (peek() && peek().t === "rp") i++;
      else if (peek()) incomplete();
      return tk.t === "func" ? FUNCS[tk.v].run(v) : v;
    }
    incomplete();
  }

  const result = expr();
  if (i < tokens.length) incomplete();
  return result;
}

function tidy(n) {
  return parseFloat(n.toPrecision(12));
}

// ---------- Formatting ----------

const SUPERSCRIPT = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };

function groupDigits(str) {
  const negative = str.startsWith("-");
  const [intPart, decPart] = (negative ? str.slice(1) : str).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "−" : "") + grouped + (decPart !== undefined ? "." + decPart : "");
}

function formatNumber(n) {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
    const [mantissa, exp] = n.toExponential(9).split("e");
    const m = mantissa.replace(/\.?0+$/, "").replace("-", "−");
    return m + "×10" + String(Number(exp)).replace(/./g, (c) => SUPERSCRIPT[c]);
  }
  return groupDigits(String(tidy(n)));
}

const formatNumToken = (v) => (v.includes("e") ? formatNumber(parseFloat(v)) : groupDigits(v));
const numToken = (n) => ({ t: "num", v: String(tidy(n)), fixed: true });
const isUnaryPosition = (prev) => !prev || ["op", "lp", "func"].includes(prev.t);

function tokenLabel(tk, prev) {
  switch (tk.t) {
    case "num":
      return formatNumToken(tk.v);
    case "op":
      return tk.v === "-" && isUnaryPosition(prev) ? "−" : OPS[tk.v];
    case "func":
      return FUNCS[tk.v].label + "(";
    case "lp":
      return "(";
    case "rp":
      return ")";
    case "const":
      return CONSTS[tk.v].label;
    case "post":
      return POSTFIX[tk.v].label;
  }
  return "";
}

const expressionText = (tokens) => tokens.map((tk, i) => tokenLabel(tk, tokens[i - 1])).join("");

// ---------- Input ----------

const last = () => state.tokens[state.tokens.length - 1];
const endsValue = (tk) => tk && ["num", "const", "rp", "post"].includes(tk.t);
const push = (tk) => state.tokens.push(tk);

function openParens() {
  let n = 0;
  for (const tk of state.tokens) {
    if (tk.t === "lp" || tk.t === "func") n++;
    else if (tk.t === "rp") n--;
  }
  return n;
}

// Runs before every edit. After "=", digits start fresh while operators
// carry the answer forward (e.g. "= then × 2").
function beginInput(keepResult) {
  state.error = null;
  if (state.justEvaluated) {
    state.justEvaluated = false;
    state.tokens = keepResult ? [numToken(state.lastAnswer)] : [];
  }
}

// Starts a new value, inserting × when it follows another value (2π, 3(4), …).
function pushValue(tk) {
  if (endsValue(last())) push({ t: "op", v: "*" });
  push(tk);
}

function inputDigit(d) {
  beginInput(false);
  const tk = last();
  if (tk && tk.t === "num" && !tk.fixed) {
    if (tk.v.replace(/[-.]/g, "").length >= 15) return;
    if (tk.v === "0") tk.v = d;
    else if (tk.v === "-0") tk.v = "-" + d;
    else tk.v += d;
  } else {
    pushValue({ t: "num", v: d });
  }
}

function inputDecimal() {
  beginInput(false);
  const tk = last();
  if (tk && tk.t === "num" && !tk.fixed) {
    if (!tk.v.includes(".")) tk.v += ".";
  } else {
    pushValue({ t: "num", v: "0." });
  }
}

function inputOperator(op) {
  beginInput(true);
  const tk = last();
  if (!tk) {
    if (op !== "-") push({ t: "num", v: "0" });
    push({ t: "op", v: op });
    return;
  }
  if (tk.t === "op") {
    // Allow a negative sign after an operator: 2 × −3.
    if (op === "-" && tk.v !== "-") return push({ t: "op", v: "-" });
    while (last() && last().t === "op") state.tokens.pop();
    if (endsValue(last()) || op === "-") push({ t: "op", v: op });
    return;
  }
  if (tk.t === "lp" || tk.t === "func") {
    if (op === "-") push({ t: "op", v: "-" });
    return;
  }
  push({ t: "op", v: op });
}

function inputFunc(name) {
  beginInput(false);
  pushValue({ t: "func", v: name });
}

function inputConst(name) {
  beginInput(false);
  pushValue({ t: "const", v: name });
}

function inputPostfix(name) {
  beginInput(true);
  if (endsValue(last())) push({ t: "post", v: name });
}

const COMMANDS = {
  ".": inputDecimal,
  "(": () => {
    beginInput(false);
    pushValue({ t: "lp" });
  },
  ")": () => {
    beginInput(false);
    if (openParens() > 0 && endsValue(last())) push({ t: "rp" });
  },
  exp: () => {
    beginInput(false);
    pushValue({ t: "const", v: "e" });
    push({ t: "op", v: "^" });
    push({ t: "lp" });
  },
  pow10: () => {
    beginInput(false);
    pushValue({ t: "num", v: "10", fixed: true });
    push({ t: "op", v: "^" });
    push({ t: "lp" });
  },
  ee: () => {
    beginInput(true);
    if (!endsValue(last())) return;
    push({ t: "op", v: "*" });
    push({ t: "num", v: "10", fixed: true });
    push({ t: "op", v: "^" });
  },
  negate: () => {
    beginInput(true);
    const tk = last();
    if (tk && tk.t === "num") tk.v = tk.v.startsWith("-") ? tk.v.slice(1) : "-" + tk.v;
  },
  "=": equals,
  clear: () => {
    state.tokens = [];
    state.justEvaluated = false;
    state.error = null;
  },
  back: () => {
    state.error = null;
    // Right after "=", backspace reopens the expression for editing.
    if (state.justEvaluated) {
      state.justEvaluated = false;
      return;
    }
    const tk = last();
    if (!tk) return;
    if (tk.t === "num" && !tk.fixed && tk.v.length > 1 && tk.v !== "-0") {
      tk.v = tk.v.slice(0, -1);
      if (tk.v === "-") state.tokens.pop();
    } else {
      state.tokens.pop();
    }
  },
  second: () => {
    state.second = !state.second;
  },
  angle: () => {
    state.angle = state.angle === "deg" ? "rad" : "deg";
    save(STORAGE.angle, state.angle);
  },
  mc: () => setMemory(null),
  mr: () => {
    if (state.memory === null) return;
    beginInput(false);
    pushValue(numToken(state.memory));
  },
  "m+": () => addToMemory(1),
  "m-": () => addToMemory(-1),
};

function currentValue() {
  if (state.justEvaluated) return state.lastAnswer;
  try {
    const v = evaluate(state.tokens);
    return Number.isFinite(v) ? tidy(v) : null;
  } catch {
    return null;
  }
}

function setMemory(value) {
  state.memory = value;
  save(STORAGE.memory, value);
}

function addToMemory(sign) {
  const v = currentValue();
  if (v === null) return;
  setMemory(tidy((state.memory ?? 0) + sign * v));
}

function equals() {
  if (state.justEvaluated || !state.tokens.length) return;
  try {
    const value = evaluate(state.tokens);
    if (Number.isNaN(value)) throw new CalcError("Not a real number");
    if (!Number.isFinite(value)) throw new CalcError("Result is too large");
    for (let n = openParens(); n > 0; n--) push({ t: "rp" });
    const result = tidy(value);
    const isPlainNumber = state.tokens.length === 1 && state.tokens[0].t === "num";
    if (!isPlainNumber) {
      state.history.unshift({ expr: expressionText(state.tokens), result });
      state.history.length = Math.min(state.history.length, 50);
      save(STORAGE.history, state.history);
    }
    state.lastAnswer = result;
    state.justEvaluated = true;
  } catch (err) {
    state.error = err instanceof CalcError ? err.message : "Error";
  }
}

function press(key) {
  if (/^\d$/.test(key)) inputDigit(key);
  else if (key in OPS) inputOperator(key);
  else if (key in FUNCS) inputFunc(key);
  else if (key in CONSTS) inputConst(key);
  else if (key in POSTFIX) inputPostfix(key);
  else if (key in COMMANDS) COMMANDS[key]();
  render();
}

// ---------- Rendering ----------

const calcEl = document.getElementById("calc");
const displayEl = document.querySelector(".display");
const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");
const historyListEl = document.getElementById("historyList");

function render() {
  const text = expressionText(state.tokens);
  expressionEl.replaceChildren();
  if (!text) {
    const placeholder = document.createElement("span");
    placeholder.className = "placeholder";
    placeholder.textContent = "0";
    expressionEl.append(placeholder);
  } else {
    expressionEl.append(text);
    const open = openParens();
    if (open > 0 && !state.justEvaluated) {
      const ghost = document.createElement("span");
      ghost.className = "ghost";
      ghost.textContent = ")".repeat(open);
      expressionEl.append(ghost);
    }
    if (state.justEvaluated) expressionEl.append(" =");
  }
  expressionEl.classList.toggle("long", text.length > 14);
  expressionEl.scrollLeft = expressionEl.scrollWidth;

  let resultText = "";
  if (state.error) {
    resultText = state.error;
  } else if (state.justEvaluated) {
    resultText = formatNumber(state.lastAnswer);
  } else if (state.tokens.length > 1 || (last() && last().t !== "num")) {
    const v = currentValue();
    if (v !== null) resultText = "= " + formatNumber(v);
  }
  resultEl.textContent = resultText;
  resultEl.classList.toggle("error", Boolean(state.error));
  resultEl.classList.toggle("long", resultText.length > 12);
  displayEl.classList.toggle("evaluated", state.justEvaluated);

  document.getElementById("angleTag").textContent = state.angle.toUpperCase();
  document.getElementById("angleKey").textContent = state.angle === "deg" ? "DEG" : "RAD";
  document.getElementById("secondTag").hidden = !state.second;
  document.getElementById("memTag").hidden = state.memory === null;
  calcEl.classList.toggle("second", state.second);
  document.querySelector('[data-key="second"]').setAttribute("aria-pressed", String(state.second));
}

function renderHistory() {
  historyListEl.replaceChildren(
    ...state.history.map((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      const expr = document.createElement("span");
      const result = document.createElement("span");
      expr.className = "h-expr";
      result.className = "h-result";
      expr.textContent = item.expr + " =";
      result.textContent = formatNumber(item.result);
      btn.append(expr, result);
      btn.addEventListener("click", () => {
        beginInput(false);
        pushValue(numToken(item.result));
        toggleHistory(false);
        render();
      });
      li.append(btn);
      return li;
    })
  );
  document.getElementById("historyEmpty").hidden = state.history.length > 0;
}

function toggleHistory(open) {
  if (open) renderHistory();
  historyEl.hidden = !open;
}

// ---------- Mode and theme ----------

function setMode(mode) {
  calcEl.classList.toggle("sci", mode === "sci");
  document.querySelectorAll("[data-mode]").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  });
  save(STORAGE.mode, mode);
}

function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// ---------- Events ----------

document.querySelector(".pad").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-key]");
  if (!btn) return;
  const useAlt = state.second && btn.dataset.alt;
  press(useAlt ? btn.dataset.alt : btn.dataset.key);
});

document.querySelector(".memory-row").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-key]");
  if (btn) press(btn.dataset.key);
});

document.querySelectorAll("[data-mode]").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

document.getElementById("themeBtn").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  save(STORAGE.theme, next);
});

document.getElementById("historyBtn").addEventListener("click", () => toggleHistory(historyEl.hidden));
document.getElementById("closeHistory").addEventListener("click", () => toggleHistory(false));
document.getElementById("clearHistory").addEventListener("click", () => {
  state.history = [];
  save(STORAGE.history, state.history);
  renderHistory();
});

const KEYBOARD = {
  Enter: "=",
  "=": "=",
  Backspace: "back",
  Escape: "clear",
  Delete: "clear",
  ",": ".",
  x: "*",
  X: "*",
  "%": "pct",
  "!": "fact",
  s: "sin",
  c: "cos",
  t: "tan",
  l: "ln",
  g: "log",
  r: "sqrt",
  p: "pi",
  e: "e",
};

function flashKey(key) {
  const btn = document.querySelector(`.pad [data-key="${CSS.escape(key)}"]`);
  if (!btn) return;
  btn.classList.add("pressed");
  setTimeout(() => btn.classList.remove("pressed"), 100);
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape" && !historyEl.hidden) return toggleHistory(false);
  let key = KEYBOARD[e.key] ?? e.key;
  if (!(/^\d$/.test(key) || key in OPS || key in FUNCS || key in CONSTS || key in POSTFIX || key in COMMANDS)) return;
  e.preventDefault();
  // Keep focus off on-screen buttons so Enter evaluates rather than "clicks".
  if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  press(key);
  flashKey(key);
});

// ---------- Start ----------

setTheme(load(STORAGE.theme, null));
setMode(load(STORAGE.mode, "basic"));
render();
