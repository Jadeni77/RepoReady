import {
    canPrompt,
    formatFixJson,
    formatFixText,
    LicenseId,
    planFix,
    ProjectType,
    runFix,
    type FixItem,
    type FixOptions
} from "@repoready/core";
import type { Command } from "commander";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { defaultAdapters } from "../adapters.js";
import { getDefaultCwd } from "../cwd.js";

type FixCommandOptions = {
    cwd?: string;
    dryRun?: boolean;
    force?: boolean;
    yes?: boolean;
    interactive?: boolean;
    json?: boolean;
    lang?: ProjectType | "auto";
    license?: LicenseId;
    author?: string;
};

export function registerFixCommand(program: Command): void {
    program
        .command("fix")
        .description("Apply the recommended fixes for a repository in one guided pass.")
        .option("--cwd <path>", "Repository directory to update.")
        .option("--dry-run", "Show what would change without writing anything.")
        .option("--force", "Allow fixes that overwrite existing files.")
        .option("--yes", "Apply every safe fix without confirmation.")
        .option("--interactive", "Choose which fixes to apply.")
        .option("--json", "Output machine-readable JSON.")
        .option("--lang <lang>", "CI language template override.")
        .option("--license <id>", "License to generate when adding a LICENSE file.")
        .option("--author <name>", "Copyright holder for a generated LICENSE file.")
        .action(async (options: FixCommandOptions) => {
            const baseOptions: FixOptions = {
                cwd: options.cwd ?? getDefaultCwd(),
                dryRun: Boolean(options.dryRun),
                force: Boolean(options.force),
                yes: Boolean(options.yes),
                lang: options.lang ?? "auto",
                license: options.license,
                author: options.author,
                adapters: defaultAdapters
            };

            if (options.interactive && !options.dryRun) {
                const selected = await promptForSelection(baseOptions, Boolean(options.json));

                if (selected === null) {
                    console.log("Cancelled. Nothing was written.");
                    return;
                }

                // The interactive picker is itself the confirmation step.
                const result = await runFix({ ...baseOptions, select: selected, yes: true });
                printResult(result, options.json);
                return;
            }

            const result = await runFix(baseOptions);
            printResult(result, options.json);

            if (result.cancelled) {
                process.exitCode = 1;
            }
        });
}

function printResult(result: Awaited<ReturnType<typeof runFix>>, json?: boolean): void {
    console.log(json ? formatFixJson(result) : formatFixText(result));
}

/**
 * Returns the generator IDs to apply, or null when the user cancels.
 * Selection covers risky fixes too — picking one is an explicit choice — but
 * those still need --force before anything is overwritten.
 */
async function promptForSelection(
    options: FixOptions,
    json: boolean
): Promise<string[] | null> {
    const plan = await planFix(options);

    if (plan.items.length === 0) {
        console.log("RepoReady found no fixes to apply.");
        return null;
    }

    if (json || !canPrompt()) {
        throw new Error(
            "--interactive needs a TTY. Use --yes to apply every safe fix non-interactively."
        );
    }

    console.log(`RepoReady found ${plan.items.length} recommended fix(es):\n`);
    plan.items.forEach((item, index) => {
        console.log(`${index + 1}. ${describe(item)}`);
    });

    const rl = createInterface({ input: stdin, output: stdout });

    try {
        const answer = await rl.question(
            "\nWhich fixes? (numbers, 'all', or blank to cancel) "
        );

        const trimmed = answer.trim().toLowerCase();

        if (!trimmed) return null;
        if (trimmed === "all") return plan.items.map((item) => item.generatorId);

        const chosen = trimmed
            .split(/[\s,]+/)
            .filter(Boolean)
            .map((token) => Number(token));

        const invalid = chosen.filter(
            (index) => !Number.isInteger(index) || index < 1 || index > plan.items.length
        );

        if (invalid.length > 0 || chosen.length === 0) {
            throw new Error(
                `Invalid selection. Enter numbers between 1 and ${plan.items.length}.`
            );
        }

        return chosen.map((index) => plan.items[index - 1]!.generatorId);
    } finally {
        rl.close();
    }
}

function describe(item: FixItem): string {
    const files = item.files.map((file) => file.path).join(", ");
    const suffix = item.safety === "risky" ? " — needs --force" : "";
    return `${item.checkName} (${item.generatorId})${suffix}\n      ${files}`;
}
