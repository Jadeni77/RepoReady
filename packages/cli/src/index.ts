#!/usr/bin/env node

import { Command } from "commander";
import { formatDoctorJson, formatDoctorText, runDoctor } from "@repoready/core";

const program = new Command();

program
    .name("repoready")
    .description("Make repositories open-source-ready in minutes.")
    .version("0.0.1");

program
    .command("doctor")
    .description("Scan the current repository and report readines issues.")
    .option("--json", "Output machine-readable JSON.")
    .option(
        "--fail-under <score>",
        "Exit with code 1 if the score is below this number",
        parseScore
    )
    .action(async (options: { json?: boolean; failUnder?: number}) => {
        const result = await runDoctor({
            cwd: process.cwd()
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

program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});

function parseScore(value: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        throw new Error("--fail-under must be an integer between 0 and 100");
    }

    return parsed;
}