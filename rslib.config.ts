import { defineConfig } from "@rslib/core";

/**
 * Bundleless build for `@anvilkit/plugin-export-react`.
 *
 * Each `.ts` under `src/` becomes an individual ESM + CJS output in
 * `dist/`, matching `plugin-export-html`'s layout. `@anvilkit/core`,
 * `@puckeditor/core`, and `react` are all left external so consumers
 * install exactly one copy.
 */
export default defineConfig({
	source: {
		entry: {
			index: [
				"./src/**/*.ts",
				"!./src/**/*.{test,spec}.ts",
				"!./src/**/__tests__/**",
			],
		},
	},
	lib: [
		{
			bundle: false,
			dts: {
				autoExtension: true,
			},
			id: "esm",
			format: "esm",
		},
		{
			bundle: false,
			dts: {
				autoExtension: true,
				distPath: "./dist/cjs",
			},
			id: "cjs",
			format: "cjs",
		},
	],
	output: {
		target: "node",
		externals: ["@anvilkit/core", "@puckeditor/core", "react"],
	},
	performance: {
		// rslib defaults performance.buildCache to true, but rspack 2.x's
		// persistent cache storage is not concurrency-safe under Turbo's
		// parallel `^build` fan-out (concurrency: 32) -> SIGABRT or
		// silently missing/corrupted dist output (e.g. missing .d.ts).
		buildCache: false,
	},
});
