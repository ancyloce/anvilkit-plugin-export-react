import type { PageIR } from "@anvilkit/core/types";

export const heroFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "hero-1",
				type: "Hero",
				props: {
					headline: "Ship updates without friction.",
					description: "Deterministic React exports for marketing pages.",
					linuxLabel: "Download for Linux",
					linuxHref: "https://example.com/linux",
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
