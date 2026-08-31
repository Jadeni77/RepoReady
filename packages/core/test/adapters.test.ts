import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    displayProjectTypes,
    projectTypesFrom,
    resolveAdapters,
    resolvePrimaryAdapter
} from "../src/adapters.js";
import type { LanguageAdapter, RepoFiles } from "../src/types.js";

function files(present: string[]): RepoFiles {
    return {
        root: "/repo",
        has: async (p) => present.includes(p),
        listDir: async () => [],
        readText: async () => null,
        readJson: async () => null
    };
}

function adapter(over: Partial<LanguageAdapter> & { id: string }): LanguageAdapter {
    return {
        name: over.id,
        priority: 10,
        detect: async () => ({ detected: false }),
        ...over
    } as LanguageAdapter;
}

const node = adapter({
    id: "node",
    projectType: "node",
    priority: 10,
    ciSteps: "node-steps",
    detect: async (f) =>
        (await f.has("package.json"))
            ? { detected: true, evidence: ["package.json"] }
            : { detected: false }
});

const typescript = adapter({
    id: "typescript",
    projectType: "typescript",
    priority: 20,
    supersedes: ["node"],
    ciSteps: "ts-steps",
    detect: async (f) =>
        (await f.has("tsconfig.json"))
            ? { detected: true, evidence: ["tsconfig.json"] }
            : { detected: false }
});

const generic = adapter({ id: "generic", projectType: "generic", priority: 0, ciSteps: "generic-steps" });

describe("resolveAdapters", () => {
    it("returns only adapters that matched", async () => {
        const detected = await resolveAdapters(files(["package.json"]), [node, typescript, generic]);

        assert.deepEqual(detected.map((d) => d.adapter.id), ["node"]);
    });

    it("sorts matches by descending priority", async () => {
        const detected = await resolveAdapters(files(["package.json", "tsconfig.json"]), [node, typescript]);

        assert.deepEqual(detected.map((d) => d.adapter.id), ["typescript", "node"]);
    });

    it("carries detection evidence", async () => {
        const detected = await resolveAdapters(files(["package.json"]), [node]);

        assert.deepEqual(detected[0]?.evidence, ["package.json"]);
    });

    it("defaults evidence to an empty array", async () => {
        const bare = adapter({ id: "bare", detect: async () => ({ detected: true }) });
        const detected = await resolveAdapters(files([]), [bare]);

        assert.deepEqual(detected[0]?.evidence, []);
    });

    it("treats a throwing adapter as not detected", async () => {
        const broken = adapter({
            id: "broken",
            detect: async () => {
                throw new Error("boom");
            }
        });

        assert.deepEqual(await resolveAdapters(files([]), [broken]), []);
    });
});

describe("projectTypesFrom", () => {
    it("lists every detected project type", async () => {
        const detected = await resolveAdapters(files(["package.json", "tsconfig.json"]), [node, typescript]);

        assert.deepEqual(projectTypesFrom(detected), ["typescript", "node"]);
    });

    it("falls back to generic when nothing matched", () => {
        assert.deepEqual(projectTypesFrom([]), ["generic"]);
    });
});

describe("displayProjectTypes", () => {
    it("hides a superseded type", async () => {
        const detected = await resolveAdapters(files(["package.json", "tsconfig.json"]), [node, typescript]);

        assert.deepEqual(displayProjectTypes(detected), ["typescript"]);
    });

    it("keeps types nothing supersedes", async () => {
        const detected = await resolveAdapters(files(["package.json"]), [node]);

        assert.deepEqual(displayProjectTypes(detected), ["node"]);
    });
});

describe("resolvePrimaryAdapter", () => {
    const all = [typescript, node, generic];

    it("picks the highest-priority detected adapter with CI steps", async () => {
        const detected = await resolveAdapters(files(["package.json", "tsconfig.json"]), all);

        assert.equal(resolvePrimaryAdapter(all, detected, "auto")?.id, "typescript");
    });

    it("falls back to the generic adapter when nothing matched", () => {
        assert.equal(resolvePrimaryAdapter(all, [], "auto")?.id, "generic");
    });

    it("honours an explicit language even when undetected", () => {
        assert.equal(resolvePrimaryAdapter(all, [], "node")?.id, "node");
    });

    it("throws a helpful error for an unregistered language", () => {
        assert.throws(
            () => resolvePrimaryAdapter(all, [], "cobol" as never),
            /cobol.*node|node.*cobol/s
        );
    });
});
