import { fromRoot, pathExists, readJsonFile } from "./fs.js";
import type { RepoReadyConfig } from "./types.js";

const CONFIG_FILES = ["repoready.config.json", ".repoready.json"];

export async function loadConfig(root: string): Promise<RepoReadyConfig> {
    for (const file of CONFIG_FILES) {
        const fullPath = fromRoot(root, file);

        if (await pathExists(fullPath)) {
            const config = await readJsonFile<RepoReadyConfig>(fullPath);
            return config ?? {};
        }
    }
    return {};
}