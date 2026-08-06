import puppeteer from "puppeteer-core";
const [S, CHROME] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 950 });
await p.evaluateOnNewDocument(() => {
  const mk = () => ({ isPhantom: true, publicKey: null, connect: async () => ({}), signMessage: async () => ({}) });
  window.phantom = { solana: mk() };
  window.solflare = mk();
  window.backpack = { solana: mk() };
});
await p.goto("http://localhost:3333/enter", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 3000));
const chips = await p.evaluate(() =>
  [...document.querySelectorAll("button")].filter((b) => /Phantom|Solflare|Backpack/.test(b.textContent)).map((b) => b.textContent.trim()),
);
console.log("picker chips:", JSON.stringify(chips));
await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Solflare"))?.click());
await new Promise((r) => setTimeout(r, 500));
await p.screenshot({ path: `${S}/wallet-picker.png` });
console.log("preferred after click:", await p.evaluate(() => localStorage.getItem("gf_wallet")));
await b.close();
