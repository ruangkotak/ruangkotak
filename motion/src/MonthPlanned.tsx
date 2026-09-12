import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

const BG = "#131316";
const INK = "#f2f2f0";
const MUTED = "#8b8b95";
const LINE = "#2c2c34";
const ACCENT = "#7a9dff";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const FONT =
  'ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Eight angles, the shape of a real month. Intent mix is the point:
// teach and prove carry the month, one offer closes it.
const IDEAS: { tag: string; line: string }[] = [
  { tag: "TEACH", line: "The mistake in every first draft" },
  { tag: "TEACH", line: "Three questions before you hire anyone" },
  { tag: "PROVE", line: "What the quote actually pays for" },
  { tag: "STORY", line: "Why we turned this project down" },
  { tag: "TEACH", line: "The part nobody budgets for" },
  { tag: "PROVE", line: "The version we shipped, and the one we did not" },
  { tag: "STORY", line: "What changed after the first month" },
  { tag: "OFFER", line: "Who this is not for" },
];

const WEEKS = ["WEEK 1", "WEEK 2", "WEEK 3", "WEEK 4"];

export const MonthPlanned: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        fontFamily: FONT,
        padding: 72,
        // one global fade at the tail so the clip loops without a cut
        opacity: interpolate(frame, [0, 8, 246, 268], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        }),
      }}
    >
      <div
        style={{
          color: MUTED,
          fontSize: 22,
          letterSpacing: 2.4,
          fontWeight: 600,
          opacity: interpolate(frame, [6, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
        }}
      >
        RUANGKOTAK
      </div>

      <div
        style={{
          color: INK,
          fontSize: 62,
          lineHeight: 1.05,
          letterSpacing: -1.8,
          fontWeight: 600,
          marginTop: 26,
          maxWidth: 640,
          opacity: interpolate(frame, [12, 36], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
          translate: `0px ${interpolate(frame, [12, 40], [14, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }).toFixed(2)}px`,
        }}
      >
        A month, planned.
      </div>

      <div style={{ marginTop: 64, display: "flex", gap: 34 }}>
        {/* week rail. each bracket claims two ideas, which is the real cadence */}
        <div style={{ width: 96, display: "flex", flexDirection: "column", gap: 0 }}>
          {WEEKS.map((w, i) => {
            const start = 150 + i * 10;
            return (
              <div
                key={w}
                style={{
                  height: 160,
                  borderLeft: `2px solid ${ACCENT}`,
                  paddingLeft: 14,
                  paddingTop: 8,
                  color: ACCENT,
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: 1.6,
                  opacity: interpolate(frame, [start, start + 22], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE,
                  }),
                  scaleY: interpolate(frame, [start, start + 26], [0.4, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE,
                  }),
                  transformOrigin: "top left",
                }}
              >
                {w}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }}>
          {IDEAS.map((idea, i) => {
            const start = 34 + i * 13;
            const isOffer = idea.tag === "OFFER";
            return (
              <div
                key={idea.line}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 20,
                  height: 80,
                  borderBottom: `1px solid ${LINE}`,
                  opacity: interpolate(frame, [start, start + 20], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE,
                  }),
                  translate: `0px ${interpolate(frame, [start, start + 24], [18, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE,
                  }).toFixed(2)}px`,
                }}
              >
                <span
                  style={{
                    color: isOffer ? ACCENT : MUTED,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 1.4,
                    width: 58,
                    flexShrink: 0,
                  }}
                >
                  {idea.tag}
                </span>
                <span
                  style={{
                    color: INK,
                    fontSize: 26,
                    letterSpacing: -0.5,
                    lineHeight: 1.3,
                  }}
                >
                  {idea.line}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          color: MUTED,
          fontSize: 22,
          lineHeight: 1.45,
          maxWidth: 560,
          opacity: interpolate(frame, [196, 222], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
        }}
      >
        You film and post.
        <br />
        <span style={{ color: INK }}>We do everything on either side of that.</span>
      </div>
    </AbsoluteFill>
  );
};
