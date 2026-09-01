import { securityGenerator } from "@repoready/plugin-github";
import type { Command } from "commander";
import { runAndPrint, withCommonOptions, type InitCommandOptions } from "./init.js";

export function registerSecurityCommand(program: Command): void {
    withCommonOptions(
        program
            .command("init-security")
            .description("Generate a SECURITY.md file.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(securityGenerator, options);
    });
}
