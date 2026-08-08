import { Composition } from "remotion";
import { Main, TOTAL_FRAMES } from "./Video";
import { Demo, DEMO_FRAMES, Short, SHORT_FRAMES } from "./Demo";

export const Root: React.FC = () => (
  <>
    <Composition id="GetFunded" component={Main} durationInFrames={TOTAL_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="Demo" component={Demo} durationInFrames={DEMO_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="Short" component={Short} durationInFrames={SHORT_FRAMES} fps={30} width={1920} height={1080} />
  </>
);
