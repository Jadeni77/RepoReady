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