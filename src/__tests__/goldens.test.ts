import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { emitReact } from "../emitter.js";
import { resolveReactExportOptions } from "../types.js";
import { fixtures } from "./__fixtures__/index.js";

const __filename = fileURLToPath(import.meta.url);
const GOLDENS_DIR = resolve(dirname(__filename), "__snapshots__/goldens");
const UPDATE = process.env.UPDATE_GOLDENS === "1";

function readOrWriteGolden(path: string, content: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if (UPDATE) {
			writeFileSync(path, content, "utf8");
			return content;
		}
		throw error;
	}
}

describe("goldens — emitted TSX byte-for-byte match", () => {
	for (const { name, ir } of fixtures) {
		it(`${name}.tsx matches the committed golden`, () => {
			const { code } = emitReact(
				ir,
				resolveReactExportOptions({ syntax: "tsx" }),
			);
			const goldenPath = resolve(GOLDENS_DIR, `${name}.tsx`);
			if (UPDATE) {
				writeFileSync(goldenPath, code, "utf8");
			}
			const golden = readOrWriteGolden(goldenPath, code);
			expect(code).toBe(golden);
		});

		it(`${name}.jsx matches the committed golden`, () => {
			const { code } = emitReact(
				ir,
				resolveReactExportOptions({ syntax: "jsx" }),
			);
			const goldenPath = resolve(GOLDENS_DIR, `${name}.jsx`);
			if (UPDATE) {
				writeFileSync(goldenPath, code, "utf8");
			}
			const golden = readOrWriteGolden(goldenPath, code);
			expect(code).toBe(golden);
		});
	}
});
