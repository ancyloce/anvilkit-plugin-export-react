import type { ExportFormatDefinition } from "@anvilkit/core/types";

import { emitReact } from "./emitter.js";
import {
	type ReactExportOptions,
	resolveReactExportOptions,
} from "./types.js";

export const reactFormat: ExportFormatDefinition<ReactExportOptions> = {
	id: "react",
	label: "React (.tsx)",
	extension: "tsx",
	mimeType: "text/plain",
	run: async (ir, options) => {
		const resolved = resolveReactExportOptions(options);
		const { code, warnings } = emitReact(ir, resolved);
		const extension = resolved.syntax === "jsx" ? "jsx" : "tsx";
		return {
			content: code,
			filename: `page.${extension}`,
			warnings,
		};
	},
};
