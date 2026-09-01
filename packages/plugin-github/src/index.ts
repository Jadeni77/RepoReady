import type { LanguageAdapter } from "@repoready/core";
import { securityPolicyCheck } from "./checks.js";
import {
    dependabotGenerator,
    releaseGenerator,
    scorecardGenerator,
    securityGenerator
} from "./generators.js";

/**
 * Universal GitHub repository hygiene. It has no projectType and no ciSteps,
 * so it contributes checks to every repo without ever being chosen as the CI
 * provider or appearing in the detected project types.
 */
export const githubAdapter: LanguageAdapter = {
    id: "github",
    name: "GitHub",
    priority: 0,
    detect: async () => ({ detected: true }),
    checks: [securityPolicyCheck],
    generators: [
        securityGenerator,
        dependabotGenerator,
        scorecardGenerator,
        releaseGenerator
    ]
};

export * from "./checks.js";
export * from "./generators.js";
