import puppeteer from "puppeteer-core";
const [S, CHROME] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--use-angle=metal", "--enable-gpu", "--window-size=1920,1080"],
});
const p = await b.newPage();
await p.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
await p.setViewport({ width: 1920, height: 1080 });
await p.goto("https://dexscreener.com/solana/HMzvsEEmtzHhvZNw9uwbaG85HCTmFnkbhzUx16cy7ca3?embed=1&theme=light&chartTheme=light&trades=0&info=0", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 9000));
await p.screenshot({ path: `${S}/chart-headless.png` });
await b.close();
console.log("done");
