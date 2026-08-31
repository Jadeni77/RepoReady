export type CheckStatus = "pass" | "warn" | "fail";

export type CheckCategory =
    | "community"
    | "automation"
    | "dependencies"
    | "structure"
    | "security";

export type ProjectType =
    | "node"
    | "python"
    | "go"
    | "rust"
    | "java"
    | "ruby"
    | "php"
    | "generic";

export type RepoReadyConfig = {
    checks?: Record<string, boolean>;
    license?: LicenseId;
    author?: string;
};

export type RepoContext = {
    root: string;
    config: RepoReadyConfig;
    projectTypes: ProjectType[];
    has: (relativePath: string) => Promise<boolean>;
    listDir: (relativePath: string) => Promise<string[]>;
    readText: (relativePath: string) => Promise<string | null>;
    readJson: <T = unknown>(relativePath: string) => Promise<T | null>;
};

export type CheckResult = {
    id: string;
    name: string;
    category: CheckCategory;
    status: CheckStatus;
    summary: string;
    recommendation?: string;
    pointsEarned: number;
    pointsPossible: number;
    details?: Record<string, unknown>;
}

export type HealthCheck = {
    id: string;
    name: string;
    category: CheckCategory;
    points: number;
    shouldRun?: (ctx: RepoContext) => Promise<boolean> | boolean;
    run: (ctx: RepoContext) => Promise<CheckResult>;

}

export type CategoryScore = {
    category: CheckCategory;
    pointsEarned: number;
    pointsPossible: number;
    score: number;
}

export type DoctorOptions = {
    cwd?: string;
    only?: string[];
    skip?: string[];
}

export type DoctorResult = {
    root: string;
    score: number;
    pointsEarned: number;
    pointsPossible: number;
    detectedProjectTypes: ProjectType[];
    categoryScores: CategoryScore[];
    results: CheckResult[];
    suggestions: string[];
}

export type GeneratorCategory = CheckCategory;

export type GeneratorFileAction = "create" | "overwrite" | "skip";

export type GeneratorFile = {
    path: string;
    content: string;
}

export type GeneratorFileResult = {
    path: string;
    action: GeneratorFileAction;
    existed: boolean;
    reason?: string;
    content?: string;
}

export type GeneratorOptions = {
    cwd?: string;
    dryRun?: boolean;
    force?: boolean;
    /** Skip the interactive "apply these changes?" confirmation. */
    yes?: boolean;
    lang?: ProjectType | "auto";
    targetPath?: string;
    license?: LicenseId;
    author?: string;
}

export type GeneratorResult = {
    id: string;
    name: string;
    category: GeneratorCategory;
    dryRun: boolean;
    files: GeneratorFileResult[];
}

/**
 * The outcome of planning a generator: what *would* happen, with nothing
 * written yet. `fix` plans every generator up front so it can confirm the
 * whole change set once instead of prompting per file.
 */
export type GeneratorPlan = {
    id: string;
    name: string;
    category: GeneratorCategory;
    files: PlannedFile[];
}

export type PlannedFile = {
    path: string;
    /** Absolute path on disk, for writing. */
    fullPath: string;
    content: string;
    action: GeneratorFileAction;
    existed: boolean;
    reason?: string;
}

export type RepoGenerator = {
    id: string;
    name: string;
    category: GeneratorCategory;
    description: string;
    generate: (
        ctx: RepoContext,
        options: GeneratorOptions
    ) => Promise<GeneratorFile[]>;
};

export type LicenseId =
    | "mit"
    | "isc"
    | "bsd-2-clause"
    | "bsd-3-clause"
    | "unlicense";

export type DepIssueLevel = "info" | "warn" | "fail";

export type DepIssue = {
    id: string;
    level: DepIssueLevel;
    summary: string;
    recommendation?: string;
}

export type DepCheckOptions = {
    cwd?: string;
}

export type DepCheckResult = {
    root: string;
    detectedProjectTypes: ProjectType[];
    manifests: string[];
    lockfiles: string[];
    /** Config files for automated update tools (Dependabot, Renovate). */
    updateTools: string[];
    dependencyCount: number;
    issues: DepIssue[];
    nextCommands: string[];
}

export type FixSafety = "safe" | "risky";

export type FixItem = {
    /** The check that triggered this fix. */
    checkId: string;
    checkName: string;
    generatorId: string;
    generatorName: string;
    category: GeneratorCategory;
    /**
     * "safe" creates files that do not exist yet. "risky" would overwrite
     * something already in the repo and is never applied without --force.
     */
    safety: FixSafety;
    files: PlannedFile[];
}

export type FixOptions = {
    cwd?: string;
    dryRun?: boolean;
    force?: boolean;
    yes?: boolean;
    interactive?: boolean;
    lang?: ProjectType | "auto";
    license?: LicenseId;
    author?: string;
    /** Generator IDs to apply. When omitted, every safe fix is applied. */
    select?: string[];
}

export type FixFileResult = GeneratorFileResult;

export type FixResult = {
    root: string;
    dryRun: boolean;
    scoreBefore: number;
    items: FixItem[];
    applied: FixFileResult[];
    /** True when the run stopped because the user declined confirmation. */
    cancelled: boolean;
}
