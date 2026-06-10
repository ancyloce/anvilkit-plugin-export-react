/**
 * @file The `exportReact` registry entry (pure data — no React) plus the
 * `AnvilkitMessages` type augmentation.
 *
 * Headless plugin (no `./ui`): the in-Studio chrome strings are the header
 * action label (`StudioHeaderAction.labelKey`) and the export-format label
 * (`ExportFormatDefinition.labelKey`), both resolved by core's chrome via
 * `useMsg(labelKey, label)` once `register()` contributes this entry.
 * Message content lives in `i18n/messages/<locale>.json`; English ships
 * inline and other locales lazy-load.
 */

import type { RegistryEntry } from "@anvilkit/core/i18n";

// Messages live at the plugin-root `i18n/messages/` (shipped via the package
// `files`). Imported from outside `src/` so the bundleless rslib build keeps
// them external `.json` — same pattern as `meta/config.json`.
import enMessages from "../../i18n/messages/en.json" with { type: "json" };

/** Static lazy-pack map (avoids a dynamic template `import()` under rslib). */
const LOCALE_PACKS: Readonly<
	Record<string, () => Promise<{ readonly default: Record<string, string> }>>
> = {
	zh: () => import("../../i18n/messages/zh.json", { with: { type: "json" } }),
	ja: () => import("../../i18n/messages/ja.json", { with: { type: "json" } }),
	ko: () => import("../../i18n/messages/ko.json", { with: { type: "json" } }),
};

/** The registry entry contributed to the catalog (core prepends `studio.*`). */
export const EXPORT_REACT_ENTRY: RegistryEntry = {
	namespace: "exportReact",
	en: enMessages,
	loadMessages: async (locale) => {
		const pack = LOCALE_PACKS[locale];
		return pack === undefined ? {} : (await pack()).default;
	},
};

/** Exact key union for the `AnvilkitMessages` augmentation. */
export type ExportReactMessageKey = keyof typeof enMessages;

// Augment the public key registry so `useT("exportReact.*")` autocompletes.
declare module "@anvilkit/core/i18n" {
	interface AnvilkitMessages extends Record<ExportReactMessageKey, string> {}
}
