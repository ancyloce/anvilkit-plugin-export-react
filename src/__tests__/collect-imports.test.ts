import type { PageIR } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import {
	collectImports,
	componentTypeToPackageSlug,
} from "../collect-imports.js";
import { bentoGridFixture } from "./__fixtures__/bento-grid.fixture.js";
import { heroFixture } from "./__fixtures__/hero.fixture.js";

describe("componentTypeToPackageSlug", () => {
	it("kebab-cases PascalCase types", () => {
		expect(componentTypeToPackageSlug("Hero")).toBe("hero");
		expect(componentTypeToPackageSlug("BentoGrid")).toBe("bento-grid");
		expect(componentTypeToPackageSlug("PricingMinimal")).toBe(
			"pricing-minimal",
		);
		expect(componentTypeToPackageSlug("LogoClouds")).toBe("logo-clouds");
	});
});

describe("collectImports", () => {
	it("returns a single named import for a minimal fixture", () => {
		const manifest = collectImports(heroFixture);
		expect(manifest.imports).toEqual([
			{ binding: "Hero", source: "@anvilkit/hero", kind: "named" },
		]);
	});

	it("deduplicates repeated component types", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{ id: "a", type: "Button", props: { label: "A" } },
					{ id: "b", type: "Button", props: { label: "B" } },
				],
			},
			assets: [],
			metadata: {},
		};
		const manifest = collectImports(ir);
		expect(manifest.imports).toHaveLength(1);
		expect(manifest.imports[0]?.binding).toBe("Button");
	});

	it("sorts imports by source ascending", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{ id: "hero", type: "Hero", props: {} },
					{ id: "bento", type: "BentoGrid", props: {} },
					{ id: "navbar", type: "Navbar", props: {} },
				],
			},
			assets: [],
			metadata: {},
		};
		const manifest = collectImports(ir);
		expect(manifest.imports.map((imp) => imp.source)).toEqual([
			"@anvilkit/bento-grid",
			"@anvilkit/hero",
			"@anvilkit/navbar",
		]);
	});

	it("excludes the __root__ wrapper type", () => {
		const manifest = collectImports(bentoGridFixture);
		expect(
			manifest.imports.find((imp) => imp.binding === "__root__"),
		).toBeUndefined();
	});
});
