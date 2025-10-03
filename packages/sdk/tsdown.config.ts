import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
	entry: [
		"./src/index.ts",
		"./src/checkout/index.ts",
		"./src/checkout/next/index.ts",
		"./src/test/index.ts",
		"./src/feeds/index.ts",
	],
	outDir: "./dist",
	dts: true,
	sourcemap: true,
	format: "esm",
	platform: "node",
	// plugins: [dts()],
});

export default config;
