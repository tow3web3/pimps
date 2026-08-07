import puppeteer from "puppeteer-core";
const [S, CHROME] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 950 });
await p.goto("http://localhost:3333/terminal", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: `${S}/rules-gate.png` });
// mobile too
await p.setViewport({ width: 390, height: 844 });
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: `${S}/rules-gate-mobile.png` });
await b.close();
console.log("done");
