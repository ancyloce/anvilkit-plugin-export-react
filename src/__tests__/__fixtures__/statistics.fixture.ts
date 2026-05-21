import type { PageIR } from "@anvilkit/core/types";

export const statisticsFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "stats-1",
				type: "Statistics",
				props: {
					items: [
						{ value: "99.99%", label: "Uptime" },
						{ value: "20ms", label: "p95 latency" },
					],
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
