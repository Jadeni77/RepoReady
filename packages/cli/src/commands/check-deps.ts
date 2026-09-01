import { checkDependencies, formatDepCheckJson, formatDepCheckText } from "@repoready/core";
import type { Command } from "commander";
import { defaultAdapters } from "../adapters.js";
import { getDefaultCwd } from "../cwd.js";

type CheckDepsCommandOptions = {
    cwd?: string;
    json?: boolean;
    strict?: boolean;
};

export function registerCheckDepsCommand(program: Command): void {
    program
        .command("check-deps")
        .description("Inspect dependency manifests, lockfiles, and update tooling.")
        .option("--cwd <path>", "Repository directory to scan.")
        .option("--json", "Output machine-readable JSON.")
        .option("--strict", "Exit with code 1 if any warning or failure is found.")
        .action(async (options: CheckDepsCommandOptions) => {
            const result = await checkDependencies({
                cwd: options.cwd ?? getDefaultCwd(),
                adapters: defaultAdapters
            });

            console.log(
                options.json ? formatDepCheckJson(result) : formatDepCheckText(result)
            );

            const blocking = result.issues.some((issue) => issue.level !== "info");

            if (options.strict && blocking) {
                process.exitCode = 1;
            }
        });
}
