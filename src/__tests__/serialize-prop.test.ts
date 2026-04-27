import { describe, expect, it } from "vitest";

import { serializeProp } from "../serialize-prop.js";

describe("serializeProp — primitives", () => {
	it("emits string values as quoted JSX attributes", () => {
		const result = serializeProp("hello", { propName: "title" });
		expect(result.value).toBe('"hello"');
		expect(result.warnings).toEqual([]);
	});

	it("escapes double quotes inside string values as &quot; (HTML-entity decoded by JSX)", () => {
		const result = serializeProp('he said "hi"');
		expect(result.value).toBe('"he said &quot;hi&quot;"');
	});

	it("emits newline, carriage return, and tab inside a JSX expression so escapes are honored", () => {
		const result = serializeProp("a\nb\rc\td");
		expect(result.value).toBe(`{${JSON.stringify("a\nb\rc\td")}}`);
	});

	it("emits U+2028 and U+2029 line separators inside a JSX expression", () => {
		const result = serializeProp("a\u2028b\u2029c");
		expect(result.value).toBe(`{${JSON.stringify("a\u2028b\u2029c")}}`);
	});

	it("emits backslashes inside a JSX expression so they survive JSX attribute mode", () => {
		const result = serializeProp("C:\\Users\\file");
		expect(result.value).toBe(`{${JSON.stringify("C:\\Users\\file")}}`);
	});

	it("emits HTML-entity-shaped text inside a JSX expression so JSX cannot decode it", () => {
		const result = serializeProp("Tom &amp; Jerry");
		expect(result.value).toBe(`{${JSON.stringify("Tom &amp; Jerry")}}`);
	});

	it("emits angle/brace tokens inside a JSX expression so the JSX parser cannot misread them", () => {
		expect(serializeProp("<script>").value).toBe(
			`{${JSON.stringify("<script>")}}`,
		);
		expect(serializeProp("a {b} c").value).toBe(
			`{${JSON.stringify("a {b} c")}}`,
		);
	});

	it("emits numbers inside JSX expression braces", () => {
		expect(serializeProp(42).value).toBe("{42}");
		expect(serializeProp(0).value).toBe("{0}");
		expect(serializeProp(-1.5).value).toBe("{-1.5}");
	});

	it("emits booleans inside JSX expression braces", () => {
		expect(serializeProp(true).value).toBe("{true}");
		expect(serializeProp(false).value).toBe("{false}");
	});

	it("emits null inside JSX expression braces", () => {
		expect(serializeProp(null).value).toBe("{null}");
	});

	it("downgrades non-finite numbers to {null} with a warning", () => {
		const result = serializeProp(Number.NaN, { propName: "count" });
		expect(result.value).toBe("{null}");
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
	});
});

describe("serializeProp — composites", () => {
	it("JSON-serializes plain arrays", () => {
		const result = serializeProp([1, 2, 3]);
		expect(result.value).toBe("{[1,2,3]}");
		expect(result.warnings).toEqual([]);
	});

	it("JSON-serializes plain objects", () => {
		const result = serializeProp({ a: 1, b: "x" });
		expect(result.value).toBe('{{"a":1,"b":"x"}}');
	});

	it("handles nested objects and arrays", () => {
		const result = serializeProp({ items: [{ name: "x" }] });
		expect(result.value).toBe('{{"items":[{"name":"x"}]}}');
	});
});

describe("serializeProp — non-serializable values", () => {
	it("functions surface NON_SERIALIZABLE_PROP warnings", () => {
		const result = serializeProp(() => 42, {
			nodeId: "n-1",
			propName: "onClick",
		});
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({
			code: "NON_SERIALIZABLE_PROP",
			nodeId: "n-1",
		});
	});

	it("Dates surface NON_SERIALIZABLE_PROP warnings", () => {
		const result = serializeProp(new Date("2026-01-01"), {
			propName: "createdAt",
		});
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
	});

	it("Maps surface NON_SERIALIZABLE_PROP warnings", () => {
		const result = serializeProp(new Map([["a", 1]]), { propName: "dict" });
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
		expect(result.value).toBe("{/* omitted: non-serializable */}");
	});

	it("Sets surface NON_SERIALIZABLE_PROP warnings", () => {
		const result = serializeProp(new Set([1, 2]), { propName: "ids" });
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
	});

	it("undefined surfaces NON_SERIALIZABLE_PROP warning", () => {
		const result = serializeProp(undefined, { propName: "maybe" });
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
	});

	it("nested function inside an object degrades cleanly", () => {
		const result = serializeProp(
			{ a: 1, b: () => 0 },
			{ propName: "obj", nodeId: "n-2" },
		);
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
		expect(result.warnings[0]?.nodeId).toBe("n-2");
	});

	it("nested Date inside an object surfaces a warning (not silently ISO-stringified)", () => {
		const result = serializeProp(
			{ createdAt: new Date("2026-01-01") },
			{ propName: "meta", nodeId: "n-3" },
		);
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
		expect(result.warnings[0]?.nodeId).toBe("n-3");
	});

	it("nested Date inside an array surfaces a warning", () => {
		const result = serializeProp([{ at: new Date("2026-01-01") }], {
			propName: "events",
		});
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
	});

	it("bigint at top level surfaces a warning", () => {
		const result = serializeProp(10n, { propName: "big" });
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
	});

	it("symbol at top level surfaces a warning", () => {
		const result = serializeProp(Symbol("s"), { propName: "sym" });
		expect(result.value).toBe("{/* omitted: non-serializable */}");
		expect(result.warnings[0]?.code).toBe("NON_SERIALIZABLE_PROP");
	});
});
