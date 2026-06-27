import type { CheckCategory, CheckResult, CheckStatus, HealthCheck, RepoContext } from "./types.js";

// Schema Check
function result(input: {
    id: string;
    name: string;
    category: CheckCategory;
    status: CheckStatus;
    summary: string;
    recommendation?: string;
    pointsEarned: number;
    pointsPossible: number;
}): CheckResult {
    return input;
}

async function hasAny(ctx: RepoContext, paths: string[]): Promise<string | null> {
    for (const filePath of paths) {
        if (await ctx.has(filePath)) {
            return filePath;
        }
    }
    return null;
}

export const defaultChecks: HealthCheck[] = [
    {
        id: "readme",
        name: "README",
        category: "community",
        points: 15,
        async run(ctx) {
            const found = await hasAny(ctx, ["README.md", "readme.md"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "fail",
                summary: `No README file found.`,
                pointsEarned: 0,
                pointsPossible: this.points
            });
        }
    },

    {
        id: "license",
        name: "License",
        category: "community",
        points: 10,
        async run(ctx) {
            const found = await hasAny(ctx, ["LICENSE", "LICENSE.md", "license.md"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "fail",
                summary: `No license file found`,
                recommendation: "Run repoready init-license.",
                pointsEarned: 0,
                pointsPossible: this.points
            });

        }
    },

    {
        id: "contributing",
        name: "Contributing Guide",
        category: "community",
        points: 10,
        async run(ctx) {
            const found = await hasAny(ctx, ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "fail",
                summary: `No contributing file found.`,
                recommendation: "Run repoready init-contributing.",
                pointsEarned: 0,
                pointsPossible: this.points
            });

        }
    },

    {
        id: "code-of-conduct",
        name: "Code of Conduct",
        category: "community",
        points: 5,
        async run(ctx) {
            const found = await hasAny(ctx, ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "warn",
                summary: `No code of conduct found.`,
                recommendation: "Run repoready init-code-of-conduct.",
                pointsEarned: Math.floor(this.points / 2),
                pointsPossible: this.points
            });

        }
    },

    {
        id: "ci",
        name: "CI Workflow",
        category: "automation",
        points: 15,
        async run(ctx) {
            if (await ctx.has(".github/workflows")) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `Github Actions workflow directory found.`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "fail",
                summary: `No Github Actions workflow directory found.`,
                recommendation: "Run repoready init-ci.",
                pointsEarned: 0,
                pointsPossible: this.points
            });
        }
    },

    {
        id: "issue-template",
        name: "Issue Template",
        category: "community",
        points: 5,
        async run(ctx) {
            const found = await hasAny(ctx, [".github/ISSUE_TEMPLATE.md", ".github/ISSUE_TEMPLATE"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "warn",
                summary: `No issue template found.`,
                recommendation: "Run repoready init-issue.",
                pointsEarned: Math.floor(this.points / 2),
                pointsPossible: this.points
            });

        }
    },
    
    {
        id: "pr-template",
        name: "Pull Request Template",
        category: "community",
        points: 5,
        async run(ctx) {
            const found = await hasAny(ctx, [".github/PULL_REQUEST_TEMPLATE.md", "PULL_REQUEST_TEMPLATE.md"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "warn",
                summary: `No pull request template found.`,
                recommendation: "Run repoready init-pr-templatet.",
                pointsEarned: Math.floor(this.points / 2),
                pointsPossible: this.points
            });

        }
    },

    {
        id: "env-example",
        name: "Environment Example",
        category: "structure",
        points: 5,
        async run(ctx) {
            const found = await hasAny(ctx, [".env.example", ".env.sample"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "warn",
                summary: `No environment example file found.`,
                recommendation: "Add .env.example if the project uses environment variables.",
                pointsEarned: Math.floor(this.points / 2),
                pointsPossible: this.points
            });

        }
    },
    
    {
        id: "tests",
        name: "Tests",
        category: "structure",
        points: 10,
        async run(ctx) {
            const found = await hasAny(ctx, ["test", "tests", "__tests__", "spec"]);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} directory found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "warn",
                summary: `No test directory found.`,
                recommendation: "Add tests or run repoready generate-tests.",
                pointsEarned: Math.floor(this.points / 2),
                pointsPossible: this.points
            });

        }
    },

    {
        id: "dependency-manifest",
        name: "Dependency Manifest",
        category: "dependencies",
        points: 10,
        async run(ctx) {
            const manifests = ["package.json", "pyproject.toml", 
                "requirements.txt", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Gemfile", "composer.json"]
            
            const found = await hasAny(ctx, manifests);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "warn",
                summary: `No dependency manifest found.`,
                recommendation: "This may be fine for docs-only repos.",
                pointsEarned: Math.floor(this.points / 2),
                pointsPossible: this.points
            });

        }
    },

    {
        id: "lockfile",
        name: "Lock File",
        category: "dependencies",
        points: 5,
        async run(ctx) {
            const lockfiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock", "poetry.lock",
                "Pipfile.lock", "Cargo.lock", "composer.lock", "Gemfile.lock"
            ];
            
            const found = await hasAny(ctx, lockfiles);

            if (found) {
                return result({
                    id: this.id,
                    name: this.name,
                    category: this.category,
                    status: "pass",
                    summary: `${found} found`,
                    pointsEarned: this.points,
                    pointsPossible: this.points
                });
            }
            return result({
                id: this.id,
                name: this.name,
                category: this.category,
                status: "warn",
                summary: `No lockfile found.`,
                recommendation: "Commit a lockfile for reproducible installs when appropriate.",
                pointsEarned: Math.floor(this.points / 2),
                pointsPossible: this.points
            });
        }
    }
];