import type { PageIR } from "@anvilkit/core/types";

import { bentoGridFixture } from "./bento-grid.fixture.js";
import { blogListFixture } from "./blog-list.fixture.js";
import { buttonFixture } from "./button.fixture.js";
import { helpsFixture } from "./helps.fixture.js";
import { heroFixture } from "./hero.fixture.js";
import { inputFixture } from "./input.fixture.js";
import { logoCloudsFixture } from "./logo-clouds.fixture.js";
import { navbarFixture } from "./navbar.fixture.js";
import { pricingMinimalFixture } from "./pricing-minimal.fixture.js";
import { sectionFixture } from "./section.fixture.js";
import { statisticsFixture } from "./statistics.fixture.js";

export interface Fixture {
	readonly name: string;
	readonly ir: PageIR;
}

export const fixtures: readonly Fixture[] = [
	{ name: "bento-grid", ir: bentoGridFixture },
	{ name: "blog-list", ir: blogListFixture },
	{ name: "button", ir: buttonFixture },
	{ name: "helps", ir: helpsFixture },
	{ name: "hero", ir: heroFixture },
	{ name: "input", ir: inputFixture },
	{ name: "logo-clouds", ir: logoCloudsFixture },
	{ name: "navbar", ir: navbarFixture },
	{ name: "pricing-minimal", ir: pricingMinimalFixture },
	{ name: "section", ir: sectionFixture },
	{ name: "statistics", ir: statisticsFixture },
];

export {
	bentoGridFixture,
	blogListFixture,
	buttonFixture,
	helpsFixture,
	heroFixture,
	inputFixture,
	logoCloudsFixture,
	navbarFixture,
	pricingMinimalFixture,
	sectionFixture,
	statisticsFixture,
};
