import { NextRequest, NextResponse } from "next/server";
import { runUniverseSweep } from "@/app/api/tokens/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rebuilds the eligible universe. On a persistent server this was an interval;
 * here it is a schedule. Each run does a bounded slice of the exhaustive walk
 * and merges it into the shared snapshot, so coverage converges across runs
 * without any single invocation risking a timeout.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (!fromVercelCron && (!secret || auth !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const full = req.nextUrl.searchParams.get("mode") !== "fresh";
  const count = await runUniverseSweep(full);
  return NextResponse.json({ ok: true, mode: full ? "full" : "fresh", tokens: count });
}
