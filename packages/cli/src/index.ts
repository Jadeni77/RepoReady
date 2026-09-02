#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { registerCheckDepsCommand } from "./commands/check-deps.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerExternalToolCommands } from "./commands/external-tools.js";
import { registerFixCommand } from "./commands/fix.js";
import { registerInitCommands } from "./commands/init.js";
import { registerSecurityCommand } from "./commands/security.js";

/**
 * Single source of truth for the version. package.json sits one level above
 * src/index.ts, dist/index.js, and the published tarball's dist/, so this
 * resolves correctly when run from source, from the local build, and from an
 * installed package.
 */
function resolveVersion(): string {
    try {
        return (createRequire(import.meta.url)("../package.json") as { version: string }).version;
    } catch {
        // Reporting the wrong version is a cosmetic problem; failing to start
        // is not. This can only happen if the file is used outside its
        // package layout, e.g. vendored on its own.
        return "0.0.0-unknown";
    }
}

const version = resolveVersion();

const program = new Command();

program
    .name("repoready")
    .description("Make repositories open-source-ready in minutes.")
    .version(version);

registerDoctorCommand(program);
registerFixCommand(program);
registerCheckDepsCommand(program);
registerInitCommands(program);
registerSecurityCommand(program);
registerExternalToolCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
