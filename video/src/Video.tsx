import { AbsoluteFill, Img, OffthreadVideo, Series, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Brut, Count, Kinetic, Label, Mark, Paper, Shot, Sticker } from "./bits";
import { T } from "./theme";

const CENTER: React.CSSProperties = {
  justifyContent: "center",
  alignItems: "center",
  padding: 120,
};

/* S1 — the mark lands, the name follows */
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 22, fps, config: { damping: 200 } });
  return (
    <Paper>
      <AbsoluteFill style={{ ...CENTER, flexDirection: "column", gap: 40 }}>
        <Mark size={300} wobble />
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              fontFamily: T.display,
              fontWeight: 800,
              fontSize: 130,
              letterSpacing: -4,
              color: T.ink,
              transform: `translateY(${(1 - s) * 110}%)`,
            }}
          >
            GETFUNDED
          </div>
        </div>
        <Label delay={40}>the memecoin prop firm</Label>
      </AbsoluteFill>
    </Paper>
  );
};

/* S2 — the problem */
const Problem: React.FC = () => (
  <Paper band>
    <AbsoluteFill style={{ ...CENTER, flexDirection: "column", alignItems: "flex-start", gap: 36 }}>
      <Label color="rgba(242,239,230,0.5)">the problem</Label>
      <Kinetic text="Memecoins punish" size={120} color={T.paper} from={6} />
      <Kinetic text="the wrong things." size={120} color={T.paper} from={16} serifWords={[2]} />
      <div style={{ fontFamily: T.mono, fontSize: 34, color: "rgba(242,239,230,0.65)", marginTop: 20 }}>
        <FadeIn delay={34}>bag size beats skill · losses are unbounded · nothing is provable</FadeIn>
      </div>
    </AbsoluteFill>
  </Paper>
);

const FadeIn: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ opacity: o }}>{children}</div>;
};

/* S3 — the offer */
const Offer: React.FC = () => (
  <Paper>
    <AbsoluteFill style={{ ...CENTER, flexDirection: "column", alignItems: "flex-start", gap: 30 }}>
      <Label>the offer</Label>
      <Kinetic text="Trade a 10 SOL stack." size={108} from={4} />
      <Kinetic text="Risk nothing real." size={108} from={14} serifWords={[2]} />
      <div style={{ display: "flex", alignItems: "center", gap: 60, marginTop: 30 }}>
        <Count to={300} size={330} delay={30} />
        <div style={{ fontFamily: T.mono, fontSize: 32, color: T.ink2, lineHeight: 1.6 }}>
          <FadeIn delay={55}>
            cash prize · sent straight
            <br />
            to your wallet
          </FadeIn>
        </div>
      </div>
    </AbsoluteFill>
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", padding: 90 }}>
      <Sticker delay={70}>free roll — win $50</Sticker>
    </AbsoluteFill>
  </Paper>
);

/* S4 — the ladder */
const Ladder: React.FC = () => {
  const rows = [
    { n: "01", g: "+50%", t: "10 → 15 SOL" },
    { n: "02", g: "+100%", t: "10 → 20 SOL" },
    { n: "03", g: "+200%", t: "10 → 30 SOL" },
  ];
  return (
    <Paper>
      <AbsoluteFill style={{ ...CENTER, flexDirection: "column", alignItems: "flex-start", gap: 26 }}>
        <Label>the gauntlet</Label>
        <Kinetic text="Three challenges. One payday." size={100} from={4} serifWords={[3]} />
        <div style={{ width: "100%", marginTop: 30 }}>
          {rows.map((r, i) => (
            <LadderRow key={r.n} {...r} delay={26 + i * 16} last={i === 2} />
          ))}
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

const LadderRow: React.FC<{ n: string; g: string; t: string; delay: number; last?: boolean }> = ({ n, g, t, delay, last }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 140 } });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 60,
        borderTop: `4px solid ${T.ink}`,
        padding: "34px 10px",
        opacity: s,
        transform: `translateX(${(1 - s) * -60}px)`,
      }}
    >
      <span style={{ fontFamily: T.display, fontWeight: 800, fontSize: 76, color: last ? T.heat : T.ink3 }}>{n}</span>
      <span style={{ fontFamily: T.display, fontWeight: 800, fontSize: 96, letterSpacing: -3, color: T.ink }}>{g}</span>
      <span style={{ fontFamily: T.mono, fontSize: 34, color: T.ink2, marginLeft: "auto" }}>{t}</span>
      {last && (
        <span style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 62, color: T.heat }}>→ get paid $300</span>
      )}
    </div>
  );
};

/* S5 — the rules */
const Rules: React.FC = () => {
  const rules = [
    ["33%", "max per token"],
    ["5 SOL", "hard floor"],
    ["10", "trades minimum"],
    ["1%", "fee per fill"],
  ];
  return (
    <Paper>
      <AbsoluteFill style={{ ...CENTER, flexDirection: "column", gap: 40 }}>
        <Label>house rules — skill is the only edge</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, width: 1400, marginTop: 20 }}>
          {rules.map(([k, d], i) => (
            <Brut key={k} delay={10 + i * 10} style={{ padding: "46px 56px" }}>
              <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 110, color: T.heatDeep, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: T.mono, fontSize: 30, letterSpacing: "0.18em", textTransform: "uppercase", color: T.ink2, marginTop: 14 }}>
                {d}
              </div>
            </Brut>
          ))}
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

/* S6 — the product, real screenshots */
const Product: React.FC<{ file: string; caption: string; serifWords?: number[]; width?: number }> = ({ file, caption, serifWords = [], width }) => (
  <Paper>
    <AbsoluteFill style={{ ...CENTER, flexDirection: "column", gap: 44 }}>
      <Kinetic text={caption} size={72} from={2} serifWords={serifWords} />
      <Shot file={file} delay={8} width={width} />
    </AbsoluteFill>
  </Paper>
);

/* S7 — the burn */
const Burn: React.FC = () => (
  <Paper band>
    <AbsoluteFill style={{ ...CENTER, flexDirection: "column", alignItems: "flex-start", gap: 34 }}>
      <Label color="rgba(242,239,230,0.5)">$GETFUNDED</Label>
      <Kinetic text="Every entry paid in" size={104} color={T.paper} from={4} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 40 }}>
        <Kinetic text="$GETFUNDED is" size={104} color={T.paper} from={14} />
        <Kinetic text="burned." size={130} from={24} serifWords={[0]} />
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 36, color: "rgba(242,239,230,0.65)", marginTop: 24 }}>
        <FadeIn delay={44}>supply only shrinks · −25% on every entry for holders</FadeIn>
      </div>
    </AbsoluteFill>
  </Paper>
);

/* S8 — CTA */
const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 30, fps, config: { damping: 200 } });
  return (
    <Paper>
      <AbsoluteFill style={{ ...CENTER, flexDirection: "column", gap: 36 }}>
        <Mark size={200} wobble />
        <Kinetic text="Trade memecoins." size={120} from={8} />
        <Kinetic text="Get funded." size={120} from={18} serifWords={[1]} />
        <div
          style={{
            fontFamily: T.display,
            fontWeight: 800,
            fontSize: 44,
            background: T.heat,
            color: T.ink,
            border: `4px solid ${T.ink}`,
            borderRadius: 10,
            padding: "26px 60px",
            boxShadow: `10px 10px 0 ${T.ink}`,
            opacity: s,
            transform: `translateY(${(1 - s) * 40}px)`,
            marginTop: 20,
          }}
        >
          getfunded — free roll, win $50 →
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 28, color: T.ink3, display: "flex", gap: 60 }}>
          <FadeIn delay={50}>x.com/getfundeddotfun</FadeIn>
          <FadeIn delay={58}>t.me/getfundedfun</FadeIn>
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

/* B-ROLL: drop Higgsfield clips in public/broll, then add scenes like
   { d: 90, C: () => <Broll file="broll/broll-1.mp4" /> } to SCENES */
export const Broll: React.FC<{ file: string }> = ({ file }) => (
  <AbsoluteFill style={{ backgroundColor: T.ink }}>
    <OffthreadVideo src={staticFile(file)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  </AbsoluteFill>
);

const SCENES: Array<{ d: number; C: React.FC }> = [
  { d: 120, C: Intro },
  { d: 150, C: Problem },
  { d: 190, C: Offer },
  { d: 120, C: () => <Broll file="broll/holders.mp4" /> },
  { d: 210, C: Ladder },
  { d: 170, C: Rules },
  { d: 165, C: () => <Product file="shots/landing.png" caption="One site — zero installs." serifWords={[3]} /> },
  { d: 165, C: () => <Product file="shots/terminal.png" caption="A real desk — live pump.fun prices." serifWords={[6]} /> },
  { d: 150, C: () => <Product file="shots/enter-mobile.png" caption="Enter free — win real cash." serifWords={[4,5]} width={430} /> },
  { d: 150, C: Burn },
  { d: 180, C: Cta },
];

export const TOTAL_FRAMES = SCENES.reduce((a, s) => a + s.d, 0);

export const Main: React.FC = () => (
  <Series>
    {SCENES.map((s, i) => (
      <Series.Sequence key={i} durationInFrames={s.d}>
        <s.C />
      </Series.Sequence>
    ))}
  </Series>
);
