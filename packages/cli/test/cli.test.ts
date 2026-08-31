import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const CLI_ENTRY = path.join(REPO_ROOT, "packages/cli/src/index.ts");
const NODE_EXAMPLE = path.join(REPO_ROOT, "examples/node-basic");

type CliRun = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

/**
 * Runs the CLI the way a user would, through tsx, so the commander wiring and
 * exit codes are exercised end to end rather than mocked.
 */
async function runCli(args: string[]): Promise<CliRun> {
    try {
        const { stdout, stderr } = await execFileAsync(
            process.execPath,
            ["--import", "tsx", CLI_ENTRY, ...args],
            { cwd: REPO_ROOT, env: { ...process.env, INIT_CWD: REPO_ROOT } }
        );
        return { stdout, stderr, exitCode: 0 };
    } catch (error) {
        const failure = error as { stdout?: string; stderr?: string; code?: number };
        return {
            stdout: failure.stdout ?? "",
            stderr: failure.stderr ?? "",
            exitCode: failure.code ?? 1
        };
    }
}

const tempRepos: string[] = [];

after(async () => {
    await Promise.all(tempRepos.map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRepo(files: Record<string, string> = {}): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "repoready-cli-"));
    tempRepos.push(root);

    for (const [relativePath, content] of Object.entries(files)) {
        await writeFile(path.join(root, relativePath), content, "utf8");
    }

    return root;
}

async function exists(root: string, relativePath: string): Promise<boolean> {
    try {
        await readFile(path.join(root, relativePath));
        return true;
    } catch {
        return false;
    }
}

describe("repoready --help", () => {
    it("lists every MVP command", async () => {
        const result = await runCli(["--help"]);

        assert.equal(result.exitCode, 0);

        for (const command of [
            "doctor",
            "fix",
            "check-deps",
            "init-readme",
            "init-license",
            "init-contributing",
            "init-code-of-conduct",
            "init-issues",
            "init-pr-template",
            "init-ci"
        ]) {
            assert.match(result.stdout, new RegExp(`\\b${command}\\b`), `missing ${command}`);
        }
    });

    it("reports a version", async () => {
        const result = await runCli(["--version"]);

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
    });
});

describe("repoready doctor", () => {
    it("prints a score", async () => {
        const result = await runCli(["doctor", "--cwd", NODE_EXAMPLE]);

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /RepoReady Score: \d+\/100/);
        assert.match(result.stdout, /Detected project type: Node/);
    });

    it("emits valid JSON with --json", async () => {
        const result = await runCli(["doctor", "--cwd", NODE_EXAMPLE, "--json"]);
        const parsed = JSON.parse(result.stdout);

        assert.equal(result.exitCode, 0);
        assert.equal(typeof parsed.score, "number");
        assert.ok(Array.isArray(parsed.results));
    });

    it("exits 1 when the score is below --fail-under", async () => {
        const result = await runCli(["doctor", "--cwd", NODE_EXAMPLE, "--fail-under", "100"]);

        assert.equal(result.exitCode, 1);
    });

    it("exits 0 when the score clears --fail-under", async () => {
        const result = await runCli(["doctor", "--cwd", NODE_EXAMPLE, "--fail-under", "1"]);

        assert.equal(result.exitCode, 0);
    });

    it("rejects an out-of-range --fail-under", async () => {
        const result = await runCli(["doctor", "--cwd", NODE_EXAMPLE, "--fail-under", "500"]);

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr + result.stdout, /between 0 and 100/);
    });

    it("filters with --only", async () => {
        const result = await runCli([
            "doctor",
            "--cwd",
            NODE_EXAMPLE,
            "--only",
            "readme,license",
            "--json"
        ]);

        const parsed = JSON.parse(result.stdout);

        assert.deepEqual(
            parsed.results.map((check: { id: string }) => check.id).sort(),
            ["license", "readme"]
        );
    });
});

describe("repoready check-deps", () => {
    it("summarises dependencies", async () => {
        const result = await runCli(["check-deps", "--cwd", NODE_EXAMPLE]);

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /Dependency Check/);
        assert.match(result.stdout, /Manifests: package\.json/);
    });

    it("emits valid JSON with --json", async () => {
        const result = await runCli(["check-deps", "--cwd", NODE_EXAMPLE, "--json"]);
        const parsed = JSON.parse(result.stdout);

        assert.ok(Array.isArray(parsed.issues));
    });

    it("exits 1 under --strict when issues are found", async () => {
        const result = await runCli(["check-deps", "--cwd", NODE_EXAMPLE, "--strict"]);

        assert.equal(result.exitCode, 1);
    });
});

describe("repoready fix", () => {
    it("writes nothing with --dry-run", async () => {
        const root = await tempRepo({ "package.json": "{}" });
        const result = await runCli(["fix", "--cwd", root, "--dry-run"]);

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /recommended fix\(es\)/);
        assert.match(result.stdout, /Mode: dry-run/);
        assert.equal(await exists(root, "README.md"), false);
    });

    it("applies safe fixes with --yes", async () => {
        const root = await tempRepo({ "package.json": "{}" });
        const result = await runCli(["fix", "--cwd", root, "--yes"]);

        assert.equal(result.exitCode, 0);
        assert.equal(await exists(root, "README.md"), true);
        assert.equal(await exists(root, "LICENSE"), true);
        assert.equal(await exists(root, ".github/workflows/ci.yml"), true);
    });

    it("refuses --interactive without a TTY and says what to use instead", async () => {
        const root = await tempRepo({ "package.json": "{}" });
        const result = await runCli(["fix", "--cwd", root, "--interactive"]);

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr, /--interactive needs a TTY/);
        assert.equal(await exists(root, "README.md"), false);
    });
});

describe("repoready init-*", () => {
    it("previews without writing under --dry-run", async () => {
        const root = await tempRepo({});
        const result = await runCli(["init-contributing", "--cwd", root, "--dry-run"]);

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /# Contributing/);
        assert.equal(await exists(root, "CONTRIBUTING.md"), false);
    });

    it("writes the file with --yes", async () => {
        const root = await tempRepo({});
        const result = await runCli(["init-contributing", "--cwd", root, "--yes"]);

        assert.equal(result.exitCode, 0);
        assert.equal(await exists(root, "CONTRIBUTING.md"), true);
    });

    it("exits 1 and keeps the file when it already exists", async () => {
        const root = await tempRepo({ "CONTRIBUTING.md": "mine" });
        const result = await runCli(["init-contributing", "--cwd", root, "--yes"]);

        assert.equal(result.exitCode, 1);
        assert.match(result.stdout, /--force/);
        assert.equal(
            await readFile(path.join(root, "CONTRIBUTING.md"), "utf8"),
            "mine"
        );
    });

    it("overwrites with --force", async () => {
        const root = await tempRepo({ "CONTRIBUTING.md": "mine" });
        const result = await runCli(["init-contributing", "--cwd", root, "--force", "--yes"]);

        assert.equal(result.exitCode, 0);
        assert.match(
            await readFile(path.join(root, "CONTRIBUTING.md"), "utf8"),
            /^# Contributing/
        );
    });

    it("generates the requested license", async () => {
        const root = await tempRepo({});
        await runCli([
            "init-license",
            "--cwd",
            root,
            "--yes",
            "--license",
            "isc",
            "--author",
            "Ada Lovelace"
        ]);

        const license = await readFile(path.join(root, "LICENSE"), "utf8");

        assert.match(license, /^ISC License/);
        assert.match(license, /Ada Lovelace/);
    });

    it("rejects an unsupported license", async () => {
        const result = await runCli(["init-license", "--license", "apache-2.0"]);

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr + result.stdout, /--license must be one of/);
    });

    it("rejects an unsupported CI language", async () => {
        const result = await runCli(["init-ci", "--lang", "cobol"]);

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr + result.stdout, /--lang must be one of/);
    });
});
