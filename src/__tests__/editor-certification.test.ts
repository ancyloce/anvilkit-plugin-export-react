/**
 * Exporter certification **wave 2** (PLAN-0020 §5.1 — "reference
 * exporter(s): `plugin-export-html`, then `plugin-export-react`";
 * DD-0019 §23.2, §32.3; DD-DEC-018; REVIEW-0019 P0).
 *
 * REVIEW-0019 §2 recorded this package as the review's one `MISSING`
 * item. This suite is the wave-2 close: the format now declares
 * `responsive`, `tokens`, `styleDefinitions`, `localComponents` and
 * `variants`, each backed by a positive emission fixture below. The
 * emission path is the shared core consumer (`buildExportAuthoring`)
 * plus the IR transform in `editor/authored-transform.ts`, loaded
 * through a dynamic `import()` so the core engine stays out of the
 * entry chunk.
 *
 * `richText`, `interactions` and `bindings` stay undeclared —
 * genuinely unsupported by an emitted static page — and are asserted
 * to block.
 *
 * Preflight assertions run through `runExportPreflight`, the same
 * entry point `runExport` enforces in production. Everything is
 * imported from `@anvilkit/core`, so this package gains no new
 * dependency.
 */

import { compilePlugins, StudioConfigSchema } from "@anvilkit/core";
import {
	createEmptyAuthoringState,
	listUsedAuthoringFeatures,
	runExportPreflight,
} from "@anvilkit/core/editor";
import type { StudioPluginContext } from "@anvilkit/core/types";
import { describe, expect, it, vi } from "vitest";

import {
	REACT_EDITOR_CAPABILITIES,
	reactFormat,
} from "../formats/format-definition.js";
import { createReactExportPlugin } from "../index.js";
import { heroFixture } from "./__fixtures__/hero.fixture.js";

type Authoring = ReturnType<typeof createEmptyAuthoringState>;

function makeCtx(): StudioPluginContext {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: (() => {
			throw new Error("getPuckApi should not be invoked here");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig: StudioConfigSchema.parse({}),
		log: vi.fn(),
		emit: vi.fn(),
		registerAssetResolver: vi.fn(),
	};
}

function authoringUsing(feature: string): Authoring {
	const empty = createEmptyAuthoringState();
	switch (feature) {
		case "responsive":
			return {
				...empty,
				breakpoints: [
					{
						id: "tablet",
						label: "Tablet",
						maxWidth: 991,
						order: 0,
						enabled: true,
					},
				],
			};
		case "tokens":
			return {
				...empty,
				tokens: {
					brand: {
						id: "brand",
						path: ["color"],
						name: "Brand",
						type: "color",
						values: {},
					},
				},
			};
		case "styleDefinitions":
			return {
				...empty,
				styleDefinitions: {
					card: {
						version: "1",
						id: "card",
						name: "Card",
						appliesTo: "any",
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				},
			};
		case "localComponents":
			return {
				...empty,
				componentDefinitions: {
					def: {
						version: "1",
						id: "def",
						name: "Card",
						root: { type: "Box", props: { id: "n" } },
						exposedProps: [],
						variantAxes: [],
						variants: [],
						revision: 1,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				},
			};
		case "variants":
			return {
				...empty,
				componentDefinitions: {
					def: {
						version: "1",
						id: "def",
						name: "Card",
						root: { type: "Box", props: { id: "n" } },
						exposedProps: [],
						variantAxes: [
							{
								id: "tone",
								name: "Tone",
								options: [
									{ id: "dark", name: "Dark" },
									{ id: "light", name: "Light" },
								],
							},
						],
						variants: [
							{
								id: "v-dark",
								selection: { tone: "dark" },
								patch: {},
							},
						],
						revision: 1,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				},
			};
		case "interactions":
			return {
				...empty,
				interactions: {
					i1: {
						version: "1",
						id: "i1",
						nodeId: "hero-1",
						trigger: { type: "click" },
						actions: [],
						enabled: true,
					} as never,
				},
			};
		case "bindings":
			return {
				...empty,
				bindings: {
					b1: { version: "1", id: "b1", nodeId: "hero-1" } as never,
				},
			};
		default:
			throw new Error(`unhandled feature ${feature}`);
	}
}

/** The hero fixture with an authoring sidecar on its root props. */
function authoredHero(authoring: Authoring) {
	return {
		...heroFixture,
		root: {
			...heroFixture.root,
			props: { ...heroFixture.root.props, __anvilkit: authoring },
		},
	};
}

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

const red = {
	kind: "literal",
	value: { kind: "hex", value: "#ff0000" },
} as const;

const SUPPORTED = [
	"responsive",
	"tokens",
	"styleDefinitions",
	"localComponents",
	"variants",
] as const;

const UNSUPPORTED = ["interactions", "bindings"] as const;

describe("editor capability declaration (wave 2)", () => {
	it("declares exactly the certified feature set", () => {
		// Nothing enters this list ahead of its positive fixture below.
		expect(REACT_EDITOR_CAPABILITIES.version).toBe("1");
		expect(REACT_EDITOR_CAPABILITIES.supportedFeatures).toEqual([...SUPPORTED]);
		expect(reactFormat.editorCapabilities).toBe(REACT_EDITOR_CAPABILITIES);
	});

	it("survives plugin binding into the registry", async () => {
		const runtime = await compilePlugins(
			[createReactExportPlugin()],
			makeCtx(),
		);
		const registered = runtime.exportFormats.get("react");
		expect(registered).toBeDefined();
		expect(registered?.editorCapabilities).toBe(REACT_EDITOR_CAPABILITIES);
		expect(registered?.labelKey).toBe("exportReact.format.react");
	});

	it("survives the options path that rebuilds the format object", async () => {
		// The options path spreads `reactFormat` and replaces `run`. This
		// guards the shape of that spread: a hand-picked field list here
		// would silently drop the declaration — the exact defect wave 1
		// had to fix in `plugin-export-html`.
		const runtime = await compilePlugins(
			[createReactExportPlugin({ syntax: "jsx" })],
			makeCtx(),
		);
		const registered = runtime.exportFormats.get("react");
		expect(registered?.id).toBe("react");
		expect(registered?.editorCapabilities).toBe(REACT_EDITOR_CAPABILITIES);
	});
});

describe("used-feature preflight (§23.2)", () => {
	for (const feature of SUPPORTED) {
		it(`passes production export for a document using "${feature}"`, () => {
			const usedFeatures = listUsedAuthoringFeatures(authoringUsing(feature));
			expect(usedFeatures).toContain(feature);
			const result = runExportPreflight({
				usedFeatures,
				capabilities: reactFormat.editorCapabilities,
			});
			expect(result.status).toBe("passed");
			expect(result.errors).toEqual([]);
			expect(result.event.status).toBe("passed");
		});
	}

	for (const feature of UNSUPPORTED) {
		it(`blocks production export for a document using "${feature}"`, () => {
			const usedFeatures = listUsedAuthoringFeatures(authoringUsing(feature));
			expect(usedFeatures).toContain(feature);
			const result = runExportPreflight({
				usedFeatures,
				capabilities: reactFormat.editorCapabilities,
			});
			expect(result.status).toBe("blocked");
			expect(result.errors.map((error) => error.code)).toContain(
				"EDITOR_EXPORTER_UNSUPPORTED",
			);
			expect(result.event.status).toBe("failed");
		});
	}

	it("blocks richText, which stays deliberately undeclared", () => {
		// `TiptapDocumentV1` props would serialize as object literals the
		// target components cannot render, so declaring it would be a
		// lie. (Sidecar scanning cannot detect richText usage today —
		// asserted with the literal id so the gate is ready when it can.)
		const result = runExportPreflight({
			usedFeatures: ["richText"],
			capabilities: reactFormat.editorCapabilities,
		});
		expect(result.status).toBe("blocked");
	});

	it("degrades to a warning in development preview rather than blocking", () => {
		const result = runExportPreflight({
			usedFeatures: listUsedAuthoringFeatures(authoringUsing("interactions")),
			capabilities: reactFormat.editorCapabilities,
			mode: "development",
		});
		expect(result.status).toBe("warning");
		expect(result.errors.every((error) => error.severity === "warning")).toBe(
			true,
		);
	});

	it("passes a document that uses no editor features", () => {
		const result = runExportPreflight({
			usedFeatures: listUsedAuthoringFeatures(createEmptyAuthoringState()),
			capabilities: reactFormat.editorCapabilities,
		});
		expect(result.status).toBe("passed");
		expect(result.errors).toEqual([]);
		expect(result.event.status).toBe("passed");
	});

	it("an assessed-empty declaration still blocks what this format passes", () => {
		// DD-DEC-018's fail-closed default, kept visible now that this
		// format declares real support.
		const usedFeatures = listUsedAuthoringFeatures(authoringUsing("tokens"));
		expect(
			runExportPreflight({
				usedFeatures,
				capabilities: { version: "1", supportedFeatures: [] },
			}).status,
		).toBe("blocked");
		expect(
			runExportPreflight({
				usedFeatures,
				capabilities: reactFormat.editorCapabilities,
			}).status,
		).toBe("passed");
	});
});

describe("certification fixtures (declared features emit)", () => {
	it("responsive + tokens + styleDefinitions: emits the authored stylesheet", async () => {
		const ir = authoredHero({
			...createEmptyAuthoringState(),
			breakpoints: [
				{
					id: "tablet",
					label: "Tablet",
					maxWidth: 991,
					order: 0,
					enabled: true,
				},
			],
			tokens: {
				brand: {
					id: "brand",
					path: ["color"],
					name: "Brand",
					type: "color",
					values: { default: red },
				},
			},
			styleDefinitions: {
				card: {
					version: "1",
					id: "card",
					name: "Card",
					appliesTo: "any",
					style: {
						base: { background: { kind: "solid", color: red } },
					},
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
			nodes: {
				"hero-1": {
					version: "1",
					styleRefs: { base: ["card"] },
					layout: {
						base: { gap: px(24) },
						overrides: { tablet: { gap: px(12) } },
					},
					typography: {
						base: { color: { kind: "token", tokenId: "brand" } },
					},
				},
			},
		});
		const first = await reactFormat.run(ir, {}, undefined);
		const second = await reactFormat.run(ir, {}, undefined);
		// The stylesheet rides in as a leading <style> element; the
		// authored node renders inside its data-ak-node wrapper div.
		expect(first.content).toContain("<style");
		expect(first.content).toContain("gap: 24px");
		expect(first.content).toContain("@media (max-width: 991px)");
		expect(first.content).toContain("background: #ff0000");
		expect(first.content).toContain("color: #ff0000");
		expect(first.content).toContain('<div data-ak-node="hero-1">');
		expect(first.content).toContain("<Hero");
		// The sidecar itself never leaks into the emitted page.
		expect(first.content).not.toContain("__anvilkit");
		// Deterministic: identical input → identical bytes.
		expect(first.content).toBe(second.content);
	});

	it("localComponents + variants: renders the materialized subtree", async () => {
		const ir = authoredHero({
			...createEmptyAuthoringState(),
			componentDefinitions: {
				def: {
					version: "1",
					id: "def",
					name: "Feature section",
					root: {
						type: "Section",
						props: {
							id: "secRoot",
							headline: "Base headline",
						},
					},
					exposedProps: [
						{
							id: "headline",
							name: "Headline",
							type: "text",
							sourcePath: ["headline"],
							defaultValue: "Base headline",
						},
					],
					variantAxes: [
						{
							id: "tone",
							name: "Tone",
							options: [
								{ id: "dark", name: "Dark" },
								{ id: "light", name: "Light" },
							],
						},
					],
					variants: [
						{
							id: "v-dark",
							selection: { tone: "dark" },
							patch: { secRoot: { style: { base: { opacity: 0.9 } } } },
						},
					],
					revision: 1,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
			nodes: {
				"hero-1": {
					version: "1",
					componentInstance: {
						definitionId: "def",
						definitionRevision: 1,
						variantSelection: { tone: "dark" },
						propOverrides: { headline: "Overridden headline" },
						nodeOverrides: {},
					},
				},
			},
		});
		const first = await reactFormat.run(ir, {}, undefined);
		const second = await reactFormat.run(ir, {}, undefined);
		// The placeholder Hero renders as the materialized Section, whose
		// import is collected from the materialized type.
		expect(first.content).not.toContain("<Hero");
		expect(first.content).toContain('from "@anvilkit/section"');
		expect(first.content).toContain("<Section");
		expect(first.content).toContain("Overridden headline");
		// Variant patch styles bind to the §14.2 runtime id.
		expect(first.content).toContain('<div data-ak-node="hero-1::secRoot">');
		expect(first.content).toContain("opacity: 0.9");
		expect(first.content).toBe(second.content);
	});

	it("degrades an unresolvable instance to an ExportWarning", async () => {
		const ir = authoredHero({
			...createEmptyAuthoringState(),
			componentDefinitions: {
				other: {
					version: "1",
					id: "other",
					name: "Other",
					root: { type: "Box", props: { id: "n" } },
					exposedProps: [],
					variantAxes: [],
					variants: [],
					revision: 1,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
			nodes: {
				"hero-1": {
					version: "1",
					componentInstance: {
						definitionId: "ghost-def",
						definitionRevision: 1,
						variantSelection: {},
						propOverrides: {},
						nodeOverrides: {},
					},
				},
			},
		});
		const result = await reactFormat.run(ir, {}, undefined);
		// The placeholder exports as-is (ED-COMP-007) with a warning.
		expect(result.content).toContain("<Hero");
		expect(
			result.warnings?.some(
				(warning) => warning.code === "EDITOR_DEFINITION_UNAVAILABLE",
			),
		).toBe(true);
	});
});

describe("byte-stability for non-editor documents (§3.2)", () => {
	it("produces identical output across runs with no authoring markers", async () => {
		const first = await reactFormat.run(heroFixture, {}, undefined);
		const second = await reactFormat.run(heroFixture, {}, undefined);
		// Identical input → identical output: the editor integration
		// emits nothing for a document without authoring.
		expect(first.content).toBe(second.content);
		expect(first.filename).toBe(second.filename);
		expect(first.content).not.toContain("data-ak-node");
		expect(first.content).not.toContain("<style");
	});
});
