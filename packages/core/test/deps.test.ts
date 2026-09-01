import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { checkDependencies } from "../src/deps.js";
import {
    NODE_EXAMPLE,
    PYTHON_EXAMPLE,
    TEST_ADAPTERS,
    makeTempRepo,
    removeTempRepo
} from "./helpers.js";

describe("checkDependencies", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    async function temp(files: Record<string, string> = {}): Promise<string> {
        const root = await makeTempRepo(files);
        tempRepos.push(root);
        return root;
    }

    const issueIds = (result: { issues: { id: string }[] }): string[] =>
        result.issues.map((issue) => issue.id);

    it("reports a missing manifest and stops there", async () => {
        const result = await checkDependencies({
            cwd: await temp({ "notes.txt": "" }),
            adapters: TEST_ADAPTERS
        });

        assert.deepEqual(issueIds(result), ["no-manifest"]);
        assert.deepEqual(result.manifests, []);
        assert.deepEqual(result.nextCommands, []);
    });

    it("lists the manifests and lockfiles it found", async () => {
        const result = await checkDependencies({
            cwd: await temp({ "package.json": "{}", "package-lock.json": "{}" }),
            adapters: TEST_ADAPTERS
        });

        assert.deepEqual(result.manifests, ["package.json"]);
        assert.deepEqual(result.lockfiles, ["package-lock.json"]);
        assert.ok(!issueIds(result).includes("no-lockfile"));
    });

    it("flags a missing lockfile with a language-specific fix", async () => {
        const result = await checkDependencies({
            cwd: await temp({ "package.json": "{}" }),
            adapters: TEST_ADAPTERS
        });
        const issue = result.issues.find((i) => i.id === "no-lockfile");

        assert.ok(issue);
        assert.match(issue.recommendation ?? "", /package-lock\.json/);
    });

    it("detects Dependabot and Renovate config", async () => {
        const dependabot = await checkDependencies({
            cwd: await temp({ "package.json": "{}", ".github/dependabot.yml": "version: 2" }),
            adapters: TEST_ADAPTERS
        });
        const renovate = await checkDependencies({
            cwd: await temp({ "package.json": "{}", "renovate.json": "{}" }),
            adapters: TEST_ADAPTERS
        });

        assert.deepEqual(dependabot.updateTools, [".github/dependabot.yml"]);
        assert.ok(!issueIds(dependabot).includes("no-update-tool"));
        assert.deepEqual(renovate.updateTools, ["renovate.json"]);
        assert.ok(!issueIds(renovate).includes("no-update-tool"));
    });

    it("flags a repo with no automated update tooling", async () => {
        const result = await checkDependencies({
            cwd: await temp({ "package.json": "{}" }),
            adapters: TEST_ADAPTERS
        });

        assert.ok(issueIds(result).includes("no-update-tool"));
    });

    describe("Node projects", () => {
        it("counts runtime and dev dependencies", async () => {
            const result = await checkDependencies({
                cwd: await temp({
                    "package.json": JSON.stringify({
                        dependencies: { a: "^1.0.0", b: "^2.0.0" },
                        devDependencies: { c: "^3.0.0" }
                    })
                }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.dependencyCount, 3);
        });

        it("flags unbounded version ranges", async () => {
            const result = await checkDependencies({
                cwd: await temp({
                    "package.json": JSON.stringify({
                        dependencies: { loose: "*", latest: "latest", fine: "^1.2.3" }
                    })
                }),
                adapters: TEST_ADAPTERS
            });

            const issue = result.issues.find((i) => i.id === "node-floating-ranges");

            assert.ok(issue);
            assert.match(issue.summary, /loose@\*/);
            assert.match(issue.summary, /latest@latest/);
            assert.doesNotMatch(issue.summary, /fine/);
        });

        it("accepts bounded ranges", async () => {
            const result = await checkDependencies({
                cwd: await temp({
                    "package.json": JSON.stringify({
                        dependencies: { a: "^1.2.3", b: "~2.0.0", c: "1.0.0", d: ">=3 <4" }
                    })
                }),
                adapters: TEST_ADAPTERS
            });

            assert.ok(!issueIds(result).includes("node-floating-ranges"));
        });

        it("notes dependencies resolved outside the registry", async () => {
            const result = await checkDependencies({
                cwd: await temp({
                    "package.json": JSON.stringify({
                        dependencies: { forked: "github:owner/repo" }
                    })
                }),
                adapters: TEST_ADAPTERS
            });

            const issue = result.issues.find((i) => i.id === "node-non-registry-deps");

            assert.equal(issue?.level, "info");
            assert.match(issue?.summary ?? "", /forked/);
        });

        it("suggests declaring engines.node", async () => {
            const withEngines = await checkDependencies({
                cwd: await temp({
                    "package.json": JSON.stringify({ engines: { node: ">=20" } })
                }),
                adapters: TEST_ADAPTERS
            });

            assert.ok(!issueIds(withEngines).includes("node-no-engines"));
        });

        it("fails loudly on an unparseable package.json", async () => {
            const result = await checkDependencies({
                cwd: await temp({ "package.json": "{ not json" }),
                adapters: TEST_ADAPTERS
            });

            const issue = result.issues.find((i) => i.id === "node-unreadable-manifest");

            assert.equal(issue?.level, "fail");
        });

        it("names the tools to run next", async () => {
            const result = await checkDependencies({
                cwd: await temp({ "package.json": "{}" }),
                adapters: TEST_ADAPTERS
            });

            assert.ok(result.nextCommands.includes("npm outdated"));
            assert.ok(result.nextCommands.includes("npx npm-check-updates --interactive"));
        });
    });

    describe("Python projects", () => {
        it("flags requirements with no version constraint", async () => {
            const result = await checkDependencies({ cwd: PYTHON_EXAMPLE, adapters: TEST_ADAPTERS });
            const issue = result.issues.find((i) => i.id === "python-unpinned-requirements");

            assert.ok(issue);
            assert.match(issue.summary, /requests/);
            assert.doesNotMatch(issue.summary, /pytest/);
        });

        it("ignores comments and pip flags", async () => {
            const result = await checkDependencies({
                cwd: await temp({
                    "pyproject.toml": "[project]\nname = 'x'",
                    "requirements.txt":
                        "# a comment\n--index-url https://example.com\nrequests==2.0.0\n\nflask>=3  # inline\n"
                }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.dependencyCount, 2);
            assert.ok(!issueIds(result).includes("python-unpinned-requirements"));
        });

        it("names the Python tools to run next", async () => {
            const result = await checkDependencies({ cwd: PYTHON_EXAMPLE, adapters: TEST_ADAPTERS });

            assert.ok(result.nextCommands.includes("pip list --outdated"));
        });
    });

    it("audits the bare Node example end to end", async () => {
        const result = await checkDependencies({ cwd: NODE_EXAMPLE, adapters: TEST_ADAPTERS });

        assert.deepEqual(result.detectedProjectTypes, ["node"]);
        assert.ok(issueIds(result).includes("no-lockfile"));
        assert.ok(issueIds(result).includes("no-update-tool"));
        // examples/node-basic deliberately pins left-pad to "*".
        assert.ok(issueIds(result).includes("node-floating-ranges"));
    });
});
