import type { PageIR } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import { emitReact } from "../emitter.js";
import { REACT_EXPORT_DEFAULTS, resolveReactExportOptions } from "../types.js";
import { heroFixture } from "./__fixtures__/hero.fixture.js";
import { bentoGridFixture } from "./__fixtures__/bento-grid.fixture.js";
import { fixtures } from "./__fixtures__/index.js";

describe("emitReact — basic shape", () => {
	it("returns code, imports, and an empty warnings array for a clean fixture", () => {
		const result = emitReact(heroFixture, REACT_EXPORT_DEFAULTS);
		expect(result.code).toContain('import { Hero } from "@anvilkit/hero";');
		expect(result.code).toContain("export default function Page()");
		expect(result.code).toContain("<Hero");
		expect(result.warnings).toEqual([]);
		expect(result.imports.imports.length).toBeGreaterThan(0);
	});

	it("throws when the root node is not __root__", () => {
		const bad: PageIR = {
			version: "1",
			root: { id: "root", type: "Div", props: {} },
			assets: [],
			metadata: {},
		};
		expect(() => emitReact(bad, REACT_EXPORT_DEFAULTS)).toThrow(
			/expected root node type "__root__"/,
		);
	});

	it("throws when ir.version is not the supported version", () => {
		const bad = {
			version: "2",
			root: { id: "root", type: "__root__", props: {} },
			assets: [],
			metadata: {},
		} as unknown as PageIR;
		expect(() => emitReact(bad, REACT_EXPORT_DEFAULTS)).toThrow(
			/unsupported ir.version/,
		);
	});
});

describe("emitReact — options", () => {
	it("tsx syntax keeps the JSX.Element return-type annotation", () => {
		const result = emitReact(heroFixture, resolveReactExportOptions({ syntax: "tsx" }));
		expect(result.code).toContain(": JSX.Element");
	});

	it("jsx syntax strips the return-type annotation", () => {
		const result = emitReact(heroFixture, resolveReactExportOptions({ syntax: "jsx" }));
		expect(result.code).not.toContain(": JSX.Element");
	});

	it("moduleResolution=cjs emits require + module.exports", () => {
		const result = emitReact(
			heroFixture,
			resolveReactExportOptions({ moduleResolution: "cjs" }),
		);
		expect(result.code).toContain('require("@anvilkit/hero")');
		expect(result.code).toContain("module.exports = Page;");
		expect(result.code).not.toContain("export default function Page()");
	});

	it("includeImports=false omits the top-of-file import block", () => {
		const result = emitReact(
			heroFixture,
			resolveReactExportOptions({ includeImports: false }),
		);
		expect(result.code).not.toContain("import { Hero }");
		expect(result.code).toContain("<Hero");
	});
});

describe("emitReact — nested + sibling children", () => {
	it("emits 2-space-indented nested JSX for children arrays", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "section-1",
						type: "Section",
						props: { title: "Wrap" },
						children: [
							{ id: "btn-1", type: "Button", props: { label: "Click" } },
						],
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).toMatch(/<Section title="Wrap">\n {6}<Button /);
		expect(result.code).toContain("  </Section>");
	});

	it("wraps sibling root children in a fragment", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{ id: "a", type: "Hero", props: { headline: "A" } },
					{ id: "b", type: "Section", props: { title: "B" } },
				],
			},
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).toContain("<>");
		expect(result.code).toContain("</>");
	});
});

describe("emitReact — warnings for non-serializable props", () => {
	it("emits NON_SERIALIZABLE_PROP for a function prop and keeps the rest of the tree intact", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "btn-1",
						type: "Button",
						props: { label: "Click", onClick: () => 42 },
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
		expect(result.warnings[0]?.nodeId).toBe("btn-1");
		expect(result.code).toContain("{/* omitted: non-serializable */}");
		expect(result.code).toContain('label="Click"');
	});
});

describe("emitReact — empty canvas", () => {
	it("emits an empty fragment when root has no children", () => {
		const ir: PageIR = {
			version: "1",
			root: { id: "root", type: "__root__", props: {} },
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.warnings).toEqual([]);
		expect(result.code).toContain("<></>");
		expect(result.code).toContain("export default function Page()");
	});

	it("emits an empty fragment when children is an empty array", () => {
		const ir: PageIR = {
			version: "1",
			root: { id: "root", type: "__root__", props: {}, children: [] },
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).toContain("<></>");
	});
});

describe("emitReact — CJS output shape", () => {
	it("emits both module.exports and module.exports.default", () => {
		const result = emitReact(
			heroFixture,
			resolveReactExportOptions({ moduleResolution: "cjs" }),
		);
		expect(result.code).toContain("module.exports = Page;");
		expect(result.code).toContain("module.exports.default = Page;");
		expect(result.code).not.toContain("export default");
	});

	it("surfaces CJS_REQUIRES_JSX info warning when syntax is tsx + moduleResolution is cjs", () => {
		const result = emitReact(
			heroFixture,
			resolveReactExportOptions({ syntax: "tsx", moduleResolution: "cjs" }),
		);
		expect(result.warnings.some((w) => w.code === "CJS_REQUIRES_JSX")).toBe(true);
	});

	it("does not emit CJS_REQUIRES_JSX for jsx + cjs", () => {
		const result = emitReact(
			heroFixture,
			resolveReactExportOptions({ syntax: "jsx", moduleResolution: "cjs" }),
		);
		expect(result.warnings.some((w) => w.code === "CJS_REQUIRES_JSX")).toBe(false);
	});
});

describe("emitReact — hostile-IR hardening", () => {
	it("emits INVALID_NODE_TYPE and a comment placeholder when type is not a valid JSX name", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{ id: "bad-1", type: "Hero onError=alert(1)", props: {} },
				],
			},
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).not.toContain("onError=alert");
		expect(result.code).toContain("{/* omitted: invalid component type */}");
		expect(result.warnings.some((w) => w.code === "INVALID_NODE_TYPE")).toBe(true);
	});

	it("emits INVALID_PROP_NAME and drops the attribute when prop key contains whitespace", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "bad-prop",
						type: "Hero",
						props: { "onClick x=1": "nope", title: "keep" },
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).not.toContain("onClick x=1");
		expect(result.code).toContain('title="keep"');
		expect(result.warnings.some((w) => w.code === "INVALID_PROP_NAME")).toBe(true);
	});
});

describe("emitReact — every demo fixture", () => {
	it("emits clean (warning-free) source for all fixtures", () => {
		for (const { name, ir } of fixtures) {
			const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
			expect(result.warnings, `${name} should have no warnings`).toEqual([]);
			expect(result.code).toContain("export default function Page()");
		}
	});
});

describe("emitReact — bento grid nested object props", () => {
	it("serializes the items array into a JSX expression attribute", () => {
		const result = emitReact(bentoGridFixture, REACT_EXPORT_DEFAULTS);
		expect(result.code).toContain("items={");
		expect(result.code).toContain('"title":"Snapshots"');
	});
});
