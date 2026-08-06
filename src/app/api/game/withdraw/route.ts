import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The funded-account withdrawal model is gone: clearing challenge 3 pays a
// fixed prize automatically. This endpoint is kept only so old clients get a
// clear message instead of a 404.
export async function POST() {
  return NextResponse.json(
    { error: "withdrawals are automatic now — the prize is sent when you win" },
    { status: 410 },
  );
}
