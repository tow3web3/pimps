// The demo film: a real cursor on the real site — sign in, take the free
// seat, read the rules, buy, clear all three challenges, get the win screen.
// The screencast is the whole story; Remotion adds only the hello and the CTA.
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Kinetic, Label, Mark, Paper } from "./bits";
import { T } from "./theme";
import { Cta } from "./Video";

const VIDEO_FRAMES = 2667; // measured from demo.webm

const Hello: React.FC = () => (
  <Paper>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 36 }}>
      <Mark size={200} wobble />
      <Kinetic text="Watch a full run." size={110} from={4} serifWords={[3]} />
      <Label delay={26}>sign in → trade → clear 3 challenges → get paid</Label>
    </AbsoluteFill>
  </Paper>
);

const Film: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#131110" }}>
    <OffthreadVideo src={staticFile("demo.webm")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  </AbsoluteFill>
);

export const DEMO_FRAMES = 75 + VIDEO_FRAMES + 170;

export const Demo: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={75}>
      <Hello />
    </Series.Sequence>
    <Series.Sequence durationInFrames={VIDEO_FRAMES}>
      <Film />
    </Series.Sequence>
    <Series.Sequence durationInFrames={170}>
      <Cta />
    </Series.Sequence>
  </Series>
);

// ── the short cut ────────────────────────────────────────────────────────
// One 96s take, three speeds: the seat + challenge 01 read at near-real pace,
// challenges 02 and 03 fly by (the "same game ×3" beat), the win breathes.
// Subtitles carry the story; timings are expressed in RAW take seconds and
// mapped through the segment speeds. MARKs from scripts/film-short.mjs:
// seated 10.92 · ch1_done 39.35 · ch2_done 63.56 · won 85.95 · end 96.95
const SEGS = [
  { from: 0, to: 39.35, rate: 1.85 },
  { from: 39.35, to: 85.95, rate: 4.2 },
  { from: 85.95, to: 96.8, rate: 1.6 },
];
const segDur = SEGS.map((s) => Math.round(((s.to - s.from) / s.rate) * 30));
const FILM_FRAMES = segDur.reduce((a, b) => a + b, 0);
const SHORT_HOLD = 30;
const CTA_FRAMES = 120;
export const SHORT_FRAMES = FILM_FRAMES + SHORT_HOLD + CTA_FRAMES;

const rawToFrame = (raw: number): number => {
  let acc = 0;
  for (let i = 0; i < SEGS.length; i++) {
    const s = SEGS[i];
    if (raw <= s.to) return acc + ((raw - s.from) / s.rate) * 30;
    acc += segDur[i];
  }
  return acc;
};

const SUBS: { from: number; to: number; text: string; hot?: boolean }[] = [
  { from: 1.8, to: 7.2, text: "free roll in — a 10 SOL stack on live pump.fun" },
  { from: 8.0, to: 10.8, text: "5 house rules, then the desk" },
  { from: 11.5, to: 17.8, text: "challenge 01 · pick a runner, size in" },
  { from: 21.0, to: 27.4, text: "the chart rips → your pnl rips with it" },
  { from: 27.8, to: 33.8, text: "sell the top — the bag grows for real" },
  { from: 34.0, to: 39.1, text: "target smashed → SECURE PASS claims it" },
  { from: 39.4, to: 62.8, text: "challenge 02 — new token, same playbook (4× speed)" },
  { from: 63.9, to: 85.6, text: "challenge 03 — last rip, +200% target" },
  { from: 86.2, to: 91.4, text: "ALL 3 CLEARED → $300 cash", hot: true },
  { from: 91.4, to: 96.8, text: "usdc sent to your wallet — automatically ✓", hot: true },
];

const SubBand: React.FC<{ text: string; hot?: boolean; t: number }> = ({ text, hot, t }) => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
    <div
      style={{
        marginBottom: 64,
        background: hot ? T.heat : T.paper,
        color: hot ? T.paper : T.ink,
        border: `3px solid ${T.ink}`,
        boxShadow: `7px 7px 0 rgba(19,17,16,0.8)`,
        borderRadius: 12,
        padding: "14px 34px",
        fontFamily: T.mono,
        fontWeight: 700,
        fontSize: 31,
        letterSpacing: 0.3,
        opacity: t,
        transform: `translateY(${(1 - t) * 18}px)`,
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

const Subs: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame >= FILM_FRAMES + SHORT_HOLD) return null;
  // the hold keeps the last card on screen with the final message
  const sub =
    frame >= FILM_FRAMES
      ? SUBS[SUBS.length - 1]
      : SUBS.find((s) => frame >= rawToFrame(s.from) && frame < rawToFrame(s.to));
  if (!sub) return null;
  const start = frame >= FILM_FRAMES ? rawToFrame(sub.from) : rawToFrame(sub.from);
  const t = Math.min(1, Math.max(0, (frame - start) / 7));
  return <SubBand text={sub.text} hot={sub.hot} t={t} />;
};

export const Short: React.FC = () => (
  <AbsoluteFill>
    <Series>
      {SEGS.map((s, i) => (
        <Series.Sequence key={i} durationInFrames={segDur[i]}>
          <AbsoluteFill style={{ backgroundColor: "#131110" }}>
            <OffthreadVideo
              src={staticFile("demo-short.webm")}
              muted
              playbackRate={s.rate}
              startFrom={Math.round(s.from * 30)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        </Series.Sequence>
      ))}
      {/* Freeze×OffthreadVideo mis-seeks — hold the win on an extracted still */}
      <Series.Sequence durationInFrames={SHORT_HOLD}>
        <AbsoluteFill style={{ backgroundColor: "#131110" }}>
          <Img
            src={staticFile("win-hold.png")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      </Series.Sequence>
      <Series.Sequence durationInFrames={CTA_FRAMES}>
        <Cta />
      </Series.Sequence>
    </Series>
    <Subs />
  </AbsoluteFill>
);
