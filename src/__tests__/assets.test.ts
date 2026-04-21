import type { PageIR } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import { collectReactAssets } from "../assets.js";
import { emitReact } from "../emitter.js";
import { resolveReactExportOptions } from "../types.js";

function irWithHeroSrc(url: string): PageIR {
	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "hero-1",
					type: "Hero",
					props: {
						backgroundSrc: url,
						headline: "Ship it.",
					},
				},
			],
		},
		assets: [],
		metadata: {},
	};
}

describe("collectReactAssets — url-prop strategy", () => {
	it("returns empty imports and no rewrites", () => {
		const plan = collectReactAssets(irWithHeroSrc("/assets/hero-bg.jpg"), "url-prop");
		expect(plan.imports).toEqual([]);
		expect(plan.rewrites.size).toBe(0);
		expect(plan.warnings).toEqual([]);
	});
});

describe("collectReactAssets — static-import strategy", () => {
	it("produces a default import for each local asset URL", () => {
		const plan = collectReactAssets(
			irWithHeroSrc("/assets/hero-bg.jpg"),
			"static-import",
		);
		expect(plan.imports).toHaveLength(1);
		expect(plan.imports[0]?.kind).toBe("default");
		expect(plan.imports[0]?.source).toBe("./assets/hero-bg.jpg");
		expect(plan.rewrites.size).toBe(1);
		const rewrite = plan.rewrites.get("/assets/hero-bg.jpg");
		expect(rewrite?.binding).toMatch(/^hero_bg_/);
	});

	it("collapses two props with the same URL into one binding", () => {
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
						props: { backgroundSrc: "/assets/bg.jpg" },
					},
					{
						id: "section-1",
						type: "Section",
						props: { imageSrc: "/assets/bg.jpg" },
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const plan = collectReactAssets(ir, "static-import");
		expect(plan.imports).toHaveLength(1);
		expect(plan.rewrites.size).toBe(1);
	});

	it("sorts imports by binding name", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{ id: "a", type: "Section", props: { imageSrc: "/assets/zed.jpg" } },
					{ id: "b", type: "Section", props: { imageSrc: "/assets/alpha.jpg" } },
				],
			},
			assets: [],
			metadata: {},
		};
		const plan = collectReactAssets(ir, "static-import");
		const sources = plan.imports.map((imp) => imp.source);
		expect(sources).toEqual([...sources].sort());
	});

	it("emits EXTERNAL_URL_STATIC_IMPORT for external URLs and falls back to url-prop", () => {
		const plan = collectReactAssets(
			irWithHeroSrc("https://cdn.example.com/hero-bg.jpg"),
			"static-import",
		);
		expect(plan.imports).toHaveLength(0);
		expect(plan.rewrites.size).toBe(0);
		expect(plan.warnings).toHaveLength(1);
		expect(plan.warnings[0]?.code).toBe("EXTERNAL_URL_STATIC_IMPORT");
	});
});

describe("emitReact — asset strategy integration", () => {
	it("url-prop keeps the URL as a string literal", () => {
		const result = emitReact(
			irWithHeroSrc("/assets/hero-bg.jpg"),
			resolveReactExportOptions({ assetStrategy: "url-prop" }),
		);
		expect(result.code).toContain('backgroundSrc="/assets/hero-bg.jpg"');
		expect(result.code).not.toContain("import hero_bg");
	});

	it("static-import rewrites the prop to a binding + emits the import", () => {
		const result = emitReact(
			irWithHeroSrc("/assets/hero-bg.jpg"),
			resolveReactExportOptions({ assetStrategy: "static-import" }),
		);
		expect(result.code).toMatch(/import hero_bg_[a-f0-9]{8} from "\.\/assets\/hero-bg\.jpg";/);
		expect(result.code).toMatch(/backgroundSrc=\{hero_bg_[a-f0-9]{8}\}/);
	});

	it("static-import + external URL surfaces a warning and falls back to string", () => {
		const result = emitReact(
			irWithHeroSrc("https://cdn.example.com/bg.jpg"),
			resolveReactExportOptions({ assetStrategy: "static-import" }),
		);
		expect(result.code).toContain('backgroundSrc="https://cdn.example.com/bg.jpg"');
		expect(result.warnings.some((w) => w.code === "EXTERNAL_URL_STATIC_IMPORT")).toBe(true);
	});
});
