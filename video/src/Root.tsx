import { Composition } from "remotion";
import { Main, TOTAL_FRAMES } from "./Video";

export const Root: React.FC = () => (
  <Composition
    id="GetFunded"
    component={Main}
    durationInFrames={TOTAL_FRAMES}
    fps={30}
    width={1920}
    height={1080}
  />
);
