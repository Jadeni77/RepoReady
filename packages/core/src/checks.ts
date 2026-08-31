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
}): HealthCheck {
    const check: HealthCheck = {
        id: input.id,
        name: input.name,
        category: input.category,
        points: input.points,

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
    recommendation: "Run repoready init-readme."
});

const licenseCheck = makeFileCheck({
    id: "license",
    name: "License",
    category: "community",
    points: 10,
    paths: ["LICENSE", "LICENSE.md", "license.md"],
    missingStatus: "fail",
    missingSummary: "No license file found.",
    recommendation: "Run repoready init-license."
})

const contributingCheck = makeFileCheck({
    id: "contributing",
    name: "Contributing Guide",
    category: "community",
    points: 10,
    paths: ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"],
    missingStatus: "fail",
    missingSummary: "No contributing guide found.",
    recommendation: "Run repoready init-contributing."
})

const codeOfConductCheck = makeFileCheck({
    id: "code-of-conduct",
    name: "Code of Conduct",
    category: "community",
    points: 5,
    paths: ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"],
    missingStatus: "warn",
    missingSummary: "No code of conduct found.",
    recommendation: "Run repoready init-code-of-conduct."
})

const issueTemplateCheck = makeFileCheck({
    id: "issue-template",
    name: "Issue Template",
    category: "community",
    points: 5,
    paths: [".github/ISSUE_TEMPLATE.md", ".github/ISSUE_TEMPLATE"],
    missingStatus: "warn",
    missingSummary: "No issue template found.",
    recommendation: "Run repoready init-issues."
})

const pullRequestCheck = makeFileCheck({
    id: "pr-template",
    name: "Pull Request Template",
    category: "community",
    points: 5,
    paths: [".github/PULL_REQUEST_TEMPLATE.md", "PULL_REQUEST_TEMPLATE.md"],
    missingStatus: "warn",
    missingSummary: "No pull request template found.",
    recommendation: "Run repoready init-pr-template."
})

const ciWorkflowCheck: HealthCheck = {
    id: "ci",
    name: "CI Workflow",
    category: "automation",
    points: 15,

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
