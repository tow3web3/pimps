// The SHORT demo film (~24s of screencast): a visible cursor lands, takes the
// free seat, buys a real token, and secures the FINAL challenge to the $300
// win screen — the ladder is compressed to one pass by forcing the run to
// phase 3 behind the scenes. Output: video/public/demo-short.webm
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

// star token: big, moving up, chart verified — never film a rug or a blank
const toks = await api("/api/tokens");
const candidates = toks.tokens
  .filter(
    (t) =>
      t.mcapUsd > 1_000_000 &&
      (t.vol5mUsd ?? 0) > 3_000 &&
      t.chg1h > 3 &&
      t.chg1h < 300 && // a +13000% parabola is a sparse, slow-loading chart
      (t.ageHours ?? 0) > 12, // enough history that the candles fill the frame
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

// ── action (every second counts) ──
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
const rec = await page.screencast({ path: "video/public/demo-short.webm" });
await page.evaluate(() => window.__curTo(960, 700, 0));
await sleep(1900); // hero kinetic type plays — the site introduces itself

await go("Start challenge 01", "a,button", 700);
await sleep(1600); // /enter

await go("play free", "button", 650);
await sleep(3000); // receipt prints → terminal

// rules gate: one beat, then take the desk
const rulesBtn = await findBox("take the desk");
await sleep(900);
await moveTo(rulesBtn.x, rulesBtn.y, 600);
await click();
await sleep(900);

// pick the star token from the list (type to find it, fast)
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
await sleep(3800); // the LIVE chart gets the screen

// buy 50% — glide along the chart while the fill lands
await go("50%", "button", 600);
await go("buy ", "button", 550);
await sleep(1400); // fill
await moveTo(1050, 500, 800); // read the chart like a trader
await sleep(1800); // pnl badge breathes in the list

// compress the ladder: the run becomes challenge 03 on the paid track with
// the target already beaten — the cursor only has to SECURE it on camera
const run = (await sql`SELECT id FROM runs WHERE wallet = ${wallet} AND status = 'active' ORDER BY id DESC LIMIT 1`)[0];
const t = (await sql`SELECT mint, symbol, price_sol FROM trades WHERE run_id = ${run.id} ORDER BY id DESC LIMIT 1`)[0];
const px = Number(t?.price_sol ?? 0.0001);
const now = Date.now();
const values = Array.from({ length: 11 }, (_, i) =>
  `(${run.id}, ${now - (i + 2) * 60000}, 'buy', '${t.mint}', '${t.symbol}', ${(0.2 / px).toFixed(4)}, ${px}, 0.2, 0.002, NULL)`,
).join(",");
await sql.query(
  `INSERT INTO trades(run_id, ts, side, mint, symbol, qty, price_sol, sol_amount, fee_sol, pnl_sol) VALUES ${values}`,
);
await sql`UPDATE runs SET tier='paid', phase=2, cash_sol=31, trade_count=12 WHERE id=${run.id}`;

// the poll sees the phase jump first and throws the "2/3 DOWN" celebration —
// a perfect story beat: acknowledge it, open challenge 03, then SECURE the win
await go("start challenge 03", "button", 700);
await sleep(1100); // HUD flips to challenge 03, equity beats the target
await go("secure pass", "button", 750);
await sleep(4200); // $300 WIN overlay lingers — the money shot

await rec.stop();
await b.close();

// SAFETY: the win created a REAL pending $300 payout to this throwaway
// wallet — remove it (and the runs) so a funded hot wallet can never pay it
await sql`DELETE FROM withdrawals WHERE wallet = ${wallet}`;
await sql`DELETE FROM positions WHERE run_id IN (SELECT id FROM runs WHERE wallet = ${wallet})`;
await sql`DELETE FROM trades WHERE run_id IN (SELECT id FROM runs WHERE wallet = ${wallet})`;
await sql`DELETE FROM runs WHERE wallet = ${wallet}`;
console.log("demo-short.webm recorded, demo account cleaned");
process.exit(0);
