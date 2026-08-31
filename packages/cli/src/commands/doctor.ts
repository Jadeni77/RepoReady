import { formatDoctorJson, formatDoctorText, runDoctor } from "@repoready/core";
import type { Command } from "commander";
import { getDefaultCwd } from "../cwd.js";

type DoctorCommandOptions = {
    cwd?: string,
    json?: boolean,
    failUnder?: number,
    only?: string[],
    skip?: string[]
};

export function registerDoctorCommand(program: Command): void {
    program
        .command("doctor")
        .description("Scan a repository and report readiness issues.")
        .option("--cwd <path>", "Repository directory to scan.")
        .option("--json", "Output machine-readable JSON.")
        .option(
            "--fail-under <score>",
            "Exit with code 1 if the score is below this number.",
            parseScore
        )
        .option(
            "--only <items>",
            "Run only matching check IDs or categories. Example: --only community,security",
            parseList
        )
        .option(
            "--skip <items>",
            "Skip matching check IDs or categories. Example: --skip code-of-conduct",
            parseList
        )
        .action(async (options: DoctorCommandOptions) => {
            const result = await runDoctor({
                cwd: options.cwd ?? getDefaultCwd(),
                only: options.only,
                skip: options.skip
            });

            const output = options.json
                ? formatDoctorJson(result)
                : formatDoctorText(result);
            
            console.log(output);

            if (
                typeof options.failUnder === "number" &&
                result.score < options.failUnder
            ) {
                process.exitCode = 1;
            }
        });
}

function parseScore(value: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        throw new Error("--fail-under must be an integer between 0 and 100");
    }

    return parsed;
}

function parseList(value: string): string[] {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}