import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/DMSans";

const { fontFamily } = loadFont();

const BG = "#131316";
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// The fill that moves through the letterforms. Ink and accent, nothing neon.
const FILL =
  "linear-gradient(105deg, #6f83c4 0%, #9db4ff 16%, #f1f4ff 31%, #8ea9ff 45%, #6d80bd 60%, #a8bcff 78%, #e8eeff 100%)";

export const HeroWordmark: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        justifyContent: "center",
        alignItems: "center",
        padding: "0 40px",
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 300,
          lineHeight: 1,
          letterSpacing: -12,
          whiteSpace: "nowrap",
          backgroundImage: FILL,
          backgroundSize: "260% 100%",
          // the fill drifts across the word, slowly, and returns. no cut on loop.
          backgroundPosition: `${interpolate(
            frame,
            [0, 270, 540],
            [0, 100, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.45, 0, 0.55, 1),
            }
          ).toFixed(3)}% 50%`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          opacity: interpolate(frame, [0, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
          scale: interpolate(frame, [0, 40], [1.04, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
        }}
      >
        RUANGKOTAK
      </div>
    </AbsoluteFill>
  );
};
