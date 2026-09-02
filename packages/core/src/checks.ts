import type { CheckCategory, CheckResult, CheckStatus, HealthCheck, RepoContext } from "./types.js";

type PackageJson = {
    scripts?: Record<string, string>;
}

const dependencyManifestPaths = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "Gemfile",
    "composer.json"
];

function makeResult(check: HealthCheck, status: CheckStatus, summary: string,
                    recommendation?: string, pointsEarned?: number, details?: Record<string, unknown>
): CheckResult {
    return {
        id: check.id,
        name: check.name,
        category: check.category,
        status,
        summary,
        recommendation,
        pointsEarned:
            pointsEarned ?? 
            (status === "pass" ? check.points : status === "warn" ? Math.floor(check.points / 2) : 0),
        pointsPossible: check.points,
        details
    };
}

function makeFileCheck(input: {
    id: string;
    name: string;
    category: CheckCategory;
    points: number;
    paths: string[];
    missingStatus?: "warn" | "fail";
    missingSummary: string;
    recommendation?: string;
    fixedBy?: string;
}): HealthCheck {
    const check: HealthCheck = {
        id: input.id,
        name: input.name,
        category: input.category,
        points: input.points,
        fixedBy: input.fixedBy,

        async run(ctx) {
          const found = await hasAny(ctx, input.paths);
          
          if (found) {
            return makeResult(check, "pass", `${found} found.`);
          }
          
          return makeResult(
            check,
            input.missingStatus ?? "fail",
            input.missingSummary,
            input.recommendation
          );
        }
    };
    
    return check
}

async function hasAny(ctx: RepoContext, paths: string[]): Promise<string | null> {
    for (const filePath of paths) {
        if (await ctx.has(filePath)) {
            return filePath;
        }
    }
    return null;
}

const readmeCheck = makeFileCheck({
    id: "readme",
    name: "README",
    category: "community",
    points: 15,
    paths: ["README.md", "readme.md", "README"],
    missingStatus: "fail",
    missingSummary: "No README file found.",
    recommendation: "Run repoready init-readme.",
    fixedBy: "readme"
});

/**
 * Distinctive phrases from each license's canonical text. GitHub matches the
 * whole document against the SPDX corpus; a phrase match is a cheap
 * approximation that is accurate enough to tell a real license from an empty
 * file, which is the failure this check exists to catch.
 *
 * Order matters: AGPL and LGPL name themselves before the plain GPL phrase
 * would match them.
 */
const LICENSE_SIGNATURES: [string, RegExp][] = [
    ["GNU Affero General Public License", /GNU AFFERO GENERAL PUBLIC LICENSE/i],
    ["GNU Lesser General Public License", /GNU LESSER GENERAL PUBLIC LICENSE/i],
    ["GNU General Public License", /GNU GENERAL PUBLIC LICENSE/i],
    ["Apache License 2.0", /Apache License,?\s+Version 2\.0/i],
    ["Mozilla Public License 2.0", /Mozilla Public License Version 2\.0/i],
    ["MIT License", /Permission is hereby granted, free of charge/i],
    ["ISC License", /Permission to use, copy, modify,? and\/or distribute this software/i],
    ["BSD License", /Redistribution and use in source and binary forms/i],
    ["The Unlicense", /This is free and unencumbered software released into the public domain/i],
    ["Creative Commons", /Creative Commons/i]
];

const licenseCheck: HealthCheck = {
    id: "license",
    name: "License",
    category: "community",
    points: 10,
    fixedBy: "license",

    async run(ctx) {
        const path = await hasAny(ctx, ["LICENSE", "LICENSE.md", "LICENSE.txt", "license.md", "COPYING"]);

        if (!path) {
            return makeResult(
                licenseCheck,
                "fail",
                "No license file found.",
                "Run repoready init-license."
            );
        }

        // A file's existence is not the point — an empty or unrecognised
        // LICENSE grants nothing, so the repo is still all-rights-reserved
        // and GitHub will not detect a license either.
        const text = (await ctx.readText(path)) ?? "";
        const match = LICENSE_SIGNATURES.find(([, pattern]) => pattern.test(text));

        if (match) {
            return makeResult(
                licenseCheck,
                "pass",
                `${path} contains the ${match[0]}.`,
                undefined,
                undefined,
                { license: match[0] }
            );
        }

        if (text.trim().length === 0) {
            return makeResult(
                licenseCheck,
                "fail",
                `${path} is empty, so the project is still all rights reserved.`,
                "Run repoready init-license --force to write a real license."
            );
        }

        return makeResult(
            licenseCheck,
            "warn",
            `${path} does not match a known open-source license.`,
            "Check the text is a full license. GitHub only detects licenses it can match."
        );
    }
};

const contributingCheck = makeFileCheck({
    id: "contributing",
    name: "Contributing Guide",
    category: "community",
    points: 10,
    paths: ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"],
    missingStatus: "fail",
    missingSummary: "No contributing guide found.",
    recommendation: "Run repoready init-contributing.",
    fixedBy: "contributing"
})

const codeOfConductCheck = makeFileCheck({
    id: "code-of-conduct",
    name: "Code of Conduct",
    category: "community",
    points: 5,
    paths: ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"],
    missingStatus: "warn",
    missingSummary: "No code of conduct found.",
    recommendation: "Run repoready init-code-of-conduct.",
    fixedBy: "code-of-conduct"
})

const issueTemplateCheck: HealthCheck = {
    id: "issue-template",
    name: "Issue Template",
    category: "community",
    points: 5,
    fixedBy: "issues",

    async run(ctx) {
        if (await ctx.has(".github/ISSUE_TEMPLATE.md")) {
            return makeResult(issueTemplateCheck, "pass", ".github/ISSUE_TEMPLATE.md found.");
        }

        // An empty ISSUE_TEMPLATE directory offers contributors nothing, so
        // the directory existing is not enough — it has to hold templates.
        const templates = (await ctx.listDir(".github/ISSUE_TEMPLATE")).filter(
            (entry) => entry.endsWith(".md") || entry.endsWith(".yml") || entry.endsWith(".yaml")
        );

        if (templates.length > 0) {
            return makeResult(
                issueTemplateCheck,
                "pass",
                `Found ${templates.length} issue template(s).`,
                undefined,
                undefined,
                { templates }
            );
        }

        if (await ctx.has(".github/ISSUE_TEMPLATE")) {
            return makeResult(
                issueTemplateCheck,
                "warn",
                ".github/ISSUE_TEMPLATE exists but contains no templates.",
                "Run repoready init-issues."
            );
        }

        return makeResult(
            issueTemplateCheck,
            "warn",
            "No issue template found.",
            "Run repoready init-issues."
        );
    }
};

const pullRequestCheck = makeFileCheck({
    id: "pr-template",
    name: "Pull Request Template",
    category: "community",
    points: 5,
    paths: [".github/PULL_REQUEST_TEMPLATE.md", "PULL_REQUEST_TEMPLATE.md"],
    missingStatus: "warn",
    missingSummary: "No pull request template found.",
    recommendation: "Run repoready init-pr-template.",
    fixedBy: "pr-template"
})

const ciWorkflowCheck: HealthCheck = {
    id: "ci",
    name: "CI Workflow",
    category: "automation",
    points: 15,
    fixedBy: "ci",

    async run(ctx) {
        const workflowFiles = await ctx.listDir(".github/workflows");
        const yamlWorkflows = workflowFiles.filter(
            (file) => file.endsWith(".yml") || file.endsWith(".yaml")
        );

        if (yamlWorkflows.length > 0) {
            return makeResult(
                ciWorkflowCheck,
                "pass",
                `Found ${yamlWorkflows.length} GitHub Actions workflow file(s).`,
                undefined,
                undefined,
                { workflows: yamlWorkflows }
            );
        }

        if (await ctx.has(".github/workflows")) {
            return makeResult(
                ciWorkflowCheck,
                "warn",
                "Workflow directory exists, but no .yml or .yaml workflow files were found.",
                "Add a workflow file such as .github/workflows/ci.yml."
            );
        }
        
        return makeResult(
            ciWorkflowCheck,
            "fail",
            "No GitHub Actions workflow directory found.",
            "Run repoready init-ci."
        );
    }
};

const envExampleCheck = makeFileCheck({
    id: "env-example",
    name: "Environment Example",
    category: "structure",
    points: 5,
    paths: [".env.example", ".env.sample"],
    missingStatus: "warn",
    missingSummary: "No environment example file found.",
    recommendation: "Add .env.example if the project uses environment variables."
})

const testsCheck: HealthCheck = {
    id: "tests",
    name: "Tests",
    category: "structure",
    points: 10,

    async run(ctx) {
        const testDir = await hasAny(ctx, ["test", "tests", "__tests__", "spec"]);

        if (testDir) {
            return makeResult(testsCheck, "pass", `${testDir} directory found.`)
        }

        if (ctx.projectTypes.includes("node")) {
            const pkg = await ctx.readJson<PackageJson>("package.json");
            const testScript = pkg?.scripts?.test;

            if (testScript && !/no test specified/i.test(testScript)) {
                return makeResult(
                    testsCheck,
                    "pass",
                    "package.json has a non-placeholder test script.",
                    undefined,
                    undefined,
                    { testScript }
                );
            }
            if (testScript) {
                return makeResult(
                    testsCheck,
                    "warn",
                    "package.json has a placeholder test script.",
                    "Replace the placeholder test script with a real test command."
                );
            }
        }
        
        return makeResult(
            testsCheck,
            "warn",
            "No test directory or test script found.",
            "Add a tests/ directory or a real test script to the dependency manifest."
        );
    }
};

const dependencyManifestCheck: HealthCheck = {
    id: "dependency-manifest",
    name: "Dependency Manifest",
    category: "dependencies",
    points: 10,

    async run(ctx) {
        const found = await hasAny(ctx, dependencyManifestPaths);

        if (found) {
            return makeResult(dependencyManifestCheck, "pass", `${found} found.`);
        }
        return makeResult(
                dependencyManifestCheck,
                "warn",
                "No dependency manifest found.",
                "If this repo contains code, add the appropriate dependency manifest."
            );
    }
};

const lockfileCheck: HealthCheck = {
    id: "lockfile",
    name: "Lockfile",
    category: "dependencies",
    points: 5,

    async shouldRun(ctx) {
        return Boolean(await hasAny(ctx, dependencyManifestPaths));
    },

    async run(ctx) {
        const lockfile = await hasAny(ctx, [
            "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock", "poetry.lock",
            "Pipfile.lock", "Cargo.lock", "composer.lock", "Gemfile.lock"
        ]);

        if (lockfile) {
            return makeResult(lockfileCheck, "pass", `${lockfile} found.`);
        }
        
        return makeResult(
            lockfileCheck,
            "warn",
            "No lockfile found.",
            "Commit a lockfile for reproducible installs when appropriate."
        );
    }
};

const gitignoreCheck: HealthCheck = {
    id: "gitignore",
    name: ".gitignore",
    category: "security",
    points: 5,

    async run(ctx) {
        if (!(await ctx.has(".gitignore"))) {
            return makeResult(
                gitignoreCheck,
                "warn",
                "No .gitignore file found.",
                "Add a .gitignore file to avoid committing local files, build outputs, and secrets."
            );
        }

        const raw = await ctx.readText(".gitignore");
        const lines = raw?.split(/\r?\n/).map((line) => line.trim()) ?? [];

        const ignoresEnv = lines.some((line) => {
            return (
                line === ".env" ||
                line === ".env.*" ||
                line === "*.env" ||
                line.startsWith(".env")
            );
        });

        if (ignoresEnv) {
            return makeResult(gitignoreCheck, "pass", ".gitignore found and appears to ignore .env files");
        }

        return makeResult(
            gitignoreCheck,
            "warn",
            ".gitignore found, but it does not appear to ignore .env files.",
            "Add .env and .env.* to .gitignore, while keeping .env.example committed."
        );
    }
};


export const defaultChecks: HealthCheck[] = [
    readmeCheck,
    licenseCheck,
    contributingCheck,
    codeOfConductCheck,
    issueTemplateCheck,
    pullRequestCheck,
    ciWorkflowCheck,
    envExampleCheck,
    testsCheck,
    dependencyManifestCheck,
    lockfileCheck,
    gitignoreCheck
];
