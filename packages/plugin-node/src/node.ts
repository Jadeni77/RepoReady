import type { LanguageAdapter } from "@repoready/core";
import { nodeEnginesCheck, nodePublishFilesCheck } from "./checks.js";

export const nodeAdapter: LanguageAdapter = {
    id: "node",
    name: "Node",
    projectType: "node",
    priority: 10,
    detect: async (files) =>
        (await files.has("package.json"))
            ? { detected: true, evidence: ["package.json"] }
            : { detected: false },
    checks: [nodeEnginesCheck, nodePublishFilesCheck],
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

      - name: Run tests
        run: npm test
`
};
