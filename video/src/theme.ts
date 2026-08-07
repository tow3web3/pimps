import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadInstrument } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const bricolage = loadBricolage();
const instrument = loadInstrument();
const mono = loadMono();

export const T = {
  paper: "#f2efe6",
  panel: "#f9f6ee",
  ink: "#131110",
  ink2: "#575349",
  ink3: "#8d8778",
  heat: "#ff5200",
  heatDeep: "#d63c00",
  up: "#0a8f55",
  down: "#cf3b31",
  display: bricolage.fontFamily,
  serif: instrument.fontFamily,
  mono: mono.fontFamily,
};

export const dotGrid: React.CSSProperties = {
  backgroundColor: T.paper,
  backgroundImage: "radial-gradient(rgba(19,17,16,0.07) 2px, transparent 2px)",
  backgroundSize: "48px 48px",
};
