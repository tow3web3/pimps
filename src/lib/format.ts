// Number formatting for a terminal that mixes SOL, USD and memecoin micro-prices.

export function fmtSol(v: number, digits = 3): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** USD with sensible precision for anything from $0.0000001 to $10M */
export function fmtUsd(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return "$" + v.toFixed(2);
  if (abs === 0) return "$0.00";
  return "$" + fmtMicro(v);
}

/**
 * Memecoin micro-price, subscript-zeros style: 0.0000123 -> 0.0₄123
 * Falls back to plain decimals above 0.001.
 */
export function fmtMicro(v: number): string {
  if (v >= 0.001) return v.toPrecision(4);
  const s = v.toFixed(20);
  const m = s.match(/^0\.(0+)([1-9]\d{0,3})/);
  if (!m) return v.toPrecision(3);
  const zeros = m[1].length;
  const subs = "₀₁₂₃₄₅₆₇₈₉";
  const sub = String(zeros)
    .split("")
    .map((d) => subs[+d])
    .join("");
  return `0.0${sub}${m[2]}`;
}

/** Compact USD for mcap/liq/volume: $1.24M, $530K */
export function fmtCompact(v: number): string {
  if (!isFinite(v)) return "—";
  const trim = (s: string) => s.replace(/\.0+$/, "");
  if (v >= 1e9) return "$" + trim((v / 1e9).toFixed(2)) + "B";
  if (v >= 1e6) return "$" + trim((v / 1e6).toFixed(2)) + "M";
  if (v >= 1e3) return "$" + trim((v / 1e3).toFixed(1)) + "K";
  return "$" + v.toFixed(0);
}

/** Signed percent with explicit arrow — never color alone */
export function fmtPct(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "·";
  return `${arrow} ${Math.abs(v).toFixed(digits)}%`;
}

export function fmtSignedSol(v: number, digits = 3): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${fmtSol(Math.abs(v), digits)}`;
}

/** Token quantity, compact */
export function fmtQty(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  if (v >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}

/** DD:HH:MM:SS countdown */
export function fmtCountdown(msLeft: number): string {
  if (msLeft <= 0) return "00:00:00";
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(Math.floor(s % 60))}`;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** chart precision for a given price magnitude */
export function pricePrecision(p: number): { precision: number; minMove: number } {
  if (p >= 1) return { precision: 4, minMove: 0.0001 };
  const zeros = Math.max(0, -Math.floor(Math.log10(p)) - 1);
  const precision = Math.min(12, zeros + 4);
  return { precision, minMove: Number((10 ** -precision).toFixed(12)) };
}
