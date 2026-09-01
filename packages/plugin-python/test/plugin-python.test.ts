import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { parse as parseYaml } from "yaml";
import { createRepoContext } from "@repoready/core";
import type { RepoFiles } from "@repoready/core";
import { pythonAdapter } from "../src/index.js";

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
