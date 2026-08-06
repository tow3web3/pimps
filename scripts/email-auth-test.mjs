// email lane proof: register → free seat → active run → attach payout wallet
const BASE = "http://localhost:3333";
let cookie = "";
const req = async (path, opts = {}) => {
  const r = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  const c = r.headers.get("set-cookie"); if (c) cookie = c.split(";")[0];
  return { status: r.status, j: await r.json().catch(() => null) };
};
const email = `test-${Date.now()}@getfunded.dev`;
const reg = await req("/api/auth/email", { method: "POST", body: JSON.stringify({ email, password: "hunter2hunter2" }) });
const me = await req("/api/auth/me");
const enter = await req("/api/game/enter", { method: "POST", body: JSON.stringify({ method: "free" }) });
const badpw = await (async () => { const save = cookie; cookie = ""; const r = await req("/api/auth/email", { method: "POST", body: JSON.stringify({ email, password: "wrongwrongwrong" }) }); cookie = save; return r; })();
const relog = await (async () => { cookie = ""; const r = await req("/api/auth/email", { method: "POST", body: JSON.stringify({ email, password: "hunter2hunter2" }) }); return r; })();
const setw = await req("/api/auth/set-wallet", { method: "POST", body: JSON.stringify({ wallet: "BXBx98vFg2HXgTyhkFrMLy8VaKPu2N6iqggNSrCMMRV7" }) });
const badw = await req("/api/auth/set-wallet", { method: "POST", body: JSON.stringify({ wallet: "not-a-wallet" }) });
console.log(JSON.stringify({
  register: { status: reg.status, acct: reg.j?.wallet?.slice(0, 6), label: reg.j?.label },
  me: { status: me.status, label: me.j?.label },
  enter: { status: enter.status, run: enter.j?.state?.run?.status },
  wrongPassword: badpw.status,
  relogin: relog.status,
  setWallet: setw.status,
  invalidWallet: badw.status,
}, null, 1));
