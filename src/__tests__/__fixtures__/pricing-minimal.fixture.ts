import type { PageIR } from "@anvilkit/core/types";

export const pricingMinimalFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "pricing-1",
				type: "PricingMinimal",
				props: {
					headline: "Simple, transparent pricing",
					tiers: [
						{ name: "Starter", price: 0, features: ["5 pages", "Community"] },
						{ name: "Pro", price: 29, features: ["Unlimited", "Priority"] },
					],
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
