import { resolvePrimaryAdapter } from "./adapters.js";
import { genericAdapter } from "./builtin-adapters.js";
import { buildLicense } from "./licenses.js";
import { readGitUserName } from "./fs.js";
import { GeneratorOptions, ProjectType, RepoContext, RepoGenerator } from "./types.js";

type PackageJson = {
    name?: string;
    description?: string;
    author?: string | { name?: string; email?: string };
    scripts?: Record<string, string>;
};

const README_PATTERN = /^readme(\.(md|mdx|rst|txt))?$/i;

/**
 * Returns the README's actual on-disk name. Probing fixed candidates instead
 * would report "README.md" for a repo containing "readme.md" — harmless on
 * macOS, but on Linux it creates a second, competing README.
 */
async function findExistingReadme(ctx: RepoContext): Promise<string | null> {
    const matches = (await ctx.listDir("."))
        .filter((entry) => README_PATTERN.test(entry))
        .sort();

    return matches.find((entry) => entry === "README.md") ?? matches[0] ?? null;
}

export const readmeGenerator: RepoGenerator = {
    id: "readme",
    name: "README Generator",
    category: "community",
    description: "Generate a starter README.md file.",

    async generate(ctx, options) {
        const projectName = await detectProjectName(ctx);
        const description = await detectProjectDescription(ctx);
        const commands = primaryCommands(ctx);

        const outputPath =
            options.targetPath ??
            (await findExistingReadme(ctx)) ??
            "README.md";

        return [
            {
                path: outputPath,
                content: buildReadme({
                    projectName,
                    description,
                    install: commands.install,
                    test: commands.test,
                    projectTypes: ctx.projectTypes
                })
            }
        ];
    }
};

export const contributingGenerator: RepoGenerator = {
    id: "contributing",
    name: "Contributing Guide Generator",
    category: "community",
    description: "Generate a CONTRIBUTING.md file.",

    async generate(ctx) {
        return [
            {
                path: "CONTRIBUTING.md",
                content: buildContributing(primaryCommands(ctx))
            }
        ];
    }
};

export const licenseGenerator: RepoGenerator = {
    id: "license",
    name: "License Generator",
    category: "community",
    description: "Generate a LICENSE file.",

    async generate(ctx, options) {
        const license = options.license ?? ctx.config.license ?? "mit";
        const author = await detectAuthor(ctx, options);

        return [
            {
                path: "LICENSE",
                content: buildLicense({
                    license,
                    year: new Date().getFullYear(),
                    author
                })
            }
        ];
    }
};

export const codeOfConductGenerator: RepoGenerator = {
    id: "code-of-conduct",
    name: "Code of Conduct Generator",
    category: "community",
    description: "Generate a CODE_OF_CONDUCT.md file (Contributor Covenant 2.1).",

    async generate() {
        return [
            {
                path: "CODE_OF_CONDUCT.md",
                content: buildCodeOfConduct()
            }
        ];
    }
};

export const issueTemplateGenerator: RepoGenerator = {
    id: "issues",
    name: "Issue Template Generator",
    category: "community",
    description: "Generate GitHub issue templates.",

    async generate() {
        return [
            {
                path: ".github/ISSUE_TEMPLATE/bug_report.md",
                content: buildBugReportTemplate()
            },
            {
                path: ".github/ISSUE_TEMPLATE/feature_request.md",
                content: buildFeatureRequestTemplate()
            }
        ];
    }
};

export const pullRequestTemplateGenerator: RepoGenerator = {
    id: "pr-template",
    name: "Pull Request Template Generator",
    category: "community",
    description: "Generate a GitHub pull request template.",

    async generate() {
        return [
            {
                path: ".github/PULL_REQUEST_TEMPLATE.md",
                content: buildPullRequestTemplate()
            }
        ];
    }
};

export const ciGenerator: RepoGenerator = {
    id: "ci",
    name: "CI Generator",
    category: "automation",
    description: "Generate a GitHub Actions CI workflow.",

    async generate(ctx, options) {
        const adapter = resolvePrimaryAdapter(ctx.adapters, ctx.detected, options.lang ?? "auto");
        const ciSteps = adapter?.ciSteps ?? genericAdapter.ciSteps!;

        return [
            {
                path: ".github/workflows/ci.yml",
                content: buildCiWorkflow(ciSteps)
            }
        ];
    }
};

export const defaultGenerators: RepoGenerator[] = [
    readmeGenerator,
    licenseGenerator,
    contributingGenerator,
    codeOfConductGenerator,
    issueTemplateGenerator,
    pullRequestTemplateGenerator,
    ciGenerator
];

export function getGenerator(id: string): RepoGenerator | null {
    return (
        defaultGenerators.find((generator) => generator.id === id) ??
        null
    );
}

async function detectProjectName(ctx: RepoContext): Promise<string> {
    if (ctx.projectTypes.includes("node")) {
        const pkg = await ctx.readJson<PackageJson>("package.json");
        if (pkg?.name) return pkg.name;
    }

    const parts = ctx.root.split(/[\\/]/);
    return parts.at(-1) || "my-project";
}

async function detectProjectDescription(ctx: RepoContext): Promise<string> {
    if (ctx.projectTypes.includes("node")) {
        const pkg = await ctx.readJson<PackageJson>("package.json");
        if (pkg?.description) return pkg.description;
    }

    return "A project made ready with RepoReady.";
}

async function detectAuthor(ctx: RepoContext, options: GeneratorOptions): Promise<string> {
    if (options.author) return options.author;
    if (ctx.config.author) return ctx.config.author;

    if (ctx.projectTypes.includes("node")) {
        const pkg = await ctx.readJson<PackageJson>("package.json");
        const author = pkg?.author;

        if (typeof author === "string" && author.trim()) {
            // package.json allows "Name <email> (url)"; the license only wants the name.
            return author.replace(/\s*[<(].*$/, "").trim() || author.trim();
        }
        if (author && typeof author === "object" && author.name) {
            return author.name;
        }
    }

    return (await readGitUserName(ctx.root)) ?? (await detectProjectName(ctx));
}

/** Shell snippets shown in generated docs, keyed by the repo's primary language. */
function primaryCommands(ctx: RepoContext): { install: string; test: string } {
    const adapter = resolvePrimaryAdapter(ctx.adapters, ctx.detected, "auto");

    return {
        install: adapter?.installCommand ?? genericAdapter.installCommand!,
        test: adapter?.testCommand ?? genericAdapter.testCommand!
    };
}

function buildReadme(input: {
    projectName: string;
    description: string;
    install: string;
    test: string;
    projectTypes: ProjectType[];
}): string {
    return `# ${input.projectName}

${input.description}

## Overview

This repository is maintained with readability, contribution quality, and
project health in mind.

Detected project type: \`${input.projectTypes.join(", ")}\`

## Getting started

Clone the repository:

\`\`\`bash
git clone <repository-url>
cd ${input.projectName}
\`\`\`

Install dependencies:

\`\`\`bash
${input.install}
\`\`\`

## Usage

Add usage instructions here.

## Development

Run the test suite before submitting changes.

\`\`\`bash
${input.test}
\`\`\`

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

See [LICENSE](./LICENSE).
`;
}

function buildContributing(commands: { install: string; test: string }): string {
    return `# Contributing

Thanks for your interest in contributing.

## Getting started

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Add or update tests when appropriate.
5. Open a pull request.

## Development workflow

Install dependencies:

\`\`\`bash
${commands.install}
\`\`\`

Before submitting a pull request, run the project checks locally:

\`\`\`bash
${commands.test}
\`\`\`

## Pull request guidelines

Include:

- A clear summary of the change.
- Any relevant issue links.
- Notes about testing.
- Screenshots or examples when helpful.

## Reporting issues

When opening an issue, include:

- What happened.
- What you expected to happen.
- Steps to reproduce.
- Your environment, if relevant.

## Code of conduct

Please be respectful and constructive in all project discussions. See
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
`;
}

function buildBugReportTemplate(): string {
    return `---
name: Bug report
about: Report something that is not working as expected
title: ""
labels: bug
assignees: ""
---

## What happened

A clear description of the bug.

## What you expected to happen

A clear description of the expected behavior.

## Steps to reproduce

1.
2.
3.

## Environment

- OS:
- Version:
- Relevant tool versions:

## Additional context

Logs, screenshots, or anything else that helps.
`;
}

function buildFeatureRequestTemplate(): string {
    return `---
name: Feature request
about: Suggest an idea for this project
title: ""
labels: enhancement
assignees: ""
---

## Problem

What problem does this solve? Describe the situation you ran into.

## Proposed solution

What would you like to happen?

## Alternatives considered

Other approaches you thought about, and why they fall short.

## Additional context

Anything else worth knowing.
`;
}

function buildPullRequestTemplate(): string {
    return `## Summary

Describe what this change does and why.

## Related issues

Closes #

## Changes

-
-

## Testing

Describe how you verified this change.

\`\`\`bash
# Commands you ran
\`\`\`

## Checklist

- [ ] Tests added or updated
- [ ] Documentation updated
- [ ] Changes verified locally
`;
}

function buildCodeOfConduct(): string {
    return `# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, caste, color, religion, or sexual
identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment for our
community include:

- Demonstrating empathy and kindness toward other people
- Being respectful of differing opinions, viewpoints, and experiences
- Giving and gracefully accepting constructive feedback
- Accepting responsibility and apologizing to those affected by our mistakes,
  and learning from the experience
- Focusing on what is best not just for us as individuals, but for the overall
  community

Examples of unacceptable behavior include:

- The use of sexualized language or imagery, and sexual attention or advances of
  any kind
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information, such as a physical or email address,
  without their explicit permission
- Other conduct which could reasonably be considered inappropriate in a
  professional setting

## Enforcement Responsibilities

Community leaders are responsible for clarifying and enforcing our standards of
acceptable behavior and will take appropriate and fair corrective action in
response to any behavior that they deem inappropriate, threatening, offensive,
or harmful.

Community leaders have the right and responsibility to remove, edit, or reject
comments, commits, code, wiki edits, issues, and other contributions that are
not aligned to this Code of Conduct, and will communicate reasons for moderation
decisions when appropriate.

## Scope

This Code of Conduct applies within all community spaces, and also applies when
an individual is officially representing the community in public spaces.
Examples of representing our community include using an official email address,
posting via an official social media account, or acting as an appointed
representative at an online or offline event.

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported to the community leaders responsible for enforcement at
[INSERT CONTACT METHOD]. All complaints will be reviewed and investigated
promptly and fairly.

All community leaders are obligated to respect the privacy and security of the
reporter of any incident.

## Enforcement Guidelines

Community leaders will follow these Community Impact Guidelines in determining
the consequences for any action they deem in violation of this Code of Conduct:

### 1. Correction

**Community Impact**: Use of inappropriate language or other behavior deemed
unprofessional or unwelcome in the community.

**Consequence**: A private, written warning from community leaders, providing
clarity around the nature of the violation and an explanation of why the
behavior was inappropriate. A public apology may be requested.

### 2. Warning

**Community Impact**: A violation through a single incident or series of
actions.

**Consequence**: A warning with consequences for continued behavior. No
interaction with the people involved, including unsolicited interaction with
those enforcing the Code of Conduct, for a specified period of time. This
includes avoiding interactions in community spaces as well as external channels
like social media. Violating these terms may lead to a temporary or permanent
ban.

### 3. Temporary Ban

**Community Impact**: A serious violation of community standards, including
sustained inappropriate behavior.

**Consequence**: A temporary ban from any sort of interaction or public
communication with the community for a specified period of time. No public or
private interaction with the people involved, including unsolicited interaction
with those enforcing the Code of Conduct, is allowed during this period.
Violating these terms may lead to a permanent ban.

### 4. Permanent Ban

**Community Impact**: Demonstrating a pattern of violation of community
standards, including sustained inappropriate behavior, harassment of an
individual, or aggression toward or disparagement of classes of individuals.

**Consequence**: A permanent ban from any sort of public interaction within the
community.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage],
version 2.1, available at
https://www.contributor-covenant.org/version/2/1/code_of_conduct.html.

Community Impact Guidelines were inspired by
[Mozilla's code of conduct enforcement ladder][mozilla].

For answers to common questions about this code of conduct, see the FAQ at
https://www.contributor-covenant.org/faq. Translations are available at
https://www.contributor-covenant.org/translations.

[homepage]: https://www.contributor-covenant.org
[mozilla]: https://github.com/mozilla/inclusion
`;
}

function buildCiWorkflow(ciSteps: string): string {
    return `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

${ciSteps}`;
}
