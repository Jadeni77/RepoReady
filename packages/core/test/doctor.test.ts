import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { runDoctor } from "../src/doctor.js";
import {
    NODE_EXAMPLE,
    PERFECT_REPO,
    PYTHON_EXAMPLE,
    TEST_ADAPTERS,
    makeTempRepo,
    removeTempRepo
} from "./helpers.js";

describe("runDoctor", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    async function temp(files: Record<string, string>): Promise<string> {
        const root = await makeTempRepo(files);
        tempRepos.push(root);
        return root;
    }

    it("scores a fully equipped repo at 100", async () => {
        const result = await runDoctor({ cwd: await temp(PERFECT_REPO), adapters: TEST_ADAPTERS });

        assert.equal(result.score, 100);
        assert.equal(result.pointsEarned, result.pointsPossible);
        assert.deepEqual(result.suggestions, []);
        assert.ok(result.results.every((check) => check.status === "pass"));
    });

    it("scores a bare repo below a fully equipped one", async () => {
        const bare = await runDoctor({ cwd: await temp({ "notes.txt": "" }), adapters: TEST_ADAPTERS });
        const full = await runDoctor({ cwd: await temp(PERFECT_REPO), adapters: TEST_ADAPTERS });

        assert.ok(bare.score < full.score);
        assert.ok(bare.suggestions.length > 0);
    });

    it("reports the detected project type", async () => {
        const node = await runDoctor({ cwd: NODE_EXAMPLE, adapters: TEST_ADAPTERS });
        const python = await runDoctor({ cwd: PYTHON_EXAMPLE, adapters: TEST_ADAPTERS });

        assert.deepEqual(node.detectedProjectTypes, ["node"]);
        assert.deepEqual(python.detectedProjectTypes, ["python"]);
    });

    it("keeps the score between 0 and 100", async () => {
        const result = await runDoctor({ cwd: await temp({}), adapters: TEST_ADAPTERS });

        assert.ok(result.score >= 0 && result.score <= 100);
    });

    describe("the CI check", () => {
        // Regression: the workflow directory was once read as "./github/workflows",
        // so a repo with real workflows still reported none.
        it("passes when .github/workflows holds a yml file", async () => {
            const result = await runDoctor({
                cwd: await temp({ ".github/workflows/ci.yml": "name: CI\n" }),
                adapters: TEST_ADAPTERS
            });

            const ci = result.results.find((check) => check.id === "ci");

            assert.equal(ci?.status, "pass");
            assert.match(ci?.summary ?? "", /1 GitHub Actions workflow file/);
            assert.deepEqual(ci?.details?.workflows, ["ci.yml"]);
        });

        it("passes for .yaml as well as .yml", async () => {
            const result = await runDoctor({
                cwd: await temp({ ".github/workflows/release.yaml": "name: Release\n" }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "ci")?.status, "pass");
        });

        it("warns when the workflow directory exists but is empty of workflows", async () => {
            const result = await runDoctor({
                cwd: await temp({ ".github/workflows/README.md": "notes" }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "ci")?.status, "warn");
        });

        it("fails when there is no workflow directory", async () => {
            const result = await runDoctor({ cwd: await temp({}), adapters: TEST_ADAPTERS });

            assert.equal(result.results.find((check) => check.id === "ci")?.status, "fail");
        });
    });

    describe("the tests check", () => {
        it("passes on a real npm test script", async () => {
            const result = await runDoctor({
                cwd: await temp({
                    "package.json": JSON.stringify({ scripts: { test: "node --test" } })
                }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "tests")?.status, "pass");
        });

        it("warns on the npm placeholder test script", async () => {
            const result = await runDoctor({
                cwd: await temp({
                    "package.json": JSON.stringify({
                        scripts: { test: 'echo "Error: no test specified" && exit 1' }
                    })
                }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "tests")?.status, "warn");
        });
    });

    describe("the gitignore check", () => {
        it("passes when .env is ignored", async () => {
            const result = await runDoctor({
                cwd: await temp({ ".gitignore": "node_modules/\n.env\n" }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "gitignore")?.status, "pass");
        });

        it("warns when .gitignore does not cover .env", async () => {
            const result = await runDoctor({
                cwd: await temp({ ".gitignore": "node_modules/\n" }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "gitignore")?.status, "warn");
        });
    });

    describe("the lockfile check", () => {
        it("does not run without a dependency manifest", async () => {
            const result = await runDoctor({
                cwd: await temp({ "notes.txt": "" }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "lockfile"), undefined);
        });

        it("runs once a manifest exists", async () => {
            const result = await runDoctor({
                cwd: await temp({ "package.json": "{}" }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "lockfile")?.status, "warn");
        });
    });

    describe("filtering", () => {
        it("runs only the requested check IDs", async () => {
            const result = await runDoctor({
                cwd: await temp({}),
                only: ["readme", "license"],
                adapters: TEST_ADAPTERS
            });

            assert.deepEqual(
                result.results.map((check) => check.id).sort(),
                ["license", "readme"]
            );
        });

        it("matches a whole category", async () => {
            const result = await runDoctor({
                cwd: await temp({}),
                only: ["automation"],
                adapters: TEST_ADAPTERS
            });

            assert.ok(result.results.length > 0);
            assert.ok(result.results.every((check) => check.category === "automation"));
        });

        it("skips the requested checks", async () => {
            const result = await runDoctor({
                cwd: await temp({}),
                skip: ["readme"],
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "readme"), undefined);
        });

        it("honours checks disabled in repoready.config.json", async () => {
            const result = await runDoctor({
                cwd: await temp({
                    "repoready.config.json": JSON.stringify({ checks: { license: false } })
                }),
                adapters: TEST_ADAPTERS
            });

            assert.equal(result.results.find((check) => check.id === "license"), undefined);
        });

        it("scores 100 when every check is filtered out", async () => {
            const result = await runDoctor({
                cwd: await temp({}),
                only: ["nothing-matches"],
                adapters: TEST_ADAPTERS
            });

            assert.deepEqual(result.results, []);
            assert.equal(result.score, 100);
        });
    });

    describe("category scores", () => {
        it("totals to the overall points", async () => {
            const result = await runDoctor({
                cwd: await temp({ "README.md": "# x" }),
                adapters: TEST_ADAPTERS
            });

            const earned = result.categoryScores.reduce((sum, c) => sum + c.pointsEarned, 0);
            const possible = result.categoryScores.reduce((sum, c) => sum + c.pointsPossible, 0);

            assert.equal(earned, result.pointsEarned);
            assert.equal(possible, result.pointsPossible);
        });
    });

    it("de-duplicates suggestions", async () => {
        const result = await runDoctor({ cwd: await temp({}), adapters: TEST_ADAPTERS });

        assert.equal(new Set(result.suggestions).size, result.suggestions.length);
    });
});
