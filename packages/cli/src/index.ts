#!/usr/bin/env node

import { Command } from "commander";
import { registerCheckDepsCommand } from "./commands/check-deps.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerFixCommand } from "./commands/fix.js";
import { registerInitCommands } from "./commands/init.js";

const program = new Command();

program
    .name("repoready")
    .description("Make repositories open-source-ready in minutes.")
    .version("0.1.0");

registerDoctorCommand(program);
registerFixCommand(program);
registerCheckDepsCommand(program);
registerInitCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
