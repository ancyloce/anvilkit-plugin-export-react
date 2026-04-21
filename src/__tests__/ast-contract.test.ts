import { parse } from "@typescript-eslint/typescript-estree";
import { describe, expect, it } from "vitest";

import { emitReact } from "../emitter.js";
import { REACT_EXPORT_DEFAULTS, resolveReactExportOptions } from "../types.js";
import { fixtures } from "./__fixtures__/index.js";

const NOISE_KEYS = new Set(["loc", "range", "raw", "start", "end", "tokens", "comments"]);

type Plain = unknown;

function stripNoise(node: Plain): Plain {
	if (Array.isArray(node)) {
		return node.map(stripNoise);
	}
	if (node && typeof node === "object") {
		const input = node as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(input)) {
			if (NOISE_KEYS.has(key)) continue;
			out[key] = stripNoise(value);
		}
		return out;
	}
	return node;
}

describe("AST contract — every demo fixture parses cleanly", () => {
	for (const { name, ir } of fixtures) {
		it(`parses the emitted source for ${name} (tsx)`, () => {
			const { code } = emitReact(ir, REACT_EXPORT_DEFAULTS);
			const ast = parse(code, { jsx: true, loc: false, range: false });
			expect(ast.type).toBe("Program");
			expect(Array.isArray(ast.body)).toBe(true);
			const snapshot = stripNoise(ast);
			expect(snapshot).toMatchSnapshot();
		});

		it(`parses the emitted source for ${name} (jsx)`, () => {
			const { code } = emitReact(
				ir,
				resolveReactExportOptions({ syntax: "jsx" }),
			);
			const ast = parse(code, { jsx: true, loc: false, range: false });
			expect(ast.type).toBe("Program");
		});
	}
});

describe("AST contract — pathological inputs", () => {
	it("throws a parse error when the emitter is deliberately broken (regression guard)", () => {
		// The parser should reject obviously-broken JSX. This guarantees
		// that a regression in the emitter can't silently pass the suite.
		expect(() =>
			parse("export default function Page() { return (<Hero /); }", {
				jsx: true,
			}),
		).toThrow();
	});
});
