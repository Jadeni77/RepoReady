import type { CheckResult, HealthCheck, RepoContext } from "@repoready/core";

type PackageJson = {
    name?: string;
    private?: boolean;
    files?: string[];
    engines?: Record<string, string>;
};

type TsConfig = {
    extends?: string;
    compilerOptions?: { strict?: boolean };
};

/**
 * Where a repo's TypeScript config actually lives. Monorepos routinely keep
 * the real settings in a base file that per-package configs extend, so
 * reading only tsconfig.json reports strict mode as off for a repo that has
 * it on.
 */
const TSCONFIG_CANDIDATES = ["tsconfig.json", "tsconfig.base.json"];

/** Resolves `extends` one level, which covers the usual base-config layout. */
async function readStrict(ctx: RepoContext): Promise<boolean | null> {
    for (const candidate of TSCONFIG_CANDIDATES) {
        const config = await ctx.readJson<TsConfig>(candidate);
        if (!config) continue;

        if (typeof config.compilerOptions?.strict === "boolean") {
            return config.compilerOptions.strict;
        }

        if (config.extends) {
            const base = await ctx.readJson<TsConfig>(
                config.extends.replace(/^\.\//, "")
            );
            if (typeof base?.compilerOptions?.strict === "boolean") {
                return base.compilerOptions.strict;
            }
        }
    }

    return null;
}

function result(
    check: HealthCheck,
    status: CheckResult["status"],
    summary: string,
    recommendation?: string
): CheckResult {
    return {
        id: check.id,
        name: check.name,
        category: check.category,
        status,
        summary,
        recommendation,
        pointsEarned: status === "pass" ? check.points : status === "warn" ? Math.floor(check.points / 2) : 0,
        pointsPossible: check.points
    };
}

export const tsStrictCheck: HealthCheck = {
    id: "ts-strict",
    name: "TypeScript Strict Mode",
    category: "structure",
    points: 5,

    async run(ctx) {
        const strict = await readStrict(ctx);

        if (strict === true) {
            return result(tsStrictCheck, "pass", "TypeScript strict mode is enabled.");
        }

        if (strict === false) {
            return result(
                tsStrictCheck,
                "warn",
                "TypeScript strict mode is disabled.",
                "Set \"strict\": true in compilerOptions to catch more bugs at compile time."
            );
        }

        return result(
            tsStrictCheck,
            "warn",
            "No TypeScript config declares a strict setting.",
            "Set \"strict\": true in compilerOptions to catch more bugs at compile time."
        );
    }
};

export const nodeEnginesCheck: HealthCheck = {
    id: "node-engines",
    name: "Node Engines",
    category: "dependencies",
    points: 5,

    async run(ctx) {
        const pkg = await ctx.readJson<PackageJson>("package.json");

        if (pkg?.engines?.node) {
            return result(nodeEnginesCheck, "pass", `engines.node is ${pkg.engines.node}.`);
        }

        return result(
            nodeEnginesCheck,
            "warn",
            "package.json does not declare engines.node.",
            "Add \"engines\": { \"node\": \">=20\" } so consumers know which runtimes are supported."
        );
    }
};

export const nodePublishFilesCheck: HealthCheck = {
    id: "node-publish-files",
    name: "Published Files",
    category: "structure",
    points: 5,

    /** A private package is never published, so publishing hygiene is noise. */
    async shouldRun(ctx: RepoContext) {
        const pkg = await ctx.readJson<PackageJson>("package.json");
        return Boolean(pkg) && pkg?.private !== true;
    },

    async run(ctx) {
        const pkg = await ctx.readJson<PackageJson>("package.json");

        if (pkg?.files?.length) {
            return result(nodePublishFilesCheck, "pass", "package.json declares a files allowlist.");
        }

        if (await ctx.has(".npmignore")) {
            return result(nodePublishFilesCheck, "pass", ".npmignore found.");
        }

        return result(
            nodePublishFilesCheck,
            "warn",
            "No files allowlist or .npmignore, so the published tarball may include everything.",
            "Add a \"files\" array to package.json listing what should ship."
        );
    }
};
