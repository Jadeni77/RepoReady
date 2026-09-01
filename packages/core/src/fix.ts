import { defaultChecks } from "./checks.js";
import { runDoctor } from "./doctor.js";
import { defaultGenerators } from "./generators.js";
import { applyPlan, canPrompt, confirmApply, describeFiles, planGenerator } from "./generator-runner.js";
import { createRepoContext } from "./scan.js";
import type {
    FixFileResult,
    FixItem,
    FixOptions,
    FixResult,
    GeneratorOptions,
    HealthCheck,
    PlannedFile,
    RepoContext,
    RepoGenerator
} from "./types.js";

export type FixPlan = {
    root: string;
    scoreBefore: number;
    items: FixItem[];
};

/** Works out every available fix without writing anything. */
export async function planFix(options: FixOptions = {}): Promise<FixPlan> {
    const ctx = await createRepoContext(options.cwd, { adapters: options.adapters });
    const doctorResult = await runDoctor({ cwd: ctx.root, adapters: options.adapters });

    const generatorOptions: GeneratorOptions = {
        cwd: ctx.root,
        force: options.force,
        lang: options.lang ?? "auto",
        license: options.license,
        author: options.author,
        adapters: options.adapters
    };

    const items: FixItem[] = [];

    for (const check of doctorResult.results) {
        if (check.status === "pass") continue;

        const generatorId = findCheck(ctx, check.id)?.fixedBy;
        if (!generatorId) continue;

        const generator = findGenerator(ctx, generatorId);
        if (!generator) continue;

        const plan = await planGenerator(generator, generatorOptions, ctx);

        items.push({
            checkId: check.id,
            checkName: check.name,
            generatorId: generator.id,
            generatorName: generator.name,
            category: generator.category,
            safety: isSafe(plan.files) ? "safe" : "risky",
            files: plan.files
        });
    }

    return {
        root: ctx.root,
        scoreBefore: doctorResult.score,
        items
    };
}

export async function runFix(options: FixOptions = {}): Promise<FixResult> {
    const plan = await planFix(options);
    const selected = selectItems(plan.items, options);

    const base = {
        root: plan.root,
        scoreBefore: plan.scoreBefore,
        items: selected
    };

    if (options.dryRun) {
        return { ...base, dryRun: true, applied: [], cancelled: false };
    }

    const writable = selected.flatMap((item) =>
        item.files.filter((file) => file.action !== "skip")
    );

    if (writable.length === 0) {
        return { ...base, dryRun: false, applied: [], cancelled: false };
    }

    if (!options.yes && canPrompt()) {
        const approved = await confirmApply(describeFiles(writable));

        if (!approved) {
            return { ...base, dryRun: false, applied: [], cancelled: true };
        }
    }

    const applied: FixFileResult[] = [];

    for (const item of selected) {
        applied.push(
            ...(await applyPlan({
                id: item.generatorId,
                name: item.generatorName,
                category: item.category,
                files: item.files
            }))
        );
    }

    return { ...base, dryRun: false, applied, cancelled: false };
}

/**
 * With no explicit selection, only safe fixes run: `fix` must never clobber
 * a file the user already wrote just because a check scored it poorly.
 */
function selectItems(items: FixItem[], options: FixOptions): FixItem[] {
    if (options.select?.length) {
        const wanted = new Set(options.select.map((id) => id.toLowerCase()));
        return items.filter(
            (item) =>
                wanted.has(item.generatorId.toLowerCase()) ||
                wanted.has(item.checkId.toLowerCase())
        );
    }

    return items.filter((item) => item.safety === "safe");
}

function isSafe(files: PlannedFile[]): boolean {
    return files.length > 0 && files.every((file) => file.action === "create");
}

/** Finds a check definition by ID across core and every detected adapter. */
function findCheck(ctx: RepoContext, id: string): HealthCheck | undefined {
    return [
        ...defaultChecks,
        ...ctx.detected.flatMap((entry) => entry.adapter.checks ?? [])
    ].find((check) => check.id === id);
}

/** Finds a generator by ID across core and every detected adapter. */
function findGenerator(ctx: RepoContext, id: string): RepoGenerator | undefined {
    return [
        ...defaultGenerators,
        ...ctx.detected.flatMap((entry) => entry.adapter.generators ?? [])
    ].find((generator) => generator.id === id);
}
