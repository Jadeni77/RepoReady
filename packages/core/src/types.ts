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
};

export type RepoContext = {
    root: string;
    config: RepoReadyConfig;
    projectTypes: ProjectType[];
    has: (relativePath: string) => Promise<Boolean>;
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
}

export type HealthCheck = {
    id: string;
    name: string;
    category: CheckCategory;
    points: number;
    run: (ctx: RepoContext) => Promise<CheckResult>;
}

export type DoctorOptions = {
    cwd?: string;
}

export type DoctorResult = {
    root: string;
    score: number;
    detectedProjectTypes: ProjectType[];
    results: CheckResult[];
    suggestions: string[];
}