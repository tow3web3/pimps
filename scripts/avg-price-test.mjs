// Proof: after 2 buys the stored averages match the recorded fills EXACTLY.
import nacl from "tweetnacl";
import bs58 from "bs58";
const BASE = "http://localhost:3333";
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);
let cookie = "";
const req = async (path, opts = {}) => {
  const r = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  const c = r.headers.get("set-cookie"); if (c) cookie = c.split(";")[0];
  return r.json().catch(() => null);
};
const n = await req("/api/auth/nonce", { method: "POST", body: JSON.stringify({ wallet }) });
const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.message), kp.secretKey));
await req("/api/auth/verify", { method: "POST", body: JSON.stringify({ wallet, signature: sig }) });
await req("/api/game/enter", { method: "POST", body: JSON.stringify({ method: "free" }) });
const toks = await req("/api/tokens");
const mint = toks.tokens[0].mint;
await req("/api/game/buy", { method: "POST", body: JSON.stringify({ mint, solAmount: 2 }) });
await new Promise((r) => setTimeout(r, 3000)); // let the price tick between fills
await req("/api/game/buy", { method: "POST", body: JSON.stringify({ mint, solAmount: 1 }) });
const st = await req("/api/game/state");
const pos = st.positions.find((p) => p.mint === mint);
const fills = st.trades.filter((t) => t.mint === mint && t.side === "buy");
const expSol = fills.reduce((s, t) => s + t.qty * t.priceSol, 0) / fills.reduce((s, t) => s + t.qty, 0);
const relErr = Math.abs(pos.avgPriceSol - expSol) / expSol;
console.log(JSON.stringify({
  fills: fills.map((t) => ({ qty: +t.qty.toFixed(2), priceSol: t.priceSol })),
  avgPriceSol: pos.avgPriceSol,
  expectedWeighted: expSol,
  relativeError: relErr,
  exact: relErr < 1e-9,
  avgPriceUsd: pos.avgPriceUsd,
  usdPinned: pos.avgPriceUsd > 0,
}, null, 1));
