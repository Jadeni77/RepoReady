import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    platform: "node",
    dts: true,
    /**
     * Inline the workspace packages so the CLI ships as a single npm package.
     * Third-party plugin loading is explicitly unsupported, so core and the
     * plugins have no external consumers; publishing them separately would buy
     * nothing and cost a four-way version bump on every release.
     */
    noExternal: [/^@repoready\//],
    /**
     * tsup rewrites "node:readline/promises" to the bare specifier in its
     * output, and esbuild does not recognise that subpath as a builtin, so it
     * must be marked external by hand or the bundle fails to resolve it.
     */
    external: ["readline/promises"]
});
