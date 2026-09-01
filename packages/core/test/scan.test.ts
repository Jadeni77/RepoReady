import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createRepoContext } from "../src/scan.js";
import { NODE_EXAMPLE, PYTHON_EXAMPLE, TEST_ADAPTERS, makeTempRepo, removeTempRepo } from "./helpers.js";

describe("createRepoContext", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    async function temp(files: Record<string, string>): Promise<string> {
        const root = await makeTempRepo(files);
        tempRepos.push(root);
        return root;
    }

    it("detects a Node project", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: TEST_ADAPTERS });
        assert.deepEqual(ctx.projectTypes, ["node"]);
    });

    it("detects a Python project", async () => {
        const ctx = await createRepoContext(PYTHON_EXAMPLE, { adapters: TEST_ADAPTERS });
        assert.deepEqual(ctx.projectTypes, ["python"]);
    });

    it("falls back to generic when nothing is recognised", async () => {
        const ctx = await createRepoContext(await temp({ "notes.txt": "hello" }), { adapters: TEST_ADAPTERS });
        assert.deepEqual(ctx.projectTypes, ["generic"]);
    });

    it("detects several project types in a polyglot repo", async () => {
        const ctx = await createRepoContext(
            await temp({
                "package.json": "{}",
                "go.mod": "module example.com/x",
                "Cargo.toml": "[package]"
            }),
            { adapters: TEST_ADAPTERS }
        );

        assert.deepEqual(ctx.projectTypes, ["node", "go", "rust"]);
    });

    it("reads text, JSON, and directory listings relative to the root", async () => {
        const ctx = await createRepoContext(
            await temp({
                "package.json": JSON.stringify({ name: "demo" }),
                "docs/a.md": "A",
                "docs/b.md": "B"
            }),
            { adapters: TEST_ADAPTERS }
        );

        assert.equal(await ctx.has("package.json"), true);
        assert.equal(await ctx.has("missing.json"), false);
        assert.equal(await ctx.readText("docs/a.md"), "A");
        assert.deepEqual((await ctx.listDir("docs")).sort(), ["a.md", "b.md"]);
        assert.deepEqual(await ctx.readJson("package.json"), { name: "demo" });
    });

    it("returns null for unreadable files instead of throwing", async () => {
        const ctx = await createRepoContext(await temp({ "broken.json": "{ not json" }), { adapters: TEST_ADAPTERS });

        assert.equal(await ctx.readText("nope.md"), null);
        assert.equal(await ctx.readJson("broken.json"), null);
        assert.deepEqual(await ctx.listDir("nope"), []);
    });

    it("loads repoready.config.json when present", async () => {
        const ctx = await createRepoContext(
            await temp({
                "repoready.config.json": JSON.stringify({ checks: { license: false } })
            }),
            { adapters: TEST_ADAPTERS }
        );

        assert.deepEqual(ctx.config.checks, { license: false });
    });

    it("defaults to an empty config when no config file exists", async () => {
        const ctx = await createRepoContext(await temp({}), { adapters: TEST_ADAPTERS });
        assert.deepEqual(ctx.config, {});
    });

    it("exposes every registered adapter", async () => {
        const ctx = await createRepoContext(await temp({}), { adapters: TEST_ADAPTERS });

        assert.equal(ctx.adapters.length, TEST_ADAPTERS.length);
    });

    it("exposes only the adapters that matched, with evidence", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: TEST_ADAPTERS });

        assert.deepEqual(ctx.detected.map((d) => d.adapter.id), ["node"]);
        assert.deepEqual(ctx.detected[0]?.evidence, ["package.json"]);
    });

    it("derives projectTypes from the detected adapters", async () => {
        const ctx = await createRepoContext(
            await temp({ "package.json": "{}", "go.mod": "module x" }),
            { adapters: TEST_ADAPTERS }
        );

        assert.deepEqual(ctx.projectTypes.sort(), ["go", "node"]);
    });

    it("falls back to generic with no adapters registered", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: [] });

        assert.deepEqual(ctx.projectTypes, ["generic"]);
        assert.deepEqual(ctx.detected, []);
    });
});
