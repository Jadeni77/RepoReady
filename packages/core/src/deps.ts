import { createRepoContext } from "./scan.js";
import type {
    DepCheckOptions,
    DepCheckResult,
    DepIssue,
    ProjectType,
    RepoContext
} from "./types.js";

type PackageJson = {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    engines?: Record<string, string>;
};

const MANIFESTS = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "Gemfile",
    "composer.json"
];

const LOCKFILES = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "uv.lock",
    "poetry.lock",
    "Pipfile.lock",
    "Cargo.lock",
    "composer.lock",
    "Gemfile.lock",
    "go.sum"
];

const UPDATE_TOOL_CONFIGS = [
    ".github/dependabot.yml",
    ".github/dependabot.yaml",
    "renovate.json",
    "renovate.json5",
    ".renovaterc",
    ".renovaterc.json",
    ".github/renovate.json"
];

/**
 * Deterministic, offline dependency audit. RepoReady deliberately does not
 * reimplement npm-check-updates or pip-audit — it reports what it can see on
 * disk and names the tool to run next.
 */
export async function checkDependencies(options: DepCheckOptions = {}): Promise<DepCheckResult> {
    const ctx = await createRepoContext(options.cwd, { adapters: options.adapters });

    const manifests = await filterExisting(ctx, MANIFESTS);
    const lockfiles = await filterExisting(ctx, LOCKFILES);
    const updateTools = await filterExisting(ctx, UPDATE_TOOL_CONFIGS);

    const issues: DepIssue[] = [];

    if (manifests.length === 0) {
        return {
            root: ctx.root,
            detectedProjectTypes: ctx.projectTypes,
            manifests,
            lockfiles,
            updateTools,
            dependencyCount: 0,
            issues: [
                {
                    id: "no-manifest",
                    level: "warn",
                    summary: "No dependency manifest found.",
                    recommendation:
                        "If this repo contains code, add the appropriate dependency manifest."
                }
            ],
            nextCommands: []
        };
    }

    if (lockfiles.length === 0) {
        issues.push({
            id: "no-lockfile",
            level: "warn",
            summary: "No lockfile found, so installs are not reproducible.",
            recommendation: lockfileRecommendation(ctx.projectTypes)
        });
    }

    if (updateTools.length === 0) {
        issues.push({
            id: "no-update-tool",
            level: "warn",
            summary: "No automated dependency update tool is configured.",
            recommendation:
                "Add .github/dependabot.yml or renovate.json to get automated update pull requests."
        });
    }

    let dependencyCount = 0;

    if (ctx.projectTypes.includes("node")) {
        const node = await auditNode(ctx);
        dependencyCount += node.count;
        issues.push(...node.issues);
    }

    if (ctx.projectTypes.includes("python")) {
        const python = await auditPython(ctx);
        dependencyCount += python.count;
        issues.push(...python.issues);
    }

    return {
        root: ctx.root,
        detectedProjectTypes: ctx.projectTypes,
        manifests,
        lockfiles,
        updateTools,
        dependencyCount,
        issues,
        nextCommands: nextCommands(ctx.projectTypes)
    };
}

async function auditNode(ctx: RepoContext): Promise<{ count: number; issues: DepIssue[] }> {
    const pkg = await ctx.readJson<PackageJson>("package.json");
    const issues: DepIssue[] = [];

    if (!pkg) {
        return {
            count: 0,
            issues: [
                {
                    id: "node-unreadable-manifest",
                    level: "fail",
                    summary: "package.json exists but could not be parsed as JSON.",
                    recommendation: "Fix the JSON syntax in package.json."
                }
            ]
        };
    }

    const runtime = { ...pkg.dependencies };
    const dev = { ...pkg.devDependencies };
    const all = { ...runtime, ...dev, ...pkg.optionalDependencies };
    const count = Object.keys(all).length;

    // Unpinned ranges make builds non-reproducible even with a lockfile,
    // because a fresh `npm install` can resolve to anything.
    const floating = Object.entries(all)
        .filter(([, range]) => isFloatingRange(range))
        .map(([name, range]) => `${name}@${range}`);

    if (floating.length > 0) {
        issues.push({
            id: "node-floating-ranges",
            level: "warn",
            summary: `${floating.length} dependency range(s) are unbounded: ${floating.join(", ")}.`,
            recommendation:
                "Replace \"*\", \"latest\", and \"x\" ranges with a bounded range such as ^1.2.3."
        });
    }

    const gitOrUrl = Object.entries(all)
        .filter(([, range]) => /^(git\+|https?:|github:|file:)/.test(range))
        .map(([name]) => name);

    if (gitOrUrl.length > 0) {
        issues.push({
            id: "node-non-registry-deps",
            level: "info",
            summary: `${gitOrUrl.length} dependency/dependencies resolve outside the npm registry: ${gitOrUrl.join(", ")}.`,
            recommendation:
                "Non-registry dependencies are not covered by audit or update tooling. Pin them to a commit SHA."
        });
    }

    if (!pkg.engines?.node) {
        issues.push({
            id: "node-no-engines",
            level: "info",
            summary: "package.json does not declare an engines.node range.",
            recommendation:
                "Add \"engines\": { \"node\": \">=20\" } so consumers know which runtimes are supported."
        });
    }

    return { count, issues };
}

async function auditPython(ctx: RepoContext): Promise<{ count: number; issues: DepIssue[] }> {
    const issues: DepIssue[] = [];
    const raw = await ctx.readText("requirements.txt");

    if (raw === null) {
        return { count: 0, issues };
    }

    const requirements = raw
        .split(/\r?\n/)
        .map((line) => line.split("#")[0]?.trim() ?? "")
        .filter((line) => line.length > 0 && !line.startsWith("-"));

    const unpinned = requirements.filter((line) => !/[=<>~!]/.test(line));

    if (unpinned.length > 0) {
        issues.push({
            id: "python-unpinned-requirements",
            level: "warn",
            summary: `${unpinned.length} requirement(s) have no version constraint: ${unpinned.join(", ")}.`,
            recommendation:
                "Pin requirements with == for applications, or a bounded range for libraries."
        });
    }

    return { count: requirements.length, issues };
}

/** "*", "latest", "x", "1.x", and an empty range all resolve to anything. */
function isFloatingRange(range: string): boolean {
    const normalized = range.trim().toLowerCase();

    return (
        normalized === "" ||
        normalized === "*" ||
        normalized === "x" ||
        normalized === "latest" ||
        /^\d+\.x(\.x)?$/.test(normalized)
    );
}

function lockfileRecommendation(projectTypes: ProjectType[]): string {
    if (projectTypes.includes("node")) return "Run npm install and commit package-lock.json.";
    if (projectTypes.includes("python")) return "Commit a uv.lock, poetry.lock, or pinned requirements.txt.";
    if (projectTypes.includes("rust")) return "Commit Cargo.lock for binaries.";
    if (projectTypes.includes("go")) return "Commit go.sum.";
    if (projectTypes.includes("ruby")) return "Commit Gemfile.lock.";
    if (projectTypes.includes("php")) return "Commit composer.lock.";
    return "Commit a lockfile for reproducible installs.";
}

function nextCommands(projectTypes: ProjectType[]): string[] {
    const commands: string[] = [];

    if (projectTypes.includes("node")) {
        commands.push(
            "npm outdated",
            "npm audit",
            "npx npm-check-updates --interactive",
            "npx knip"
        );
    }

    if (projectTypes.includes("python")) {
        commands.push("pip list --outdated", "pip-audit");
    }

    if (projectTypes.includes("go")) {
        commands.push("go list -m -u all", "govulncheck ./...");
    }

    if (projectTypes.includes("rust")) {
        commands.push("cargo outdated", "cargo audit");
    }

    if (projectTypes.includes("ruby")) commands.push("bundle outdated", "bundle audit");
    if (projectTypes.includes("php")) commands.push("composer outdated", "composer audit");

    return commands;
}

async function filterExisting(ctx: RepoContext, paths: string[]): Promise<string[]> {
    const found: string[] = [];

    for (const filePath of paths) {
        if (await ctx.has(filePath)) {
            found.push(filePath);
        }
    }

    return found;
}
