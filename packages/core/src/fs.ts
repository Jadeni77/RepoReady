import { access, readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function pathExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function readTextFile(filePath: string): Promise<string | null> {
    try {
        return await readFile(filePath, "utf8");
    } catch {
        return null;
    }
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
    try {
        const raw = await readFile(filePath, "utf8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function listDirectory(filePath: string): Promise<string[]> {
    try {
        const entries = await readdir(filePath, { withFileTypes: true });
        return entries.map((entry) => entry.name)
    } catch {
        return [];
    }
}

export function fromRoot(root: string, relativePath: string): string {
    return path.join(root, relativePath);
}

/**
 * Resolves git's configured user name, which lives in the user's global
 * config far more often than in the repo. Returns null when git is missing
 * or has no name set, so callers can fall back.
 */
export async function readGitUserName(cwd: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync("git", ["config", "user.name"], { cwd });
        return stdout.trim() || null;
    } catch {
        return null;
    }
}