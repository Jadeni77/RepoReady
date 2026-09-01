import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fromRoot, pathExists } from "./fs.js";
import { createRepoContext } from "./scan.js";
import {
    GeneratorFileResult,
    GeneratorOptions,
    GeneratorPlan,
    GeneratorResult,
    PlannedFile,
    RepoContext,
    RepoGenerator
} from "./types.js";

const SKIP_EXISTS_REASON = "File already exists. Use --force to overwrite.";
const DECLINED_REASON = "User declined the change.";

/**
 * Works out what a generator would write without touching disk. `fix` uses
 * this to plan every generator up front so it can confirm the whole change
 * set once instead of prompting per file.
 */
export async function planGenerator(
    generator: RepoGenerator,
    options: GeneratorOptions = {},
    context?: RepoContext
): Promise<GeneratorPlan> {
    const ctx = context ?? (await createRepoContext(options.cwd, { adapters: options.adapters }));
    const files = await generator.generate(ctx, options);

    const planned: PlannedFile[] = [];

    for (const file of files) {
        const fullPath = fromRoot(ctx.root, file.path);
        const existed = await pathExists(fullPath);

        if (existed && !options.force) {
            planned.push({
                path: file.path,
                fullPath,
                content: file.content,
                action: "skip",
                existed,
                reason: SKIP_EXISTS_REASON
            });
            continue;
        }

        planned.push({
            path: file.path,
            fullPath,
            content: file.content,
            action: existed ? "overwrite" : "create",
            existed
        });
    }

    return {
        id: generator.id,
        name: generator.name,
        category: generator.category,
        files: planned
    };
}

/** Writes the files a plan marked create/overwrite. Skips are passed through. */
export async function applyPlan(plan: GeneratorPlan): Promise<GeneratorFileResult[]> {
    const results: GeneratorFileResult[] = [];

    for (const file of plan.files) {
        if (file.action === "skip") {
            results.push(toFileResult(file));
            continue;
        }

        await mkdir(path.dirname(file.fullPath), { recursive: true });
        await writeFile(file.fullPath, file.content, "utf8");

        results.push(toFileResult(file));
    }

    return results;
}

export async function runGenerator(
    generator: RepoGenerator,
    options: GeneratorOptions = {}
): Promise<GeneratorResult> {
    const ctx = await createRepoContext(options.cwd, { adapters: options.adapters });
    const plan = await planGenerator(generator, options, ctx);

    const base = {
        id: plan.id,
        name: plan.name,
        category: plan.category
    };

    if (options.dryRun) {
        return {
            ...base,
            dryRun: true,
            // Dry runs are the preview, so they always carry the content.
            files: plan.files.map((file) => ({ ...toFileResult(file), content: file.content }))
        };
    }

    const writable = plan.files.filter((file) => file.action !== "skip");

    if (writable.length > 0 && !options.yes && canPrompt()) {
        const approved = await confirmApply(describeFiles(writable));

        if (!approved) {
            return {
                ...base,
                dryRun: false,
                files: plan.files.map((file) => ({
                    ...toFileResult(file),
                    action: "skip" as const,
                    reason: file.reason ?? DECLINED_REASON
                }))
            };
        }
    }

    return {
        ...base,
        dryRun: false,
        files: await applyPlan(plan)
    };
}

function toFileResult(file: PlannedFile): GeneratorFileResult {
    return {
        path: file.path,
        action: file.action,
        existed: file.existed,
        reason: file.reason
    };
}

export function describeFiles(files: PlannedFile[]): string {
    return files
        .map((file) => `  ${file.action === "overwrite" ? "overwrite" : "create   "} ${file.path}`)
        .join("\n");
}

/** False in pipes and CI, where there is nobody to answer the question. */
export function canPrompt(): boolean {
    return Boolean(stdin.isTTY && stdout.isTTY);
}

export async function confirmApply(preview: string): Promise<boolean> {
    const rl = createInterface({ input: stdin, output: stdout });

    try {
        stdout.write(`\nRepoReady will write:\n${preview}\n\n`);
        const answer = await rl.question("Apply these changes? (y/N) ");
        return ["y", "yes"].includes(answer.trim().toLowerCase());
    } finally {
        rl.close();
    }
}
