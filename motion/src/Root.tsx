import { Composition } from "remotion";
import { MonthPlanned } from "./MonthPlanned";
import { HeroWordmark } from "./HeroWordmark";
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
      <Composition
        id="HeroWordmark"
        component={HeroWordmark}
        durationInFrames={540}
        fps={30}
        width={1920}
        height={560}
      />
    </>
  );
};
