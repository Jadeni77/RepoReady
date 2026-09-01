import type { LanguageAdapter, RepoFiles } from "@repoready/core";
import { tsStrictCheck } from "./checks.js";

type PackageJson = {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
};

async function detectTypeScript(files: RepoFiles) {
    if (await files.has("tsconfig.json")) {
        return { detected: true, evidence: ["tsconfig.json"] };
    }

    const pkg = await files.readJson<PackageJson>("package.json");

    if (pkg?.devDependencies?.typescript) {
        return { detected: true, evidence: ["devDependencies.typescript"] };
    }

    if (pkg?.dependencies?.typescript) {
        return { detected: true, evidence: ["dependencies.typescript"] };
    }

    return { detected: false };
}

/**
 * Outranks nodeAdapter so its CI steps win, and supersedes "node" so doctor
 * prints "TypeScript" rather than "Node, TypeScript".
 *
 * The typecheck and build steps use npm's --if-present so the same static
 * template works whether or not the project defines those scripts.
 */
export const typescriptAdapter: LanguageAdapter = {
    id: "typescript",
    name: "TypeScript",
    projectType: "typescript",
    priority: 20,
    supersedes: ["node"],
    detect: detectTypeScript,
    checks: [tsStrictCheck],
    installCommand: "npm install",
    testCommand: "npm test",
    dependabotEcosystem: "npm",
    ciSteps: `      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck --if-present

      - name: Build
        run: npm run build --if-present

      - name: Run tests
        run: npm test
`
};
