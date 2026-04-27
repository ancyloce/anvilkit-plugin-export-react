/**
 * Hostile-input battery for the React exporter.
 *
 * Threat model: every string and object in a `PageIR` is attacker-
 * controlled (LLM output, end-user text, imported documents). The
 * exporter's job is to emit React source that is safe to feed into a
 * downstream JSX parser (Babel, esbuild, swc) and does not let
 * attacker payloads bleed into the runtime DOM as live markup or
 * JS. Where another suite already covers a particular surface, this
 * file tests the same cases again so the security posture is
 * auditable in one read; where the review surfaced a gap, this file
 * is the only home for the assertion.
 *
 * If a test here starts failing, stop. Either the escape surface
 * regressed (fix the exporter) or the trust-model needs updating —
 * never weaken the assertion to make the test pass.
 */
import type { PageIR } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import { collectReactAssets } from "../assets.js";
import { emitReact } from "../emitter.js";
import { serializeProp } from "../serialize-prop.js";
import { REACT_EXPORT_DEFAULTS } from "../types.js";

function irWithHero(props: Record<string, unknown>): PageIR {
	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [{ id: "hero", type: "Hero", props }],
		},
		assets: [],
		metadata: {},
	};
}

describe("React exporter — hostile string props (JSX text-context payloads)", () => {
	it("wraps a literal <script> tag in JSON.stringify (never raw inside attribute quotes)", () => {
		const result = serializeProp("<script>alert('pwn')</script>");
		// The fix path: anything containing `<` flips to JSX expression form
		// so the JS lexer reads the string as a JS string literal, not as
		// JSX-attribute text where `<` would terminate the attribute.
		expect(result.value).toBe(
			`{${JSON.stringify("<script>alert('pwn')</script>")}}`,
		);
		expect(result.value.startsWith("{")).toBe(true);
		expect(result.value).not.toContain('"<script>');
	});

	it("emits the <script> payload through emitReact without breaking attribute quoting", () => {
		const ir = irWithHero({ headline: "<script>alert(1)</script>" });
		const code = emitReact(ir, REACT_EXPORT_DEFAULTS).code;
		// The JSX attribute must not contain a parseable `<script ...>` —
		// the emitter wraps it in JSON.stringify, producing
		// `headline={"<script>..."}` or
		// `headline={"<script>..."}` inside an expression. Either way the
		// JS lexer reads it as a string, not JSX.
		expect(code).not.toMatch(/headline="<script/);
		expect(code).toContain("headline={");
	});

	it("emits HTML-entity-shaped text through JSON.stringify so JSX cannot decode it", () => {
		// JSX attribute-string mode HTML-entity-decodes &amp;lt; back to <,
		// which would corrupt the string. Expression form preserves it.
		const result = serializeProp("Tom &amp; Jerry");
		expect(result.value).toBe(`{${JSON.stringify("Tom &amp; Jerry")}}`);
	});

	it("emits brace tokens through JSON.stringify so the JSX parser cannot misread them", () => {
		// `{` in a JSX attribute is a structural token. Naively quoting
		// `"{evil}"` works for now, but `\\` escapes do not — JSON.stringify
		// is the only safe path.
		expect(serializeProp("a {b} c").value).toBe(
			`{${JSON.stringify("a {b} c")}}`,
		);
	});

	it("emits whitespace-camouflaged payloads inside JSON.stringify (no \\n leaking into attr)", () => {
		// JSX attribute-string mode preserves raw newlines. JSON.stringify
		// converts them to `\n` escapes inside a JS string literal where
		// they are inert.
		const result = serializeProp("safe\n<script>evil</script>");
		expect(result.value.startsWith("{")).toBe(true);
		expect(result.value).toContain("\\n");
	});
});

describe("React exporter — JSX-name and attribute-name injection", () => {
	it("rejects component types that are not valid JSX identifiers", () => {
		const ir = irWithHero({});
		ir.root.children = [
			{ id: "bad", type: "Hero onError=alert(1)", props: {} },
		];
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).not.toContain("onError=alert");
		expect(result.code).toContain("{/* omitted: invalid component type */}");
		expect(result.warnings.some((w) => w.code === "INVALID_NODE_TYPE")).toBe(
			true,
		);
	});

	it("drops attributes whose key contains whitespace or =", () => {
		const ir = irWithHero({ "onClick x=1": "nope", title: "keep" });
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).not.toContain("onClick x=1");
		expect(result.code).toContain('title="keep"');
		expect(result.warnings.some((w) => w.code === "INVALID_PROP_NAME")).toBe(
			true,
		);
	});

	it("rejects attribute names that try to inject another JSX attribute", () => {
		const ir = irWithHero({ 'title=" onClick="alert': "x" });
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code).not.toContain("onClick");
		expect(result.warnings.some((w) => w.code === "INVALID_PROP_NAME")).toBe(
			true,
		);
	});
});

describe("React exporter — URL-scheme filter (static-import strategy)", () => {
	it("rejects javascript: URLs on asset props", () => {
		const ir = irWithHero({ src: "javascript:alert(1)" });
		const plan = collectReactAssets(ir, "static-import");
		expect(plan.imports).toEqual([]);
		// javascript: is matched by isExternalUrl, so it falls back to
		// url-prop with EXTERNAL_URL_STATIC_IMPORT — never produces an
		// `import "javascript:..."` line.
		expect(
			plan.warnings.some((w) => w.code === "EXTERNAL_URL_STATIC_IMPORT"),
		).toBe(true);
	});

	it("rejects file:// URLs on asset props", () => {
		const ir = irWithHero({ src: "file:///etc/passwd" });
		const plan = collectReactAssets(ir, "static-import");
		expect(plan.imports).toEqual([]);
	});

	it("rejects path-traversal URLs on asset props", () => {
		const ir = irWithHero({ src: "../../../etc/passwd" });
		const plan = collectReactAssets(ir, "static-import");
		expect(plan.imports).toEqual([]);
		expect(plan.warnings.some((w) => w.code === "UNSAFE_ASSET_PATH")).toBe(
			true,
		);
	});

	it("rejects unknown-scheme URLs on asset props", () => {
		const ir = irWithHero({ src: "weird-scheme:/payload" });
		const plan = collectReactAssets(ir, "static-import");
		expect(plan.imports).toEqual([]);
		expect(plan.warnings.some((w) => w.code === "UNSAFE_ASSET_PATH")).toBe(
			true,
		);
	});
});

describe("React exporter — structural attacks on IR shape", () => {
	it("does not stack-overflow on a deeply nested cycle in a composite prop", () => {
		// `serializeProp` walks composites recursively to surface non-
		// serializable values; a self-referencing cycle would otherwise
		// recurse forever. The guard is the WeakSet `seen` tracker in
		// detectUnserializable. JSON.stringify also catches cycles with
		// a TypeError, which safeJsonStringify converts into a warning.
		type Cyclic = { name: string; self?: Cyclic };
		const cyclic: Cyclic = { name: "root" };
		cyclic.self = cyclic;
		const result = serializeProp(cyclic, { propName: "data" });
		// We don't care which path catches it — what matters is that the
		// emitter never crashes and either produces valid JSX or surfaces
		// a warning instead.
		expect(() => result.value.length).not.toThrow();
		// Either the WeakSet guard returned cleanly with a JSON.stringify
		// TypeError -> warning, or detectUnserializable found nothing and
		// JSON.stringify itself threw. Either way: a warning and the
		// non-serializable placeholder.
		if (result.warnings.length === 0) {
			// Cycles with only plain values may serialize to "[Circular]"-
			// less output via JSON.stringify, which throws — so a warning
			// is the expected path. Anything else is a regression.
			throw new Error(
				`Expected a NON_SERIALIZABLE_PROP warning for a cyclic prop, got: ${result.value}`,
			);
		}
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
		expect(result.value).toBe("{/* omitted: non-serializable */}");
	});

	it("does not pollute Object.prototype when an IR prop has __proto__/constructor keys", () => {
		const sentinelBefore = (Object.prototype as Record<string, unknown>).polluted;
		// Using JSON.parse with a hostile body is the canonical attack
		// vector — JSON.parse does NOT walk into __proto__ but plain
		// object literals with the key `__proto__` DO assign the
		// prototype. Confirm the emitter's path goes through JSON.parse
		// shape (i.e. the values are JSON-parsed payloads, not JS object
		// literals).
		const hostile = JSON.parse(
			'{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}}}',
		) as Record<string, unknown>;
		const result = serializeProp(hostile, { propName: "data" });

		// The walk MUST NOT pollute the global prototype.
		expect((Object.prototype as Record<string, unknown>).polluted).toBe(
			sentinelBefore,
		);
		expect((Object.prototype as Record<string, unknown>).polluted2).toBe(
			undefined,
		);

		// And the output must be a JSON expression — JSON.stringify
		// re-emits the keys verbatim without executing them.
		expect(result.value.startsWith("{")).toBe(true);
	});

	it("treats __proto__ at the JSX-attribute level as just another attribute name", () => {
		// `__proto__` matches VALID_JSX_ATTR (starts with `_`), so the
		// emitter passes it through. The renderer (`React.createElement`)
		// does not treat `__proto__` as a prototype write — it is just an
		// unknown HTML attribute. This test pins the current contract so
		// a future emitter change (e.g. allowlisting attribute names)
		// does not silently regress.
		const ir = irWithHero({ __proto__: "value" });
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		// Whatever the emitter does, it must NOT pollute the host's
		// Object.prototype during compilation.
		expect((Object.prototype as Record<string, unknown>).__proto__value).toBe(
			undefined,
		);
		// And the output must not contain a literal JS prototype write.
		expect(result.code).not.toContain("Object.prototype");
	});

	it("handles an IR with 500 sibling children without stack issues", () => {
		const children = Array.from({ length: 500 }, (_, i) => ({
			id: `n-${i}`,
			type: "Hero",
			props: { headline: `H${i}` },
		}));
		const ir: PageIR = {
			version: "1",
			root: { id: "root", type: "__root__", props: {}, children },
			assets: [],
			metadata: {},
		};
		const result = emitReact(ir, REACT_EXPORT_DEFAULTS);
		expect(result.code.length).toBeGreaterThan(0);
		const matches = result.code.match(/<Hero /g) ?? [];
		expect(matches).toHaveLength(500);
	});
});
