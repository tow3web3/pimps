// Solflare's connect() resolves `true` — prove the pay path handles it
import puppeteer from "puppeteer-core";
import nacl from "tweetnacl";
import bs58 from "bs58";
const [S, CHROME] = process.argv.slice(2);
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
const [name, value] = cookie.split("=");

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
await b.setCookie({ name, value, domain: "localhost", path: "/" });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 950 });
await p.exposeFunction("__sign", (m) => Array.from(nacl.sign.detached(new TextEncoder().encode(m), kp.secretKey)));
await p.evaluateOnNewDocument((wallet, pkBytes) => {
  const bytes = new Uint8Array(pkBytes);
  const key = { toBase58: () => wallet, toString: () => wallet, toBytes: () => bytes, toBuffer: () => bytes };
  // EXACT Solflare shape: connect resolves TRUE, key lives on the provider
  window.solflare = {
    publicKey: null,
    connect: async () => { window.solflare.publicKey = key; return true; },
    signMessage: async (b2) => ({ signature: new Uint8Array(await window.__sign(new TextDecoder().decode(b2))) }),
    signAndSendTransaction: async () => { throw new Error("fake: no real transfer"); },
  };
}, wallet, Array.from(kp.publicKey));

await p.goto("http://localhost:3333/enter", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.toLowerCase().includes("usdc classic"))?.click());
await new Promise((r) => setTimeout(r, 400));
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.className.includes("btn-heat") && x.closest("main"))?.click());
await new Promise((r) => setTimeout(r, 8000));
const state = await p.evaluate(() => ({
  banner: document.querySelector("main [class*='--down']")?.textContent?.trim() ?? "",
  receipt: [...document.querySelectorAll("main p")].map((x) => x.textContent.trim()).filter((t) => t.startsWith(">")).join(" | "),
  cta: [...document.querySelectorAll("button")].find((x) => x.className.includes("btn-heat"))?.textContent?.trim(),
  processing: !!document.querySelector(".live-dot"),
}));
console.log(JSON.stringify(state, null, 1));
await b.close();
