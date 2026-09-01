import type { ProjectType, RepoContext, RepoGenerator } from "@repoready/core";

/**
 * Dependabot's ecosystem for GitHub Actions itself. Every repo with a
 * workflow benefits from it, and it is independent of the repo's language.
 */
const ACTIONS_ECOSYSTEM = "github-actions";

/**
 * release-please names its own release types, and they do not line up with
 * anything else in the system ("simple" has no language equivalent). The map
 * is tool vocabulary, so it lives with the tool's template rather than adding
 * another tool-specific field to LanguageAdapter.
 */
const RELEASE_PLEASE_TYPES: Partial<Record<ProjectType, string>> = {
    node: "node",
    typescript: "node",
    python: "python",
    go: "go",
    rust: "rust",
    java: "maven",
    ruby: "ruby",
    php: "php"
};

export const dependabotGenerator: RepoGenerator = {
    id: "dependabot",
    name: "Dependabot Generator",
    category: "dependencies",
    description: "Generate a .github/dependabot.yml config.",

    async generate(ctx) {
        return [
            {
                path: ".github/dependabot.yml",
                content: buildDependabot(collectEcosystems(ctx))
            }
        ];
    }
};

export const scorecardGenerator: RepoGenerator = {
    id: "scorecard",
    name: "OpenSSF Scorecard Generator",
    category: "security",
    description: "Generate an OpenSSF Scorecard workflow.",

    async generate() {
        return [
            {
                path: ".github/workflows/scorecard.yml",
                content: buildScorecardWorkflow()
            }
        ];
    }
};

export const releaseGenerator: RepoGenerator = {
    id: "release",
    name: "Release Generator",
    category: "automation",
    description: "Generate a release-please workflow and config.",

    async generate(ctx) {
        const releaseType = resolveReleaseType(ctx);

        return [
            {
                path: ".github/workflows/release-please.yml",
                content: buildReleasePleaseWorkflow()
            },
            {
                path: "release-please-config.json",
                content: buildReleasePleaseConfig(releaseType)
            },
            {
                path: ".release-please-manifest.json",
                content: "{\n    \".\": \"0.0.0\"\n}\n"
            }
        ];
    }
};

/**
 * Every detected language's ecosystem, deduplicated — a TypeScript repo
 * matches both the typescript and node adapters and must not get "npm" twice.
 * github-actions is always included and always last.
 */
function collectEcosystems(ctx: RepoContext): string[] {
    const ecosystems = new Set<string>();

    for (const entry of ctx.detected) {
        if (entry.adapter.dependabotEcosystem) {
            ecosystems.add(entry.adapter.dependabotEcosystem);
        }
    }

    return [...ecosystems, ACTIONS_ECOSYSTEM];
}

function resolveReleaseType(ctx: RepoContext): string {
    for (const entry of ctx.detected) {
        const type = entry.adapter.projectType
            ? RELEASE_PLEASE_TYPES[entry.adapter.projectType]
            : undefined;

        if (type) return type;
    }

    return "simple";
}

function buildDependabot(ecosystems: string[]): string {
    const updates = ecosystems
        .map(
            (ecosystem) => `  - package-ecosystem: "${ecosystem}"
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
`
        )
        .join("\n");

    return `version: 2

updates:
${updates}`;
}

function buildScorecardWorkflow(): string {
    return `name: Scorecard

on:
  branch_protection_rule:
  schedule:
    - cron: "0 6 * * 1"
  push:
    branches: [main]

permissions: read-all

jobs:
  analysis:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write
      contents: read
      actions: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Run analysis
        uses: ossf/scorecard-action@v2.4.0
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: SARIF file
          path: results.sarif
          retention-days: 5

      - name: Upload to code scanning
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
`;
}

function buildReleasePleaseWorkflow(): string {
    return `name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest

    steps:
      - name: Run release-please
        uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
`;
}

function buildReleasePleaseConfig(releaseType: string): string {
    return `{
    "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
    "packages": {
        ".": {
            "release-type": "${releaseType}",
            "changelog-path": "CHANGELOG.md"
        }
    }
}
`;
}

export const securityGenerator: RepoGenerator = {
    id: "security",
    name: "Security Policy Generator",
    category: "security",
    description: "Generate a SECURITY.md file.",

    async generate() {
        return [{ path: "SECURITY.md", content: buildSecurityPolicy() }];
    }
};

function buildSecurityPolicy(): string {
    return `# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| latest | ✅ |

## Reporting a Vulnerability

Please do not report security vulnerabilities through public issues.

Report them privately to [INSERT CONTACT METHOD]. Include:

- A description of the vulnerability.
- Steps to reproduce it.
- The affected version.
- Any potential impact you have identified.

You can expect an acknowledgement within a few days, and an update on the
fix timeline once the report has been triaged.

## Disclosure

We will coordinate disclosure with you once a fix is available.
`;
}
