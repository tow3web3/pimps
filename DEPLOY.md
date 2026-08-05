# Deploying GetFunded to Vercel

The app is serverless-ready: state lives in Postgres (Neon), scheduled work runs
as Vercel Crons, and the price feed coordinates one shared upstream fetch across
every instance through a database lock.

---

## 1. Import the repo

[vercel.com/new](https://vercel.com/new) → import `tow3web3/pimps` → **Deploy**.

Framework, build command and output are detected automatically. The first build
will succeed but the site will not work until step 2 — that is expected.

## 2. Environment variables

**Settings → Environment Variables.** Add each of these for *Production*,
*Preview* and *Development*, then **Redeploy** (variables are only picked up by
a new deployment).

| Variable | Value | Effect if missing |
|---|---|---|
| `DATABASE_URL` | the Neon connection string | nothing works — required |
| `ADMIN_SECRET` | from `.env.local` | `/admin` refuses every request |
| `CRON_SECRET` | from `.env.local` | crons still run (Vercel authenticates itself); manual triggering is blocked |
| `HELIUS_API_KEY` | `4acdd274-…` | price feed falls back to DexScreener (~3s instead of ~1.5s) |
| `TREASURY_WALLET` | `BXBx98vFg2HXgTyhkFrMLy8VaKPu2N6iqggNSrCMMRV7` | payments stay simulated |
| `HOT_WALLET_SECRET_KEY` | the base58 secret key | withdrawals queue but are never paid |
| `PAYOUT_DAILY_CAP_USD` | `500` | defaults to 500 |

Copy the exact values from your local `.env.local`. **Never commit that file** —
it is gitignored and must stay that way.

> `TREASURY_WALLET` and the `$GF` mint can also be set from `/admin` at runtime,
> which is the intended path on launch day: it takes effect on the next request
> with no redeploy.

## 3. Crons

`vercel.json` already declares them; Vercel picks them up on deploy:

| Path | Schedule | Job |
|---|---|---|
| `/api/cron/universe` | every 2 min | rebuild the eligible token universe (~28s per run) |
| `/api/cron/payouts` | every 5 min | pay due withdrawals from the payout wallet |
| `/api/cron/maintenance` | hourly | prune old candles, expired sessions and nonces |

Check them under **Deployments → Crons** after the first deploy. On the Hobby
plan Vercel limits cron frequency — if `*/2` is rejected, change the universe
schedule to `*/10 * * * *`; coverage still converges, just more slowly.

## 4. Launch day

1. Open `https://<your-domain>/admin`
2. Paste `ADMIN_SECRET` → **unlock**
3. Paste the `$GF` contract address → **go live**

Decimals are read from the chain, the price is quoted from the deepest pool, and
the discounted lane opens by itself. No deploy, no restart, no downtime.

## 5. Before taking real money

- Fund the payout wallet with SOL (transaction fees) and USDC (payouts).
- Have the `/terms` page reviewed by a lawyer — it is an operator draft.
- Neon keeps point-in-time backups; confirm the retention on your plan.

---

## What changed for serverless

| Concern | Persistent server | Vercel |
|---|---|---|
| Storage | SQLite file | Neon Postgres |
| Payout worker | `setInterval` | `/api/cron/payouts` |
| Universe sweep | `setInterval` | `/api/cron/universe`, bounded per run |
| Price feed | one in-process loop | Postgres lock elects one refresher |
| Backups | hourly local copy | Neon point-in-time recovery |
| Rate limiting | in-process, exact | in-process, per instance |

The last row is the one honest caveat: rate limiting counts per instance, so
under heavy fan-out a caller gets a higher effective allowance. The limits that
protect money do not rely on it — the free-roll lock, the one-pending-withdrawal
rule and the payment replay guard are all enforced by database constraints and
conditional updates, which hold no matter how many instances are running.
