import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { runDoctor } from "../src/doctor.js";
import { planFix, runFix } from "../src/fix.js";
import {
    TEST_ADAPTERS,
    makeTempRepo,
    readRepoFile,
    removeTempRepo,
    repoFileExists
} from "./helpers.js";

describe("planFix", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    async function temp(files: Record<string, string> = {}): Promise<string> {
        const root = await makeTempRepo(files);
        tempRepos.push(root);
        return root;
    }

    it("proposes a fix for every failing check that has a generator", async () => {
        const plan = await planFix({
            cwd: await temp({ "package.json": "{}" }),
            adapters: TEST_ADAPTERS
        });
        const ids = plan.items.map((item) => item.generatorId);

        assert.deepEqual(ids.sort(), [
            "ci",
            "code-of-conduct",
            "contributing",
            "issues",
            "license",
            "pr-template",
            "readme"
        ]);
    });

    it("does not propose fixes for checks that already pass", async () => {
        const plan = await planFix({
            cwd: await temp({ "package.json": "{}", "README.md": "# x" }),
            adapters: TEST_ADAPTERS
        });

        assert.equal(plan.items.find((item) => item.generatorId === "readme"), undefined);
    });

    it("reports the score before any change", async () => {
        const root = await temp({ "package.json": "{}" });
        const plan = await planFix({ cwd: root, adapters: TEST_ADAPTERS });
        const doctor = await runDoctor({ cwd: root, adapters: TEST_ADAPTERS });

        assert.equal(plan.scoreBefore, doctor.score);
    });

    it("marks a fix risky when it would overwrite an existing file", async () => {
        // An empty README fails the check but the file is already there, so
        // regenerating it means clobbering the user's work.
        const plan = await planFix({
            cwd: await temp({ "CODE_OF_CONDUCT.md": "" }),
            adapters: TEST_ADAPTERS
        });
        const coc = plan.items.find((item) => item.generatorId === "code-of-conduct");

        assert.equal(coc, undefined, "a passing check should not be proposed");
    });

    it("marks a partially-existing multi-file fix as risky", async () => {
        const plan = await planFix({
            cwd: await temp({ ".github/ISSUE_TEMPLATE/bug_report.md": "mine" }),
            adapters: TEST_ADAPTERS
        });

        const issues = plan.items.find((item) => item.generatorId === "issues");

        // The directory exists so the check passes; nothing to propose.
        assert.equal(issues, undefined);
    });

    it("writes nothing", async () => {
        const root = await temp({ "package.json": "{}" });
        await planFix({ cwd: root, adapters: TEST_ADAPTERS });

        assert.equal(await repoFileExists(root, "README.md"), false);
    });
});

describe("runFix", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    async function temp(files: Record<string, string> = {}): Promise<string> {
        const root = await makeTempRepo(files);
        tempRepos.push(root);
        return root;
    }

    describe("--dry-run", () => {
        it("writes nothing", async () => {
            const root = await temp({ "package.json": "{}" });
            const result = await runFix({ cwd: root, dryRun: true, adapters: TEST_ADAPTERS });

            assert.equal(result.dryRun, true);
            assert.deepEqual(result.applied, []);
            assert.equal(await repoFileExists(root, "README.md"), false);
            assert.equal(await repoFileExists(root, "LICENSE"), false);
        });

        it("still lists the fixes it would apply", async () => {
            const result = await runFix({
                cwd: await temp({ "package.json": "{}" }),
                dryRun: true,
                adapters: TEST_ADAPTERS
            });

            assert.ok(result.items.length > 0);
            assert.ok(result.items.every((item) => item.safety === "safe"));
        });
    });

    describe("--yes", () => {
        it("applies every safe fix", async () => {
            const root = await temp({ "package.json": "{}" });
            const result = await runFix({ cwd: root, yes: true, adapters: TEST_ADAPTERS });

            assert.equal(result.cancelled, false);
            assert.ok(result.applied.length >= 7);

            for (const expected of [
                "README.md",
                "LICENSE",
                "CONTRIBUTING.md",
                "CODE_OF_CONDUCT.md",
                ".github/PULL_REQUEST_TEMPLATE.md",
                ".github/ISSUE_TEMPLATE/bug_report.md",
                ".github/workflows/ci.yml"
            ]) {
                assert.equal(
                    await repoFileExists(root, expected),
                    true,
                    `${expected} was not written`
                );
            }
        });

        it("raises the doctor score", async () => {
            const root = await temp({ "package.json": "{}" });

            const before = await runDoctor({ cwd: root, adapters: TEST_ADAPTERS });
            await runFix({ cwd: root, yes: true, adapters: TEST_ADAPTERS });
            const after = await runDoctor({ cwd: root, adapters: TEST_ADAPTERS });

            assert.ok(
                after.score > before.score,
                `expected the score to rise from ${before.score}, got ${after.score}`
            );
        });

        it("is idempotent — a second run has nothing left to do", async () => {
            const root = await temp({ "package.json": "{}" });

            await runFix({ cwd: root, yes: true, adapters: TEST_ADAPTERS });
            const second = await runFix({ cwd: root, yes: true, adapters: TEST_ADAPTERS });

            assert.deepEqual(
                second.applied.filter((file) => file.action !== "skip"),
                []
            );
        });
    });

    describe("safety", () => {
        it("never overwrites an existing file by default", async () => {
            const root = await temp({ "package.json": "{}", "LICENSE": "" });

            await runFix({ cwd: root, yes: true, adapters: TEST_ADAPTERS });

            // The empty LICENSE satisfies the check, so it is left alone.
            assert.equal(await readRepoFile(root, "LICENSE"), "");
        });

        it("only applies safe fixes when nothing is selected", async () => {
            const result = await runFix({
                cwd: await temp({ "package.json": "{}" }),
                yes: true,
                adapters: TEST_ADAPTERS
            });

            assert.ok(result.items.every((item) => item.safety === "safe"));
        });

        it("applies only the selected fixes", async () => {
            const root = await temp({ "package.json": "{}" });
            const result = await runFix({
                cwd: root,
                yes: true,
                select: ["license"],
                adapters: TEST_ADAPTERS
            });

            assert.deepEqual(result.items.map((item) => item.generatorId), ["license"]);
            assert.equal(await repoFileExists(root, "LICENSE"), true);
            assert.equal(await repoFileExists(root, "README.md"), false);
        });

        it("accepts a check ID as a selector", async () => {
            const root = await temp({ "package.json": "{}" });
            await runFix({
                cwd: root,
                yes: true,
                select: ["pr-template"],
                adapters: TEST_ADAPTERS
            });

            assert.equal(await repoFileExists(root, ".github/PULL_REQUEST_TEMPLATE.md"), true);
        });
    });

    it("passes the license and author through to the generator", async () => {
        const root = await temp({ "package.json": "{}" });
        await runFix({
            cwd: root,
            yes: true,
            license: "isc",
            author: "Ada Lovelace",
            adapters: TEST_ADAPTERS
        });

        const license = await readRepoFile(root, "LICENSE");

        assert.match(license, /^ISC License/);
        assert.match(license, /Ada Lovelace/);
    });

    it("passes the CI language through to the generator", async () => {
        const root = await temp({ "package.json": "{}" });
        await runFix({ cwd: root, yes: true, lang: "go", adapters: TEST_ADAPTERS });

        assert.match(await readRepoFile(root, ".github/workflows/ci.yml"), /actions\/setup-go/);
    });

    it("reports nothing to do for an already healthy repo", async () => {
        const root = await temp({ "package.json": "{}" });
        await runFix({ cwd: root, yes: true, adapters: TEST_ADAPTERS });

        const again = await runFix({ cwd: root, yes: true, adapters: TEST_ADAPTERS });

        assert.deepEqual(again.applied, []);
        assert.equal(again.cancelled, false);
    });
});
