// On a persistent server this armed background workers. On Vercel there are no
// background timers — the same jobs run from /api/cron/* on a schedule, so this
// hook only warms the schema.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureSchema } = await import("./server/sql");
    await ensureSchema();
    console.log("[boot] schema ready");
  } catch (e) {
    console.error("[boot] schema bootstrap failed:", e instanceof Error ? e.message : e);
  }
}
