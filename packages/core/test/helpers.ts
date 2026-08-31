import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from this file so tests do not depend on the cwd. */
export const REPO_ROOT = path.resolve(here, "../../..");
export const EXAMPLES_ROOT = path.join(REPO_ROOT, "examples");
export const NODE_EXAMPLE = path.join(EXAMPLES_ROOT, "node-basic");
export const PYTHON_EXAMPLE = path.join(EXAMPLES_ROOT, "python-basic");

/**
 * Creates a throwaway repo in the OS temp dir. Anything that writes must use
 * one of these — the examples/ fixtures are read-only for tests.
 */
export async function makeTempRepo(files: Record<string, string> = {}): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "repoready-test-"));
    await writeFiles(root, files);
    return root;
}

export async function writeFiles(
    root: string,
    files: Record<string, string>
): Promise<void> {
    for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relativePath);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content, "utf8");
    }
}

export async function removeTempRepo(root: string): Promise<void> {
    await rm(root, { recursive: true, force: true });
}

export async function readRepoFile(root: string, relativePath: string): Promise<string> {
    return readFile(path.join(root, relativePath), "utf8");
}

export async function repoFileExists(root: string, relativePath: string): Promise<boolean> {
    try {
        await readFile(path.join(root, relativePath));
        return true;
    } catch {
        return false;
    }
}

/** A repo that satisfies every default check, for score-ceiling assertions. */
export const PERFECT_REPO: Record<string, string> = {
    "README.md": "# Perfect\n",
    "LICENSE": "MIT License\n",
    "CONTRIBUTING.md": "# Contributing\n",
    "CODE_OF_CONDUCT.md": "# Code of Conduct\n",
    ".github/ISSUE_TEMPLATE/bug_report.md": "# Bug\n",
    ".github/PULL_REQUEST_TEMPLATE.md": "# PR\n",
    ".github/workflows/ci.yml": "name: CI\n",
    ".env.example": "TOKEN=\n",
    "tests/example.test.js": "",
    "package.json": JSON.stringify({ name: "perfect", scripts: { test: "node --test" } }),
    "package-lock.json": "{}",
    ".gitignore": ".env\n"
};
