import type { StudioHeaderAction } from "@anvilkit/core/types";

export const exportReactHeaderAction: StudioHeaderAction = {
	id: "export-react",
	label: "Export React",
	icon: "code",
	group: "secondary",
	order: 110,
	onClick: async (ctx) => {
		// The host app wires this to its `exportAs("react", options)` path.
		// The placeholder log proves the header action is contributed by
		// `compilePlugins()` and is callable from a real Studio instance.
		ctx.log(
			"info",
			"React export clicked; host should wire exportAs(\"react\").",
		);
	},
};
