import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { ciGenerator, createRepoContext } from "@repoready/core";
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
        assert.equal(steps.find((s: any) => s.uses?.startsWith("actions/setup-node")).with["node-version"], 22);
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

describe("ciSteps shape", () => {
    // Mirrors the guards in packages/core/test/builtin-adapters.test.ts.
    // Without them, a mis-indented ciSteps fragment can pass every other
    // test here while breaking the real workflow written by `init-ci`.
    const adapters = [nodeAdapter, typescriptAdapter];

    it("indents every ciSteps line by at least six spaces", () => {
        // A block sequence at 4 spaces still parses as valid YAML when it
        // sits at the same indent as its parent mapping key ("steps:"), but
        // breaks the real workflow template in generators.ts, which nests
        // steps six spaces under a four-space `steps:` key.
        for (const adapter of adapters) {
            const lines = adapter.ciSteps!.split("\n");

            for (const line of lines) {
                if (line.trim() === "") continue;

                const leadingSpaces = line.match(/^ */)![0].length;

                assert.ok(
                    leadingSpaces >= 6,
                    `${adapter.id} ciSteps has a line indented only ${leadingSpaces} spaces: ${JSON.stringify(line)}`
                );
            }
        }
    });

    it("produces steps that parse as YAML inside a workflow", () => {
        // Mirrors the real shape from buildCiWorkflow() in generators.ts: a
        // preceding six-space "- name: Checkout" step under the same `steps:`
        // key. A ciSteps string re-indented to four spaces parses fine against
        // a bare `steps:\n` wrapper (YAML allows a block sequence at its
        // parent's indent), but throws here, the way it would in production.
        for (const adapter of adapters) {
            const workflow = parseYaml(`jobs:
  test:
    steps:
      - name: Checkout
        uses: actions/checkout@v4

${adapter.ciSteps}`) as Record<string, any>;

            const steps = workflow.jobs.test.steps;

            assert.ok(Array.isArray(steps) && steps.length > 1, `${adapter.id} produced no steps`);

            for (const step of steps) {
                assert.ok(step.name, `${adapter.id} has an unnamed step`);
                assert.ok(step.uses || step.run, `${adapter.id} step "${step.name}" does nothing`);
            }
        }
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

    // Regression: reading only tsconfig.json reported strict mode as off for
    // monorepos that keep the setting in a base config.
    it("ts-strict finds strict in tsconfig.base.json", async () => {
        const root = await temp({
            "tsconfig.base.json": JSON.stringify({ compilerOptions: { strict: true } })
        });

        assert.equal((await runCheck("ts-strict", root))?.status, "pass");
    });

    it("ts-strict follows extends one level", async () => {
        const root = await temp({
            "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json" }),
            "tsconfig.base.json": JSON.stringify({ compilerOptions: { strict: true } })
        });

        assert.equal((await runCheck("ts-strict", root))?.status, "pass");
    });

    it("ts-strict warns when no config declares strict at all", async () => {
        const root = await temp({ "tsconfig.json": JSON.stringify({ compilerOptions: {} }) });
        const check = await runCheck("ts-strict", root);

        assert.equal(check?.status, "warn");
        assert.match(check?.summary ?? "", /No TypeScript config declares a strict setting/);
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

describe("ciGenerator auto-detection", () => {
    // Restores coverage deleted alongside the switch-based language handling
    // in generators.ts: with lang "auto", ciGenerator must resolve the
    // Node example to the Node adapter's CI steps rather than the generic
    // fallback.
    it("selects setup-node for the Node example", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: [typescriptAdapter, nodeAdapter] });
        const files = await ciGenerator.generate(ctx, { lang: "auto" });
        const workflow = parseYaml(files[0]!.content) as any;

        assert.ok(
            workflow.jobs.test.steps.some((step: any) =>
                String(step.uses ?? "").startsWith("actions/setup-node")
            )
        );
    });
});
