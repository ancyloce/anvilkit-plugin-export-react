import type {
	ExportFormatDefinition,
	StudioPlugin,
	StudioPluginMeta,
} from "@anvilkit/core/types";

import config from "../meta/config.json";
import packageJson from "../package.json";
import { resolveReactAssetUrls } from "./assets.js";
import { emitReact } from "./emitter.js";
import { reactFormat } from "./formats/format-definition.js";
import { createExportReactHeaderAction } from "./header-action.js";
import { type ReactExportOptions, resolveReactExportOptions } from "./types/types.js";

// `version` is derived from package.json so a Changesets bump can never drift
// the runtime metadata; `plugin.metadata-drift.test.ts` guards regressions.
const reactExportPluginMeta: StudioPluginMeta = {
	...config,
	version: packageJson.version,
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
					run: async (ir, callOptions, runCtx) => {
						const resolved = resolveReactExportOptions({
							...opts,
							...callOptions,
						});
						const { ir: resolvedIr, warnings: resolutionWarnings } =
							await resolveReactAssetUrls(ir, runCtx?.assetResolvers ?? []);
						const { code, warnings } = emitReact(resolvedIr, resolved);
						const extension = resolved.syntax === "jsx" ? "jsx" : "tsx";
						return {
							content: code,
							filename: `page.${extension}`,
							warnings: [...resolutionWarnings, ...warnings],
						};
					},
				};

	const headerAction = createExportReactHeaderAction(format, opts);

	return {
		meta: reactExportPluginMeta,
		register(_ctx) {
			return {
				meta: reactExportPluginMeta,
				exportFormats: [format],
				headerActions: [headerAction],
			};
		},
	};
}
