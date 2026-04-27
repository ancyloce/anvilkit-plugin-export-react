#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
	mkdir,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const PACKAGE_JSON = resolve(PACKAGE_ROOT, "package.json");
const CONFIG_JSON = resolve(__dirname, "check-config.json");
const DIST_ENTRY = resolve(PACKAGE_ROOT, "dist/index.js");
const TMP_DIR = resolve(PACKAGE_ROOT, ".bundle-check");
const ENTRY_FILE = resolve(TMP_DIR, "entry.mjs");
const OUT_DIR = resolve(TMP_DIR, "out");

const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function loadInputs() {
	const [pkgRaw, configRaw] = await Promise.all([
		readFile(PACKAGE_JSON, "utf8"),
		readFile(CONFIG_JSON, "utf8"),
	]);

	const pkg = JSON.parse(pkgRaw);
	const config = JSON.parse(configRaw);

	if (
		!Number.isFinite(config.budgetGzippedBytes) ||
		config.budgetGzippedBytes <= 0
	) {
		throw new Error(
			"check-bundle-budget: invalid budgetGzippedBytes in check-config.json",
		);
	}

	return { pkg, config };
}

async function ensureDistExists() {
	try {
		await stat(DIST_ENTRY);
	} catch {
		console.log(
			"check-bundle-budget: dist/index.js missing — running `pnpm exec rslib build`",
		);
		execFileSync(PNPM_BIN, ["exec", "rslib", "build"], {
			cwd: PACKAGE_ROOT,
			stdio: "inherit",
		});
	}
}

async function prepareEntry(packageName) {
	await rm(TMP_DIR, { recursive: true, force: true });
	await mkdir(TMP_DIR, { recursive: true });
	await writeFile(
		ENTRY_FILE,
		`export * from ${JSON.stringify(packageName)};\n`,
		"utf8",
	);
}

async function bundle(packageName, peerDependencies, dependencies) {
	const platform = packageName.startsWith("@anvilkit/plugin-")
		? "browser"
		: "node";
	// The budget measures *this* package's own code only — every peer or
	// regular dependency is the consumer's installed copy and must be
	// excluded so esbuild does not pull it into the gzipped bundle.
	const external = [
		...new Set([
			...Object.keys(peerDependencies),
			...Object.keys(dependencies),
			"react/jsx-runtime",
			"react/jsx-dev-runtime",
		]),
	];

	const result = await build({
		absWorkingDir: PACKAGE_ROOT,
		bundle: true,
		entryPoints: [ENTRY_FILE],
		external,
		format: "esm",
		logLevel: "error",
		metafile: true,
		minify: true,
		outdir: OUT_DIR,
		platform,
		splitting: true,
		target: "es2022",
		treeShaking: true,
		write: true,
	});

	if (result.errors.length > 0) {
		for (const error of result.errors) {
			console.error(error);
		}
		throw new Error("check-bundle-budget: esbuild reported errors");
	}

	return result.metafile;
}

function findEntryChunk(metafile) {
	for (const [outputPath, output] of Object.entries(metafile.outputs)) {
		if (output.entryPoint) {
			return resolve(PACKAGE_ROOT, outputPath);
		}
	}

	throw new Error(
		"check-bundle-budget: could not locate the bundled entry chunk",
	);
}

async function main() {
	const { pkg, config } = await loadInputs();
	await ensureDistExists();
	await prepareEntry(pkg.name);

	const metafile = await bundle(
		pkg.name,
		pkg.peerDependencies ?? {},
		pkg.dependencies ?? {},
	);
	const entryChunkPath = findEntryChunk(metafile);
	const raw = await readFile(entryChunkPath);
	const gzipped = gzipSync(raw, { level: 9 });
	const rawBytes = raw.length;
	const gzippedBytes = gzipped.length;
	const budget = config.budgetGzippedBytes;
	const percentOfBudget = ((gzippedBytes / budget) * 100).toFixed(1);
	const entryChunkName = basename(entryChunkPath);
	const asyncChunks = (await readdir(OUT_DIR)).filter(
		(fileName) => fileName.endsWith(".js") && fileName !== entryChunkName,
	);

	console.log(`check-bundle-budget: ${pkg.name}`);
	console.log(`  entry chunk:  ${entryChunkName}`);
	console.log(`  raw bytes:    ${rawBytes.toLocaleString()}`);
	console.log(`  gzipped:      ${gzippedBytes.toLocaleString()}`);
	console.log(`  budget:       ${budget.toLocaleString()}`);
	console.log(`  of budget:    ${percentOfBudget}%`);
	console.log(
		`  async chunks: ${asyncChunks.length > 0 ? asyncChunks.join(", ") : "none"}`,
	);

	if (gzippedBytes > budget) {
		console.error("");
		console.error(
			`check-bundle-budget: FAIL — ${gzippedBytes.toLocaleString()} bytes exceeds the ${budget.toLocaleString()} byte budget.`,
		);
		process.exit(1);
	}

	console.log("check-bundle-budget: OK");
}

main().catch((error) => {
	console.error("check-bundle-budget: crashed unexpectedly");
	console.error(error);
	process.exit(2);
});
