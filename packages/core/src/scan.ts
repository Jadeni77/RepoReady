import path from "node:path";
import { projectTypesFrom, resolveAdapters } from "./adapters.js";
import { loadConfig } from "./config.js";
import { fromRoot, listDirectory, pathExists, readJsonFile, readTextFile } from "./fs.js";
import type { LanguageAdapter, RepoContext, RepoFiles } from "./types.js";

export type RepoContextOptions = {
    adapters?: LanguageAdapter[];
};

export async function createRepoContext(
    cwd: string = process.cwd(),
    options: RepoContextOptions = {}
): Promise<RepoContext> {
    const root = path.resolve(cwd);
    const adapters = options.adapters ?? [];

    const files: RepoFiles = {
        root,
        has: (relativePath) => pathExists(fromRoot(root, relativePath)),
        listDir: (relativePath) => listDirectory(fromRoot(root, relativePath)),
        readText: (relativePath) => readTextFile(fromRoot(root, relativePath)),
        readJson: <T>(relativePath: string) => readJsonFile<T>(fromRoot(root, relativePath))
    };

    const [config, detected] = await Promise.all([
        loadConfig(root),
        resolveAdapters(files, adapters)
    ]);

    return {
        ...files,
        config,
        projectTypes: projectTypesFrom(detected),
        adapters,
        detected
    };
}
