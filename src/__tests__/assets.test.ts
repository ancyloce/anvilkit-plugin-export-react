import type { PageIR } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import { collectReactAssets, resolveReactAssetUrls } from "../assets.js";
import { emitReact } from "../emitter.js";
import { reactFormat } from "../format-definition.js";
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
		const plan = collectReactAssets(
			irWithHeroSrc("/assets/hero-bg.jpg"),
			"url-prop",
		);
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

	it("discovers nested asset props inside arrays and objects", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "blog-1",
						type: "BlogList",
						props: {
							posts: [
								{
									title: "Post",
									imageSrc: "/assets/post.png",
									media: { thumbnailSrc: "/assets/thumb.png" },
								},
							],
						},
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const plan = collectReactAssets(ir, "static-import");

		expect(plan.imports.map((imp) => imp.source)).toEqual([
			"./assets/post.png",
			"./assets/thumb.png",
		]);
		expect(plan.rewrites.has("/assets/post.png")).toBe(true);
		expect(plan.rewrites.has("/assets/thumb.png")).toBe(true);
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
					{
						id: "b",
						type: "Section",
						props: { imageSrc: "/assets/alpha.jpg" },
					},
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

	it("rejects traversal segments and surfaces UNSAFE_ASSET_PATH", () => {
		const plan = collectReactAssets(
			irWithHeroSrc("../../../etc/passwd"),
			"static-import",
		);
		expect(plan.imports).toHaveLength(0);
		expect(plan.rewrites.size).toBe(0);
		expect(plan.warnings[0]?.code).toBe("UNSAFE_ASSET_PATH");
	});

	it("rejects javascript: scheme under static-import", () => {
		const plan = collectReactAssets(
			irWithHeroSrc("javascript:alert(1)"),
			"static-import",
		);
		expect(plan.imports).toHaveLength(0);
		expect(
			plan.warnings.some((w) => w.code === "EXTERNAL_URL_STATIC_IMPORT"),
		).toBe(true);
	});

	it("rejects file: scheme under static-import", () => {
		const plan = collectReactAssets(
			irWithHeroSrc("file:///etc/passwd"),
			"static-import",
		);
		expect(plan.imports).toHaveLength(0);
		expect(
			plan.warnings.some((w) => w.code === "EXTERNAL_URL_STATIC_IMPORT"),
		).toBe(true);
	});

	it("treats same-path URLs with distinct query strings as distinct bindings (documented)", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "a",
						type: "Section",
						props: { imageSrc: "/assets/bg.jpg?v=1" },
					},
					{
						id: "b",
						type: "Section",
						props: { imageSrc: "/assets/bg.jpg?v=2" },
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const plan = collectReactAssets(ir, "static-import");
		expect(plan.imports).toHaveLength(2);
		expect(plan.rewrites.size).toBe(2);
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
		expect(result.code).toMatch(
			/import hero_bg_[a-f0-9]{8} from "\.\/assets\/hero-bg\.jpg";/,
		);
		expect(result.code).toMatch(/backgroundSrc=\{hero_bg_[a-f0-9]{8}\}/);
	});

	it("static-import rewrites nested asset props inside composite prop values", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "blog-1",
						type: "BlogList",
						props: {
							posts: [{ title: "Post", imageSrc: "/assets/post.png" }],
						},
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const result = emitReact(
			ir,
			resolveReactExportOptions({ assetStrategy: "static-import" }),
		);

		expect(result.code).toMatch(
			/import post_[a-f0-9]{8} from "\.\/assets\/post\.png";/,
		);
		expect(result.code).toMatch(
			/posts=\{\[\{"title":"Post","imageSrc":post_[a-f0-9]{8}\}\]\}/,
		);
		expect(result.code).not.toContain('"imageSrc":"/assets/post.png"');
	});

	it("static-import + external URL surfaces a warning and falls back to string", () => {
		const result = emitReact(
			irWithHeroSrc("https://cdn.example.com/bg.jpg"),
			resolveReactExportOptions({ assetStrategy: "static-import" }),
		);
		expect(result.code).toContain(
			'backgroundSrc="https://cdn.example.com/bg.jpg"',
		);
		expect(
			result.warnings.some((w) => w.code === "EXTERNAL_URL_STATIC_IMPORT"),
		).toBe(true);
	});
});

describe("React export asset resolvers", () => {
	it("rewrites asset:// URLs before emitting React source", async () => {
		const result = await reactFormat.run(
			irWithHeroSrc("asset://asset-1"),
			{ assetStrategy: "url-prop" },
			{
				assetResolvers: [
					(url) =>
						url === "asset://asset-1"
							? { url: "https://cdn.example.com/hero-bg.jpg" }
							: null,
				],
			},
		);

		expect(result.content).toContain(
			'backgroundSrc="https://cdn.example.com/hero-bg.jpg"',
		);
		expect(result.content).not.toContain("asset://");
	});

	it("drops hostile resolved URLs and emits ASSET_UNRESOLVED", async () => {
		const result = await reactFormat.run(
			irWithHeroSrc("asset://asset-1"),
			{ assetStrategy: "url-prop" },
			{
				assetResolvers: [
					(url) =>
						url === "asset://asset-1" ? { url: "javascript:alert(1)" } : null,
				],
			},
		);

		expect(result.content).not.toContain("javascript:");
		expect(result.content).not.toContain("asset://");
		expect(
			result.warnings?.some((warning) => warning.code === "ASSET_UNRESOLVED"),
		).toBe(true);
	});

	it("drops file, blob, filesystem, and protocol-relative resolved URLs", async () => {
		const urls = [
			"file:///etc/passwd",
			"blob:https://example.com/asset",
			"filesystem:https://example.com/temporary/asset",
			"//cdn.example.com/asset.png",
		];

		for (const url of urls) {
			const result = await reactFormat.run(
				irWithHeroSrc("asset://asset-1"),
				{ assetStrategy: "url-prop" },
				{
					assetResolvers: [
						(candidate) => (candidate === "asset://asset-1" ? { url } : null),
					],
				},
			);

			expect(result.content).not.toContain(url);
			expect(result.content).not.toContain("asset://");
			expect(
				result.warnings?.some((warning) => warning.code === "ASSET_UNRESOLVED"),
			).toBe(true);
		}
	});

	it("drops non-image data URLs from resolvers", async () => {
		const dataUrl = "data:text/html,<script>alert(1)</script>";
		const result = await reactFormat.run(
			irWithHeroSrc("asset://asset-1"),
			{ assetStrategy: "url-prop" },
			{
				assetResolvers: [
					(url) => (url === "asset://asset-1" ? { url: dataUrl } : null),
				],
			},
		);

		expect(result.content).not.toContain(dataUrl);
		expect(
			result.warnings?.some((warning) => warning.code === "ASSET_UNRESOLVED"),
		).toBe(true);
	});

	it("allows safe raster image data URLs from resolvers", async () => {
		const dataUrl = "data:image/png;base64,aGVsbG8=";
		const result = await reactFormat.run(
			irWithHeroSrc("asset://asset-1"),
			{ assetStrategy: "url-prop" },
			{
				assetResolvers: [
					(url) => (url === "asset://asset-1" ? { url: dataUrl } : null),
				],
			},
		);

		expect(result.content).toContain(`backgroundSrc="${dataUrl}"`);
		expect(result.content).not.toContain("asset://");
	});
});

describe("resolveReactAssetUrls", () => {
	it("rewrites the IR without mutating the input", async () => {
		const ir = irWithHeroSrc("asset://asset-1");
		const next = await resolveReactAssetUrls(ir, [
			(url) =>
				url === "asset://asset-1"
					? { url: "https://cdn.example.com/hero-bg.jpg" }
					: null,
		]);

		expect(ir.root.children?.[0]?.props.backgroundSrc).toBe("asset://asset-1");
		expect(next.ir.root.children?.[0]?.props.backgroundSrc).toBe(
			"https://cdn.example.com/hero-bg.jpg",
		);
		expect(Object.isFrozen(next.ir)).toBe(true);
	});

	it("does not freeze metadata objects owned by the caller", async () => {
		const assetMeta = { size: 12, nested: { width: 640 } };
		const metadata = {
			title: "Asset page",
			extra: { owner: "caller" },
		} as unknown as PageIR["metadata"];
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
						props: { backgroundSrc: "asset://asset-1" },
					},
				],
			},
			assets: [
				{
					id: "asset-1",
					kind: "image",
					url: "asset://asset-1",
					meta: assetMeta,
				},
			],
			metadata,
		};

		const next = await resolveReactAssetUrls(ir, [
			(url) =>
				url === "asset://asset-1"
					? { url: "https://cdn.example.com/hero-bg.jpg" }
					: null,
		]);

		expect(Object.isFrozen(next.ir.assets[0]?.meta)).toBe(true);
		expect(Object.isFrozen(next.ir.metadata)).toBe(true);
		expect(Object.isFrozen(assetMeta)).toBe(false);
		expect(Object.isFrozen(assetMeta.nested)).toBe(false);
		expect(Object.isFrozen(metadata)).toBe(false);
		expect(
			Object.isFrozen((metadata as unknown as { extra: object }).extra),
		).toBe(false);
	});
});
