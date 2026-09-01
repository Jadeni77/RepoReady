import type { CheckResult, HealthCheck } from "@repoready/core";

function result(
    check: HealthCheck,
    status: CheckResult["status"],
    summary: string,
    recommendation?: string
): CheckResult {
    return {
        id: check.id,
        name: check.name,
        category: check.category,
        status,
        summary,
        recommendation,
        pointsEarned: status === "pass" ? check.points : status === "warn" ? Math.floor(check.points / 2) : 0,
        pointsPossible: check.points
    };
}

export const securityPolicyCheck: HealthCheck = {
    id: "security-policy",
    name: "Security Policy",
    category: "security",
    points: 5,
    fixedBy: "security",

    async run(ctx) {
        if ((await ctx.has("SECURITY.md")) || (await ctx.has(".github/SECURITY.md"))) {
            return result(securityPolicyCheck, "pass", "SECURITY.md found.");
        }

        return result(
            securityPolicyCheck,
            "warn",
            "No SECURITY.md; contributors have no documented way to report vulnerabilities.",
            "Run repoready init-security."
        );
    }
};
