import type {
	ExportFormatDefinition,
	StudioPlugin,
	StudioPluginMeta,
} from "@anvilkit/core/types";
import { FileCode2 } from "lucide-react";
import { createElement } from "react";

import config from "../meta/config.json";
import { createExportReactHeaderAction } from "./actions/header-action.js";
import { reactFormat } from "./formats/format-definition.js";
import { EXPORT_REACT_ENTRY } from "./i18n/entry.js";
import type { ReactExportOptions } from "./types/types.js";
import { EXPORT_REACT_VERSION } from "./version.js";

// `version` comes from the hand-maintained `version.ts` constant rather than a
// `package.json` import, which esbuild would inline whole and blow the gzip
// budget. `plugin.metadata-drift.test.ts` asserts it matches package.json, so a
// Changesets bump can never drift the runtime metadata.
const reactExportPluginMeta: StudioPluginMeta = {
	...config,
	version: EXPORT_REACT_VERSION,
	icon: createElement(FileCode2),
};

/**
 * Build the `StudioPlugin` object for the React export format.
 *
 * The returned plugin contributes exactly one export format
 * (`id: "react"`) and one header action (`id: "export-react"`). The
 * header action is bound to the same options passed here, so a host
 * supplying `buildIR` gets an action that runs the export end-to-end
 * and broadcasts `anvilkit:export:ready`; without `buildIR` the action
 * broadcasts `anvilkit:export:request` for the host to handle.
 *
 * Options passed here become the plugin-level defaults. Caller-supplied
 * options at `exportAs("react", opts)` time shallow-merge on top, so
 * call-site overrides win over plugin defaults. When no options are
 * supplied here, the shared `reactFormat` singleton is returned
 * unchanged — preserving referential equality for tests that compare
 * `runtime.exportFormats.get("react") === reactFormat`.
 */
export function createReactExportPlugin(
	opts: ReactExportOptions = {},
): StudioPlugin {
	const format: ExportFormatDefinition<ReactExportOptions> =
		Object.keys(opts).length === 0
			? reactFormat
			: {
					...reactFormat,
					// One pipeline: delegate to `reactFormat.run` with the
					// plugin-level defaults merged under call-site options.
					run: (ir, callOptions, runCtx) =>
						reactFormat.run(ir, { ...opts, ...callOptions }, runCtx),
				};

	const headerAction = createExportReactHeaderAction(format, opts);

	return {
		meta: reactExportPluginMeta,
		register(ctx) {
			// Contribute the `exportReact` catalog so the header action's and
			// the export format's `labelKey` resolve in-chrome.
			ctx.registerMessages(EXPORT_REACT_ENTRY);
			return {
				meta: reactExportPluginMeta,
				exportFormats: [format],
				headerActions: [headerAction],
			};
		},
	};
}
