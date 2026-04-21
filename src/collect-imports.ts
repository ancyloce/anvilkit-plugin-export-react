import type { PageIR, PageIRNode } from "@anvilkit/core/types";
import type { ImportManifest, ImportRecord } from "./types.js";

/**
 * The root wrapper node carries `type: "__root__"` and never needs its
 * own import — every other component type in the tree should resolve
 * to a `@anvilkit/<slug>` package.
 */
const ROOT_TYPE = "__root__";
const VALID_COMPONENT_TYPE = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Convert a PascalCase component type to a kebab-case slug for the
 * `@anvilkit/<slug>` package name. Matches the `packages/components`
 * naming convention.
 */
export function componentTypeToPackageSlug(type: string): string {
	return type
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}

function collectTypes(node: PageIRNode, out: Set<string>): void {
	if (node.type !== ROOT_TYPE && VALID_COMPONENT_TYPE.test(node.type)) {
		out.add(node.type);
	}
	if (node.children) {
		for (const child of node.children) {
			collectTypes(child, out);
		}
	}
}

/**
 * Walk the IR tree and return the deduplicated import manifest for
 * every component type encountered (excluding the `__root__`
 * wrapper). The mapping is:
 *
 * - `binding` — the component's PascalCase type (used directly in JSX).
 * - `source`  — `@anvilkit/<kebab-case>` package name.
 * - `kind`    — always `"named"` for the default wiring; consumers may
 *   override via the emitter's own logic (e.g. static-import assets).
 *
 * Sorted by `source` ascending so the emitted imports are byte-stable
 * across runs.
 */
export function collectImports(ir: PageIR): ImportManifest {
	const types = new Set<string>();
	collectTypes(ir.root, types);

	const records: ImportRecord[] = [...types]
		.map<ImportRecord>((type) => ({
			binding: type,
			source: `@anvilkit/${componentTypeToPackageSlug(type)}`,
			kind: "named",
		}))
		.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));

	return { imports: records };
}
