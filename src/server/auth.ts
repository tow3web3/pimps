import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { cookies } from "next/headers";
import { db } from "./db";
import { BRAND } from "@/lib/rules";

const SESSION_TTL = 30 * 24 * 3600_000;
const NONCE_TTL = 5 * 60_000;
export const SESSION_COOKIE = "gf_session";

export function issueNonce(wallet: string): string {
  const nonce = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO auth_nonces(wallet, nonce, expires_at) VALUES(?,?,?) " +
      "ON CONFLICT(wallet) DO UPDATE SET nonce=excluded.nonce, expires_at=excluded.expires_at",
  ).run(wallet, nonce, Date.now() + NONCE_TTL);
  return nonce;
}

export function loginMessage(wallet: string, nonce: string): string {
  return `${BRAND} login\nwallet: ${wallet}\nnonce: ${nonce}`;
}

/** verify the Phantom signature over the login message, mint a session token */
export function verifyAndCreateSession(wallet: string, signatureB58: string): string | null {
  const row = db
    .prepare("SELECT nonce, expires_at FROM auth_nonces WHERE wallet=?")
    .get(wallet) as { nonce: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;

  let ok = false;
  try {
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(loginMessage(wallet, row.nonce)),
      bs58.decode(signatureB58),
      bs58.decode(wallet),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  db.prepare("DELETE FROM auth_nonces WHERE wallet=?").run(wallet);
  db.prepare("INSERT OR IGNORE INTO users(wallet, created_at) VALUES(?,?)").run(wallet, Date.now());
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token, wallet, expires_at) VALUES(?,?,?)").run(
    token,
    wallet,
    Date.now() + SESSION_TTL,
  );
  return token;
}

export async function sessionWallet(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare("SELECT wallet, expires_at FROM sessions WHERE token=?")
    .get(token) as { wallet: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return row.wallet;
}

export function destroySession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token=?").run(token);
}
