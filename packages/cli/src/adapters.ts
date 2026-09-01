import { builtinAdapters, type LanguageAdapter } from "@repoready/core";
import { githubAdapter } from "@repoready/plugin-github";
import { nodeAdapter, typescriptAdapter } from "@repoready/plugin-node";
import { pythonAdapter } from "@repoready/plugin-python";

/**
 * The adapter set every command runs with. Order does not decide which
 * adapter wins when priorities differ — resolveAdapters sorts detected
 * adapters by priority — but order still matters in two places: an explicit
 * --lang lookup walks this array in order (resolvePrimaryAdapter's
 * `adapters.find(a => a.projectType === lang)`), and Array.prototype.sort is
 * stable, so this order breaks ties among adapters with equal priority.
 */
export const defaultAdapters: LanguageAdapter[] = [
    typescriptAdapter,
    nodeAdapter,
    pythonAdapter,
    githubAdapter,
    ...builtinAdapters
];
