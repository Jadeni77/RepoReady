import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createRepoContext } from "../src/scan.js";
import { NODE_EXAMPLE, PYTHON_EXAMPLE, makeTempRepo, removeTempRepo } from "./helpers.js";

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
        const ctx = await createRepoContext(NODE_EXAMPLE);
        assert.deepEqual(ctx.projectTypes, ["node"]);
    });

    it("detects a Python project", async () => {
        const ctx = await createRepoContext(PYTHON_EXAMPLE);
        assert.deepEqual(ctx.projectTypes, ["python"]);
    });

    it("falls back to generic when nothing is recognised", async () => {
        const ctx = await createRepoContext(await temp({ "notes.txt": "hello" }));
        assert.deepEqual(ctx.projectTypes, ["generic"]);
    });

    it("detects several project types in a polyglot repo", async () => {
        const ctx = await createRepoContext(
            await temp({
                "package.json": "{}",
                "go.mod": "module example.com/x",
                "Cargo.toml": "[package]"
            })
        );

        assert.deepEqual(ctx.projectTypes, ["node", "go", "rust"]);
    });

    it("reads text, JSON, and directory listings relative to the root", async () => {
        const ctx = await createRepoContext(
            await temp({
                "package.json": JSON.stringify({ name: "demo" }),
                "docs/a.md": "A",
                "docs/b.md": "B"
            })
        );

        assert.equal(await ctx.has("package.json"), true);
        assert.equal(await ctx.has("missing.json"), false);
        assert.equal(await ctx.readText("docs/a.md"), "A");
        assert.deepEqual((await ctx.listDir("docs")).sort(), ["a.md", "b.md"]);
        assert.deepEqual(await ctx.readJson("package.json"), { name: "demo" });
    });

    it("returns null for unreadable files instead of throwing", async () => {
        const ctx = await createRepoContext(await temp({ "broken.json": "{ not json" }));

        assert.equal(await ctx.readText("nope.md"), null);
        assert.equal(await ctx.readJson("broken.json"), null);
        assert.deepEqual(await ctx.listDir("nope"), []);
    });

    it("loads repoready.config.json when present", async () => {
        const ctx = await createRepoContext(
            await temp({
                "repoready.config.json": JSON.stringify({ checks: { license: false } })
            })
        );

        assert.deepEqual(ctx.config.checks, { license: false });
    });

    it("defaults to an empty config when no config file exists", async () => {
        const ctx = await createRepoContext(await temp({}));
        assert.deepEqual(ctx.config, {});
    });
});
