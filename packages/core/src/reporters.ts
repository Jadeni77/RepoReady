import { CheckCategory, CheckResult, CheckStatus, DoctorResult } from "./types.js";

const CATEGORY_LABELS: Record<CheckCategory, string> = {
    community: "community",
    automation: "automation",
    dependencies: "dependencies",
    structure: "structure",
    security: "security"
};

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
    lines.push(`Detected: ${result.detectedProjectTypes.join(", ")}`);
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