import type { PageIR } from "@anvilkit/core/types";

export const helpsFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "helps-1",
				type: "Helps",
				props: {
					heading: "Frequently asked",
					items: [
						{ q: "How do I install?", a: "Run pnpm add @anvilkit/core." },
						{ q: "Does it support React 19?", a: "Yes, via the peer range." },
					],
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
