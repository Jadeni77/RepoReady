import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { after, describe, it } from "node:test";
import { applyPlan, describeFiles, planGenerator, runGenerator } from "../src/generator-runner.js";
import { contributingGenerator, issueTemplateGenerator, readmeGenerator } from "../src/generators.js";
import {
    makeTempRepo,
    readRepoFile,
    removeTempRepo,
    repoFileExists
} from "./helpers.js";

describe("planGenerator", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    async function temp(files: Record<string, string> = {}): Promise<string> {
        const root = await makeTempRepo(files);
        tempRepos.push(root);
        return root;
    }

    it("plans a create for a file that does not exist", async () => {
        const plan = await planGenerator(contributingGenerator, { cwd: await temp({}) });

        assert.equal(plan.files.length, 1);
        assert.equal(plan.files[0]?.action, "create");
        assert.equal(plan.files[0]?.existed, false);
    });

    it("plans a skip when the file exists and --force was not passed", async () => {
        const plan = await planGenerator(contributingGenerator, {
            cwd: await temp({ "CONTRIBUTING.md": "mine" })
        });

        assert.equal(plan.files[0]?.action, "skip");
        assert.equal(plan.files[0]?.existed, true);
        assert.match(plan.files[0]?.reason ?? "", /--force/);
    });

    it("plans an overwrite when --force is passed", async () => {
        const plan = await planGenerator(contributingGenerator, {
            cwd: await temp({ "CONTRIBUTING.md": "mine" }),
            force: true
        });

        assert.equal(plan.files[0]?.action, "overwrite");
        assert.equal(plan.files[0]?.existed, true);
    });

    it("writes nothing", async () => {
        const root = await temp({});
        await planGenerator(contributingGenerator, { cwd: root });

        assert.equal(await repoFileExists(root, "CONTRIBUTING.md"), false);
    });

    it("plans every file a multi-file generator emits", async () => {
        const plan = await planGenerator(issueTemplateGenerator, { cwd: await temp({}) });

        assert.equal(plan.files.length, 2);
        assert.ok(plan.files.every((file) => file.action === "create"));
    });
});

describe("runGenerator", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    async function temp(files: Record<string, string> = {}): Promise<string> {
        const root = await makeTempRepo(files);
        tempRepos.push(root);
        return root;
    }

    it("creates the file and reports the action", async () => {
        const root = await temp({});
        const result = await runGenerator(contributingGenerator, { cwd: root, yes: true });

        assert.equal(result.dryRun, false);
        assert.equal(result.files[0]?.action, "create");
        assert.match(await readRepoFile(root, "CONTRIBUTING.md"), /^# Contributing/);
    });

    it("creates nested directories as needed", async () => {
        const root = await temp({});
        await runGenerator(issueTemplateGenerator, { cwd: root, yes: true });

        assert.equal(
            await repoFileExists(root, ".github/ISSUE_TEMPLATE/bug_report.md"),
            true
        );
        assert.equal(
            await repoFileExists(root, ".github/ISSUE_TEMPLATE/feature_request.md"),
            true
        );
    });

    describe("--dry-run", () => {
        it("writes nothing", async () => {
            const root = await temp({});
            const result = await runGenerator(contributingGenerator, {
                cwd: root,
                dryRun: true
            });

            assert.equal(result.dryRun, true);
            assert.equal(await repoFileExists(root, "CONTRIBUTING.md"), false);
        });

        it("returns the content so it can be previewed", async () => {
            const result = await runGenerator(contributingGenerator, {
                cwd: await temp({}),
                dryRun: true
            });

            assert.match(result.files[0]?.content ?? "", /^# Contributing/);
        });

        it("still reports what would be skipped", async () => {
            const result = await runGenerator(contributingGenerator, {
                cwd: await temp({ "CONTRIBUTING.md": "mine" }),
                dryRun: true
            });

            assert.equal(result.files[0]?.action, "skip");
        });
    });

    describe("overwrite safety", () => {
        it("leaves an existing file untouched without --force", async () => {
            const root = await temp({ "CONTRIBUTING.md": "do not clobber me" });
            const result = await runGenerator(contributingGenerator, { cwd: root, yes: true });

            assert.equal(result.files[0]?.action, "skip");
            assert.equal(await readRepoFile(root, "CONTRIBUTING.md"), "do not clobber me");
        });

        it("replaces the file with --force", async () => {
            const root = await temp({ "CONTRIBUTING.md": "old" });
            const result = await runGenerator(contributingGenerator, {
                cwd: root,
                force: true,
                yes: true
            });

            assert.equal(result.files[0]?.action, "overwrite");
            assert.match(await readRepoFile(root, "CONTRIBUTING.md"), /^# Contributing/);
        });
    });

    // On a case-sensitive filesystem, targeting "README.md" here would leave
    // the repo with two competing READMEs. Assert on the directory listing,
    // which preserves case even where path lookups do not.
    it("reuses an existing README's filename instead of adding a second one", async () => {
        const root = await temp({ "readme.md": "old" });
        const result = await runGenerator(readmeGenerator, {
            cwd: root,
            force: true,
            yes: true
        });

        assert.equal(result.files[0]?.path, "readme.md");
        assert.deepEqual(
            (await readdir(root)).filter((entry) => /^readme/i.test(entry)),
            ["readme.md"]
        );
    });
});

describe("applyPlan", () => {
    const tempRepos: string[] = [];

    after(async () => {
        await Promise.all(tempRepos.map(removeTempRepo));
    });

    it("writes creates and passes skips through untouched", async () => {
        const root = await makeTempRepo({ "CONTRIBUTING.md": "mine" });
        tempRepos.push(root);

        const plan = await planGenerator(contributingGenerator, { cwd: root });
        const results = await applyPlan(plan);

        assert.equal(results[0]?.action, "skip");
        assert.equal(await readRepoFile(root, "CONTRIBUTING.md"), "mine");
    });
});

describe("describeFiles", () => {
    it("labels each planned action", () => {
        const preview = describeFiles([
            {
                path: "README.md",
                fullPath: "/tmp/README.md",
                content: "",
                action: "create",
                existed: false
            },
            {
                path: "LICENSE",
                fullPath: "/tmp/LICENSE",
                content: "",
                action: "overwrite",
                existed: true
            }
        ]);

        assert.match(preview, /create\s+README\.md/);
        assert.match(preview, /overwrite\s+LICENSE/);
    });
});
