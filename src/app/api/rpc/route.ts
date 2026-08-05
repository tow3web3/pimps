import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// JSON-RPC proxy so the browser can talk to Solana without ever seeing the
// Helius key. Falls back to the public endpoint if Helius refuses.
const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

async function forward(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const key = process.env.HELIUS_API_KEY;

  if (key) {
    try {
      const res = await forward(`https://mainnet.helius-rpc.com/?api-key=${key}`, body);
      if (res.ok) {
        return new NextResponse(await res.text(), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    } catch {
      // fall through to the public endpoint
    }
  }

  const res = await forward(PUBLIC_RPC, body);
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
