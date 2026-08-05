/**
 * @file P4-06 (PLAN-0025 §9.3) — the React format consumes the
 * unified appearance compiler's artifact from the run context for v2
 * documents: real compiler output (never hand-written CSS) rides in
 * as the `data-anvilkit-appearance` style element, root-styled nodes
 * emit the selector attribute pair, and the legacy/no-editor paths
 * stay byte-identical when no artifact is supplied.
 */

import { compileDocumentAppearance } from "@anvilkit/core/editor";
import type { PageIR } from "@anvilkit/core/types";
import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { reactFormat } from "../formats/format-definition.js";

const v2Config = {
	components: {
		Hero: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Hero",
								responsive: true,
								properties: ["display", "opacity"],
							},
							media: { label: "Media", properties: ["opacity"] },
						},
					},
				},
			},
			render: () => null,
		},
	},
} as unknown as Config;

const v2Data = {
	content: [
		{
			type: "Hero",
			props: {
				id: "hero-1",
				headline: "Ship updates without friction.",
				appearance: {
					version: "1",
					targets: {
						root: {
							style: {
								base: { layout: { display: "flex" }, visual: { opacity: 0.5 } },
							},
						},
					},
				},
			},
		},
		{
			type: "Hero",
			props: {
				id: "hero-2",
				headline: "Media-only styling.",
				appearance: {
					version: "1",
					targets: {
						media: { style: { base: { visual: { opacity: 0.25 } } } },
					},
				},
			},
		},
	],
	root: { props: {} },
	zones: {},
} as unknown as Data;

const ir: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "hero-1",
				type: "Hero",
				props: { headline: "Ship updates without friction." },
			},
			{
				id: "hero-2",
				type: "Hero",
				props: { headline: "Media-only styling." },
			},
		],
	},
	assets: [],
	metadata: { createdAt: "2026-04-11T00:00:00.000Z" },
};

const options = { syntax: "tsx" as const };

describe("React export consumes the unified compiler artifact (P4-06)", () => {
	it("emits the compiler CSS as the appearance style element and the attribute-pair wrapper", async () => {
		const compiled = compileDocumentAppearance({
			data: v2Data,
			config: v2Config,
		});
		expect(compiled.css).toContain('[data-ak-style-node="hero-1"]');

		const result = await reactFormat.run(ir, options, {
			compiledAppearance: compiled,
		});
		const code = result.content as string;
		// The appearance stylesheet rides in marked with the shared
		// injection attribute…
		expect(code).toContain("data-anvilkit-appearance");
		expect(code).toContain('[data-ak-style-node=\\"hero-1\\"]');
		// …and the root-styled node emits the compiler's selector
		// attribute PAIR, while a node styled only on an inner target
		// gets no wrapper (no matching emitted element exists).
		expect(code).toContain('data-ak-style-node="hero-1"');
		expect(code).toContain('data-ak-style-target="root"');
		expect(code).not.toContain('data-ak-style-node="hero-2"');
	});

	it("is deterministic across runs with the same artifact", async () => {
		const compiled = compileDocumentAppearance({
			data: v2Data,
			config: v2Config,
		});
		const first = await reactFormat.run(ir, options, {
			compiledAppearance: compiled,
		});
		const second = await reactFormat.run(ir, options, {
			compiledAppearance: compiled,
		});
		expect(first.content).toBe(second.content);
	});

	it("stays byte-identical to the pre-editor output when no artifact is supplied", async () => {
		const withoutCtx = await reactFormat.run(ir, options, undefined);
		const withEmptyCtx = await reactFormat.run(ir, options, {});
		expect(withEmptyCtx.content).toBe(withoutCtx.content);
		expect(withoutCtx.content as string).not.toContain("data-ak-style-node");
	});
});
