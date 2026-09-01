import { defaultChecks } from "./checks.js";
import { createRepoContext } from "./scan.js";
import { CategoryScore, CheckCategory, CheckResult, DoctorOptions, DoctorResult, HealthCheck } from "./types.js";

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
    const ctx = await createRepoContext(options.cwd, { adapters: options.adapters });

    const checksToRun: HealthCheck[] = [];

    const adapterChecks = ctx.detected.flatMap((entry) => entry.adapter.checks ?? []);
    const allChecks = [...defaultChecks, ...adapterChecks];

    for (const check of allChecks) {
        const enabledConfig = ctx.config.checks?.[check.id] !== false;
        if (!enabledConfig) continue;

        const shouldRun = check.shouldRun ? await check.shouldRun(ctx) : true;
        if (!shouldRun) continue;

        if (options.only?.length && !matchesAny(check, options.only)) continue;
        if (options.skip?.length && matchesAny(check, options.skip)) continue;

        checksToRun.push(check);
    }

    const results: CheckResult[] = [];

    for (const check of checksToRun) {
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

    const score = calculateScore(pointsEarned, pointsPossible);

    const suggestions = results
        .filter((check) => check.status != "pass")
        .map((check) => check.recommendation)
        .filter((value): value is string => Boolean(value));
    
    return {
        root: ctx.root,
        score,
        pointsEarned,
        pointsPossible,
        detectedProjectTypes: ctx.projectTypes,
        categoryScores: calculateCategoryScores(results),
        results,
        suggestions: Array.from(new Set(suggestions))
    };
}

function calculateScore(pointsEarned: number, pointsPossible: number): number {
    if (pointsPossible === 0) return 100;
    return Math.round((pointsEarned / pointsPossible) * 100);
}

function calculateCategoryScores(results: CheckResult[]): CategoryScore[] {
    const categories = new Map<CheckCategory, { pointsEarned: number; pointsPossible: number}>();

    for (const result of results) {
        const current = categories.get(result.category) ?? {
            pointsEarned: 0,
            pointsPossible: 0
        };

        current.pointsEarned += result.pointsEarned;
        current.pointsPossible += result.pointsPossible;

        categories.set(result.category, current);
    }

    return Array.from(categories.entries()).map(([category, points]) => ({
        category,
        pointsEarned: points.pointsEarned,
        pointsPossible: points.pointsPossible,
        score: calculateScore(points.pointsEarned, points.pointsPossible)
    }));
}

function matchesAny(check: HealthCheck, values: string[]): boolean {
    return values.some((value) => matches(check, value));
}

function matches(check: HealthCheck, value: string): boolean {
    const normalized = value.toLowerCase().trim();

    return (
        check.id.toLowerCase() === normalized ||
        check.category.toLowerCase() === normalized ||
        check.name.toLowerCase() === normalized
    );
}