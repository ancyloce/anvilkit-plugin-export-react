import type { PageIR } from "@anvilkit/core/types";

export const sectionFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "section-1",
				type: "Section",
				props: {
					title: "Everything you need",
					body: "A feature overview in plain prose.",
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
