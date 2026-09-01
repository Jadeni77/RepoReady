import {
    dependabotGenerator,
    releaseGenerator,
    scorecardGenerator
} from "@repoready/plugin-github";
import type { Command } from "commander";
import { runAndPrint, withCommonOptions, type InitCommandOptions } from "./init.js";

/** Release tools RepoReady knows how to configure. */
const RELEASE_TOOLS = ["release-please"];

/**
 * Commands that generate config for external tools. RepoReady orchestrates
 * these tools rather than reimplementing them: it writes the config and names
 * what to run, and never calls out to the network itself.
 */
export function registerExternalToolCommands(program: Command): void {
    withCommonOptions(
        program
            .command("init-dependabot")
            .description("Generate a Dependabot config for the detected ecosystems.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(dependabotGenerator, options);
    });

    withCommonOptions(
        program
            .command("init-scorecard")
            .description("Generate an OpenSSF Scorecard workflow.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(scorecardGenerator, options);
    });

    withCommonOptions(
        program
            .command("init-release")
            .description("Generate a release workflow and config.")
            .option(
                "--tool <tool>",
                `Release tool to configure: ${RELEASE_TOOLS.join(", ")}.`,
                parseReleaseTool,
                "release-please"
            )
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(releaseGenerator, options);
    });
}

function parseReleaseTool(value: string): string {
    const normalized = value.toLowerCase();

    if (!RELEASE_TOOLS.includes(normalized)) {
        throw new Error(
            `Unknown release tool "${value}". Supported tools: ${RELEASE_TOOLS.join(", ")}.`
        );
    }

    return normalized;
}
