import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse as parseYaml } from "yaml";
import { builtinAdapters, genericAdapter } from "../src/builtin-adapters.js";
import type { RepoFiles } from "../src/types.js";

function files(present: string[]): RepoFiles {
    return {
        root: "/repo",
        has: async (p) => present.includes(p),
        listDir: async () => [],
        readText: async () => null,
        readJson: async () => null
    };
}

describe("builtinAdapters", () => {
    it("covers the languages core still knows about", () => {
        assert.deepEqual(
            builtinAdapters.map((a) => a.id).sort(),
            ["generic", "go", "java", "php", "ruby", "rust"]
        );
    });

    it("gives every adapter a distinct ID", () => {
        const ids = builtinAdapters.map((a) => a.id);
        assert.equal(new Set(ids).size, ids.length);
    });

    it("gives every adapter CI steps and shell commands", () => {
        for (const adapter of builtinAdapters) {
            assert.ok(adapter.ciSteps, `${adapter.id} has no ciSteps`);
            assert.ok(adapter.installCommand, `${adapter.id} has no installCommand`);
            assert.ok(adapter.testCommand, `${adapter.id} has no testCommand`);
        }
    });

    it("produces steps that parse as YAML inside a workflow", () => {
        for (const adapter of builtinAdapters) {
            const workflow = parseYaml(
                `jobs:\n  test:\n    steps:\n${adapter.ciSteps}`
            ) as Record<string, any>;

            const steps = workflow.jobs.test.steps;

            assert.ok(Array.isArray(steps) && steps.length > 0, `${adapter.id} produced no steps`);

            for (const step of steps) {
                assert.ok(step.name, `${adapter.id} has an unnamed step`);
                assert.ok(step.uses || step.run, `${adapter.id} step "${step.name}" does nothing`);
            }
        }
    });

    describe("detection", () => {
        const cases: [string, string][] = [
            ["go", "go.mod"],
            ["rust", "Cargo.toml"],
            ["java", "pom.xml"],
            ["ruby", "Gemfile"],
            ["php", "composer.json"]
        ];

        for (const [id, marker] of cases) {
            it(`detects ${id} from ${marker}`, async () => {
                const adapter = builtinAdapters.find((a) => a.id === id)!;
                const result = await adapter.detect(files([marker]));

                assert.equal(result.detected, true);
                assert.deepEqual(result.evidence, [marker]);
            });

            it(`does not detect ${id} in an empty repo`, async () => {
                const adapter = builtinAdapters.find((a) => a.id === id)!;

                assert.equal((await adapter.detect(files([]))).detected, false);
            });
        }

        it("detects java from build.gradle too", async () => {
            const java = builtinAdapters.find((a) => a.id === "java")!;

            assert.equal((await java.detect(files(["build.gradle"]))).detected, true);
        });
    });

    // generic is the fallback: reachable by ID, never auto-detected.
    it("never detects the generic adapter", async () => {
        assert.equal((await genericAdapter.detect(files(["go.mod"]))).detected, false);
        assert.equal(genericAdapter.priority, 0);
    });
});
