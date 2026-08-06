// Full UI reproduction: fake Phantom provider (real ed25519 signatures),
// real clicks through /enter, watching where the browser actually lands.
import puppeteer from "puppeteer-core";
import nacl from "tweetnacl";
import bs58 from "bs58";

const [CHROME, SHOT, LANE = "free"] = process.argv.slice(2);
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 950 });
await p.exposeFunction("__walletSign", (msg) =>
  Array.from(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)),
);
await p.evaluateOnNewDocument((wallet, pkBytes) => {
  // enough of a PublicKey for ATA derivation: base58 + raw bytes
  const bytes = new Uint8Array(pkBytes);
  const fakeKey = {
    toBase58: () => wallet,
    toString: () => wallet,
    toBytes: () => bytes,
    toBuffer: () => bytes,
    equals: (o) => o?.toBase58?.() === wallet,
  };
  const provider = {
    isPhantom: true,
    publicKey: null,
    connect: async () => {
      provider.publicKey = fakeKey;
      return { publicKey: provider.publicKey };
    },
    signMessage: async (bytes) => {
      const msg = new TextDecoder().decode(bytes);
      const sig = await window.__walletSign(msg);
      return { signature: new Uint8Array(sig) };
    },
    signAndSendTransaction: async () => {
      throw new Error("fake wallet: refusing real transfer");
    },
  };
  window.phantom = { solana: provider };
}, wallet, Array.from(kp.publicKey));

const logs = [];
p.on("console", (m) => { if (m.type() === "error") logs.push("console: " + m.text().slice(0, 140)); });
p.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 140)));

await p.goto("http://localhost:3333/enter", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 2500));

// which lane is selected by default, and is the CTA disabled?
const before = await p.evaluate(() => {
  const cta = [...document.querySelectorAll("button")].find((b) => b.className.includes("btn-heat") && b.closest("main"));
  return { cta: cta?.textContent?.trim(), disabled: cta?.disabled ?? null };
});
console.log("default state:", JSON.stringify(before));

if (LANE !== "default") {
  const label = LANE === "free" ? "free roll" : LANE === "usdc" ? "usdc classic" : "holders";
  await p.evaluate((label) => {
    const t = [...document.querySelectorAll("button")].find((b) => b.textContent.toLowerCase().includes(label));
    t?.click();
  }, label);
  await new Promise((r) => setTimeout(r, 400));
}
await p.evaluate(() => {
  const cta = [...document.querySelectorAll("button")].find((b) => b.className.includes("btn-heat") && b.closest("main"));
  cta?.click();
});
// wait for either navigation to /terminal or receipt lines
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (p.url().includes("/terminal")) break;
}
const receipt = await p.evaluate(() =>
  [...document.querySelectorAll("main p")].map((x) => x.textContent.trim()).filter((t) => t.startsWith(">")).join(" | "),
).catch(() => "");
const bannerText = await p.evaluate(() => document.querySelector("main .border-\\[var\\(--down\\)\\]")?.textContent?.trim() ?? "");
console.log("banner:", bannerText.slice(0, 160) || "(none)");
console.log("final url:", p.url());
console.log("receipt:", receipt || "(none)");
console.log("errors:", logs.slice(0, 6).join("\n") || "(none)");
await p.screenshot({ path: `${SHOT}/ui-enter-${LANE}.png` });
await b.close();
