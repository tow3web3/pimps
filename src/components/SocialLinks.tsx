import { SOCIALS } from "@/lib/rules";

// X and Telegram, dressed like the rest of the house: ink chip, hard shadow,
// heat on hover. Links live in rules.ts — one edit when the accounts go live.

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.78.24 1.54 1.74z" />
    </svg>
  );
}

export default function SocialLinks({ className = "" }: { className?: string }) {
  const items = [
    { href: SOCIALS.x || "#", label: "X (Twitter)", icon: <XIcon /> },
    { href: SOCIALS.telegram || "#", label: "Telegram", icon: <TelegramIcon /> },
  ];
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      {items.map((it) => (
        <a
          key={it.label}
          href={it.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={it.label}
          title={it.label}
          className="w-8 h-8 shrink-0 border-2 border-[var(--ink)] rounded-[4px] flex items-center justify-center text-[var(--ink)] bg-[var(--panel-solid)] shadow-[2px_2px_0_var(--ink)] hover:bg-[var(--heat)] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--ink)] transition-all"
        >
          {it.icon}
        </a>
      ))}
    </span>
  );
}
