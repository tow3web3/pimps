// The full ladder, for real: CH01 → CH02 → CH03 → prize row. Targets are
// reached by DB-forcing the cash (prices can't be faked), every transition
// goes through the real securepass endpoint.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const DB = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(DB);
const BASE = "http://localhost:3333";

let cookie = "";
const req = async (path, opts = {}) => {
  const r = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  const c = r.headers.get("set-cookie"); if (c) cookie = c.split(";")[0];
  return { status: r.status, j: await r.json().catch(() => null) };
};

// email account — also validates the no-wallet path end to end
const email = `ladder-${Date.now()}@test.dev`;
await req("/api/auth/email", { method: "POST", body: JSON.stringify({ email, password: "ladderladder1" }) });
const me = await req("/api/auth/me");
const acct = me.j.wallet;
await req("/api/game/enter", { method: "POST", body: JSON.stringify({ method: "free" }) });

const force = async (cash) => {
  await sql`UPDATE runs SET cash_sol = ${cash}, trade_count = 12 WHERE wallet = ${acct} AND status = 'active'`;
};

const report = [];
for (const [phase, cash] of [[0, 16], [1, 22], [2, 31]]) {
  await force(cash);
  const pass = await req("/api/game/securepass", { method: "POST", body: "{}" });
  const st = await req("/api/game/state");
  report.push({
    clearedPhase: phase + 1,
    securepass: pass.status,
    after: st.j?.run
      ? { phase: st.j.run.phase + 1, cashSol: st.j.run.cashSol, status: st.j.run.status, trades: st.j.run.tradeCount }
      : { status: "no active run", prize: st.j?.prize ?? null },
  });
}
const withdrawal = await sql`SELECT payout_usd, status, wallet FROM withdrawals WHERE wallet = ${acct} OR run_id IN (SELECT id FROM runs WHERE wallet = ${acct}) ORDER BY id DESC LIMIT 1`;
console.log(JSON.stringify({ acct: acct.slice(0, 8), ladder: report, prizeRow: withdrawal[0] ?? null }, null, 1));
