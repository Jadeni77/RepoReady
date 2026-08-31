import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { checkDependencies } from "../src/deps.js";
import { runDoctor } from "../src/doctor.js";
import { runFix } from "../src/fix.js";
import { contributingGenerator } from "../src/generators.js";
import { runGenerator } from "../src/generator-runner.js";
import {
    formatDepCheckJson,
    formatDepCheckText,
    formatDoctorJson,
    formatDoctorText,
    formatFixJson,
    formatFixText,
    formatGeneratorText,
    formatProjectTypes
} from "../src/reporters.js";
import { PERFECT_REPO, makeTempRepo, removeTempRepo } from "./helpers.js";

const tempRepos: string[] = [];

after(async () => {
    await Promise.all(tempRepos.map(removeTempRepo));
});

async function temp(files: Record<string, string> = {}): Promise<string> {
    const root = await makeTempRepo(files);
    tempRepos.push(root);
    return root;
}

describe("formatProjectTypes", () => {
    it("uses human-readable labels", () => {
        assert.equal(formatProjectTypes(["node"]), "Node");
        assert.equal(formatProjectTypes(["python"]), "Python");
        assert.equal(formatProjectTypes(["php"]), "PHP");
        assert.equal(formatProjectTypes(["node", "python"]), "Node, Python");
    });
});

describe("formatDoctorText", () => {
    it("leads with the score and the detected project type", async () => {
        const result = await runDoctor({ cwd: await temp({ "package.json": "{}" }) });
        const output = formatDoctorText(result);

        assert.match(output, new RegExp(`^RepoReady Score: ${result.score}/100`));
        assert.match(output, /Detected project type: Node/);
    });

    it("groups checks under their category and marks each status", async () => {
        const output = formatDoctorText(await runDoctor({ cwd: await temp({}) }));

        assert.match(output, /^Community$/m);
        assert.match(output, /^Automation$/m);
        assert.match(output, /❌ README/);
    });

    it("lists suggested fixes", async () => {
        const output = formatDoctorText(await runDoctor({ cwd: await temp({}) }));

        assert.match(output, /Suggested fixes:/);
        assert.match(output, /repoready init-readme/);
    });

    it("congratulates a healthy repo instead of listing fixes", async () => {
        const output = formatDoctorText(await runDoctor({ cwd: await temp(PERFECT_REPO) }));

        assert.match(output, /No suggested fixes/);
        assert.doesNotMatch(output, /Suggested fixes:/);
    });
});

describe("formatDoctorJson", () => {
    it("round-trips the result", async () => {
        const result = await runDoctor({ cwd: await temp({ "package.json": "{}" }) });
        const parsed = JSON.parse(formatDoctorJson(result));

        assert.equal(parsed.score, result.score);
        assert.equal(parsed.results.length, result.results.length);
        assert.deepEqual(parsed.detectedProjectTypes, ["node"]);
    });
});

describe("formatGeneratorText", () => {
    it("shows the dry-run preview inline", async () => {
        const result = await runGenerator(contributingGenerator, {
            cwd: await temp({}),
            dryRun: true
        });

        const output = formatGeneratorText(result);

        assert.match(output, /Mode: dry-run/);
        assert.match(output, /--- CONTRIBUTING\.md ---/);
        assert.match(output, /# Contributing/);
    });

    it("omits file bodies when actually writing", async () => {
        const result = await runGenerator(contributingGenerator, {
            cwd: await temp({}),
            yes: true
        });

        const output = formatGeneratorText(result);

        assert.match(output, /Mode: write/);
        assert.match(output, /CREATE: CONTRIBUTING\.md/);
        assert.doesNotMatch(output, /--- CONTRIBUTING\.md ---/);
    });

    it("explains why a file was skipped", async () => {
        const result = await runGenerator(contributingGenerator, {
            cwd: await temp({ "CONTRIBUTING.md": "mine" }),
            yes: true
        });

        assert.match(formatGeneratorText(result), /--force/);
    });
});

describe("formatDepCheckText", () => {
    it("summarises manifests, lockfiles, and next steps", async () => {
        const result = await checkDependencies({
            cwd: await temp({ "package.json": JSON.stringify({ dependencies: { a: "*" } }) })
        });

        const output = formatDepCheckText(result);

        assert.match(output, /Manifests: package\.json/);
        assert.match(output, /Lockfiles: none/);
        assert.match(output, /Run next:/);
        assert.match(output, /npm outdated/);
    });

    it("says so when there is nothing to report", async () => {
        const result = await checkDependencies({
            cwd: await temp({
                "package.json": JSON.stringify({
                    engines: { node: ">=20" },
                    dependencies: { a: "^1.0.0" }
                }),
                "package-lock.json": "{}",
                ".github/dependabot.yml": "version: 2"
            })
        });

        assert.match(formatDepCheckText(result), /No dependency issues found/);
    });

    it("round-trips as JSON", async () => {
        const result = await checkDependencies({ cwd: await temp({ "package.json": "{}" }) });
        const parsed = JSON.parse(formatDepCheckJson(result));

        assert.deepEqual(parsed.manifests, ["package.json"]);
    });
});

describe("formatFixText", () => {
    it("numbers the recommended fixes", async () => {
        const result = await runFix({
            cwd: await temp({ "package.json": "{}" }),
            dryRun: true
        });

        const output = formatFixText(result);

        assert.match(output, /RepoReady found \d+ recommended fix\(es\):/);
        assert.match(output, /^1\. /m);
        assert.match(output, /Mode: dry-run\. Nothing was written\./);
    });

    it("lists what it wrote after a real run", async () => {
        const result = await runFix({ cwd: await temp({ "package.json": "{}" }), yes: true });
        const output = formatFixText(result);

        assert.match(output, /Applied \d+ file\(s\):/);
        assert.match(output, /CREATE: README\.md/);
        assert.match(output, /Run repoready doctor/);
    });

    it("reports a healthy repo plainly", async () => {
        const root = await temp(PERFECT_REPO);
        const result = await runFix({ cwd: root, yes: true });

        assert.match(formatFixText(result), /found no fixes to apply/);
    });

    it("round-trips as JSON", async () => {
        const result = await runFix({
            cwd: await temp({ "package.json": "{}" }),
            dryRun: true
        });

        const parsed = JSON.parse(formatFixJson(result));

        assert.equal(parsed.dryRun, true);
        assert.equal(parsed.items.length, result.items.length);
    });
});
