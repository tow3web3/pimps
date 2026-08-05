import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/server/sql";
import { pruneCandles } from "@/server/candles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** housekeeping the persistent server used to do on a timer */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (!fromVercelCron && (!secret || auth !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  await pruneCandles();
  return NextResponse.json({ ok: true, pruned: true });
}
