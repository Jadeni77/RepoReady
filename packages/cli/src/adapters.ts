import { builtinAdapters, type LanguageAdapter } from "@repoready/core";
import { githubAdapter } from "@repoready/plugin-github";
import { nodeAdapter, typescriptAdapter } from "@repoready/plugin-node";
import { pythonAdapter } from "@repoready/plugin-python";

/**
 * The adapter set every command runs with. Order does not matter for
 * detection — resolveAdapters sorts by priority — but keeping the richest
 * adapters first makes the list easier to read.
 */
export const defaultAdapters: LanguageAdapter[] = [
    typescriptAdapter,
    nodeAdapter,
    pythonAdapter,
    githubAdapter,
    ...builtinAdapters
];
