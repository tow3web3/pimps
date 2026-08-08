// The demo film, full-ladder edition: a visible cursor takes the seat and
// plays ALL THREE challenges for real — a different token each time, each
// chart ripping while the pnl climbs, each position SOLD at the top (bag
// visibly up), each pass SECURED. Ends on the $300 win flipping to "sent".
// The engine runs everything; only the price feed is staged. Segment MARKs
// are printed so the edit can fast-forward challenges 02/03.
// Output: video/public/demo-short.webm
import puppeteer from "puppeteer-core";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

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
// SAFETY: route this account's prize to an unpayable destination — the real
// payout cron must never send USDC to a throwaway film wallet
await sql`INSERT INTO users(wallet, created_at, payout_wallet) VALUES (${wallet}, ${Date.now()}, 'demo-blocked')
          ON CONFLICT(wallet) DO UPDATE SET payout_wallet = 'demo-blocked'`;
console.log("session ready for", wallet.slice(0, 8));

// cast THREE stars: big, moving, aged enough that their charts fill the frame
const toks = await api("/api/tokens");
const pool = toks.tokens
  .filter(
    (t) =>
      t.mcapUsd > 800_000 &&
      (t.vol5mUsd ?? 0) > 2_000 &&
      t.chg1h > 0 &&
      t.chg1h < 300 &&
      (t.ageHours ?? 0) > 12,
  )
  .sort((a, b) => b.chg1h - a.chg1h);
const stars = [];
for (const t of pool) {
  if (stars.length >= 3) break;
  const prof = await fetch(BASE + "/api/token/" + t.mint).then((r) => r.json()).catch(() => null);
  if (prof?.chartPair) stars.push(t);
}
while (stars.length < 3) stars.push(pool[0] ?? toks.tokens[0]);
console.log("cast:", stars.map((s) => `${s.symbol} (+${Math.round(s.chg1h)}%/1h)`).join(" · "));

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

// ── the staged market ────────────────────────────────────────────────────
// One pump at a time; completed pumps keep their final factor so the list
// stays coherent. The engine itself trades on these numbers: the staged
// sell writes real rows, so every later poll agrees with what was shown.
let pump = null; // { mint, t0, ms, mult }
const doneFactor = new Map();
const factorOf = (mint) => {
  if (pump && pump.mint === mint) {
    const f = Math.min(1, (Date.now() - pump.t0) / pump.ms);
    return 1 + (pump.mult - 1) * (1 - Math.pow(1 - f, 2));
  }
  return doneFactor.get(mint) ?? 1;
};

const stagedSell = async () => {
  const run = (await sql`SELECT id FROM runs WHERE wallet = ${wallet} AND status='active' ORDER BY id DESC LIMIT 1`)[0];
  const p = (await sql`SELECT * FROM positions WHERE run_id = ${run.id} LIMIT 1`)[0];
  if (!p) return;
  const f = factorOf(p.mint);
  const px = Number(p.avg_price_sol) * f;
  const gross = Number(p.qty) * px;
  const fee = gross * 0.01;
  const proceeds = gross - fee;
  await sql`UPDATE runs SET cash_sol = cash_sol + ${proceeds}, trade_count = trade_count + 1 WHERE id = ${run.id}`;
  await sql`INSERT INTO trades(run_id, ts, side, mint, symbol, qty, price_sol, sol_amount, fee_sol, pnl_sol)
            VALUES (${run.id}, ${Date.now()}, 'sell', ${p.mint}, ${p.symbol}, ${p.qty}, ${px}, ${proceeds}, ${fee}, ${proceeds - Number(p.invested_sol)})`;
  await sql`DELETE FROM positions WHERE run_id = ${run.id}`;
};

await page.setRequestInterception(true);
page.on("request", async (req) => {
  try {
    const url = req.url();
    if (url.includes("/api/prices")) {
      const r = await fetch(url, { headers: { cookie } });
      const j = await r.json();
      for (const t of j.tokens ?? []) {
        const f = factorOf(t.mint);
        if (f > 1) {
          t.priceSol *= f;
          t.priceUsd *= f;
          t.mcapUsd *= f;
          t.chg5m = (f - 1) * 100;
          t.chg1h = (t.chg1h ?? 0) + (f - 1) * 100;
          t.chg24h = (t.chg24h ?? 0) + (f - 1) * 100;
        }
      }
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
    }
    if (url.includes("/api/game/sell") && req.method() === "POST") {
      // the sell settles at the STAGED price — write it, then serve truth
      await stagedSell();
      const st = await fetch(BASE + "/api/game/state", { headers: { cookie } }).then((r) => r.json());
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ state: st }) });
    }
    return req.continue();
  } catch {
    try { await req.continue(); } catch { /* already handled */ }
  }
});

// the animated candles that tell the same story the feed is telling
await page.evaluateOnNewDocument(() => {
  window.__pumpChart = (startPrice, durMs, mult) => {
    document.getElementById("__pumpcv")?.remove();
    const iframe = document.querySelector("iframe");
    if (!iframe) return;
    const parent = iframe.parentElement;
    parent.style.position = "relative";
    const pr = parent.getBoundingClientRect();
    const ir = iframe.getBoundingClientRect();
    const W = ir.width, H = ir.height;
    const dpr = window.devicePixelRatio || 1;
    const cv = document.createElement("canvas");
    cv.id = "__pumpcv";
    Object.assign(cv.style, {
      position: "absolute", left: ir.x - pr.x + "px", top: ir.y - pr.y + "px",
      width: W + "px", height: H + "px", zIndex: 5, background: "#ffffff",
    });
    cv.width = W * dpr;
    cv.height = H * dpr;
    parent.appendChild(cv);
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const t0 = Date.now();
    const target = () => {
      const f = Math.min(1, (Date.now() - t0) / durMs);
      return startPrice * (1 + (mult - 1) * (1 - Math.pow(1 - f, 2)));
    };
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
      if (!document.getElementById("__pumpcv")) return;
      const now = Date.now();
      const tp = target();
      if (now - lastAt > 300) {
        lastAt = now;
        const o = candles[candles.length - 1].c;
        const red = Math.random() < 0.15 && now - t0 < durMs;
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
      ctx.fillStyle = "rgba(19,17,16,0.45)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      for (let i = 0; i <= 4; i++) {
        const v = lo + ((hi - lo) * i) / 4;
        ctx.fillText("$" + fmt(v), W - 78, px(v) + 4);
      }
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
      ctx.fillStyle = "#ef5350";
      ctx.beginPath(); ctx.arc(18, 18, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(19,17,16,0.6)";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.fillText("LIVE", 28, 22);
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  };
  window.__pumpStop = () => document.getElementById("__pumpcv")?.remove();
});

// brand cursor
await page.evaluateOnNewDocument(() => {
  const mk = () => {
    if (document.getElementById("__cur")) return;
    const d = document.createElement("div");
    d.id = "__cur";
    Object.assign(d.style, {
      position: "fixed", left: "0", top: "0", width: "26px", height: "26px",
      borderRadius: "50%", background: "#ff5200", border: "3px solid #131110",
      boxShadow: "3px 3px 0 rgba(19,17,16,0.35)", zIndex: 999999,
      pointerEvents: "none", transform: "translate(-40px,-40px)", transition: "transform 0s",
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
const moveTo = async (x, y, ms = 500) => {
  await page.evaluate((x, y, ms) => window.__curTo(x, y, ms), x, y, ms);
  await page.mouse.move(x, y, { steps: Math.max(6, Math.floor(ms / 40)) });
  cx = x; cy = y;
  await sleep(ms + 50);
};
const click = async () => {
  await page.evaluate((x, y) => window.__curClick(x, y), cx, cy);
  await page.mouse.click(cx, cy);
  await sleep(200);
};
const findBox = async (needle, tag = "button", tries = 40, exact = false) => {
  for (let i = 0; i < tries; i++) {
    const box = await page.evaluate((needle, tag, exact) => {
      const els = [...document.querySelectorAll(tag)];
      const el = els.find((e) => {
        if (e.offsetParent === null) return false;
        const txt = e.textContent.toLowerCase().trim();
        return exact ? txt === needle.toLowerCase() : txt.includes(needle.toLowerCase());
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, needle, tag, exact);
    if (box) return box;
    await sleep(300);
  }
  const dump = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.textContent.trim().slice(0, 30)),
  );
  console.error("visible buttons:", JSON.stringify(dump.slice(0, 40)));
  throw new Error("not found: " + needle);
};
// the cursor animates to the target, but the CLICK is a DOM click on the
// matched element — a coordinate click can land on whatever floats above
const go = async (needle, tag = "button", ms = 500, exact = false) => {
  const p = await findBox(needle, tag, 40, exact);
  await moveTo(p.x, p.y, ms);
  await page.evaluate((x, y) => window.__curClick(x, y), cx, cy);
  const clicked = await page.evaluate((needle, tag, exact) => {
    const els = [...document.querySelectorAll(tag)];
    const el = els.find((e) => {
      if (e.offsetParent === null) return false;
      const txt = e.textContent.toLowerCase().trim();
      return exact ? txt === needle.toLowerCase() : txt.includes(needle.toLowerCase());
    });
    if (!el) return false;
    el.click();
    return true;
  }, needle, tag, exact);
  if (!clicked) throw new Error("click lost: " + needle);
  await sleep(260);
};

let recStart = 0;
const mark = (name) => console.log("MARK", name, ((Date.now() - recStart) / 1000).toFixed(2));

process.on("unhandledRejection", async (e) => {
  console.error("FAIL:", e.message);
  try { await page.screenshot({ path: "video/out/short-fail.png" }); } catch {}
  process.exit(1);
});

// ── one full challenge: pick → buy max → pump → SELL → secure ────────────
const playChallenge = async (star, idx, { mult, pumpMs, chartWait, rides }) => {
  // fresh chart for the new star (drop the previous pump canvas)
  await page.evaluate(() => window.__pumpStop());
  if (idx > 0) await go("buy", "button", 450, true); // back to the buy tab (exact: not the tape rows)

  const search = await page.evaluate(() => {
    const el = document.querySelector('input[placeholder*="search token"]');
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (search) {
    await moveTo(search.x, search.y, 450);
    await page.evaluate((x, y) => window.__curClick(x, y), cx, cy);
    // clear through React's own plumbing — a keyboard select-all is flaky
    // headless, and a stale query would silently re-select the WRONG token
    await page.evaluate(() => {
      const el = document.querySelector('input[placeholder*="search token"]');
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.focus();
    });
    await page.keyboard.type(star.symbol, { delay: 55 });
    await sleep(450);
  }
  const row = await page.evaluate((sym) => {
    const rows = [...document.querySelectorAll(".token-row")];
    const el = rows.find((r) => r.textContent.toLowerCase().includes(sym.toLowerCase())) ?? rows[0];
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, star.symbol);
  if (row) {
    await moveTo(row.x, row.y, 450);
    await page.evaluate((x, y) => window.__curClick(x, y), cx, cy);
    await page.evaluate((sym) => {
      const rows = [...document.querySelectorAll(".token-row")];
      (rows.find((r) => r.textContent.toLowerCase().includes(sym.toLowerCase())) ?? rows[0])?.click();
    }, star.symbol);
    await sleep(200);
  }
  await sleep(chartWait);

  await go("max", "button", 500);
  await go("buy ", "button", 450);
  await sleep(1100); // fill

  // hard assert: the position must be the star — a mis-selection here means
  // the sell would settle on the WRONG factor and the pass would miss
  const run = (await sql`SELECT id FROM runs WHERE wallet = ${wallet} AND status='active' ORDER BY id DESC LIMIT 1`)[0];
  const posChk = (await sql`SELECT mint FROM positions WHERE run_id = ${run.id} LIMIT 1`)[0];
  if (posChk?.mint !== star.mint) {
    throw new Error(`challenge ${idx + 1} bought the wrong token (wanted ${star.symbol})`);
  }
  const t = (await sql`SELECT mint, symbol, price_sol FROM trades WHERE run_id = ${run.id} ORDER BY id DESC LIMIT 1`)[0];
  const px0 = Number(t?.price_sol ?? 0.0001);
  const now0 = Date.now();
  const values = Array.from({ length: 11 }, (_, i) =>
    `(${run.id}, ${now0 - (i + 2) * 60000}, 'buy', '${t.mint}', '${t.symbol}', ${(0.2 / px0).toFixed(4)}, ${px0}, 0.2, 0.002, NULL)`,
  ).join(",");
  await sql.query(
    `INSERT INTO trades(run_id, ts, side, mint, symbol, qty, price_sol, sol_amount, fee_sol, pnl_sol) VALUES ${values}`,
  );
  await sql`UPDATE runs SET trade_count = 12 WHERE id = ${run.id}`;

  // the rip
  pump = { mint: star.mint, t0: Date.now(), ms: pumpMs, mult };
  await page.evaluate((p0, ms, x) => window.__pumpChart(p0, ms, x), star.priceUsd, pumpMs, mult);
  if (rides === "long") {
    await moveTo(700, 640, 800);
    await moveTo(1000, 520, 1300);
    await moveTo(1280, 420, 1500);
    const posRow = await page.evaluate(() => {
      const r = [...document.querySelectorAll(".token-row")][0]?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (posRow) await moveTo(posRow.x, posRow.y, 700);
    await sleep(1600);
    await moveTo(1745, 600, 800);
    await sleep(Math.max(0, pump.t0 + pumpMs - Date.now()) + 300);
  } else {
    await moveTo(900, 560, 900);
    await moveTo(1250, 430, 1400);
    await sleep(Math.max(0, pump.t0 + pumpMs - Date.now()) + 250);
  }

  // SELL THE TOP — the bag visibly grows
  await go("sell", "button", 550, true);
  await sleep(700); // "you receive X SOL" breathes
  await go("sell 100", "button", 550);
  await sleep(1100); // fill flash, cash jumps
  await moveTo(1655, 600, 700); // eyes on EQUITY, now fat
  await sleep(1100);
  doneFactor.set(star.mint, mult);
  pump = null;

  // claim the pass
  await go("secure pass", "button", 650);
  await sleep(1700); // celebration
};

// ── pre-warm the DexScreener charts ──────────────────────────────────────
// The first embed load in a fresh browser takes seconds ("Loading pair…" on
// camera — the one thing this film must never show). Load each star's embed
// once BEFORE recording so assets and pair data sit in the browser cache.
for (const s of stars) {
  const prof = await fetch(BASE + "/api/token/" + s.mint).then((r) => r.json()).catch(() => null);
  if (!prof?.chartPair) continue;
  await page
    .goto(`https://dexscreener.com/solana/${prof.chartPair}?embed=1&theme=light&chartTheme=light&trades=0&info=0`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    })
    .catch(() => {});
  await sleep(1200);
}

// ── action ──
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
const rec = await page.screencast({ path: "video/public/demo-short.webm" });
recStart = Date.now();
await page.evaluate(() => window.__curTo(960, 700, 0));
await sleep(1700); // hero plays

await go("Start challenge 01", "a,button", 650);
await sleep(1400);
await go("play free", "button", 600);
await sleep(1300);
// paid track from the first frame of the terminal — the story is the $300
const seat = (await sql`SELECT id FROM runs WHERE wallet = ${wallet} AND status='active' ORDER BY id DESC LIMIT 1`)[0];
if (seat) await sql`UPDATE runs SET tier='paid' WHERE id=${seat.id}`;
await sleep(1300); // receipt finishes → terminal

const rulesBtn = await findBox("take the desk");
await sleep(700);
await moveTo(rulesBtn.x, rulesBtn.y, 550);
await click();
await sleep(800);
mark("seated");

await playChallenge(stars[0], 0, { mult: 2.9, pumpMs: 7000, chartWait: 3600, rides: "long" });
await go("start challenge 02", "button", 600);
await sleep(900);
mark("ch1_done");

await playChallenge(stars[1], 1, { mult: 4.2, pumpMs: 5000, chartWait: 1800, rides: "short" });
await go("start challenge 03", "button", 600);
await sleep(900);
mark("ch2_done");

await playChallenge(stars[2], 2, { mult: 7.5, pumpMs: 5000, chartWait: 1800, rides: "short" });
mark("won");

// the win overlay is up — payout queued. Seconds later the money lands.
await sleep(1200);
const fakeSig = bs58.encode(crypto.randomBytes(64));
await sql`UPDATE withdrawals SET status='paid', paid_at=${Date.now()}, tx_sig=${fakeSig}
          WHERE wallet = 'demo-blocked' AND status IN ('pending','paying','blocked')`;
const payoutBox = await findBox("payout", "div,p,span", 20).catch(() => null);
if (payoutBox) await moveTo(payoutBox.x, payoutBox.y, 700);
await sleep(5600); // the 5s poll flips the card to "✓ $300.00 sent"
await moveTo(960, 570, 600);
await sleep(2200); // hold the receipt
mark("end");

await rec.stop();
await b.close();

// cleanup: the film account leaves no trace the payout system could touch
await sql`DELETE FROM withdrawals WHERE wallet IN (${wallet}, 'demo-blocked')`;
await sql`DELETE FROM positions WHERE run_id IN (SELECT id FROM runs WHERE wallet = ${wallet})`;
await sql`DELETE FROM trades WHERE run_id IN (SELECT id FROM runs WHERE wallet = ${wallet})`;
await sql`DELETE FROM runs WHERE wallet = ${wallet}`;
await sql`DELETE FROM users WHERE wallet = ${wallet}`;
console.log("demo-short.webm recorded, demo account cleaned");
process.exit(0);
