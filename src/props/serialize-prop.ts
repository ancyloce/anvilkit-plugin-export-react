import type { ExportWarning } from "@anvilkit/core/types";

/**
 * Result of serializing a single prop value. Mirrors the emitter's
 * warning contract: every non-serializable input surfaces an
 * `ExportWarning { code: "NON_SERIALIZABLE_PROP" }` and falls back to
 * a commented-out placeholder so the emitted JSX still parses.
 */
export interface SerializedProp {
	/**
	 * The JSX attribute value segment, e.g. `"hello"` for a string or
	 * `{42}` for a number. Includes the surrounding quotes or braces.
	 */
	readonly value: string;
	/**
	 * Non-fatal warnings collected while serializing. Empty for
	 * plain JSON-compatible inputs.
	 */
	readonly warnings: readonly ExportWarning[];
}

const NON_SERIALIZABLE_PLACEHOLDER = "{/* omitted: non-serializable */}";

/**
 * Build the shared `NON_SERIALIZABLE_PROP` warning shape. Every route
 * that degrades a prop — non-finite number, detected non-serializable
 * value, `JSON.stringify` throw, or placeholder fallback — reports
 * through here, so the level/code pair is stated once.
 */
function nonSerializableWarning(
	message: string,
	opts?: { readonly nodeId?: string },
): ExportWarning {
	return {
		level: "warn",
		code: "NON_SERIALIZABLE_PROP",
		message,
		...(opts?.nodeId ? { nodeId: opts.nodeId } : {}),
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Classify a value the JSON pipeline cannot represent: returns the label
 * used in the warning message, or `null` when the value is serializable.
 *
 * One classification drives both the detection walk and the placeholder
 * message, so there is no second list of types to keep in sync. `null`
 * and plain objects/arrays are serializable and report `null` here; the
 * placeholder path renders those as `"unknown"`.
 */
function describeUnserializable(value: unknown): string | null {
	switch (typeof value) {
		case "function":
			return "function";
		case "symbol":
			return "symbol";
		case "bigint":
			return "bigint";
		case "undefined":
			return "undefined";
		case "object":
			break;
		default:
			return null;
	}

	if (value instanceof Date) return "Date";
	if (value instanceof Map) return "Map";
	if (value instanceof Set) return "Set";
	if (value instanceof RegExp) return "RegExp";
	if (value instanceof Promise) return "Promise";
	return null;
}

// JSX attribute-string mode does NOT process JS-style escape sequences \u2014
// the source characters between the quotes become the literal value, with
// HTML-entity decoding as the only transformation. So any character whose
// JSX-attribute meaning differs from the IR's intent (control whitespace,
// the bidi line separators, backslashes, `&` that could begin an entity,
// or the structural JSX tokens `<`/`{`/`>`/`}`) must be emitted as a
// JSX expression so the JS lexer parses it instead.
const JSX_ATTRIBUTE_STRING_UNSAFE = /[\n\r\t\u2028\u2029\\&<>{}]/;

/**
 * Serialize a single prop value into its JSX attribute-value form.
 *
 * Primitives:
 * - `string`  → `"<escaped>"` (attribute-style string literal)
 * - `number`  → `{42}`
 * - `boolean` → `{true}` / `{false}`
 * - `null`    → `{null}`
 *
 * Composites:
 * - plain object / array → `{<JSON.stringify(...)>}`
 *
 * Any other value (function, Date, Map, Set, RegExp, Promise, symbol,
 * bigint, undefined) emits the non-serializable placeholder and
 * surfaces an `ExportWarning`. `nodeId` is echoed back on the warning
 * so host apps can attribute the issue to the offending node.
 *
 * @param value - Raw prop value from the IR.
 * @param opts  - Optional context: the IR node id and prop name, used
 *   purely for diagnostic attribution.
 */
export function serializeProp(
	value: unknown,
	opts?: { readonly nodeId?: string; readonly propName?: string },
): SerializedProp {
	if (value === null) {
		return { value: "{null}", warnings: [] };
	}

	switch (typeof value) {
		case "string":
			if (JSX_ATTRIBUTE_STRING_UNSAFE.test(value)) {
				return { value: `{${JSON.stringify(value)}}`, warnings: [] };
			}
			// Safe path: no characters JSX attribute-string mode mishandles,
			// so only `"` needs escaping for the surrounding delimiter.
			return { value: `"${value.replace(/"/g, "&quot;")}"`, warnings: [] };
		case "number": {
			if (Number.isFinite(value)) {
				return { value: `{${String(value)}}`, warnings: [] };
			}
			return {
				value: "{null}",
				warnings: [
					nonSerializableWarning(
						`Non-finite number on prop \`${opts?.propName ?? "?"}\`; emitted \`{null}\`.`,
						opts,
					),
				],
			};
		}
		case "boolean":
			return { value: `{${value ? "true" : "false"}}`, warnings: [] };
		case "object": {
			if (Array.isArray(value) || isPlainObject(value)) {
				return serializeComposite(value, opts);
			}
			return nonSerializablePlaceholder(value, opts);
		}
		default:
			return nonSerializablePlaceholder(value, opts);
	}
}

function serializeComposite(
	value: unknown[] | Record<string, unknown>,
	opts?: { readonly nodeId?: string; readonly propName?: string },
): SerializedProp {
	const warnings: ExportWarning[] = [];
	// Pre-walk before JSON.stringify so host-provided toJSON hooks (notably
	// Date.prototype.toJSON) cannot hide nested non-serializable values
	// behind an ISO-string disguise in the replacer.
	detectUnserializable(value, warnings, opts, new WeakSet());
	if (warnings.length > 0) {
		return { value: NON_SERIALIZABLE_PLACEHOLDER, warnings };
	}
	const json = safeJsonStringify(value, warnings, opts);
	if (warnings.length > 0) {
		return { value: NON_SERIALIZABLE_PLACEHOLDER, warnings };
	}
	return { value: `{${json}}`, warnings: [] };
}

function detectUnserializable(
	value: unknown,
	warnings: ExportWarning[],
	opts: { readonly nodeId?: string; readonly propName?: string } | undefined,
	seen: WeakSet<object>,
): void {
	if (value === null) return;
	const unserializableKind = describeUnserializable(value);
	if (unserializableKind !== null) {
		warnings.push(
			nonSerializableWarning(
				`Prop \`${opts?.propName ?? "?"}\` contains a non-serializable ${unserializableKind}.`,
				opts,
			),
		);
		return;
	}
	if (typeof value !== "object") return;
	if (seen.has(value as object)) return;
	seen.add(value as object);
	if (Array.isArray(value)) {
		for (const entry of value) {
			detectUnserializable(entry, warnings, opts, seen);
			if (warnings.length > 0) return;
		}
		return;
	}
	if (isPlainObject(value)) {
		for (const entry of Object.values(value)) {
			detectUnserializable(entry, warnings, opts, seen);
			if (warnings.length > 0) return;
		}
	}
}

function safeJsonStringify(
	value: unknown,
	warnings: ExportWarning[],
	opts?: { readonly nodeId?: string; readonly propName?: string },
): string {
	try {
		return JSON.stringify(value);
	} catch {
		warnings.push(
			nonSerializableWarning(
				`Prop \`${opts?.propName ?? "?"}\` could not be JSON-serialized.`,
				opts,
			),
		);
		return "null";
	}
}

function nonSerializablePlaceholder(
	value: unknown,
	opts?: { readonly nodeId?: string; readonly propName?: string },
): SerializedProp {
	return {
		value: NON_SERIALIZABLE_PLACEHOLDER,
		warnings: [
			nonSerializableWarning(
				`Prop \`${opts?.propName ?? "?"}\` is a ${
					describeUnserializable(value) ?? "unknown"
				} and cannot be emitted as JSX.`,
				opts,
			),
		],
	};
}
