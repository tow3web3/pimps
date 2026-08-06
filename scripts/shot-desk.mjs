import puppeteer from "puppeteer-core";
import nacl from "tweetnacl";
import bs58 from "bs58";
const [S, CHROME] = process.argv.slice(2);
// authenticated session so the terminal shows a real active run
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);
let cookie = "";
const req = async (path, opts = {}) => {
  const r = await fetch("http://localhost:3333" + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  const c = r.headers.get("set-cookie"); if (c) cookie = c.split(";")[0];
  return r.json().catch(() => null);
};
const n = await req("/api/auth/nonce", { method: "POST", body: JSON.stringify({ wallet }) });
const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.message), kp.secretKey));
await req("/api/auth/verify", { method: "POST", body: JSON.stringify({ wallet, signature: sig }) });
await req("/api/game/enter", { method: "POST", body: JSON.stringify({ method: "free" }) });
const [name, value] = cookie.split("=");

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
await b.setCookie({ name, value, domain: "localhost", path: "/" });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 950 });
await p.goto("http://localhost:3333/terminal", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 7000));
// click 75% in the trade panel like the user did
await p.evaluate(() => {
  const b75 = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "75%");
  b75?.click();
});
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: `${S}/paper-term.png` });
// laptop-height viewport — the original complaint
await p.setViewport({ width: 1440, height: 780 });
await new Promise((r) => setTimeout(r, 1200));
await p.screenshot({ path: `${S}/paper-term-short.png` });
await p.goto("http://localhost:3333/leaderboard", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: `${S}/paper-board.png` });
// mobile terminal
await p.setViewport({ width: 390, height: 844 });
await p.goto("http://localhost:3333/terminal", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
await p.screenshot({ path: `${S}/paper-term-mobile.png` });
await b.close();
console.log("done");
