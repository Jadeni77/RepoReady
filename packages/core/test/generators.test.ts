import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { parse as parseYaml } from "yaml";
import {
    ciGenerator,
    codeOfConductGenerator,
    contributingGenerator,
    defaultGenerators,
    issueTemplateGenerator,
    licenseGenerator,
    pullRequestTemplateGenerator,
    readmeGenerator
} from "../src/generators.js";
import { createRepoContext } from "../src/scan.js";
import type { GeneratorOptions, ProjectType } from "../src/types.js";
import { NODE_EXAMPLE, PYTHON_EXAMPLE, TEST_ADAPTERS, makeTempRepo, removeTempRepo } from "./helpers.js";

const tempRepos: string[] = [];

after(async () => {
    await Promise.all(tempRepos.map(removeTempRepo));
});

async function temp(files: Record<string, string> = {}): Promise<string> {
    const root = await makeTempRepo(files);
    tempRepos.push(root);
    return root;
}

async function generateOne(
    generator: (typeof defaultGenerators)[number],
    cwd: string,
    options: GeneratorOptions = {}
): Promise<string> {
    const ctx = await createRepoContext(cwd, { adapters: TEST_ADAPTERS });
    const files = await generator.generate(ctx, options);
    assert.ok(files[0], `${generator.id} generated no files`);
    return files[0].content;
}

/**
 * The templates were once written as indented template literals, so every
 * line arrived with four leading spaces and Markdown rendered the whole file
 * as a code block. Markdown treats 4+ spaces as an indented code block.
 */
function assertNoAccidentalIndentation(content: string, label: string): void {
    const offenders = content
        .split("\n")
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => /^\s{4,}\S/.test(line))
        // List continuations and fenced blocks legitimately indent; headings,
        // paragraphs, and fences never should.
        .filter(({ line }) => /^\s+(#{1,6}\s|```|- |\d+\. )/.test(line));

    assert.deepEqual(
        offenders.map((o) => `${o.number}: ${o.line}`),
        [],
        `${label} has Markdown-breaking indentation`
    );
}

describe("the generator registry", () => {
    it("exposes unique IDs", () => {
        const ids = defaultGenerators.map((generator) => generator.id);
        assert.equal(new Set(ids).size, ids.length);
    });

    it("covers every generator the default checks recommend", async () => {
        const { defaultChecks } = await import("../src/checks.js");
        const ctx = await createRepoContext(await temp({}), { adapters: TEST_ADAPTERS });

        const recommended = defaultChecks
            .map((check) => check.id)
            .filter((id) =>
                ["readme", "license", "contributing", "code-of-conduct", "issue-template", "pr-template", "ci"].includes(id)
            );

        // Every check that names an `repoready init-*` command must have a
        // generator behind it, or doctor advertises commands that do not exist.
        for (const checkId of recommended) {
            const result = await defaultChecks.find((c) => c.id === checkId)!.run(ctx);
            const command = result.recommendation?.match(/repoready (init-[\w-]+)/)?.[1];
            const generatorId = command?.replace("init-", "");

            assert.ok(command, `check ${checkId} did not recommend an init command`);
            assert.ok(
                defaultGenerators.some((generator) => generator.id === generatorId),
                `no generator backs "repoready ${command}"`
            );
        }
    });
});

describe("readmeGenerator", () => {
    it("starts with a level-one heading and does not indent Markdown", async () => {
        const content = await generateOne(readmeGenerator, NODE_EXAMPLE);

        assert.match(content, /^# node-basic\n/);
        assertNoAccidentalIndentation(content, "README");
    });

    it("uses well-formed, balanced code fences", async () => {
        const content = await generateOne(readmeGenerator, NODE_EXAMPLE);
        const fences = content.match(/^```.*$/gm) ?? [];

        assert.equal(fences.length % 2, 0, "unbalanced code fences");
        // Regression: the shell fence was once spelled ```bah.
        for (const fence of fences.filter((f) => f.length > 3)) {
            assert.match(fence, /^```(bash|text)$/);
        }
    });

    it("takes the name and description from package.json", async () => {
        const content = await generateOne(readmeGenerator, NODE_EXAMPLE);

        assert.match(content, /# node-basic/);
        assert.match(content, /A deliberately bare Node project/);
    });

    it("falls back to the directory name outside a Node project", async () => {
        const content = await generateOne(readmeGenerator, await temp({ "a.txt": "" }));

        assert.match(content, /^# repoready-test-/);
    });

    it("suggests language-appropriate commands", async () => {
        const node = await generateOne(readmeGenerator, NODE_EXAMPLE);
        const python = await generateOne(readmeGenerator, PYTHON_EXAMPLE);

        assert.match(node, /npm install/);
        assert.match(node, /npm test/);
        assert.match(python, /pip install -r requirements\.txt/);
        assert.match(python, /pytest/);
    });

    it("writes to the requested target path", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: TEST_ADAPTERS });
        const files = await readmeGenerator.generate(ctx, { targetPath: "docs/README.md" });

        assert.equal(files[0]?.path, "docs/README.md");
    });
});

describe("contributingGenerator", () => {
    it("produces unindented Markdown", async () => {
        const content = await generateOne(contributingGenerator, NODE_EXAMPLE);

        assert.match(content, /^# Contributing\n/);
        assertNoAccidentalIndentation(content, "CONTRIBUTING");
    });

    it("writes to CONTRIBUTING.md", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: TEST_ADAPTERS });
        const files = await contributingGenerator.generate(ctx, {});

        assert.equal(files[0]?.path, "CONTRIBUTING.md");
    });
});

describe("licenseGenerator", () => {
    it("defaults to MIT with the current year", async () => {
        const content = await generateOne(licenseGenerator, await temp({}));

        assert.match(content, /^MIT License/);
        assert.match(content, new RegExp(`Copyright \\(c\\) ${new Date().getFullYear()} `));
        assert.match(content, /THE SOFTWARE IS PROVIDED "AS IS"/);
    });

    it("honours the requested license", async () => {
        const root = await temp({});

        assert.match(
            await generateOne(licenseGenerator, root, { license: "isc" }),
            /^ISC License/
        );
        assert.match(
            await generateOne(licenseGenerator, root, { license: "bsd-3-clause" }),
            /^BSD 3-Clause License/
        );
        assert.match(
            await generateOne(licenseGenerator, root, { license: "unlicense" }),
            /^This is free and unencumbered software/
        );
    });

    it("prefers the explicit author over every other source", async () => {
        const content = await generateOne(licenseGenerator, NODE_EXAMPLE, {
            author: "Ada Lovelace"
        });

        assert.match(content, /Copyright \(c\) \d{4} Ada Lovelace/);
    });

    it("strips the email from a package.json author string", async () => {
        const content = await generateOne(licenseGenerator, NODE_EXAMPLE);

        assert.match(content, /Copyright \(c\) \d{4} Example Author\n/);
        assert.doesNotMatch(content, /author@example\.com/);
    });

    it("reads an author object from package.json", async () => {
        const root = await temp({
            "package.json": JSON.stringify({ name: "x", author: { name: "Grace Hopper" } })
        });

        assert.match(await generateOne(licenseGenerator, root), /Copyright \(c\) \d{4} Grace Hopper/);
    });

    it("reads the license and author from repoready.config.json", async () => {
        const root = await temp({
            "repoready.config.json": JSON.stringify({ license: "isc", author: "Config Author" })
        });

        const content = await generateOne(licenseGenerator, root);

        assert.match(content, /^ISC License/);
        assert.match(content, /Copyright \(c\) \d{4} Config Author/);
    });
});

describe("codeOfConductGenerator", () => {
    it("emits Contributor Covenant 2.1 with a contact placeholder", async () => {
        const ctx = await createRepoContext(await temp({}), { adapters: TEST_ADAPTERS });
        const files = await codeOfConductGenerator.generate(ctx, {});

        assert.equal(files[0]?.path, "CODE_OF_CONDUCT.md");
        assert.match(files[0].content, /^# Contributor Covenant Code of Conduct/);
        assert.match(files[0].content, /version 2\.1/);
        assert.match(files[0].content, /\[INSERT CONTACT METHOD\]/);
        assertNoAccidentalIndentation(files[0].content, "CODE_OF_CONDUCT");
    });
});

describe("issueTemplateGenerator", () => {
    it("writes bug and feature templates with valid front matter", async () => {
        const ctx = await createRepoContext(await temp({}), { adapters: TEST_ADAPTERS });
        const files = await issueTemplateGenerator.generate(ctx, {});

        assert.deepEqual(files.map((file) => file.path), [
            ".github/ISSUE_TEMPLATE/bug_report.md",
            ".github/ISSUE_TEMPLATE/feature_request.md"
        ]);

        for (const file of files) {
            const frontMatter = file.content.match(/^---\n([\s\S]*?)\n---\n/);
            assert.ok(frontMatter, `${file.path} is missing YAML front matter`);

            const parsed = parseYaml(frontMatter[1]!) as Record<string, unknown>;
            assert.equal(typeof parsed.name, "string");
            assert.equal(typeof parsed.about, "string");
            assert.ok(parsed.labels, `${file.path} has no labels`);
        }
    });
});

describe("pullRequestTemplateGenerator", () => {
    it("writes a PR template with a checklist", async () => {
        const ctx = await createRepoContext(await temp({}), { adapters: TEST_ADAPTERS });
        const files = await pullRequestTemplateGenerator.generate(ctx, {});

        assert.equal(files[0]?.path, ".github/PULL_REQUEST_TEMPLATE.md");
        assert.match(files[0].content, /## Summary/);
        assert.match(files[0].content, /- \[ \] Tests added or updated/);
    });
});

describe("ciGenerator", () => {
    const languages: ProjectType[] = [
        "go",
        "rust",
        "java",
        "ruby",
        "php",
        "generic"
    ];

    it("writes to .github/workflows/ci.yml", async () => {
        const ctx = await createRepoContext(NODE_EXAMPLE, { adapters: TEST_ADAPTERS });
        const files = await ciGenerator.generate(ctx, {});

        assert.equal(files[0]?.path, ".github/workflows/ci.yml");
    });

    // Regression: the templates once produced unparseable YAML — a `with:`
    // block indented under `uses:`, and an unterminated `"3.12` string.
    for (const lang of languages) {
        it(`emits a parseable workflow for ${lang}`, async () => {
            const content = await generateOne(ciGenerator, await temp({}), { lang });
            const workflow = parseYaml(content) as Record<string, any>;

            assert.equal(workflow.name, "CI");
            assert.ok(workflow.on, "workflow has no trigger");
            assert.deepEqual(workflow.on.push.branches, ["main"]);

            const steps = workflow.jobs.test.steps;
            assert.equal(workflow.jobs.test["runs-on"], "ubuntu-latest");
            assert.ok(Array.isArray(steps) && steps.length >= 2, "expected checkout plus work");
            assert.equal(steps[0].uses, "actions/checkout@v4");

            for (const step of steps) {
                assert.ok(step.name, "every step should be named");
                assert.ok(
                    step.uses || step.run,
                    `step "${step.name}" neither uses an action nor runs a command`
                );
                // `with` belongs to the step, not nested inside `uses`.
                if (step.with) {
                    assert.equal(typeof step.with, "object");
                }
            }
        });
    }

    it("lets an explicit --lang override detection", async () => {
        const content = await generateOne(ciGenerator, NODE_EXAMPLE, { lang: "go" });

        assert.match(content, /actions\/setup-go/);
        assert.doesNotMatch(content, /actions\/setup-node/);
    });

    it("produces a generic workflow when nothing is detected", async () => {
        const content = await generateOne(ciGenerator, await temp({ "a.txt": "" }));

        assert.match(content, /Add project-specific CI steps here/);
    });
});
