// Shared building blocks — every scene speaks the site's language.
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { dotGrid, T } from "./theme";

export const Paper: React.FC<{ children: React.ReactNode; band?: boolean }> = ({ children, band }) => (
  <AbsoluteFill style={band ? { backgroundColor: T.ink } : dotGrid}>{children}</AbsoluteFill>
);

/** words rise out of a clipping slot, one after the other — the hero move */
export const Kinetic: React.FC<{
  text: string;
  from?: number;
  step?: number;
  size: number;
  color?: string;
  serifWords?: number[];
  weight?: number;
}> = ({ text, from = 0, step = 4, size, color = T.ink, serifWords = [], weight = 800 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.22 }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - from - i * step, fps, config: { damping: 200, stiffness: 120 } });
        const serif = serifWords.includes(i);
        return (
          <span key={i} style={{ overflow: "hidden", display: "inline-block", paddingBottom: size * 0.14, marginBottom: -size * 0.14 }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - s) * 115}%)`,
                fontFamily: serif ? T.serif : T.display,
                fontStyle: serif ? "italic" : "normal",
                fontWeight: serif ? 400 : weight,
                fontSize: serif ? size * 1.06 : size,
                letterSpacing: serif ? 0 : -size * 0.035,
                lineHeight: 1,
                color: serif ? T.heat : color,
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const Label: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({ children, color = T.heatDeep, delay = 0 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ fontFamily: T.mono, fontSize: 26, letterSpacing: "0.35em", textTransform: "uppercase", color, opacity: o }}>
      {children}
    </div>
  );
};

export const Mark: React.FC<{ size: number; delay?: number; wobble?: boolean }> = ({ size, delay = 0, wobble }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 100, mass: 0.8 } });
  const rot = wobble ? Math.sin(frame / 14) * 4 : 0;
  return (
    <Img
      src={staticFile("mark.png")}
      style={{ width: size, height: size, transform: `scale(${s}) rotate(${rot}deg)` }}
    />
  );
};

/** brutalist card: 2px ink border + hard shadow, springs in */
export const Brut: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
  shadow?: string;
}> = ({ children, delay = 0, style, shadow = T.ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 140 } });
  return (
    <div
      style={{
        background: T.panel,
        border: `4px solid ${T.ink}`,
        borderRadius: 10,
        boxShadow: `${10 * s}px ${10 * s}px 0 ${shadow}`,
        opacity: s,
        transform: `translateY(${(1 - s) * 40}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** the rotated price sticker */
export const Sticker: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = 0, size = 34 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 130 } });
  return (
    <div
      style={{
        display: "inline-block",
        fontFamily: T.display,
        fontWeight: 800,
        fontSize: size,
        textTransform: "uppercase",
        background: T.heat,
        color: T.ink,
        border: `4px solid ${T.ink}`,
        borderRadius: 999,
        padding: `${size * 0.45}px ${size * 0.9}px`,
        boxShadow: `6px 6px 0 ${T.ink}`,
        transform: `rotate(-6deg) scale(${s})`,
      }}
    >
      {children}
    </div>
  );
};

/** browser-framed screenshot with a slow push-in */
export const Shot: React.FC<{ file: string; delay?: number; zoomFrom?: number; zoomTo?: number; width?: number }> = ({
  file,
  delay = 0,
  zoomFrom = 1,
  zoomTo = 1.06,
  width = 1560,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120 } });
  const zoom = interpolate(frame, [delay, durationInFrames], [zoomFrom, zoomTo], { extrapolateLeft: "clamp" });
  return (
    <div
      style={{
        width,
        border: `4px solid ${T.ink}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: `14px 14px 0 ${T.heat}`,
        opacity: s,
        transform: `translateY(${(1 - s) * 60}px)`,
        background: T.ink,
      }}
    >
      <div style={{ display: "flex", gap: 10, padding: "14px 18px", background: T.ink }}>
        {[T.down, T.heat, T.up].map((c) => (
          <div key={c} style={{ width: 16, height: 16, borderRadius: 99, background: c }} />
        ))}
      </div>
      <div style={{ overflow: "hidden" }}>
        <Img src={staticFile(file)} style={{ width: "100%", display: "block", transform: `scale(${zoom})`, transformOrigin: "top center" }} />
      </div>
    </div>
  );
};

/** big count-up number */
export const Count: React.FC<{ to: number; prefix?: string; size: number; delay?: number; color?: string }> = ({ to, prefix = "$", size, delay = 0, color = T.heat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 60 }, durationInFrames: 45 });
  return (
    <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: size, letterSpacing: -size * 0.04, lineHeight: 1, color }}>
      {prefix}
      {Math.round(to * s)}
    </div>
  );
};
