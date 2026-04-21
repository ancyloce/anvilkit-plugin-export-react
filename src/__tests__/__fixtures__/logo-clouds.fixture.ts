import type { PageIR } from "@anvilkit/core/types";

export const logoCloudsFixture: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "logo-clouds-1",
				type: "LogoClouds",
				props: {
					title: "Trusted by teams everywhere",
					items: [
						{ label: "React", src: "/assets/logos/react.svg" },
						{ label: "Docker", src: "/assets/logos/docker.svg" },
					],
				},
			},
		],
	},
	assets: [],
	metadata: {},
};
