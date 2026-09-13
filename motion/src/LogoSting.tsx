import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  ANIM_VB, BASE, BCX, BCY, BOX, BOX_EDGE, CENTER_DX, CENTER_DY, EXIT, FILLER, GROW, LOCK_W, PAD, S, SQ,
  SQ_HOME, TL, WORD_D, WORD_X,
} from "./logo/geometry";

// Same loop as svg/lockup-animated-*.svg: rest, the word slides into the box, the box moves
// to the centre and grows while the square of space splits out, hold, the square slides
// back in, the box returns, the word slides back out to rest. Last frame = first frame.
const E_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const E_IN = Easing.bezier(0.7, 0, 0.84, 0);
const E_INOUT = Easing.bezier(0.65, 0, 0.35, 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const seg = (p: number, a: number, b: number, from: number, to: number, easing: (t: number) => number) =>
  interpolate(p, [a, b], [from, to], { ...clamp, easing });

export type LogoStingProps = {
  ink: string;
  ground: string; // "transparent" for the alpha render
  widthRatio: number; // logo width as a share of the frame width
};

export const LogoSting: React.FC<LogoStingProps> = ({ ink, ground, widthRatio }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = (frame / durationInFrames) * 100; // percent through the loop, same units as the CSS

  const wordX = p < TL.out0 ? seg(p, TL.in0, TL.in1, 0, -EXIT, E_IN) : seg(p, TL.out0, 100, -EXIT, 0, E_OUT);

  const move = p < TL.ret0 ? seg(p, TL.box0, TL.box1, 0, 1, E_INOUT) : seg(p, TL.ret0, TL.ret1, 1, 0, E_INOUT);
  const k = 1 + (GROW - 1) * move;

  const open = p < TL.back0 ? seg(p, TL.split0, TL.split1, 0, 1, E_OUT) : seg(p, TL.back0, TL.back1, 1, 0, E_INOUT);
  const dx = (SQ_HOME.x - SQ.x) * (1 - open);
  const dy = (SQ_HOME.y - SQ.y) * (1 - open);
  const closed = p < TL.split0 || p >= TL.back1;

  return (
    <AbsoluteFill style={{ backgroundColor: ground, justifyContent: "center", alignItems: "center" }}>
      <svg viewBox={ANIM_VB.join(" ")} style={{ width: `${widthRatio * 100}%` }}>
        <defs>
          <clipPath id="rk-lane">
            <rect x={BOX_EDGE} y={-PAD} width={LOCK_W - BOX_EDGE + 1} height={ANIM_VB[3]} />
          </clipPath>
        </defs>
        <g
          transform={`translate(${CENTER_DX * move} ${CENTER_DY * move}) translate(${BCX} ${BCY}) scale(${k}) translate(${-BCX} ${-BCY})`}
        >
          <g transform={`scale(${S})`}>
            <path fill={ink} d={BOX} />
            {closed ? <path fill={ink} d={FILLER} /> : null}
            <rect fill={ink} x={SQ.x + dx} y={SQ.y + dy} width={SQ.size} height={SQ.size} />
          </g>
        </g>
        <g clipPath="url(#rk-lane)">
          <g transform={`translate(${WORD_X + wordX} ${BASE})`}>
            <path fill={ink} d={WORD_D} />
          </g>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
