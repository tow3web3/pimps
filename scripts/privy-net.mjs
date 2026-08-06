import puppeteer from "puppeteer-core";
const [CHROME] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const p = await b.newPage();
const hits = [];
p.on("response", async (r) => {
  if (/privy/.test(r.url())) {
    let body = "";
    try { body = (await r.text()).slice(0, 160); } catch {}
    hits.push(`${r.status()} ${r.url().slice(0, 90)} ${body.replace(/\s+/g, " ")}`);
  }
});
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") hits.push(m.type() + ": " + m.text().slice(0, 220)); });
p.on("requestfailed", (r) => hits.push("REQFAIL " + r.url().slice(0, 100) + " " + (r.failure()?.errorText ?? "")));
await p.goto("http://localhost:3333/enter", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 8000));
console.log(hits.slice(0, 10).join("\n") || "no privy network traffic at all");
await b.close();
