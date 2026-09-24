// Spoken numbers. The later Fan Economy scripts write their reveals the way they are
// SAID ("Two million dollars", "Thirty dollars", "twelve and a half million"), and the
// fact lock's digit regex cannot see those. A withheld reveal the gate cannot see is a
// reveal the gate cannot protect, so words become the same normalized tokens digits do.

const SMALL = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { thousand: 1e3, million: 1e6, billion: 1e9 };

// A bare "one"/"two" is usually a pronoun or a count of nothing on screen ("One is
// wide"). Small numbers only count when a unit follows them.
export const UNIT_WORDS = new Set(
  "dollar dollars bucks cents hours hour days day weeks week months month years year albums album projects project shows show cities city copies copy records record versions fans fan members member people tapes tape chapters chapter songs song tracks track times nominations nomination tickets ticket listeners streams percent grand pressings pressing beats sessions nights night countries labels deals".split(" "),
);

function isNumWord(w) {
  return w in SMALL || w in TENS || w in SCALES || w === "hundred" || w === "half";
}

/** Parse number-word runs in `text`. Returns [{ value, raw, start, end, money }]. */
export function spokenNumbers(text) {
  const words = [...String(text).matchAll(/[A-Za-z]+(?:-[A-Za-z]+)?|\$?\d[\d,.]*|[^\sA-Za-z\d]+/g)].map((m) => ({ w: m[0], i: m.index }));
  const low = words.map((x) => x.w.toLowerCase());
  const out = [];
  let k = 0;
  while (k < words.length) {
    const startK = k;
    // Optional leading "a" in "a hundred", "a million", and "half a million".
    let total = 0;
    let current = 0;
    let used = 0;
    let sawReal = false;
    let halfPending = false;
    while (k < words.length) {
      const w = low[k];
      const parts = w.includes("-") ? w.split("-") : [w];
      if (parts.length === 2 && parts[0] in TENS && parts[1] in SMALL) {
        current += TENS[parts[0]] + SMALL[parts[1]]; sawReal = true; used++; k++; continue;
      }
      if (w in SMALL) { current += SMALL[w]; sawReal = true; used++; k++; continue; }
      if (w in TENS) { current += TENS[w]; sawReal = true; used++; k++; continue; }
      if (w === "hundred") { current = (current || 1) * 100; sawReal = true; used++; k++; continue; }
      // "1.5 million" is a DIGIT figure with a scale word: not a spoken "a million".
      if (w in SCALES && !sawReal && k > 0 && /\d/.test(words[k - 1].w)) break;
      if (w in SCALES) {
        const base = halfPending ? (current || 0) + 0.5 : current || (sawReal ? 0 : 1);
        total += base * SCALES[w]; current = 0; halfPending = false; sawReal = true; used++; k++; continue;
      }
      if (w === "a" && k + 1 < words.length && (low[k + 1] === "hundred" || low[k + 1] in SCALES) && !sawReal) { current = 1; used++; k++; continue; }
      if (w === "half" && low[k + 1] === "a" && low[k + 2] in SCALES) { current = 0.5; sawReal = true; used += 2; k += 2; continue; }
      if (w === "and" && sawReal && k + 1 < words.length && (isNumWord(low[k + 1]) || (low[k + 1] === "a" && low[k + 2] === "half"))) {
        if (low[k + 1] === "a" && low[k + 2] === "half" && low[k + 3] in SCALES) { halfPending = true; used += 3; k += 3; continue; }
        used++; k++; continue;
      }
      break;
    }
    if (sawReal) {
      const value = total + current;
      const next = low[k] || "";
      const single = used === 1 && value <= 12;
      if (!(single && !UNIT_WORDS.has(next)) && value > 0) {
        const endWord = words[k - 1];
        out.push({
          value,
          raw: text.slice(words[startK].i, endWord.i + endWord.w.length),
          start: words[startK].i,
          end: endWord.i + endWord.w.length,
          money: next === "dollars" || next === "dollar" || next === "bucks",
          unit: UNIT_WORDS.has(next) ? next : null,
        });
      }
    } else {
      k = startK + 1;
    }
    if (k === startK) k++;
  }
  return out;
}

/** Normalized tokens ("2000000", "30") for the fact lock and the withheld gate. */
export function spokenNumberTokens(text) {
  return spokenNumbers(text).map((n) => String(Number.isInteger(n.value) ? n.value : n.value));
}

/** "$2,000,000" style display for a spoken figure. */
export function formatFigure(value, money = false) {
  const s = Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return money ? `$${s}` : s;
}
