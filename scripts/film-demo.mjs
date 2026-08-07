// The demo film director: a visible cursor signs in, takes the free seat,
// reads the rules, picks a token, buys, and clears all three challenges on
// the REAL site while this script forces the ladder behind the scenes.
// Output: video/public/demo.webm (screencast of the whole journey).
import puppeteer from "puppeteer-core";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3333";
const sql = neon(readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim());

// fresh account, session cookie only (no seat yet — the cursor will take it)
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
const [name, value] = cookie.split("=");
await b.setCookie({ name, value, domain: "localhost", path: "/" });

// the visible cursor — brand style, injected on every page
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

const moveTo = async (x, y, ms = 700) => {
  await page.evaluate((x, y, ms) => window.__curTo(x, y, ms), x, y, ms);
  const steps = Math.max(8, Math.floor(ms / 40));
  await page.mouse.move(x, y, { steps });
  cx = x; cy = y;
  await sleep(ms + 80);
};
const click = async () => {
  await page.evaluate((x, y) => window.__curClick(x, y), cx, cy);
  await page.mouse.click(cx, cy);
  await sleep(280);
};
const findBox = async (needle, tag = "button") => {
  for (let i = 0; i < 30; i++) {
    const box = await page.evaluate((needle, tag) => {
      const els = [...document.querySelectorAll(tag)];
      const el = els.find((e) => e.textContent.toLowerCase().includes(needle.toLowerCase()) && e.offsetParent !== null);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, needle, tag);
    if (box) return box;
    await sleep(400);
  }
  throw new Error("not found: " + needle);
};
const go = async (needle, tag = "button", ms = 700) => {
  const p = await findBox(needle, tag);
  await moveTo(p.x, p.y, ms);
  await click();
};

process.on("unhandledRejection", async (e) => {
  console.error("FAIL:", e.message);
  try { await page.screenshot({ path: "video/out/demo-fail.png" }); } catch {}
  process.exit(1);
});

// ── action ──
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
const rec = await page.screencast({ path: "video/public/demo.webm" });
await page.evaluate(() => window.__curTo(960, 700, 0));
await sleep(2600); // hero animation plays

await go("Start challenge 01", "a,button", 900);
await sleep(2200); // /enter

// pick the free ticket, then the CTA
await go("free roll", "button", 800);
await sleep(600);
await go("play free", "button", 800);
await sleep(4200); // receipt prints, redirect to terminal

// rules gate
await sleep(1500);
const rulesBtn = await findBox("take the desk");
await moveTo(960, 420, 900); // glance over the rules
await sleep(1200);
await moveTo(rulesBtn.x, rulesBtn.y, 700);
await click();
await sleep(1200);

// browse tokens, open one
const row = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".token-row")];
  const r = rows[1]?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
if (row) {
  await moveTo(row.x, row.y, 800);
  await sleep(400);
  await click();
}
await sleep(4500); // chart loads with real candles

// buy: 50% then the big green button
await go("50%", "button", 800);
await sleep(500);
await go("buy ", "button", 700);
await sleep(3000); // fill toast + position row + pnl badge

// clear the ladder — the script forces the target, the cursor secures it.
// every phase is a NEW run row, and the HUD gates on that run's trade LIST:
// top the current run up to 11 fills each time
const force = async (cash) => {
  const run = (await sql`SELECT id FROM runs WHERE wallet = ${wallet} AND status = 'active' ORDER BY id DESC LIMIT 1`)[0];
  if (!run) throw new Error("no active run to force");
  const have = Number((await sql`SELECT COUNT(*)::int c FROM trades WHERE run_id = ${run.id}`)[0].c);
  if (have < 11) {
    const t = (await sql`
      SELECT mint, symbol, price_sol FROM trades
      WHERE run_id IN (SELECT id FROM runs WHERE wallet = ${wallet})
      ORDER BY id DESC LIMIT 1
    `)[0];
    const mint = t?.mint ?? "So11111111111111111111111111111111111111112";
    const sym = t?.symbol ?? "SOL";
    const px = Number(t?.price_sol ?? 0.0001);
    const now = Date.now();
    const values = Array.from({ length: 11 - have }, (_, i) =>
      `(${run.id}, ${now - (i + 2) * 60000}, 'buy', '${mint}', '${sym}', ${(0.2 / px).toFixed(4)}, ${px}, 0.2, 0.002, NULL)`,
    ).join(",");
    await sql.query(
      `INSERT INTO trades(run_id, ts, side, mint, symbol, qty, price_sol, sol_amount, fee_sol, pnl_sol) VALUES ${values}`,
    );
  }
  await sql`UPDATE runs SET cash_sol = ${cash}, trade_count = 12 WHERE id = ${run.id}`;
};
for (const [cash, next] of [[16, "start challenge 02"], [22, "start challenge 03"], [31, null]]) {
  await force(cash);
  await sleep(6500); // state poll picks it up, secure-pass starts pulsing
  await go("secure pass", "button", 900);
  await sleep(2400); // celebration
  if (next) {
    await go(next, "button", 700);
    await sleep(1500);
  }
}
await sleep(3800); // YOU WON overlay lingers
await rec.stop();
await b.close();
console.log("demo.webm recorded");
process.exit(0);
