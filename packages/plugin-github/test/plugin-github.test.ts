import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createRepoContext, runFix } from "@repoready/core";
import type { RepoFiles } from "@repoready/core";
import { parse as parseYaml } from "yaml";
import type { LanguageAdapter } from "@repoready/core";
import {
    dependabotGenerator,
    githubAdapter,
    releaseGenerator,
    scorecardGenerator,
    securityGenerator,
    securityPolicyCheck
} from "../src/index.js";

/**
 * Minimal stand-ins for adapters that live in sibling plugin packages.
 * plugin-github depends only on @repoready/core, so its tests must not import
 * plugin-node or plugin-python — they declare what they need locally.
 */
function languageAdapter(
    id: string,
    projectType: LanguageAdapter["projectType"],
    marker: string,
    ecosystem: string,
    priority = 10
): LanguageAdapter {
    return {
        id,
        name: id,
        projectType,
        priority,
        detect: async (f) =>
            (await f.has(marker)) ? { detected: true, evidence: [marker] } : { detected: false },
        dependabotEcosystem: ecosystem
    };
}

const nodeAdapter = languageAdapter("node", "node", "package.json", "npm");
const pythonAdapter = languageAdapter("python", "python", "pyproject.toml", "pip");
const typescriptAdapter = languageAdapter("typescript", "typescript", "tsconfig.json", "npm", 20);

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

describe("dependabotGenerator", () => {
    async function generate(root: string, adapters: LanguageAdapter[]) {
        const ctx = await createRepoContext(root, { adapters });
        const generated = await dependabotGenerator.generate(ctx, {});
        return generated[0]!;
    }

    it("writes to .github/dependabot.yml", async () => {
        const file = await generate(await temp({}), [githubAdapter]);

        assert.equal(file.path, ".github/dependabot.yml");
    });

    it("produces parseable YAML with the documented shape", async () => {
        const file = await generate(
            await temp({ "package.json": "{}" }),
            [githubAdapter, nodeAdapter]
        );
        const config = parseYaml(file.content) as Record<string, any>;

        assert.equal(config.version, 2);
        assert.ok(Array.isArray(config.updates));
        for (const update of config.updates) {
            assert.equal(update.directory, "/");
            assert.equal(update.schedule.interval, "weekly");
            assert.equal(typeof update["package-ecosystem"], "string");
        }
    });

    it("uses the detected language's ecosystem", async () => {
        const node = await generate(
            await temp({ "package.json": "{}" }),
            [githubAdapter, nodeAdapter]
        );
        const python = await generate(
            await temp({ "pyproject.toml": "[project]" }),
            [githubAdapter, pythonAdapter]
        );

        const ecosystems = (content: string) =>
            ((parseYaml(content) as any).updates as any[]).map((u) => u["package-ecosystem"]);

        assert.deepEqual(ecosystems(node.content), ["npm", "github-actions"]);
        assert.deepEqual(ecosystems(python.content), ["pip", "github-actions"]);
    });

    // A TypeScript repo matches both the typescript and node adapters, and
    // both map to npm. Dependabot rejects a duplicated ecosystem+directory.
    it("does not duplicate an ecosystem shared by two adapters", async () => {
        const file = await generate(
            await temp({ "package.json": "{}", "tsconfig.json": "{}" }),
            [githubAdapter, typescriptAdapter, nodeAdapter]
        );

        const ecosystems = ((parseYaml(file.content) as any).updates as any[])
            .map((u) => u["package-ecosystem"]);

        assert.deepEqual(ecosystems, ["npm", "github-actions"]);
    });

    it("still covers github-actions for a repo with no detected language", async () => {
        const file = await generate(await temp({ "notes.txt": "" }), [githubAdapter]);

        const ecosystems = ((parseYaml(file.content) as any).updates as any[])
            .map((u) => u["package-ecosystem"]);

        assert.deepEqual(ecosystems, ["github-actions"]);
    });
});

describe("scorecardGenerator", () => {
    it("writes a parseable Scorecard workflow", async () => {
        const ctx = await createRepoContext(await temp({}), { adapters: [githubAdapter] });
        const generated = await scorecardGenerator.generate(ctx, {});
        const workflow = parseYaml(generated[0]!.content) as Record<string, any>;

        assert.equal(generated[0]!.path, ".github/workflows/scorecard.yml");
        assert.equal(workflow.name, "Scorecard");
        assert.ok(
            workflow.jobs.analysis.steps.some((s: any) =>
                String(s.uses ?? "").startsWith("ossf/scorecard-action")
            )
        );
        // Scorecard needs these to upload SARIF; without them the run fails.
        assert.equal(workflow.jobs.analysis.permissions["security-events"], "write");
        assert.equal(workflow.jobs.analysis.permissions["id-token"], "write");
    });
});

describe("releaseGenerator", () => {
    async function generate(root: string, adapters: LanguageAdapter[]) {
        const ctx = await createRepoContext(root, { adapters });
        return releaseGenerator.generate(ctx, {});
    }

    it("writes the workflow, config, and manifest", async () => {
        const generated = await generate(await temp({}), [githubAdapter]);

        assert.deepEqual(generated.map((f) => f.path), [
            ".github/workflows/release-please.yml",
            "release-please-config.json",
            ".release-please-manifest.json"
        ]);
    });

    it("produces parseable YAML and JSON", async () => {
        const generated = await generate(
            await temp({ "package.json": "{}" }),
            [githubAdapter, nodeAdapter]
        );

        const workflow = parseYaml(generated[0]!.content) as Record<string, any>;
        assert.equal(workflow.name, "Release Please");
        assert.equal(workflow.permissions["pull-requests"], "write");

        const config = JSON.parse(generated[1]!.content);
        assert.equal(config.packages["."]["release-type"], "node");

        const manifest = JSON.parse(generated[2]!.content);
        assert.equal(manifest["."], "0.0.0");
    });

    it("picks the release type from the detected language", async () => {
        const python = await generate(
            await temp({ "pyproject.toml": "[project]" }),
            [githubAdapter, pythonAdapter]
        );

        assert.equal(
            JSON.parse(python[1]!.content).packages["."]["release-type"],
            "python"
        );
    });

    it("falls back to simple when no language is detected", async () => {
        const generated = await generate(await temp({ "notes.txt": "" }), [githubAdapter]);

        assert.equal(
            JSON.parse(generated[1]!.content).packages["."]["release-type"],
            "simple"
        );
    });
});
