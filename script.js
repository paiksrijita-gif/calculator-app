// Calculator state: a list of finished tokens (numbers and operators)
// plus the number currently being typed.
const state = {
  tokens: [],
  current: "0",
  justEvaluated: false,
  error: false,
};

const OP_SYMBOLS = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const clearBtn = document.getElementById("clear");

// Round away floating point noise like 0.1 + 0.2 = 0.30000000000000004.
function tidy(n) {
  return parseFloat(n.toPrecision(12));
}

function formatNumber(str) {
  if (str === "Error") return str;
  const negative = str.startsWith("-");
  const [intPart, decPart] = str.replace("-", "").split(".");
  const grouped = Number(intPart).toLocaleString("en-US");
  return (negative ? "-" : "") + grouped + (decPart !== undefined ? "." + decPart : "");
}

function numberToString(n) {
  if (!Number.isFinite(n)) return "Error";
  const s = String(tidy(n));
  return s.includes("e") ? n.toExponential(6) : s;
}

// Evaluate tokens respecting precedence: × and ÷ before + and −.
function evaluate(tokens) {
  const values = [Number(tokens[0])];
  const ops = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const next = Number(tokens[i + 1]);
    if (op === "*") values.push(values.pop() * next);
    else if (op === "/") {
      if (next === 0) return NaN;
      values.push(values.pop() / next);
    } else {
      ops.push(op);
      values.push(next);
    }
  }
  let total = values[0];
  ops.forEach((op, i) => {
    total = op === "+" ? total + values[i + 1] : total - values[i + 1];
  });
  return tidy(total);
}

function lastToken() {
  return state.tokens[state.tokens.length - 1];
}

function isOperator(token) {
  return token in OP_SYMBOLS;
}

function render() {
  const exprText = state.tokens
    .map((t) => (t === "=" ? " =" : isOperator(t) ? ` ${OP_SYMBOLS[t]} ` : formatNumber(t)))
    .join("");
  // ‎ keeps the expression left-to-right inside the rtl-truncated box.
  expressionEl.textContent = exprText ? "‎" + exprText + "‎" : "";

  const shown = state.error ? "Error" : formatNumber(state.current);
  resultEl.textContent = shown;
  resultEl.classList.toggle("small", shown.length > 9);

  clearBtn.textContent = state.current !== "0" || state.error ? "C" : "AC";

  document.querySelectorAll(".key.op").forEach((btn) => {
    btn.classList.toggle(
      "active",
      isOperator(lastToken()) && state.current === "" && btn.dataset.op === lastToken()
    );
  });
}

function resetIfNeeded() {
  if (state.error) {
    state.tokens = [];
    state.current = "0";
    state.error = false;
  }
}

function inputDigit(d) {
  resetIfNeeded();
  if (state.justEvaluated) {
    state.tokens = [];
    state.current = "0";
    state.justEvaluated = false;
  }
  if (state.current.replace(/[-.]/g, "").length >= 15) return;
  state.current = state.current === "0" || state.current === "" ? d : state.current + d;
  if (state.current === "-0") state.current = "-" + d;
}

function inputDecimal() {
  resetIfNeeded();
  if (state.justEvaluated) {
    state.tokens = [];
    state.current = "0";
    state.justEvaluated = false;
  }
  if (state.current === "") state.current = "0";
  if (!state.current.includes(".")) state.current += ".";
}

function inputOperator(op) {
  if (state.error) return;
  state.justEvaluated = false;
  if (state.current === "") {
    // Swap the operator if one was just pressed.
    if (isOperator(lastToken())) state.tokens[state.tokens.length - 1] = op;
    return;
  }
  state.tokens.push(state.current.replace(/\.$/, ""), op);
  state.current = "";
}

function equals() {
  if (state.error) return;
  if (state.current === "") {
    if (!state.tokens.length) return;
    state.tokens.pop(); // drop the dangling operator
  } else {
    state.tokens.push(state.current.replace(/\.$/, ""));
  }
  if (state.tokens.length < 3) {
    state.current = state.tokens[0] ?? "0";
    state.tokens = [];
    return;
  }
  const result = evaluate(state.tokens);
  state.tokens.push("=");
  if (!Number.isFinite(result)) {
    state.error = true;
    state.current = "0";
  } else {
    state.current = numberToString(result);
  }
  state.justEvaluated = true;
}

function clear() {
  if (state.current !== "0" && state.current !== "" && !state.error && !state.justEvaluated) {
    state.current = "0"; // C: clear only the current entry
  } else {
    state.tokens = [];
    state.current = "0";
    state.error = false;
    state.justEvaluated = false;
  }
}

function backspace() {
  if (state.error || state.justEvaluated) return clear();
  if (state.current === "") return;
  state.current = state.current.slice(0, -1);
  if (state.current === "" || state.current === "-") state.current = "0";
}

function negate() {
  if (state.error || state.current === "" || state.current === "0") return;
  if (state.justEvaluated) {
    state.tokens = [];
    state.justEvaluated = false;
  }
  state.current = state.current.startsWith("-") ? state.current.slice(1) : "-" + state.current;
}

function percent() {
  if (state.error || state.current === "") return;
  if (state.justEvaluated) {
    state.tokens = [];
    state.justEvaluated = false;
  }
  state.current = numberToString(Number(state.current) / 100);
}

// The expression line shows "... =" after evaluating; strip it before reusing.
function stripEquals() {
  if (lastToken() === "=") {
    state.tokens = [];
  }
}

function handle(action, value) {
  if (action === "operator" && state.justEvaluated) stripEquals();
  switch (action) {
    case "digit": inputDigit(value); break;
    case "decimal": inputDecimal(); break;
    case "operator": inputOperator(value); break;
    case "equals": equals(); break;
    case "clear": clear(); break;
    case "backspace": backspace(); break;
    case "negate": negate(); break;
    case "percent": percent(); break;
  }
  render();
}

document.querySelector(".keys").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.digit) handle("digit", btn.dataset.digit);
  else if (btn.dataset.op) handle("operator", btn.dataset.op);
  else handle(btn.dataset.action);
});

const KEY_MAP = {
  Enter: ["equals"],
  "=": ["equals"],
  Backspace: ["backspace"],
  Escape: ["clear"],
  Delete: ["clear"],
  ".": ["decimal"],
  ",": ["decimal"],
  "%": ["percent"],
  "+": ["operator", "+"],
  "-": ["operator", "-"],
  "*": ["operator", "*"],
  x: ["operator", "*"],
  "/": ["operator", "/"],
};

function flashKey(selector) {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.classList.add("pressed");
  setTimeout(() => btn.classList.remove("pressed"), 100);
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    handle("digit", e.key);
    flashKey(`[data-digit="${e.key}"]`);
    return;
  }
  const mapped = KEY_MAP[e.key];
  if (!mapped) return;
  e.preventDefault();
  handle(...mapped);
  flashKey(mapped[0] === "operator" ? `[data-op="${mapped[1]}"]` : `[data-action="${mapped[0]}"]`);
});

render();
