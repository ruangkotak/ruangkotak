import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadMono } from "@remotion/google-fonts/DMMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/Spectral";

const { fontFamily: SANS } = loadSans();
const { fontFamily: MONO } = loadMono();
// Old-style serif for the display line, the way the desk sets its headings.
const { fontFamily: SERIF } = loadSerif();

// The Content Desk ramp. Depth carries what colour used to, so the only
// "accent" left is pure white and every surface separates by shadow.
const BG = "#1e1e1e";
const BG_2 = "#202020";
const RAISE_HI = "#2e2e2e";
const RAISE_LO = "#101010";
const SINK_HI = "#2b2b2b";
const SINK_LO = "#121212";

const INK = "#f2f2f2";
const MUTED = "#a6a6a6";
const DIM = "#767676";
const LINE = "#2c2c2c";
const ACCENT = "#ffffff";

const UP_SM = `-3px -3px 7px ${RAISE_HI}, 3px 3px 7px ${RAISE_LO}`;
const IN_SM = `inset -2px -2px 5px ${SINK_HI}, inset 2px 2px 5px ${SINK_LO}`;

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// 12s at 30fps. The playhead owns frames 44-312; the rest is head and tail
// room so the clip can loop without a visible cut.
export const DURATION = 360;
const SWEEP_IN = 44;
const SWEEP_OUT = 312;

// Geometry. The grid is the whole composition, so these are the only
// numbers that matter when the canvas size changes.
const W = 1600;
const H = 840;
const PAD = 78;
const LABEL_W = 306;
const TRACK_X = PAD + LABEL_W;
const TRACK_W = W - PAD - TRACK_X;
const LANE_H = 74;
const BAR_H = 16;

type Lane = {
  label: string;
  // fractions of the month, 0 to 1
  segments: { from: number; to: number }[];
  // true when the client does the work, not us. Drawn as an outline.
  theirs?: boolean;
  count?: string;
};

// Six lanes, the real order of operations. Positioning lands before month
// one, which is why it starts left of zero and finishes first.
const LANES: Lane[] = [
  { label: "Positioning", segments: [{ from: 0, to: 0.17 }], count: "once" },
  { label: "Eight ideas", segments: [{ from: 0.1, to: 0.42 }], count: "8" },
  { label: "Scripts", segments: [{ from: 0.24, to: 0.7 }], count: "8" },
  { label: "Captions", segments: [{ from: 0.38, to: 0.84 }], count: "8" },
  {
    label: "You film and post",
    segments: [
      { from: 0.3, to: 0.46 },
      { from: 0.55, to: 0.71 },
      { from: 0.78, to: 0.94 },
    ],
    theirs: true,
  },
  { label: "Reporting", segments: [{ from: 0.86, to: 1 }], count: "1 call" },
];

const WEEKS = ["Week 1", "Week 2", "Week 3", "Week 4"];

const ease = (frame: number, a: number, b: number, from: number, to: number) =>
  interpolate(frame, [a, b], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

export const MonthTimeline: React.FC = () => {
  const frame = useCurrentFrame();

  // The playhead is the clock everything else reads from. Near-linear on
  // purpose: a progress timeline that races to the end and then sits still
  // reads as a slideshow, not as work getting done.
  const head = interpolate(frame, [SWEEP_IN, SWEEP_OUT], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.42, 0.02, 0.58, 1),
  });
  const headX = TRACK_X + head * TRACK_W;
  const pct = Math.round(head * 100);

  const chromeIn = ease(frame, 6, 30, 0, 1);
  const gridIn = ease(frame, 16, 44, 0, 1);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        fontFamily: SANS,
        opacity: interpolate(frame, [0, 10, 336, 358], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        }),
      }}
    >
      {/* ---- top chrome: who, what, and how far along ---- */}
      <div
        style={{
          position: "absolute",
          left: PAD,
          top: PAD - 22,
          right: PAD,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          opacity: chromeIn,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 19,
            letterSpacing: 3.2,
            color: MUTED,
          }}
        >
          RUANGKOTAK
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 17,
            letterSpacing: 2.2,
            color: head >= 1 ? ACCENT : MUTED,
            padding: "9px 17px",
            borderRadius: 999,
            boxShadow: IN_SM,
          }}
        >
          {head >= 1 ? "MONTH 01 / DELIVERED" : `MONTH 01 / ${pct}%`}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: PAD,
          top: PAD + 22,
          fontFamily: SERIF,
          fontSize: 60,
          fontWeight: 400,
          letterSpacing: -1,
          color: INK,
          opacity: ease(frame, 12, 38, 0, 1),
          translate: `0px ${ease(frame, 12, 42, 14, 0).toFixed(2)}px`,
        }}
      >
        A month of content, in progress.
      </div>

      {/* ---- week columns ---- */}
      {WEEKS.map((w, i) => {
        const x = TRACK_X + (i / 4) * TRACK_W;
        const active = head >= i / 4;
        return (
          <div key={w} style={{ opacity: gridIn }}>
            <div
              style={{
                position: "absolute",
                left: x,
                top: 216,
                width: 1,
                height: 32 + LANES.length * LANE_H + 26,
                backgroundColor: LINE,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: x + 14,
                top: 222,
                fontFamily: MONO,
                fontSize: 17,
                letterSpacing: 2,
                color: active ? INK : DIM,
              }}
            >
              {w.toUpperCase()}
            </div>
          </div>
        );
      })}

      {/* ---- lanes ---- */}
      {LANES.map((lane, i) => {
        const top = 272 + i * LANE_H;
        const laneStart = Math.min(...lane.segments.map((s) => s.from));
        const laneEnd = Math.max(...lane.segments.map((s) => s.to));
        const started = head >= laneStart;
        const done = head >= laneEnd;
        const rowIn = ease(frame, 24 + i * 7, 52 + i * 7, 0, 1);

        return (
          <div key={lane.label} style={{ opacity: rowIn }}>
            <div
              style={{
                position: "absolute",
                left: PAD,
                top: top + 2,
                width: LABEL_W - 30,
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  letterSpacing: -0.3,
                  whiteSpace: "nowrap",
                  color: started ? INK : DIM,
                }}
              >
                {lane.label}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 15,
                  color: done ? ACCENT : DIM,
                }}
              >
                {done ? "done" : lane.count ?? ""}
              </span>
            </div>

            {/* the well the work sits in. sunken, full width, so an empty
                lane still reads as a lane and not as missing content. */}
            <div
              style={{
                position: "absolute",
                left: TRACK_X,
                top: top + 6,
                width: TRACK_W,
                height: BAR_H,
                borderRadius: BAR_H / 2,
                backgroundColor: BG_2,
                boxShadow: IN_SM,
              }}
            />

            {lane.segments.map((seg, j) => {
              const x = TRACK_X + seg.from * TRACK_W;
              const full = (seg.to - seg.from) * TRACK_W;
              // The bar fills only as fast as the playhead reaches it. This is
              // the whole trick: progress is never ahead of the clock.
              const grown = interpolate(
                head,
                [seg.from, seg.to],
                [0, full],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              if (grown <= 0.5) return null;

              return (
                <div
                  key={j}
                  style={{
                    position: "absolute",
                    left: x,
                    top: top + 6,
                    width: grown,
                    height: BAR_H,
                    borderRadius: BAR_H / 2,
                    backgroundColor: lane.theirs ? "transparent" : ACCENT,
                    border: lane.theirs ? `1.5px solid ${DIM}` : "none",
                    boxShadow: lane.theirs ? "none" : UP_SM,
                    // finished work steps back so the live edge stays brightest
                    opacity: lane.theirs ? 1 : head > seg.to ? 0.5 : 1,
                  }}
                />
              );
            })}

            {/* eight ticks on the ideas lane, two a week */}
            {lane.label === "Eight ideas" &&
              Array.from({ length: 8 }).map((_, k) => {
                const at = 0.1 + (k / 7) * 0.32;
                if (head < at) return null;
                return (
                  <div
                    key={k}
                    style={{
                      position: "absolute",
                      left: TRACK_X + at * TRACK_W - 3,
                      top: top + 6 + BAR_H / 2 - 3,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: BG_2,
                    }}
                  />
                );
              })}
          </div>
        );
      })}

      {/* ---- playhead ---- */}
      <div
        style={{
          position: "absolute",
          left: headX,
          top: 210,
          width: 2,
          height: 38 + LANES.length * LANE_H + 26,
          backgroundColor: INK,
          opacity: ease(frame, SWEEP_IN - 10, SWEEP_IN + 8, 0, 1) *
            (head >= 1 ? ease(frame, SWEEP_OUT, SWEEP_OUT + 20, 1, 0) : 1),
        }}
      />

      {/* ---- footer line ---- */}
      <div
        style={{
          position: "absolute",
          left: PAD,
          bottom: PAD - 20,
          fontFamily: SERIF,
          fontSize: 26,
          lineHeight: 1.4,
          color: MUTED,
          opacity: ease(frame, 280, 308, 0, 1),
        }}
      >
        You film and post.{" "}
        <span style={{ color: INK }}>
          We do everything on either side of that.
        </span>
      </div>

      {/* ---- legend ---- */}
      <div
        style={{
          position: "absolute",
          right: PAD,
          bottom: PAD - 14,
          display: "flex",
          gap: 26,
          alignItems: "center",
          fontFamily: MONO,
          fontSize: 15,
          letterSpacing: 1.4,
          color: MUTED,
          opacity: chromeIn,
        }}
      >
        <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <span
            style={{
              width: 22,
              height: 8,
              borderRadius: 4,
              backgroundColor: ACCENT,
              boxShadow: UP_SM,
            }}
          />
          WE DO
        </span>
        <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <span
            style={{
              width: 22,
              height: 8,
              borderRadius: 4,
              border: `1.5px solid ${DIM}`,
            }}
          />
          YOU DO
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const MONTH_TIMELINE_SIZE = { width: W, height: H };
