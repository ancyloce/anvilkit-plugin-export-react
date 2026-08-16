/**
 * PLAN-0036 P1-07 / FR-052 — slot emission.
 *
 * Children produced from a Puck slot field carry that field's key in
 * `node.slot`; the emitter must wrap each such region in an explicit
 * `<Component.slotName>` member tag (PRD 0023 RESOLVED-3) rather than
 * flattening every region into one anonymous child list.
 */
import type { PageIR, PageIRNode } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { emitReact } from "../emitter.js";
import { resolveReactExportOptions } from "../types/types.js";

const opts = resolveReactExportOptions({});

function pageOf(...children: PageIRNode[]): PageIR {
	return {
		version: "1",
		root: { id: "root", type: "__root__", props: {}, children },
		assets: [],
		metadata: {},
	};
}

/** A Card with both DOC-01 §5.3 slot regions populated. */
const cardWithSlots = pageOf({
	id: "card-1",
	type: "Card",
	props: { title: "Pricing", size: "default" },
	children: [
		{
			id: "badge-1",
			type: "Badge",
			props: { label: "New", variant: "default" },
			slot: "content",
		},
		{
			id: "button-1",
			type: "Button",
			props: { label: "Buy" },
			slot: "footer",
		},
	],
});

describe("slot emission (FR-052)", () => {
	it("wraps each slot region in a `<Component.slot>` member tag", () => {
		const { code } = emitReact(cardWithSlots, opts);

		expect(code).toContain("<Card.content>");
		expect(code).toContain("</Card.content>");
		expect(code).toContain("<Card.footer>");
		expect(code).toContain("</Card.footer>");
		// The slot children live INSIDE their region, not as flat siblings.
		expect(code).toMatch(/<Card\.content>\s*<Badge[\s\S]*?<\/Card\.content>/);
		expect(code).toMatch(/<Card\.footer>\s*<Button[\s\S]*?<\/Card\.footer>/);
	});

	it("keeps author order and does not merge distinct regions", () => {
		const { code } = emitReact(cardWithSlots, opts);
		expect(code.indexOf("<Card.content>")).toBeLessThan(
			code.indexOf("<Card.footer>"),
		);
		expect(code.match(/<Card\.content>/g)).toHaveLength(1);
		expect(code.match(/<Card\.footer>/g)).toHaveLength(1);
	});

	it("groups multiple children of one slot under a single tag", () => {
		const { code } = emitReact(
			pageOf({
				id: "card-1",
				type: "Card",
				props: {},
				children: [
					{ id: "a", type: "Badge", props: { label: "A" }, slot: "content" },
					{ id: "b", type: "Badge", props: { label: "B" }, slot: "content" },
				],
			}),
			opts,
		);

		expect(code.match(/<Card\.content>/g)).toHaveLength(1);
		expect(code.match(/<Badge/g)).toHaveLength(2);
	});

	it("emits unslotted children inline, exactly as before", () => {
		const { code, warnings } = emitReact(
			pageOf({
				id: "section-1",
				type: "Section",
				props: {},
				children: [{ id: "b", type: "Badge", props: { label: "A" } }],
			}),
			opts,
		);

		expect(code).not.toContain("<Section.");
		expect(code).toContain("<Badge");
		expect(warnings).toEqual([]);
	});

	it("mixes slotted and unslotted children without losing either", () => {
		const { code } = emitReact(
			pageOf({
				id: "card-1",
				type: "Card",
				props: {},
				children: [
					{ id: "plain", type: "Badge", props: { label: "Plain" } },
					{
						id: "in-slot",
						type: "Button",
						props: { label: "In" },
						slot: "footer",
					},
				],
			}),
			opts,
		);

		expect(code).toContain("<Card.footer>");
		expect(code).toMatch(/<Badge[\s\S]*<Card\.footer>/);
	});

	it("degrades to inline children (with a warning) for a non-identifier slot name", () => {
		// Legacy `data.zones` keys are not constrained to JS identifiers, and
		// `<Card.my-zone>` would be a syntax error.
		const { code, warnings } = emitReact(
			pageOf({
				id: "card-1",
				type: "Card",
				props: {},
				children: [
					{
						id: "z",
						type: "Badge",
						props: { label: "Z" },
						slot: "my-zone",
						slotKind: "zone",
					},
				],
			}),
			opts,
		);

		expect(code).not.toContain("Card.my-zone");
		expect(code).toContain("<Badge");
		expect(warnings).toContainEqual(
			expect.objectContaining({ code: "INVALID_SLOT_NAME", level: "warn" }),
		);
	});

	it("emits balanced member tags nested inside the parent element", () => {
		const { code } = emitReact(cardWithSlots, opts);
		const opened = [...code.matchAll(/<Card\.(\w+)>/g)].map((m) => m[1]);
		const closed = [...code.matchAll(/<\/Card\.(\w+)>/g)].map((m) => m[1]);

		expect(opened).toEqual(["content", "footer"]);
		expect(closed).toEqual(opened);
		// The parent element closes after every region it contains.
		expect(code.lastIndexOf("</Card.footer>")).toBeLessThan(
			code.lastIndexOf("</Card>"),
		);
	});
});
