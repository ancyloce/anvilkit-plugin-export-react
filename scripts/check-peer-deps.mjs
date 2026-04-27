#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const PACKAGE_JSON = resolve(PACKAGE_ROOT, "package.json");
const CORE_PACKAGE_JSON = resolve(
	PACKAGE_ROOT,
	"../../core/package.json",
);
const REQUIRED_PEERS = ["react", "@puckeditor/core", "@anvilkit/core"];

// Peer ranges that MUST stay at least as tight as `@anvilkit/core`'s own
// declared peer of the same name. Loosening them past core's range would
// allow pnpm strict-peer-deps to install a mutually-incompatible combo.
const CROSS_CHECKED_PEERS = ["@puckeditor/core"];

async function main() {
	const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
	const corePkg = JSON.parse(await readFile(CORE_PACKAGE_JSON, "utf8"));
	const dependencies = pkg.dependencies ?? {};
	const devDependencies = pkg.devDependencies ?? {};
	const peerDependencies = pkg.peerDependencies ?? {};
	const peerDependenciesMeta = pkg.peerDependenciesMeta ?? {};
	const corePeerDependencies = corePkg.peerDependencies ?? {};

	const missingRequiredPeers = REQUIRED_PEERS.filter(
		(name) => !(name in peerDependencies),
	);
	const missingFromDevDependencies = Object.keys(peerDependencies).filter(
		(name) => !(name in devDependencies),
	);
	const missingPeerMeta = Object.keys(peerDependencies).filter((name) => {
		const meta = peerDependenciesMeta[name];
		return !meta || meta.optional !== false;
	});
	const leakedToDependencies = REQUIRED_PEERS.filter(
		(name) => name in dependencies,
	);

	const crossPackageMismatches = [];
	for (const name of CROSS_CHECKED_PEERS) {
		const ours = peerDependencies[name];
		const theirs = corePeerDependencies[name];
		if (!ours || !theirs) continue;
		if (!isAtLeastAsTight(ours, theirs)) {
			crossPackageMismatches.push(
				`  - ${name}: this package wants "${ours}", @anvilkit/core wants "${theirs}". The plugin range must not be looser than core's.`,
			);
		}
	}

	if (
		missingRequiredPeers.length === 0 &&
		missingFromDevDependencies.length === 0 &&
		missingPeerMeta.length === 0 &&
		leakedToDependencies.length === 0 &&
		crossPackageMismatches.length === 0
	) {
		console.log(
			"check-peer-deps: OK — peer deps are mirrored in devDependencies, absent from dependencies, and at least as tight as @anvilkit/core's.",
		);
		return;
	}

	console.error("check-peer-deps: FAIL");
	console.error("");

	if (missingRequiredPeers.length > 0) {
		console.error(
			`  Missing required peerDependencies: ${missingRequiredPeers.join(", ")}`,
		);
		console.error("");
	}

	if (missingFromDevDependencies.length > 0) {
		console.error(
			`  Missing from devDependencies: ${missingFromDevDependencies.join(", ")}`,
		);
		console.error("");
	}

	if (missingPeerMeta.length > 0) {
		console.error(
			`  Missing or invalid peerDependenciesMeta: ${missingPeerMeta.join(", ")}`,
		);
		console.error("");
	}

	if (leakedToDependencies.length > 0) {
		console.error(
			`  Leaked into dependencies: ${leakedToDependencies.join(", ")}`,
		);
		console.error("");
	}

	if (crossPackageMismatches.length > 0) {
		console.error("  Cross-package peer mismatch with @anvilkit/core:");
		for (const line of crossPackageMismatches) {
			console.error(line);
		}
		console.error("");
	}

	process.exit(1);
}

/**
 * Return true when `ours` is at least as restrictive as `theirs` for the
 * common npm-style ranges this repo uses (`^X.Y.Z` or `>=X.Y.Z`). Any
 * unrecognized form falls back to a string-equality check.
 *
 * The check is deliberately conservative: it only declares "at least as
 * tight" when the lower bound of `ours` is >= the lower bound of `theirs`
 * AND both ranges target the same major (caret) tuple. Anything else
 * fails closed.
 */
function isAtLeastAsTight(ours, theirs) {
	if (ours === theirs) return true;
	const oursParsed = parseRange(ours);
	const theirsParsed = parseRange(theirs);
	if (!oursParsed || !theirsParsed) return false;
	if (oursParsed.major !== theirsParsed.major) return false;
	if (oursParsed.minor < theirsParsed.minor) return false;
	if (
		oursParsed.minor === theirsParsed.minor &&
		oursParsed.patch < theirsParsed.patch
	) {
		return false;
	}
	return true;
}

function parseRange(range) {
	const cleaned = range.replace(/^\^|^>=/, "").trim();
	const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

main().catch((error) => {
	console.error("check-peer-deps: crashed unexpectedly");
	console.error(error);
	process.exit(2);
});
