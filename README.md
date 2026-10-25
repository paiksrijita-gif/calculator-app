# Calculator

A basic and scientific calculator built with plain HTML, CSS and JavaScript — no build step, no dependencies.

Live: https://calculator-app-psi-tawny.vercel.app/

## Features

- **Basic mode:** + − × ÷ with correct order of operations, %, ±, backspace
- **Scientific mode:** sin, cos, tan and their inverses (2nd), ln, log, eˣ, 10ˣ,
  x², x³, xʸ, √, ∛, x!, 1/x, |x|, mod, π, e, EE (×10ⁿ), parentheses and `Ans`
- **Degrees or radians** toggle
- **Live preview** of the answer while you type, with clear error messages
- **Memory:** MC, MR, M+, M−
- **History** of your last 50 calculations — tap one to reuse it
- **Light and dark theme** (follows your system, or toggle it)
- **Keyboard support:** digits, `+ - * / ^ ( ) ! %`, `Enter`, `Backspace`, `Esc`,
  plus `s` sin, `c` cos, `t` tan, `l` ln, `g` log, `r` √, `p` π, `e`
- Works on phones, tablets and desktops (scientific keys sit beside the number pad on wide screens)

Expressions are evaluated with a small parser in `script.js`, never with `eval`.

## Run locally

Open `index.html` in your browser.

## Deploy

Every push to `main` on GitHub redeploys the site on Vercel automatically.
