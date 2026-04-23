import { compilePlugins, StudioConfigSchema } from "@anvilkit/core";
import type { StudioPluginContext } from "@anvilkit/core/types";
import { describe, expect, it, vi } from "vitest";

import { createReactExportPlugin } from "../index.js";
import { heroFixture } from "./__fixtures__/hero.fixture.js";

const studioConfig = StudioConfigSchema.parse({});

function makeCtx(): StudioPluginContext {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: (() => {
			throw new Error("getPuckApi should not be invoked in compile tests");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log: vi.fn(),
		emit: vi.fn(),
		registerAssetResolver: vi.fn(),
	};
}

describe("createReactExportPlugin registration", () => {
	it("registers the react export format during compilePlugins", async () => {
		const runtime = await compilePlugins([createReactExportPlugin()], makeCtx());
		expect(runtime.exportFormats.has("react")).toBe(true);
	});

	it("contributes the export-react header action", async () => {
		const runtime = await compilePlugins([createReactExportPlugin()], makeCtx());
		expect(
			runtime.headerActions.some((action) => action.id === "export-react"),
		).toBe(true);
	});

	it("exposes plugin meta with a stable id and beta version", () => {
		const plugin = createReactExportPlugin();
		expect(plugin.meta.id).toBe("anvilkit-plugin-export-react");
		expect(plugin.meta.name).toBe("React Export");
		expect(plugin.meta.version).toBe("1.0.0-beta.0");
		expect(plugin.meta.coreVersion).toBe("^0.1.0-alpha");
	});

	it("runs the registered react format and returns page.tsx", async () => {
		const runtime = await compilePlugins([createReactExportPlugin()], makeCtx());
		const format = runtime.exportFormats.get("react");
		expect(format).toBeDefined();
		if (!format) throw new Error("expected react format");

		const result = await format.run(heroFixture, {});
		expect(result.filename).toBe("page.tsx");
		expect(result.content).toContain("import { Hero } from \"@anvilkit/hero\";");
		expect(result.content).toContain("<Hero");
		expect(result.content).toContain("Ship updates without friction.");
	});

	it("switches to .jsx when syntax=jsx is requested", async () => {
		const runtime = await compilePlugins([createReactExportPlugin()], makeCtx());
		const format = runtime.exportFormats.get("react");
		if (!format) throw new Error("expected react format");

		const result = await format.run(heroFixture, { syntax: "jsx" });
		expect(result.filename).toBe("page.jsx");
		expect(result.content).not.toContain(": JSX.Element");
	});

	it("applies plugin-level options when no call-site options are supplied", async () => {
		const runtime = await compilePlugins(
			[createReactExportPlugin({ syntax: "jsx", includeImports: false })],
			makeCtx(),
		);
		const format = runtime.exportFormats.get("react");
		if (!format) throw new Error("expected react format");

		const result = await format.run(heroFixture, {});
		expect(result.filename).toBe("page.jsx");
		expect(result.content).not.toContain(": JSX.Element");
		expect(result.content).not.toContain("import { Hero }");
	});

	it("call-site options override plugin-level options", async () => {
		const runtime = await compilePlugins(
			[createReactExportPlugin({ syntax: "jsx" })],
			makeCtx(),
		);
		const format = runtime.exportFormats.get("react");
		if (!format) throw new Error("expected react format");

		const result = await format.run(heroFixture, { syntax: "tsx" });
		expect(result.filename).toBe("page.tsx");
		expect(result.content).toContain(": JSX.Element");
	});
});
