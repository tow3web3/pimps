// The demo film: a real cursor on the real site — sign in, take the free
// seat, read the rules, buy, clear all three challenges, get the win screen.
// The screencast is the whole story; Remotion adds only the hello and the CTA.
import { AbsoluteFill, Img, OffthreadVideo, Series, staticFile } from "remotion";
import { Kinetic, Label, Mark, Paper } from "./bits";
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

// ── the short cut ────────────────────────────────────────────────────────
// Opens COLD on the real site (the landing hero is its own intro), plays the
// take at 1.5× so the pacing feels like a trailer, HOLDS the $300 win frame
// (the screencast stops emitting frames once the overlay goes still), then
// closes on the CTA.
const SHORT_SECONDS = 46.7; // measured from demo-short.webm
const SHORT_RATE = 1.5;
const SHORT_FILM_FRAMES = Math.floor((SHORT_SECONDS / SHORT_RATE) * 30);
const SHORT_HOLD = 55;
export const SHORT_FRAMES = SHORT_FILM_FRAMES + SHORT_HOLD + 135;

const ShortFilm: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#131110" }}>
    <OffthreadVideo
      src={staticFile("demo-short.webm")}
      muted
      playbackRate={SHORT_RATE}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);

export const Short: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={SHORT_FILM_FRAMES}>
      <ShortFilm />
    </Series.Sequence>
    {/* Freeze×OffthreadVideo mis-seeks — hold the win on an extracted still */}
    <Series.Sequence durationInFrames={SHORT_HOLD}>
      <AbsoluteFill style={{ backgroundColor: "#131110" }}>
        <Img
          src={staticFile("win-hold.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    </Series.Sequence>
    <Series.Sequence durationInFrames={135}>
      <Cta />
    </Series.Sequence>
  </Series>
);

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
