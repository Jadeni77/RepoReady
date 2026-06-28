import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

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