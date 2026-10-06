import {
  HOME_BLOCKS,
  type HomeBlockSetting,
  type HomeBlockType,
  homeBlockText,
  homeBlockTypes,
  type StoredHomeBlock,
} from "@layered/schemas";
import type { DashboardStringKey, InterfaceLanguage } from "./dashboard-i18n.js";
import type { useDashboardLanguage } from "./language-context.js";

/**
 * What the dashboard calls a block, its settings and their options.
 *
 * The keys are built from the declarations in `@layered/schemas`, so a setting
 * added there finds its label here without another edit to this file: the
 * catalogue entry is the one edit, and a test holds every declared key to having
 * one in both languages. A key the catalogue lacks shows as the key itself,
 * which is visible rather than silent.
 */

/** The catalogue lookup `useDashboardLanguage` hands out. */
export type Text = ReturnType<typeof useDashboardLanguage>["text"];

/** `featured_entry` and `excludeFeatured` as the middle of a camel-case key. */
function camel(value: string): string {
  return value.replace(/(?:^|_)(\w)/g, (_match, letter: string) => letter.toUpperCase());
}

/** The catalogue key naming a block type. */
export const blockTypeKey = (type: HomeBlockType) => `homeBlock${camel(type)}` as DashboardStringKey;

/** The catalogue key labelling a setting. */
export const settingKey = (key: string) => `homeSetting${camel(key)}` as DashboardStringKey;

/** The catalogue key of one option of a choice. */
export const optionKey = (key: string, value: string) =>
  `homeOption${camel(key)}${camel(value)}` as DashboardStringKey;

/**
 * Whether a choice is shown as a segmented control rather than a dropdown.
 *
 * A segmented control shows every option side by side, which only stays
 * readable while each is one short word. An option that has to be shortened to
 * fit is one the reader cannot read, so anything longer gets a dropdown.
 *
 * @param labels - The options as the interface language names them.
 */
export function segmentsFit(labels: readonly string[]): boolean {
  return labels.every((label) => !/\s/.test(label) && label.length <= SEGMENT_WORD_LIMIT);
}

/** The longest single word a segmented control shows whole beside its neighbors. */
const SEGMENT_WORD_LIMIT = 10;

/**
 * The line under a block's type in the list, which says what it currently shows.
 *
 * Read from the block's own settings, so it changes when they do and cannot go
 * stale.
 *
 * @param text - The catalogue lookup.
 * @param block - The block as stored.
 * @param language - The interface language, which is also the language whose texts it quotes.
 */
export function blockSummary(text: Text, block: StoredHomeBlock, language: InterfaceLanguage): string {
  const settings = block.settings;
  switch (block.type) {
    case "hero":
      return homeBlockText("hero", settings, "title", language);
    case "featured_entry":
      return text(optionKey("source", String(settings.source)));
    case "project_grid":
    case "post_grid":
      return [
        text("homeSummaryCount", Number(settings.limit)),
        text(optionKey("order", String(settings.order))),
        ...(settings.excludeFeatured === true ? [text("homeSummaryWithoutFeatured")] : []),
      ].join(" · ");
    case "topic_bar":
      return text("homeSummaryTopics", settings.showCounts === true);
  }
}

/** Every catalogue key the declarations need, for the test that holds both languages to them. */
export function declaredKeys(): DashboardStringKey[] {
  return homeBlockTypes.flatMap((type) => [
    blockTypeKey(type),
    ...HOME_BLOCKS[type].settings.flatMap((setting: HomeBlockSetting) => [
      settingKey(setting.key),
      ...(setting.kind === "choice" ? setting.options.map((value) => optionKey(setting.key, value)) : []),
    ]),
  ]);
}
