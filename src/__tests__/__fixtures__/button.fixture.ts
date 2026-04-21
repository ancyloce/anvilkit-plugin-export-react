import type { PageIR } from "@anvilkit/core/types";

export const buttonFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "button-1",
				type: "Button",
				props: {
					label: "Get started",
					href: "/signup",
					variant: "primary",
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
