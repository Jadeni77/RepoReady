import { runDoctor } from "./doctor.js";
import { getGenerator } from "./generators.js";
import { applyPlan, canPrompt, confirmApply, describeFiles, planGenerator } from "./generator-runner.js";
import { createRepoContext } from "./scan.js";
import type {
    FixFileResult,
    FixItem,
    FixOptions,
    FixResult,
    GeneratorOptions,
    PlannedFile
} from "./types.js";

/**
 * Which generator repairs which failing check. Checks with no entry here
 * (tests, lockfile, dependency manifest) need human judgement, so `fix`
 * reports them via `doctor` rather than guessing.
 */
const CHECK_TO_GENERATOR: Record<string, string> = {
    "readme": "readme",
    "license": "license",
    "contributing": "contributing",
    "code-of-conduct": "code-of-conduct",
    "issue-template": "issues",
    "pr-template": "pr-template",
    "ci": "ci"
};

export type FixPlan = {
    root: string;
    scoreBefore: number;
    items: FixItem[];
};

/** Works out every available fix without writing anything. */
export async function planFix(options: FixOptions = {}): Promise<FixPlan> {
    const ctx = await createRepoContext(options.cwd);
    const doctorResult = await runDoctor({ cwd: ctx.root });

    const generatorOptions: GeneratorOptions = {
        cwd: ctx.root,
        force: options.force,
        lang: options.lang ?? "auto",
        license: options.license,
        author: options.author
    };

    const items: FixItem[] = [];

    for (const check of doctorResult.results) {
        if (check.status === "pass") continue;

        const generatorId = CHECK_TO_GENERATOR[check.id];
        if (!generatorId) continue;

        const generator = getGenerator(generatorId);
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
