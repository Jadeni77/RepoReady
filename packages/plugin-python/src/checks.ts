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

export const pythonPyprojectCheck: HealthCheck = {
    id: "python-pyproject",
    name: "Python Project Metadata",
    category: "structure",
    points: 5,

    async run(ctx) {
        if (await ctx.has("pyproject.toml")) {
            return result(pythonPyprojectCheck, "pass", "pyproject.toml found.");
        }

        return result(
            pythonPyprojectCheck,
            "warn",
            "No pyproject.toml; project metadata is spread across setup.py or requirements.txt.",
            "Add a pyproject.toml, the standard place for Python project metadata."
        );
    }
};

const LINT_CONFIG_FILES = [
    "ruff.toml", ".ruff.toml", ".flake8", "setup.cfg", "tox.ini", ".pylintrc", "pylintrc"
];

const LINT_PYPROJECT_SECTIONS = ["[tool.ruff", "[tool.black", "[tool.flake8", "[tool.pylint"];

export const pythonLintConfigCheck: HealthCheck = {
    id: "python-lint-config",
    name: "Python Lint Config",
    category: "structure",
    points: 5,

    async run(ctx) {
        for (const file of LINT_CONFIG_FILES) {
            if (await ctx.has(file)) {
                return result(pythonLintConfigCheck, "pass", `${file} found.`);
            }
        }

        const pyproject = (await ctx.readText("pyproject.toml")) ?? "";

        if (LINT_PYPROJECT_SECTIONS.some((section) => pyproject.includes(section))) {
            return result(pythonLintConfigCheck, "pass", "pyproject.toml configures a linter.");
        }

        return result(
            pythonLintConfigCheck,
            "warn",
            "No linter or formatter configuration found.",
            "Configure ruff or black so contributors can match the project's style."
        );
    }
};
