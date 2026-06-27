import { defaultChecks } from "./checks.js";
import { createRepoContext } from "./scan.js";
import { CheckResult, DoctorOptions, DoctorResult } from "./types.js";

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
    const ctx = await createRepoContext(options.cwd);
    const enabledChecks = defaultChecks.filter((check) => {
        return ctx.config.checks?.[check.id] != false;
    });

    const results: CheckResult[] = [];

    for (const check of enabledChecks) {
        try {
            results.push(await check.run(ctx));
        } catch (error) {
            results.push({
                id: check.id,
                name: check.name,
                category: check.category,
                status: "fail",
                summary: `Check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                recommendation: "Report this as a RepoReady bug.",
                pointsEarned: 0,
                pointsPossible: check.points
            });
        }
    }

    const pointsEarned = results.reduce(
        (sum, check) => sum + check.pointsEarned, 0
    );

    const pointsPossible = results.reduce(
        (sum, check) => sum + check.pointsPossible, 0
    );

    const score = pointsPossible === 0 ? 100 : Math.round((pointsEarned / pointsPossible) * 100);

    const suggestions = results
        .filter((check) => check.status != "pass")
        .map((check) => check.recommendation)
        .filter((value): value is string => Boolean(value));
    
    return {
        root: ctx.root,
        score,
        detectedProjectTypes: ctx.projectTypes,
        results,
        suggestions: Array.from(new Set(suggestions))
    };
}