import {
    CheckCategory,
    CheckResult,
    CheckStatus,
    DepCheckResult,
    DepIssueLevel,
    DoctorResult,
    FixItem,
    FixResult,
    GeneratorResult,
    ProjectType
} from "./types.js";

const CATEGORY_LABELS: Record<CheckCategory, string> = {
    community: "Community",
    automation: "Automation",
    dependencies: "Dependencies",
    structure: "Structure",
    security: "Security"
};

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
    node: "Node",
    typescript: "TypeScript",
    python: "Python",
    go: "Go",
    rust: "Rust",
    java: "Java",
    ruby: "Ruby",
    php: "PHP",
    generic: "Generic"
};

export function formatProjectTypes(projectTypes: ProjectType[]): string {
    return projectTypes.map((type) => PROJECT_TYPE_LABELS[type] ?? type).join(", ");
}

const STATUS_ICON: Record<CheckStatus, string> = {
    pass: "✅",
    warn: "⚠️",
    fail: "❌"
};

export function formatDoctorJson(result: DoctorResult): string {
    return JSON.stringify(result, null, 2);
}

export function formatDoctorText(result: DoctorResult): string {
    const lines: string[] = [];

    lines.push(`RepoReady Score: ${result.score}/100`);
    lines.push(`Points: ${result.pointsEarned}/${result.pointsPossible}`);
    lines.push(`Root: ${result.root}`);
    lines.push(`Detected project type: ${formatProjectTypes(result.detectedProjectTypes)}`);
    lines.push("");

    lines.push("Category Scores:");
    for (const categoryScore of result.categoryScores) {
        const label = CATEGORY_LABELS[categoryScore.category];
        lines.push(
            `   ${label}: ${categoryScore.score}/100 (${categoryScore.pointsEarned}/${categoryScore.pointsPossible})`
        );
    }

    lines.push("");

    const grouped = groupByCategory(result.results);

    for (const [category, checks] of Object.entries(grouped)) {
        lines.push(CATEGORY_LABELS[category as CheckCategory] ?? category);

        for (const check of checks) {
            lines.push(
                `   ${STATUS_ICON[check.status]} ${check.name}: ${check.summary}`
            );
        }
        lines.push("");
    }
    if (result.suggestions.length > 0) {
        lines.push("Suggested fixes:");
        result.suggestions.forEach((suggestion, index) => {
            lines.push(`    ${index + 1}. ${suggestion}`);
        });
    } else {
        lines.push("No suggested fixes. Nice work.");
    }

    return lines.join("\n");
}

function groupByCategory(results: CheckResult[]): Partial<Record<CheckCategory, CheckResult[]>> {
    return results.reduce<Partial<Record<CheckCategory, CheckResult[]>>>(
        (acc, result) => {
            acc[result.category] ??= [];
            acc[result.category]?.push(result);
            return acc;
        },
        {}
    );
}

export function formatGeneratorText(result: GeneratorResult): string {
    const lines: string[] = [];

    lines.push(`${result.name}`);
    lines.push(`Category: ${CATEGORY_LABELS[result.category] ?? result.category}`);
    lines.push(`Mode: ${result.dryRun ? "dry-run" : "write"}`);
    lines.push("");

    for (const file of result.files) {
        const icon =
            file.action === "create" ? "✅" : file.action === "overwrite" ? "⚠️" : "▶️";

        lines.push(`${icon} ${file.action.toUpperCase()}: ${file.path}`);

        if (file.reason) {
            lines.push(`    ${file.reason}`);
        }

        if (result.dryRun && file.content) {
            lines.push("");
            lines.push(`--- ${file.path} ---`);
            lines.push(file.content.trimEnd());
            lines.push(`--- end ${file.path} ---`);
            lines.push("");
        }
    }

    return lines.join("\n");
}

export function formatGeneratorJson(result: GeneratorResult): string {
    return JSON.stringify(result, null, 2);
}

const DEP_ISSUE_ICON: Record<DepIssueLevel, string> = {
    info: "ℹ️",
    warn: "⚠️",
    fail: "❌"
};

export function formatDepCheckJson(result: DepCheckResult): string {
    return JSON.stringify(result, null, 2);
}

export function formatDepCheckText(result: DepCheckResult): string {
    const lines: string[] = [];

    lines.push("Dependency Check");
    lines.push(`Root: ${result.root}`);
    lines.push(`Detected project type: ${formatProjectTypes(result.detectedProjectTypes)}`);
    lines.push("");

    lines.push(`Manifests: ${result.manifests.join(", ") || "none"}`);
    lines.push(`Lockfiles: ${result.lockfiles.join(", ") || "none"}`);
    lines.push(`Update tooling: ${result.updateTools.join(", ") || "none"}`);
    lines.push(`Declared dependencies: ${result.dependencyCount}`);
    lines.push("");

    if (result.issues.length > 0) {
        lines.push("Issues:");
        for (const issue of result.issues) {
            lines.push(`   ${DEP_ISSUE_ICON[issue.level]} ${issue.summary}`);
            if (issue.recommendation) {
                lines.push(`      ${issue.recommendation}`);
            }
        }
    } else {
        lines.push("✅ No dependency issues found.");
    }

    if (result.nextCommands.length > 0) {
        lines.push("");
        lines.push("Run next:");
        for (const command of result.nextCommands) {
            lines.push(`   ${command}`);
        }
    }

    return lines.join("\n");
}

export function formatFixJson(result: FixResult): string {
    return JSON.stringify(result, null, 2);
}

export function formatFixText(result: FixResult): string {
    const lines: string[] = [];

    if (result.items.length === 0) {
        return "RepoReady found no fixes to apply. Run repoready doctor for the full report.";
    }

    lines.push(`RepoReady found ${result.items.length} recommended fix(es):`);
    lines.push("");

    result.items.forEach((item, index) => {
        lines.push(`${index + 1}. ${describeFixItem(item)}`);
        for (const file of item.files) {
            lines.push(`      ${file.action.padEnd(9)} ${file.path}`);
            if (file.reason) {
                lines.push(`      ${" ".repeat(9)} ${file.reason}`);
            }
        }
    });

    lines.push("");

    if (result.dryRun) {
        lines.push("Mode: dry-run. Nothing was written.");
        lines.push("Run repoready fix --yes to apply, or repoready fix --interactive to choose.");
        return lines.join("\n");
    }

    if (result.cancelled) {
        lines.push("Cancelled. Nothing was written.");
        return lines.join("\n");
    }

    const written = result.applied.filter((file) => file.action !== "skip");

    if (written.length === 0) {
        lines.push("Nothing was written.");
    } else {
        lines.push(`Applied ${written.length} file(s):`);
        for (const file of written) {
            lines.push(`   ✅ ${file.action.toUpperCase()}: ${file.path}`);
        }
        lines.push("");
        lines.push("Run repoready doctor to see the updated score.");
    }

    return lines.join("\n");
}

function describeFixItem(item: FixItem): string {
    const label = `${item.checkName} (${item.generatorId})`;
    return item.safety === "risky" ? `${label} — needs --force` : label;
}