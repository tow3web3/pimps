import puppeteer from "puppeteer-core";
const [S, CHROME] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 950 });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
await p.goto("https://pimps-swart.vercel.app/enter", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
// wait for the privy button to become enabled (SDK ready)
await p.waitForFunction(
  () => {
    const btn = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Sign in"));
    return btn && !btn.disabled;
  },
  { timeout: 20000 },
).catch(() => errs.push("button never became ready"));
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Sign in"))?.click());
await new Promise((r) => setTimeout(r, 6000));
const probe = await p.evaluate(() => ({
  privyDialog: !!document.querySelector('#privy-dialog, [id*="privy"], iframe[src*="privy"]'),
  dialogs: [...document.querySelectorAll("dialog, [role=dialog]")].length,
  bodyEnd: document.body.innerHTML.slice(-300).replace(/\s+/g, " ").slice(0, 200),
}));
console.log(JSON.stringify(probe));
console.log("errors:", errs.join(" | ") || "(none)");
await p.screenshot({ path: `${S}/privy-modal-prod.png` });
await b.close();
