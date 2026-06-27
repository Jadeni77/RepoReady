import path from "node:path";
import { fromRoot, pathExists, readJsonFile } from "./fs.js";
import { loadConfig } from "./config.js";
import type { ProjectType, RepoContext } from "./types.js";

export async function createRepoContext(cwd: string = process.cwd()): Promise<RepoContext> {
    const root = path.resolve(cwd);
    const config = await loadConfig(root);

    const has = async (relativePath: string): Promise<boolean> => {
        return pathExists(fromRoot(root, relativePath));
    };

    const readJson = async <T = unknown>(relativePath: string): Promise<T | null> => {
        return readJsonFile<T>(fromRoot(root, relativePath));
    };

    const projectTypes = await detectProjectTypes(has);

    return {
        root,
        config,
        projectTypes,
        has,
        readJson
    };
}

async function detectProjectTypes(has: (relativePath: string) => Promise<boolean>): Promise<ProjectType[]> {
    const detected: ProjectType[] = [];

    if (await has("package.json")) detected.push("node");

    if (
        (await has("pyproject.toml")) ||
        (await has("requirements.txt")) ||
        (await has("setup.py"))
    ) {
        detected.push("python");
    }

    if (await has("go.mod")) detected.push("go");

    if (await has("Cargo.toml")) detected.push("rust");

    if ((await has("pom.xml")) || (await has("build.gradle"))) {
        detected.push("java");
    }

    if (await has("Gemfile")) detected.push("ruby");

    if (await has("composer.json")) detected.push("php");

    return detected.length > 0 ? detected : ["generic"];
}