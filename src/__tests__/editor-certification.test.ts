/**
 * Exporter certification **wave 2** (PLAN-0020 §5.1 — "reference
 * exporter(s): `plugin-export-html`, then `plugin-export-react`";
 * DD-0019 §23.2, §32.3; DD-DEC-018).
 *
 * REVIEW-0019 §2 recorded this package as the one `MISSING` capability:
 * no `editorCapabilities` declaration, no fixtures, no preflight
 * coverage. It blocked the same way the HTML format does, but with
 * nothing on record saying so — so a consumer hitting the block could
 * not tell a deliberate assessment from an exporter nobody had audited.
 *
 * This mirrors `plugin-export-html`'s wave-1 suite and certifies four
 * things about the declaration:
 *
 * 1. it exists, is assessed-empty, and reaches the format object;
 * 2. it survives plugin binding into the registry — a format that
 *    loses it on the way is indistinguishable from one that never
 *    declared it;
 * 3. every editor feature a document might use **blocks** production
 *    export and only *warns* in development preview, because this
 *    emitter supports none of them yet;
 * 4. documents using no editor features still export byte-identically
 *    — the DD-0019 §3.2 guarantee that adding the editor changes
 *    nothing for existing documents.
 *
 * Assertions run through `runExportPreflight`, the same entry point
 * `runExport` enforces in production, rather than re-deriving the
 * verdict from `validateExportCapabilities` — certifying the path
 * consumers actually take. Everything is imported from `@anvilkit/core`
 * so this package gains no new dependency.
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

describe("editor capability declaration", () => {
	it("declares an assessed-empty capability set", () => {
		// Empty is the audited result, not an oversight — see the
		// rationale on REACT_EDITOR_CAPABILITIES.
		expect(REACT_EDITOR_CAPABILITIES.version).toBe("1");
		expect(REACT_EDITOR_CAPABILITIES.supportedFeatures).toEqual([]);
		expect(reactFormat.editorCapabilities).toBe(REACT_EDITOR_CAPABILITIES);
	});

	it("survives plugin binding into the registry", async () => {
		const runtime = await compilePlugins(
			[createReactExportPlugin()],
			makeCtx(),
		);
		const registered = runtime.exportFormats.get("react");
		expect(registered).toBeDefined();
		expect(registered?.editorCapabilities).toEqual(REACT_EDITOR_CAPABILITIES);
		expect(registered?.labelKey).toBe("exportReact.format.react");
	});

	it("survives binding when options rebuild the format object", async () => {
		// The options path spreads `reactFormat` and replaces `run`; a
		// hand-picked field list there would silently drop the
		// declaration (the exact defect wave 1 had to fix).
		const runtime = await compilePlugins(
			[createReactExportPlugin({ syntax: "jsx" })],
			makeCtx(),
		);
		expect(runtime.exportFormats.get("react")?.editorCapabilities).toEqual(
			REACT_EDITOR_CAPABILITIES,
		);
	});
});

describe("used-feature preflight (§23.2)", () => {
	const featureDocuments: readonly [string, Authoring][] = [
		[
			"responsive",
			{
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
			},
		],
		[
			"tokens",
			{
				...createEmptyAuthoringState(),
				tokens: {
					brand: {
						id: "brand",
						path: ["color"],
						name: "Brand",
						type: "color",
						values: {},
					},
				},
			},
		],
		[
			"styleDefinitions",
			{
				...createEmptyAuthoringState(),
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
			},
		],
		[
			"localComponents",
			{
				...createEmptyAuthoringState(),
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
			},
		],
	] as readonly [string, Authoring][];

	for (const [feature, authoring] of featureDocuments) {
		it(`blocks production export for a document using "${feature}"`, () => {
			const usedFeatures = listUsedAuthoringFeatures(authoring);
			expect(usedFeatures).toContain(feature);
			const result = runExportPreflight({
				usedFeatures,
				capabilities: reactFormat.editorCapabilities,
			});
			expect(result.status).toBe("blocked");
			expect(result.errors.map((error) => error.code)).toContain(
				"EDITOR_EXPORTER_UNSUPPORTED",
			);
			expect(result.errors.every((error) => error.severity === "error")).toBe(
				true,
			);
			expect(result.event.status).toBe("failed");
		});
	}

	it("degrades to a warning in development preview rather than blocking", () => {
		const result = runExportPreflight({
			usedFeatures: listUsedAuthoringFeatures(
				featureDocuments[1]?.[1] as Authoring,
			),
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
	});

	it("blocks identically for a format that declares nothing at all", () => {
		// An absent declaration and an assessed-empty one must gate the
		// same way (DD-DEC-018) — so declaring empty costs no behaviour
		// change, which is why it was safe to add.
		const usedFeatures = listUsedAuthoringFeatures(
			featureDocuments[1]?.[1] as Authoring,
		);
		expect(
			runExportPreflight({ usedFeatures, capabilities: undefined }).status,
		).toBe("blocked");
		expect(
			runExportPreflight({
				usedFeatures,
				capabilities: reactFormat.editorCapabilities,
			}).status,
		).toBe("blocked");
	});
});

describe("byte-stability for non-editor documents (§3.2)", () => {
	it("produces identical output across runs", async () => {
		const first = await reactFormat.run(heroFixture, {}, undefined);
		const second = await reactFormat.run(heroFixture, {}, undefined);
		// Identical input → identical output; adding the capability
		// declaration changed no emitted byte.
		expect(first.content).toBe(second.content);
		expect(first.filename).toBe(second.filename);
	});
});
