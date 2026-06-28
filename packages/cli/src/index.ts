#!/usr/bin/env node

import { Command } from "commander";
import { registerDoctorCommand } from "./commands/doctor.js";

const program = new Command();

program
    .name("repoready")
    .description("Make repositories open-source-ready in minutes.")
    .version("0.1.0");

registerDoctorCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});