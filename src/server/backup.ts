import fs from "node:fs";
import path from "node:path";
import { db } from "./db";

// The single SQLite file holds every account, payment and withdrawal. SQLite's
// own backup API produces a consistent copy of a LIVE database — a plain file
// copy of a WAL database can be torn. Hourly, the last 48 kept.

const DIR = path.join(process.cwd(), "data", "backups");
const KEEP = 48;

export async function runBackup() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await db.backup(path.join(DIR, `getfunded-${stamp}.db`));
    const files = fs
      .readdirSync(DIR)
      .filter((f) => f.startsWith("getfunded-") && f.endsWith(".db"))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
      fs.unlinkSync(path.join(DIR, f));
    }
  } catch (e) {
    console.error("[backup] failed:", e instanceof Error ? e.message : e);
  }
}

export function armBackups() {
  setTimeout(() => void runBackup(), 30_000);
  setInterval(() => void runBackup(), 3600_000);
  console.log(`[backup] hourly database backups armed (${KEEP} kept in data/backups)`);
}
