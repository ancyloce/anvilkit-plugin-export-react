import type { PageIR } from "@anvilkit/core/types";

export const bentoGridFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "bento-grid-1",
				type: "BentoGrid",
				props: {
					theme: "light",
					platform: "web",
					items: [
						{
							title: "Snapshots",
							description: "Lock output to a stable TSX baseline.",
							icon: "S",
							size: "wide",
						},
						{
							title: "Linting",
							description: "Keep fixture modules clean and deterministic.",
							icon: "L",
							size: "default",
						},
					],
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
