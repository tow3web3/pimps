// prints a fresh session cookie after a full wallet sign-in + free enter
import nacl from "tweetnacl";
import bs58 from "bs58";
const BASE = process.argv[2] || "http://localhost:3333";
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);
let cookie = "";
const req = async (path, opts = {}) => {
  const r = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  const setC = r.headers.get("set-cookie");
  if (setC) cookie = setC.split(";")[0];
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
};
const n = await req("/api/auth/nonce", { method: "POST", body: JSON.stringify({ wallet }) });
const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.j.message), kp.secretKey));
const v = await req("/api/auth/verify", { method: "POST", body: JSON.stringify({ wallet, signature: sig }) });
const e = await req("/api/game/enter", { method: "POST", body: JSON.stringify({ method: "free" }) });
console.log(JSON.stringify({ wallet, cookie, verify: v.status, enter: e.status, run: e.j?.state?.run?.status ?? e.j?.error }));
