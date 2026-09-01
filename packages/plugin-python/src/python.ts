import type { LanguageAdapter } from "@repoready/core";
import { pythonLintConfigCheck, pythonPyprojectCheck } from "./checks.js";

const MARKERS = ["pyproject.toml", "requirements.txt", "setup.py"];

export const pythonAdapter: LanguageAdapter = {
    id: "python",
    name: "Python",
    projectType: "python",
    priority: 10,
    detect: async (files) => {
        for (const marker of MARKERS) {
            if (await files.has(marker)) return { detected: true, evidence: [marker] };
        }
        return { detected: false };
    },
    checks: [pythonPyprojectCheck, pythonLintConfigCheck],
    installCommand: "pip install -r requirements.txt",
    testCommand: "pytest",
    ciSteps: `      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          python -m pip install pytest
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

      - name: Run tests
        run: pytest
`
};
