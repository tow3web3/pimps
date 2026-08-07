// The demo film: a real cursor on the real site — sign in, take the free
// seat, read the rules, buy, clear all three challenges, get the win screen.
// The screencast is the whole story; Remotion adds only the hello and the CTA.
import { AbsoluteFill, OffthreadVideo, Series, staticFile } from "remotion";
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
