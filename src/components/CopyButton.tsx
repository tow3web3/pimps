"use client";

import { useState } from "react";

/** copy-to-clipboard with a tick confirmation — used for CA and dev address */
export default function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // clipboard blocked (insecure context) — select-fallback
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing more we can do */
      }
      document.body.removeChild(ta);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };

  return (
    <button
      onClick={copy}
      title={`copy ${value}`}
      className={`mono inline-flex items-center gap-1.5 transition-colors ${
        done ? "text-[var(--up)]" : "text-[var(--ink-2)] hover:text-[var(--cyan)]"
      } ${className}`}
    >
      {label && <span>{label}</span>}
      <span className="text-[11px]">{done ? "✓ copied" : "⧉"}</span>
    </button>
  );
}
