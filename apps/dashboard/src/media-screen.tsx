import { Card } from "@layered/ui";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardLanguage } from "./language-context.js";
import { MediaBrowser } from "./media-browser.js";
import type { DashboardArea } from "./routes.js";
export function MediaScreen({ area }: { area: DashboardArea }) {
  const { text } = useDashboardLanguage();
  return (
    <>
      <ScreenTitle title={text(area.labelKey)} />
      <Card>
        <MediaBrowser />
      </Card>
    </>
  );
}
