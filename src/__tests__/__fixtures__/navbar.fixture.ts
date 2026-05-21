import type { PageIR } from "@anvilkit/core/types";

export const navbarFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "navbar-1",
				type: "Navbar",
				props: {
					brand: "Anvilkit",
					links: [
						{ label: "Docs", href: "/docs" },
						{ label: "Pricing", href: "/pricing" },
					],
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
