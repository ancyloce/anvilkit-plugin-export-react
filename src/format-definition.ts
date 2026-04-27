import type { ExportFormatDefinition } from "@anvilkit/core/types";

import { resolveReactAssetUrls } from "./assets.js";
import { emitReact } from "./emitter.js";
import { type ReactExportOptions, resolveReactExportOptions } from "./types.js";

export const reactFormat: ExportFormatDefinition<ReactExportOptions> = {
	id: "react",
	label: "React (.tsx)",
	extension: "tsx",
	mimeType: "text/plain",
	run: async (ir, options, runCtx) => {
		const resolved = resolveReactExportOptions(options);
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
