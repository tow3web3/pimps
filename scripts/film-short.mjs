// The SHORT demo film (~45s of screencast → ~30s at speed): a visible cursor
// lands, takes the free seat, buys a real token MAX size — then THE POINT:
// the chart rips upward while the position pnl, equity and target bar climb
// with it (the price feed the UI reads is staged; every number on screen is
// the real site reacting to it). The ladder compresses to the final secure
// pass and the $300 win. Output: video/public/demo-short.webm
import puppeteer from "puppeteer-core";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3333";
const sql = neon(readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim());

// fresh account, session cookie only — the cursor takes the seat on camera
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);
let cookie = "";
const api = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const c = r.headers.get("set-cookie");
  if (c) cookie = c.split(";")[0];
  return r.json().catch(() => null);
};
const n = await api("/api/auth/nonce", { wallet });
const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.message), kp.secretKey));
await api("/api/auth/verify", { wallet, signature: sig });
console.log("session ready for", wallet.slice(0, 8));

// star token: big, moving up, aged enough that its chart fills the frame
const toks = await api("/api/tokens");
const candidates = toks.tokens
  .filter(
    (t) =>
      t.mcapUsd > 1_000_000 &&
      (t.vol5mUsd ?? 0) > 3_000 &&
      t.chg1h > 3 &&
      t.chg1h < 300 &&
      (t.ageHours ?? 0) > 12,
  )
  .sort((a, b) => b.chg1h - a.chg1h)
  .slice(0, 10);
let star = null;
for (const t of candidates) {
  const prof = await fetch(BASE + "/api/token/" + t.mint).then((r) => r.json()).catch(() => null);
  if (prof?.chartPair) { star = t; break; }
}
if (!star) {
  star = toks.tokens.filter((t) => t.mcapUsd > 1_000_000).sort((a, b) => b.chg1h - a.chg1h)[0] ?? toks.tokens[0];
}
console.log("star token:", star.symbol, "· 1h", star.chg1h + "%");

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--use-angle=metal", "--enable-gpu", "--window-size=1920,1080", "--hide-scrollbars"],
});
const page = await b.newPage();
await page.setUserAgent(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
);
await page.setViewport({ width: 1920, height: 1080 });
const [cn, cv] = cookie.split("=");
await b.setCookie({ name: cn, value: cv, domain: "localhost", path: "/" });

// ── the staged pump ──────────────────────────────────────────────────────
// Once armed, every /api/prices answer the page reads has the star token's
// price climbing toward PUMP_X over PUMP_MS (ease-out). The UI does the
// rest itself: pnl badge, equity, target bar — all genuine components.
const PUMP_MS = 10_000;
const PUMP_X = 2.7;
let pumpT0 = 0;
const pumpFactor = () => {
  if (!pumpT0) return 1;
  const f = Math.min(1, (Date.now() - pumpT0) / PUMP_MS);
  const e = 1 - Math.pow(1 - f, 2);
  return 1 + (PUMP_X - 1) * e;
};
await page.setRequestInterception(true);
page.on("request", async (req) => {
  try {
    const url = req.url();
    if (pumpT0 && url.includes("/api/prices")) {
      const r = await fetch(url, { headers: { cookie } });
      const j = await r.json();
      const f = pumpFactor();
      for (const t of j.tokens ?? []) {
        if (t.mint === star.mint) {
          t.priceSol *= f;
          t.priceUsd *= f;
          t.mcapUsd *= f;
          t.chg5m = (f - 1) * 100;
          t.chg1h = star.chg1h + (f - 1) * 100;
          t.chg24h = star.chg24h + (f - 1) * 100;
          t.vol5mUsd = (t.vol5mUsd ?? 0) * (1 + f);
        }
      }
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
    }
    return req.continue();
  } catch {
    try { await req.continue(); } catch { /* already handled */ }
  }
});

// the animated chart that continues the story the price feed is telling —
// drawn INSIDE the chart card (below the site's own overlays, above the iframe)
await page.evaluateOnNewDocument(() => {
  window.__pump = (startPrice, durMs, mult) => {
    const iframe = document.querySelector("iframe");
    if (!iframe) return;
    const parent = iframe.parentElement;
    parent.style.position = "relative";
    const pr = parent.getBoundingClientRect();
    const ir = iframe.getBoundingClientRect();
    const W = ir.width, H = ir.height;
    const dpr = window.devicePixelRatio || 1;
    const cv = document.createElement("canvas");
    Object.assign(cv.style, {
      position: "absolute",
      left: ir.x - pr.x + "px",
      top: ir.y - pr.y + "px",
      width: W + "px",
      height: H + "px",
      zIndex: 5,
      background: "#ffffff",
    });
    cv.width = W * dpr;
    cv.height = H * dpr;
    parent.appendChild(cv);
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);

    const t0 = Date.now();
    const target = () => {
      const f = Math.min(1, (Date.now() - t0) / durMs);
      const e = 1 - Math.pow(1 - f, 2);
      return startPrice * (1 + (mult - 1) * e);
    };
    // pre-history: a calm drift up to the entry
    const candles = [];
    let p = startPrice * 0.94;
    for (let i = 0; i < 26; i++) {
      const o = p;
      p *= 1 + (Math.random() - 0.44) * 0.018;
      candles.push({ o, c: p, h: Math.max(o, p) * 1.005, l: Math.min(o, p) * 0.995, v: 0.25 + Math.random() * 0.4 });
    }
    let lastAt = 0;
    const GREEN = "#26a69a", RED = "#ef5350";
    const fmt = (v) => (v >= 1 ? v.toFixed(2) : v.toFixed(v >= 0.01 ? 4 : 6));
    function draw() {
      const now = Date.now();
      const tp = target();
      if (now - lastAt > 330) {
        lastAt = now;
        const o = candles[candles.length - 1].c;
        const red = Math.random() < 0.16 && now - t0 < durMs;
        const c = red ? o * (1 - Math.random() * 0.01) : tp * (1 + (Math.random() - 0.35) * 0.008);
        candles.push({
          o, c,
          h: Math.max(o, c) * (1 + Math.random() * 0.007),
          l: Math.min(o, c) * (1 - Math.random() * 0.005),
          v: red ? 0.25 + Math.random() * 0.35 : 0.55 + Math.random() * 0.9,
        });
        if (candles.length > 48) candles.shift();
      }
      const lo = Math.min(...candles.map((k) => k.l)) * 0.995;
      const hi = Math.max(...candles.map((k) => k.h)) * 1.015;
      const px = (v) => 14 + (1 - (v - lo) / (hi - lo)) * (H * 0.74);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(19,17,16,0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = (H * i) / 6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      const cw = (W - 90) / 48;
      const bw = Math.max(3, cw * 0.62);
      candles.forEach((k, i) => {
        const x = 10 + i * cw + cw / 2;
        const up = k.c >= k.o;
        ctx.strokeStyle = up ? GREEN : RED;
        ctx.fillStyle = up ? GREEN : RED;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, px(k.h)); ctx.lineTo(x, px(k.l)); ctx.stroke();
        const y1 = px(Math.max(k.o, k.c)), y2 = px(Math.min(k.o, k.c));
        ctx.fillRect(x - bw / 2, y1, bw, Math.max(2, y2 - y1));
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x - bw / 2, H - 12 - k.v * 34, bw, k.v * 34);
        ctx.globalAlpha = 1;
      });
      // right price axis
      ctx.fillStyle = "rgba(19,17,16,0.45)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      for (let i = 0; i <= 4; i++) {
        const v = lo + ((hi - lo) * i) / 4;
        ctx.fillText("$" + fmt(v), W - 78, px(v) + 4);
      }
      // last-price tag on the closing candle
      const lastC = candles[candles.length - 1].c;
      const ly = px(lastC);
      ctx.strokeStyle = "rgba(38,166,154,0.5)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W - 84, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = GREEN;
      ctx.fillRect(W - 84, ly - 10, 80, 20);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.fillText("$" + fmt(lastC), W - 78, ly + 4);
      // live badge
      ctx.fillStyle = "#ef5350";
      ctx.beginPath(); ctx.arc(18, 18, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(19,17,16,0.6)";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.fillText("LIVE", 28, 22);
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  };
});

// brand cursor, injected on every page
await page.evaluateOnNewDocument(() => {
  const mk = () => {
    if (document.getElementById("__cur")) return;
    const d = document.createElement("div");
    d.id = "__cur";
    Object.assign(d.style, {
      position: "fixed", left: "0", top: "0", width: "26px", height: "26px",
      borderRadius: "50%", background: "#ff5200", border: "3px solid #131110",
      boxShadow: "3px 3px 0 rgba(19,17,16,0.35)", zIndex: 999999,
      pointerEvents: "none", transform: "translate(-40px,-40px)",
      transition: "transform 0s",
    });
    document.documentElement.appendChild(d);
  };
  if (document.readyState !== "loading") mk();
  else document.addEventListener("DOMContentLoaded", mk);
  window.__curTo = (x, y, ms) => {
    const d = document.getElementById("__cur");
    if (!d) return;
    d.style.transition = `transform ${ms}ms cubic-bezier(.25,.8,.3,1)`;
    d.style.transform = `translate(${x - 13}px, ${y - 13}px)`;
  };
  window.__curClick = (x, y) => {
    const r = document.createElement("div");
    Object.assign(r.style, {
      position: "fixed", left: `${x - 22}px`, top: `${y - 22}px`, width: "44px", height: "44px",
      borderRadius: "50%", border: "4px solid #ff5200", zIndex: 999998, pointerEvents: "none",
      opacity: "0.9", transform: "scale(0.4)", transition: "all 450ms ease-out",
    });
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => {
      r.style.transform = "scale(1.6)";
      r.style.opacity = "0";
    });
    setTimeout(() => r.remove(), 500);
  };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cx = 960, cy = 540;
const moveTo = async (x, y, ms = 550) => {
  await page.evaluate((x, y, ms) => window.__curTo(x, y, ms), x, y, ms);
  await page.mouse.move(x, y, { steps: Math.max(6, Math.floor(ms / 40)) });
  cx = x; cy = y;
  await sleep(ms + 60);
};
const click = async () => {
  await page.evaluate((x, y) => window.__curClick(x, y), cx, cy);
  await page.mouse.click(cx, cy);
  await sleep(220);
};
const findBox = async (needle, tag = "button", tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const box = await page.evaluate((needle, tag) => {
      const els = [...document.querySelectorAll(tag)];
      const el = els.find((e) => e.textContent.toLowerCase().includes(needle.toLowerCase()) && e.offsetParent !== null);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, needle, tag);
    if (box) return box;
    await sleep(300);
  }
  throw new Error("not found: " + needle);
};
const go = async (needle, tag = "button", ms = 550) => {
  const p = await findBox(needle, tag);
  await moveTo(p.x, p.y, ms);
  await click();
};

process.on("unhandledRejection", async (e) => {
  console.error("FAIL:", e.message);
  try { await page.screenshot({ path: "video/out/short-fail.png" }); } catch {}
  process.exit(1);
});

// ── action ──
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
const rec = await page.screencast({ path: "video/public/demo-short.webm" });
await page.evaluate(() => window.__curTo(960, 700, 0));
await sleep(1900); // hero kinetic type plays

await go("Start challenge 01", "a,button", 700);
await sleep(1600); // /enter

await go("play free", "button", 650);
await sleep(2800); // receipt prints → terminal

// rules gate: one beat, then take the desk
const rulesBtn = await findBox("take the desk");
await sleep(800);
await moveTo(rulesBtn.x, rulesBtn.y, 600);
await click();
await sleep(900);

// pick the star token (type to find it, fast)
const search = await page.evaluate(() => {
  const el = document.querySelector('input[placeholder*="search token"]');
  const r = el?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
if (search) {
  await moveTo(search.x, search.y, 550);
  await click();
  await page.keyboard.type(star.symbol, { delay: 70 });
  await sleep(600);
}
const row = await page.evaluate(() => {
  const r = [...document.querySelectorAll(".token-row")][0]?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
if (row) { await moveTo(row.x, row.y, 550); await click(); }
await sleep(3400); // the real chart gets the screen

// buy MAX — the money story needs a position that moves the needle
await go("max", "button", 600);
await go("buy ", "button", 550);
await sleep(1400); // fill lands

// stage set silently: paid track + fills quota, so every label reads $300
const run = (await sql`SELECT id FROM runs WHERE wallet = ${wallet} AND status = 'active' ORDER BY id DESC LIMIT 1`)[0];
const t = (await sql`SELECT mint, symbol, price_sol FROM trades WHERE run_id = ${run.id} ORDER BY id DESC LIMIT 1`)[0];
const px = Number(t?.price_sol ?? 0.0001);
const now0 = Date.now();
const values = Array.from({ length: 11 }, (_, i) =>
  `(${run.id}, ${now0 - (i + 2) * 60000}, 'buy', '${t.mint}', '${t.symbol}', ${(0.2 / px).toFixed(4)}, ${px}, 0.2, 0.002, NULL)`,
).join(",");
await sql.query(
  `INSERT INTO trades(run_id, ts, side, mint, symbol, qty, price_sol, sol_amount, fee_sol, pnl_sol) VALUES ${values}`,
);
await sql`UPDATE runs SET tier='paid', trade_count=12 WHERE id=${run.id}`;

// ── THE POINT: the chart rips and every number climbs with it ──
pumpT0 = Date.now();
await page.evaluate((p0, ms, x) => window.__pump(p0, ms, x), star.priceUsd, PUMP_MS, PUMP_X);
// ride the slope like a trader watching it print
await moveTo(700, 640, 900);
await moveTo(1000, 520, 1500);
await moveTo(1280, 420, 1700);
// hover the position in the list — the green pnl % is climbing live
const posRow = await page.evaluate(() => {
  const r = [...document.querySelectorAll(".token-row")][0]?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
if (posRow) await moveTo(posRow.x, posRow.y, 800);
await sleep(2100);
// and the equity/target side — the bar filling toward PASS
await moveTo(1745, 600, 900);
await sleep(2400); // pump tops out ~2.7×, numbers hold

// compress the ladder: the run becomes challenge 03 with the target beaten —
// the cursor only has to SECURE it on camera
await sql`UPDATE runs SET phase=2, cash_sol=31 WHERE id=${run.id}`;

// the poll throws the "2/3 DOWN" celebration first — acknowledge, then win
await go("start challenge 03", "button", 700);
await sleep(1100);
await go("secure pass", "button", 750);
await sleep(3800); // $300 WIN overlay — the money shot

await rec.stop();
await b.close();

// SAFETY: the win queued a REAL $300 payout to this throwaway wallet —
// remove everything so a funded hot wallet can never pay it
await sql`DELETE FROM withdrawals WHERE wallet = ${wallet}`;
await sql`DELETE FROM positions WHERE run_id IN (SELECT id FROM runs WHERE wallet = ${wallet})`;
await sql`DELETE FROM trades WHERE run_id IN (SELECT id FROM runs WHERE wallet = ${wallet})`;
await sql`DELETE FROM runs WHERE wallet = ${wallet}`;
console.log("demo-short.webm recorded, demo account cleaned");
process.exit(0);
