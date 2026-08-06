import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// home-screen icon: the paper tile with the heat diamond
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f2efe6",
          border: "6px solid #131110",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            background: "#ff5200",
            border: "5px solid #131110",
            transform: "rotate(45deg)",
          }}
        />
      </div>
    ),
    size,
  );
}
