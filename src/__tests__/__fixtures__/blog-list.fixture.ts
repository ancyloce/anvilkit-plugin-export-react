import type { PageIR } from "@anvilkit/core/types";

export const blogListFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "blog-list-1",
				type: "BlogList",
				props: {
					posts: [
						{ title: "Ship log", slug: "/blog/ship-log", readingTimeMinutes: 4 },
						{
							title: "Architecture diary",
							slug: "/blog/architecture-diary",
							readingTimeMinutes: 7,
						},
					],
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
