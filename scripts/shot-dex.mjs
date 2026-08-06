import puppeteer from "puppeteer-core";
const [S, CHROME] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 950 });
await p.goto("http://localhost:3333/terminal", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "DEX");
  btn?.click();
});
await new Promise((r) => setTimeout(r, 6000));
await p.screenshot({ path: `${S}/dex-embed.png` });
await b.close();
console.log("done");
