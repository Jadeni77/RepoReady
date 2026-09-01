import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createRepoContext } from "@repoready/core";
import type { RepoFiles } from "@repoready/core";
import { nodeAdapter, typescriptAdapter } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const TS_EXAMPLE = path.join(REPO_ROOT, "examples/typescript-basic");
const NODE_EXAMPLE = path.join(REPO_ROOT, "examples/node-basic");

const temps: string[] = [];
after(async () => {
    await Promise.all(temps.map((r) => rm(r, { recursive: true, force: true })));
});

async function temp(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "repoready-node-"));
    temps.push(root);
    for (const [rel, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
        await writeFile(path.join(root, rel), content, "utf8");
    }
    return root;
}

function files(present: string[], json: Record<string, unknown> = {}): RepoFiles {
    return {
        root: "/repo",
        has: async (p) => present.includes(p),
        listDir: async () => [],
        readText: async () => null,
        readJson: async (p) => (json[p] ?? null) as never
    };
}

describe("nodeAdapter", () => {
    it("detects package.json", async () => {
        const result = await nodeAdapter.detect(files(["package.json"]));

        assert.equal(result.detected, true);
        assert.deepEqual(result.evidence, ["package.json"]);
    });

    it("does not detect an empty repo", async () => {
        assert.equal((await nodeAdapter.detect(files([]))).detected, false);
    });

    it("produces a parseable Node workflow", () => {
        const workflow = parseYaml(`jobs:\n  test:\n    steps:\n${nodeAdapter.ciSteps}`) as any;
        const steps = workflow.jobs.test.steps;

        assert.ok(steps.some((s: any) => String(s.uses ?? "").startsWith("actions/setup-node")));
        assert.equal(steps.find((s: any) => s.uses?.startsWith("actions/setup-node")).with["node-version"], 20);
    });
});

describe("typescriptAdapter", () => {
    it("detects tsconfig.json", async () => {
        const result = await typescriptAdapter.detect(files(["tsconfig.json"]));

        assert.equal(result.detected, true);
        assert.deepEqual(result.evidence, ["tsconfig.json"]);
    });

    it("detects a typescript devDependency without a tsconfig", async () => {
        const result = await typescriptAdapter.detect(
            files(["package.json"], { "package.json": { devDependencies: { typescript: "^5" } } })
        );

        assert.equal(result.detected, true);
        assert.deepEqual(result.evidence, ["devDependencies.typescript"]);
    });

    it("does not detect a plain JavaScript repo", async () => {
        const result = await typescriptAdapter.detect(
            files(["package.json"], { "package.json": { dependencies: { left_pad: "*" } } })
        );

        assert.equal(result.detected, false);
    });

    it("outranks node so its CI steps win", () => {
        assert.ok(typescriptAdapter.priority > nodeAdapter.priority);
        assert.deepEqual(typescriptAdapter.supersedes, ["node"]);
    });

    it("runs typecheck and build with --if-present", () => {
        assert.match(typescriptAdapter.ciSteps!, /--if-present/);
        const workflow = parseYaml(`jobs:\n  test:\n    steps:\n${typescriptAdapter.ciSteps}`) as any;
        assert.ok(workflow.jobs.test.steps.length >= 3);
    });
});

describe("adapter checks", () => {
    const adapters = [typescriptAdapter, nodeAdapter];

    async function runCheck(id: string, root: string) {
        const ctx = await createRepoContext(root, { adapters });
        const check = [...(typescriptAdapter.checks ?? []), ...(nodeAdapter.checks ?? [])]
            .find((c) => c.id === id)!;

        if (check.shouldRun && !(await check.shouldRun(ctx))) return null;
        return check.run(ctx);
    }

    it("ts-strict passes when strict is enabled", async () => {
        const root = await temp({ "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }) });

        assert.equal((await runCheck("ts-strict", root))?.status, "pass");
    });

    it("ts-strict warns when strict is off", async () => {
        const root = await temp({ "tsconfig.json": JSON.stringify({ compilerOptions: { strict: false } }) });

        assert.equal((await runCheck("ts-strict", root))?.status, "warn");
    });

    it("node-engines passes when engines.node is declared", async () => {
        const root = await temp({ "package.json": JSON.stringify({ engines: { node: ">=20" } }) });

        assert.equal((await runCheck("node-engines", root))?.status, "pass");
    });

    it("node-engines warns when it is missing", async () => {
        const root = await temp({ "package.json": "{}" });

        assert.equal((await runCheck("node-engines", root))?.status, "warn");
    });

    it("node-publish-files passes when files is declared", async () => {
        const root = await temp({ "package.json": JSON.stringify({ files: ["dist"] }) });

        assert.equal((await runCheck("node-publish-files", root))?.status, "pass");
    });

    it("node-publish-files warns for a publishable package with no files field", async () => {
        const root = await temp({ "package.json": JSON.stringify({ name: "x" }) });

        assert.equal((await runCheck("node-publish-files", root))?.status, "warn");
    });

    // A private package is never published, so publishing hygiene is noise.
    it("node-publish-files does not run for a private package", async () => {
        const root = await temp({ "package.json": JSON.stringify({ private: true }) });

        assert.equal(await runCheck("node-publish-files", root), null);
    });
});

describe("end to end", () => {
    it("reports TypeScript for the TypeScript example", async () => {
        const ctx = await createRepoContext(TS_EXAMPLE, { adapters: [typescriptAdapter, nodeAdapter] });

        assert.deepEqual(ctx.detected.map((d) => d.adapter.id), ["typescript", "node"]);
        assert.ok(ctx.projectTypes.includes("typescript"));
        assert.ok(ctx.projectTypes.includes("node"));
    });

    it("reports only Node for the plain Node example", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: [typescriptAdapter, nodeAdapter] });

        assert.deepEqual(ctx.detected.map((d) => d.adapter.id), ["node"]);
    });
});
