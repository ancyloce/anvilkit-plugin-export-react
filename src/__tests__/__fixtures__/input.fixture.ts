import type { PageIR } from "@anvilkit/core/types";

export const inputFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "input-1",
				type: "Input",
				props: {
					name: "email",
					placeholder: "you@example.com",
					required: true,
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
