import { Composition } from "remotion";
import { MonthPlanned } from "./MonthPlanned";
import { LogoSting } from "./LogoSting";
import { MonthTimeline, DURATION, MONTH_TIMELINE_SIZE } from "./MonthTimeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MonthPlanned"
        component={MonthPlanned}
        durationInFrames={270}
        fps={30}
        width={1000}
        height={1250}
      />
      <Composition
        id="MonthTimeline"
        component={MonthTimeline}
        durationInFrames={DURATION}
        fps={30}
        width={MONTH_TIMELINE_SIZE.width}
        height={MONTH_TIMELINE_SIZE.height}
      />
      {/* logo sting. 6s seamless loop. alpha version renders as ProRes 4444 */}
      <Composition
        id="LogoSting-16x9"
        component={LogoSting}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ ink: "#ffffff", ground: "#000000", widthRatio: 0.52 }}
      />
      <Composition
        id="LogoSting-1x1"
        component={LogoSting}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{ ink: "#ffffff", ground: "#000000", widthRatio: 0.72 }}
      />
      <Composition
        id="LogoSting-9x16"
        component={LogoSting}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ ink: "#ffffff", ground: "#000000", widthRatio: 0.72 }}
      />
      <Composition
        id="LogoSting-alpha"
        component={LogoSting}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ ink: "#ffffff", ground: "transparent", widthRatio: 0.52 }}
      />
    </>
  );
};
