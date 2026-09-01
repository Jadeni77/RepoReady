import type { CheckResult, HealthCheck, RepoContext } from "@repoready/core";

type PackageJson = {
    name?: string;
    private?: boolean;
    files?: string[];
    engines?: Record<string, string>;
};

type TsConfig = {
    compilerOptions?: { strict?: boolean };
};

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
        const tsconfig = await ctx.readJson<TsConfig>("tsconfig.json");

        if (tsconfig?.compilerOptions?.strict === true) {
            return result(tsStrictCheck, "pass", "tsconfig.json enables strict mode.");
        }

        return result(
            tsStrictCheck,
            "warn",
            "tsconfig.json does not enable strict mode.",
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
