import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createRepoContext, runFix } from "@repoready/core";
import type { RepoFiles } from "@repoready/core";
import { githubAdapter, securityGenerator, securityPolicyCheck } from "../src/index.js";

const temps: string[] = [];
after(async () => {
    await Promise.all(temps.map((r) => rm(r, { recursive: true, force: true })));
});

async function temp(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "repoready-github-"));
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
    const ctx = await createRepoContext(root, { adapters: [githubAdapter] });
    const check = (githubAdapter.checks ?? []).find((c) => c.id === id)!;

    if (check.shouldRun && !(await check.shouldRun(ctx))) return null;
    return check.run(ctx);
}

async function repoFileExists(root: string, relativePath: string): Promise<boolean> {
    try {
        await readFile(path.join(root, relativePath));
        return true;
    } catch {
        return false;
    }
}

describe("githubAdapter", () => {
    it("always detects", async () => {
        assert.equal((await githubAdapter.detect(files([]))).detected, true);
    });

    it("contributes no project type, so it never appears in projectTypes", () => {
        assert.equal(githubAdapter.projectType, undefined);
    });

    it("provides no CI steps, so it is never the CI provider", () => {
        assert.equal(githubAdapter.ciSteps, undefined);
    });
});

describe("security-policy check", () => {
    it("passes with SECURITY.md", async () => {
        const root = await temp({ "SECURITY.md": "# Security" });
        assert.equal((await runCheck("security-policy", root))?.status, "pass");
    });

    it("passes with .github/SECURITY.md", async () => {
        const root = await temp({ ".github/SECURITY.md": "# Security" });
        assert.equal((await runCheck("security-policy", root))?.status, "pass");
    });

    it("warns when absent and names its generator", async () => {
        const root = await temp({});
        assert.equal((await runCheck("security-policy", root))?.status, "warn");
        assert.equal(securityPolicyCheck.fixedBy, "security");
    });
});

describe("securityGenerator", () => {
    it("writes SECURITY.md with a reporting section", async () => {
        const ctx = await createRepoContext(await temp({}), { adapters: [githubAdapter] });
        const generated = await securityGenerator.generate(ctx, {});

        assert.equal(generated[0]?.path, "SECURITY.md");
        assert.match(generated[0].content, /^# Security Policy/);
        assert.match(generated[0].content, /## Reporting a Vulnerability/);
        assert.match(generated[0].content, /\[INSERT CONTACT METHOD\]/);
    });
});

describe("integration with fix", () => {
    it("fix applies the security policy via fixedBy", async () => {
        const root = await temp({});
        await runFix({ cwd: root, yes: true, adapters: [githubAdapter] });

        assert.equal(await repoFileExists(root, "SECURITY.md"), true);
    });
});
