import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { cookies } from "next/headers";
import { ensureSchema, sql, type Row } from "./sql";
import { BRAND } from "@/lib/rules";

const SESSION_TTL = 30 * 24 * 3600_000;
const NONCE_TTL = 5 * 60_000;
export const SESSION_COOKIE = "gf_session";

export async function issueNonce(wallet: string): Promise<string> {
  await ensureSchema();
  const nonce = randomBytes(16).toString("hex");
  await sql`
    INSERT INTO auth_nonces(wallet, nonce, expires_at)
    VALUES (${wallet}, ${nonce}, ${Date.now() + NONCE_TTL})
    ON CONFLICT(wallet) DO UPDATE SET nonce = excluded.nonce, expires_at = excluded.expires_at
  `;
  return nonce;
}

export function loginMessage(wallet: string, nonce: string): string {
  return `${BRAND} login\nwallet: ${wallet}\nnonce: ${nonce}`;
}

/** verify the wallet signature over the login message, mint a session token */
export async function verifyAndCreateSession(
  wallet: string,
  signatureB58: string,
): Promise<string | null> {
  await ensureSchema();
  const rows = (await sql`
    SELECT nonce, expires_at FROM auth_nonces WHERE wallet = ${wallet}
  `) as Row[];
  if (rows.length === 0) return null;
  const expires = Number(rows[0].expires_at);
  if (expires < Date.now()) return null;

  let ok = false;
  try {
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(loginMessage(wallet, rows[0].nonce as string)),
      bs58.decode(signatureB58),
      bs58.decode(wallet),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  const token = randomBytes(32).toString("hex");
  await sql`DELETE FROM auth_nonces WHERE wallet = ${wallet}`;
  await sql`
    INSERT INTO users(wallet, created_at) VALUES (${wallet}, ${Date.now()})
    ON CONFLICT(wallet) DO NOTHING
  `;
  await sql`
    INSERT INTO sessions(token, wallet, expires_at)
    VALUES (${token}, ${wallet}, ${Date.now() + SESSION_TTL})
  `;
  return token;
}

export async function sessionWallet(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureSchema();
  const rows = (await sql`
    SELECT wallet, expires_at FROM sessions WHERE token = ${token}
  `) as Row[];
  if (rows.length === 0) return null;
  if (Number(rows[0].expires_at) < Date.now()) return null;
  return rows[0].wallet as string;
}

export async function destroySession(token: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}
