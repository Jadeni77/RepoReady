import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { ciGenerator, createRepoContext } from "@repoready/core";
import type { RepoFiles } from "@repoready/core";
import { pythonAdapter } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const PYTHON_EXAMPLE = path.join(REPO_ROOT, "examples/python-basic");

const temps: string[] = [];
after(async () => {
    await Promise.all(temps.map((r) => rm(r, { recursive: true, force: true })));
});

async function temp(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "repoready-python-"));
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

async function runCheck(id: string, root: string) {
    const ctx = await createRepoContext(root, { adapters: [pythonAdapter] });
    const check = (pythonAdapter.checks ?? []).find((c) => c.id === id)!;

    if (check.shouldRun && !(await check.shouldRun(ctx))) return null;
    return check.run(ctx);
}

describe("pythonAdapter", () => {
    it("detects pyproject.toml", async () => {
        const result = await pythonAdapter.detect(files(["pyproject.toml"]));
        assert.equal(result.detected, true);
        assert.deepEqual(result.evidence, ["pyproject.toml"]);
    });

    it("detects requirements.txt", async () => {
        const result = await pythonAdapter.detect(files(["requirements.txt"]));
        assert.equal(result.detected, true);
        assert.deepEqual(result.evidence, ["requirements.txt"]);
    });

    it("detects setup.py", async () => {
        const result = await pythonAdapter.detect(files(["setup.py"]));
        assert.equal(result.detected, true);
        assert.deepEqual(result.evidence, ["setup.py"]);
    });

    it("does not detect an empty repo", async () => {
        assert.equal((await pythonAdapter.detect(files([]))).detected, false);
    });

    it("pins the Python version as a string in CI", () => {
        const workflow = parseYaml(`jobs:\n  test:\n    steps:\n${pythonAdapter.ciSteps}`) as any;
        const setup = workflow.jobs.test.steps.find((s: any) =>
            String(s.uses ?? "").startsWith("actions/setup-python")
        );

        assert.equal(setup.with["python-version"], "3.12");
        assert.match(pythonAdapter.ciSteps!, /pip install -r requirements\.txt/);
        assert.doesNotMatch(pythonAdapter.ciSteps!, /pip-install/);
    });
});

describe("ciGenerator auto-detection", () => {
    // Restores coverage deleted alongside the switch-based language handling
    // in generators.ts: with lang "auto", ciGenerator must resolve the
    // Python example to the Python adapter's CI steps rather than the
    // generic fallback.
    it("selects setup-python for the Python example", async () => {
        const ctx = await createRepoContext(PYTHON_EXAMPLE, { adapters: [pythonAdapter] });
        const files = await ciGenerator.generate(ctx, { lang: "auto" });
        const workflow = parseYaml(files[0]!.content) as any;

        assert.ok(
            workflow.jobs.test.steps.some((step: any) =>
                String(step.uses ?? "").startsWith("actions/setup-python")
            )
        );
    });
});

describe("pythonAdapter ciSteps shape", () => {
    // Mirrors the guards in packages/core/test/builtin-adapters.test.ts.
    // Without them, a mis-indented ciSteps fragment can pass every other
    // test here while breaking the real workflow written by `init-ci`.
    it("indents every ciSteps line by at least six spaces", () => {
        // A block sequence at 4 spaces still parses as valid YAML when it
        // sits at the same indent as its parent mapping key ("steps:"), but
        // breaks the real workflow template in generators.ts, which nests
        // steps six spaces under a four-space `steps:` key.
        const lines = pythonAdapter.ciSteps!.split("\n");

        for (const line of lines) {
            if (line.trim() === "") continue;

            const leadingSpaces = line.match(/^ */)![0].length;

            assert.ok(
                leadingSpaces >= 6,
                `pythonAdapter ciSteps has a line indented only ${leadingSpaces} spaces: ${JSON.stringify(line)}`
            );
        }
    });

    it("produces steps that parse as YAML inside a workflow", () => {
        // Mirrors the real shape from buildCiWorkflow() in generators.ts: a
        // preceding six-space "- name: Checkout" step under the same `steps:`
        // key. A ciSteps string re-indented to four spaces parses fine against
        // a bare `steps:\n` wrapper (YAML allows a block sequence at its
        // parent's indent), but throws here, the way it would in production.
        const workflow = parseYaml(`jobs:
  test:
    steps:
      - name: Checkout
        uses: actions/checkout@v4

${pythonAdapter.ciSteps}`) as Record<string, any>;

        const steps = workflow.jobs.test.steps;

        assert.ok(Array.isArray(steps) && steps.length > 1, "pythonAdapter produced no steps");

        for (const step of steps) {
            assert.ok(step.name, "pythonAdapter has an unnamed step");
            assert.ok(step.uses || step.run, `pythonAdapter step "${step.name}" does nothing`);
        }
    });
});

describe("python checks", () => {
    it("python-pyproject passes with a pyproject.toml", async () => {
        const root = await temp({ "pyproject.toml": "[project]\nname = 'x'" });
        assert.equal((await runCheck("python-pyproject", root))?.status, "pass");
    });

    it("python-pyproject warns with only requirements.txt", async () => {
        const root = await temp({ "requirements.txt": "requests\n" });
        assert.equal((await runCheck("python-pyproject", root))?.status, "warn");
    });

    it("python-lint-config passes with a ruff config", async () => {
        const root = await temp({ "pyproject.toml": "[project]", "ruff.toml": "" });
        assert.equal((await runCheck("python-lint-config", root))?.status, "pass");
    });

    it("python-lint-config detects a [tool.ruff] section in pyproject", async () => {
        const root = await temp({ "pyproject.toml": "[project]\nname='x'\n[tool.ruff]\nline-length = 100\n" });
        assert.equal((await runCheck("python-lint-config", root))?.status, "pass");
    });

    it("python-lint-config detects a dotted [tool.ruff.lint] subtable in pyproject", async () => {
        const root = await temp({
            "pyproject.toml": "[project]\nname='x'\n[tool.ruff.lint]\nselect = ['E', 'F']\n"
        });
        assert.equal((await runCheck("python-lint-config", root))?.status, "pass");
    });

    it("python-lint-config warns with no linter configured", async () => {
        const root = await temp({ "pyproject.toml": "[project]\nname='x'\n" });
        assert.equal((await runCheck("python-lint-config", root))?.status, "warn");
    });
});
