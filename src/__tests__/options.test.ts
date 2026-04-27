import { describe, expect, it } from "vitest";

import {
	REACT_EXPORT_DEFAULTS,
	type ReactExportOptions,
	resolveReactExportOptions,
} from "../types.js";

function invalidOptions(value: Record<string, unknown>): ReactExportOptions {
	return value as ReactExportOptions;
}

describe("resolveReactExportOptions", () => {
	it("applies defaults when no options are supplied", () => {
		expect(resolveReactExportOptions()).toEqual(REACT_EXPORT_DEFAULTS);
	});

	it("rejects invalid syntax values at runtime", () => {
		expect(() =>
			resolveReactExportOptions(invalidOptions({ syntax: "ts" })),
		).toThrow(/syntax/);
	});

	it("rejects invalid moduleResolution values at runtime", () => {
		expect(() =>
			resolveReactExportOptions(invalidOptions({ moduleResolution: "umd" })),
		).toThrow(/moduleResolution/);
	});

	it("rejects invalid includeImports values at runtime", () => {
		expect(() =>
			resolveReactExportOptions(invalidOptions({ includeImports: "false" })),
		).toThrow(/includeImports/);
	});

	it("rejects invalid assetStrategy values at runtime", () => {
		expect(() =>
			resolveReactExportOptions(invalidOptions({ assetStrategy: "inline" })),
		).toThrow(/assetStrategy/);
	});

	it("rejects null option values instead of treating them as defaults", () => {
		expect(() =>
			resolveReactExportOptions(invalidOptions({ assetStrategy: null })),
		).toThrow(/assetStrategy/);
	});
});
