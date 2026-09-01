import {
    ciGenerator,
    codeOfConductGenerator,
    contributingGenerator,
    formatGeneratorText,
    GeneratorOptions,
    isLicenseId,
    issueTemplateGenerator,
    licenseGenerator,
    LicenseId,
    ProjectType,
    pullRequestTemplateGenerator,
    readmeGenerator,
    RepoGenerator,
    runGenerator,
    SUPPORTED_LICENSES
} from "@repoready/core";
import type { Command } from "commander";
import { stat } from "node:fs/promises";
import path from "node:path";
import { defaultAdapters } from "../adapters.js";
import { getDefaultCwd } from "../cwd.js";

export type InitCommandOptions = {
    cwd?: string;
    dryRun?: boolean;
    force?: boolean;
    yes?: boolean;
    lang?: ProjectType | "auto";
    license?: LicenseId;
    author?: string;
    targetPath?: string;
};

/** Every init-* command shares the same write-safety flags. */
export function withCommonOptions(command: Command): Command {
    return command
        .option("--cwd <path>", "Repository directory to update.")
        .option("--dry-run", "Preview generated files without writing them.")
        .option("--force", "Overwrite existing files.")
        .option("--yes", "Skip the confirmation prompt.");
}

export function registerInitCommands(program: Command): void {
    withCommonOptions(
        program
            .command("init-readme")
            .description("Generate a starter README.md file.")
            .argument(
                "[path]",
                "Target directory or README file path. Example: init-readme packages/core"
            )
    ).action(async (target: string | undefined, options: InitCommandOptions) => {
        const resolved = await resolveReadmeTarget(target, options.cwd);

        await runAndPrint(readmeGenerator, {
            ...options,
            cwd: resolved.cwd,
            targetPath: resolved.targetPath
        });
    });

    withCommonOptions(
        program
            .command("init-license")
            .description("Generate a LICENSE file.")
            .option(
                "--license <id>",
                `License to generate: ${SUPPORTED_LICENSES.join(", ")}.`,
                parseLicense
            )
            .option("--author <name>", "Copyright holder. Defaults to package.json or git config.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(licenseGenerator, options);
    });

    withCommonOptions(
        program
            .command("init-contributing")
            .description("Generate a CONTRIBUTING.md file.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(contributingGenerator, options);
    });

    withCommonOptions(
        program
            .command("init-code-of-conduct")
            .description("Generate a CODE_OF_CONDUCT.md file.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(codeOfConductGenerator, options);
    });

    withCommonOptions(
        program
            .command("init-issues")
            .description("Generate GitHub issue templates.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(issueTemplateGenerator, options);
    });

    withCommonOptions(
        program
            .command("init-pr-template")
            .description("Generate a GitHub pull request template.")
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(pullRequestTemplateGenerator, options);
    });

    withCommonOptions(
        program
            .command("init-ci")
            .description("Generate a GitHub Actions CI workflow.")
            .option(
                "--lang <lang>",
                "CI language template: auto, or any detected language."
            )
    ).action(async (options: InitCommandOptions) => {
        await runAndPrint(ciGenerator, options);
    });
}

export async function runAndPrint(
    generator: RepoGenerator,
    options: InitCommandOptions
): Promise<void> {
    const result = await runGenerator(generator, {
        cwd: options.cwd ?? getDefaultCwd(),
        dryRun: Boolean(options.dryRun),
        force: Boolean(options.force),
        yes: Boolean(options.yes),
        lang: options.lang ?? "auto",
        license: options.license,
        author: options.author,
        targetPath: options.targetPath,
        adapters: defaultAdapters
    } satisfies GeneratorOptions);

    console.log(formatGeneratorText(result));

    const blocked = result.files.some(
        (file) => file.action === "skip" && file.existed
    );

    if (blocked && !result.dryRun) {
        process.exitCode = 1;
    }
}

async function resolveReadmeTarget(
    target: string | undefined,
    cwdOption: string | undefined
): Promise<{ cwd: string; targetPath?: string }> {
    const baseCwd = path.resolve(cwdOption ?? getDefaultCwd());

    if (!target) {
        return {
            cwd: baseCwd
        };
    }

    const absoluteTarget = path.resolve(baseCwd, target);

    if (await isDirectory(absoluteTarget)) {
        return {
            cwd: absoluteTarget
        };
    }

    if (looksLikeReadmeFile(target)) {
        return {
            cwd: path.dirname(absoluteTarget),
            targetPath: path.basename(absoluteTarget)
        };
    }

    return {
        cwd: absoluteTarget
    };
}

async function isDirectory(filePath: string): Promise<boolean> {
    try {
        const stats = await stat(filePath);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

function looksLikeReadmeFile(filePath: string): boolean {
    const basename = path.basename(filePath).toLowerCase();
    const extension = path.extname(filePath).toLowerCase();

    return (
        basename.startsWith("readme") ||
        extension === ".md" ||
        extension === ".mdx"
    );
}

function parseLicense(value: string): LicenseId {
    const normalized = value.toLowerCase();

    if (!isLicenseId(normalized)) {
        throw new Error(
            `--license must be one of: ${SUPPORTED_LICENSES.join(", ")}. ` +
                "Longer licenses such as Apache-2.0 are not bundled; copy the canonical text instead."
        );
    }

    return normalized;
}
