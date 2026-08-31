import type {
    DetectedAdapter,
    LanguageAdapter,
    ProjectType,
    RepoFiles
} from "./types.js";

/**
 * Runs every adapter's detect against the repo. A throwing adapter is treated
 * as "not detected" rather than failing the whole scan — one bad adapter must
 * not take doctor down.
 */
export async function resolveAdapters(
    files: RepoFiles,
    adapters: LanguageAdapter[]
): Promise<DetectedAdapter[]> {
    const detected: DetectedAdapter[] = [];

    for (const adapter of adapters) {
        try {
            const result = await adapter.detect(files);

            if (result.detected) {
                detected.push({ adapter, evidence: result.evidence ?? [] });
            }
        } catch {
            // Ignored on purpose: see the doc comment above.
        }
    }

    return detected.sort((a, b) => b.adapter.priority - a.adapter.priority);
}

export function projectTypesFrom(detected: DetectedAdapter[]): ProjectType[] {
    const types = detected
        .map((entry) => entry.adapter.projectType)
        .filter((type): type is ProjectType => Boolean(type));

    return types.length > 0 ? types : ["generic"];
}

/**
 * Project types worth showing a human. A TypeScript repo also matches the
 * Node adapter, but printing "Node, TypeScript" is noise.
 */
export function displayProjectTypes(detected: DetectedAdapter[]): ProjectType[] {
    const superseded = new Set(
        detected.flatMap((entry) => entry.adapter.supersedes ?? [])
    );

    const visible = projectTypesFrom(detected).filter((type) => !superseded.has(type));

    return visible.length > 0 ? visible : ["generic"];
}

export function resolvePrimaryAdapter(
    adapters: LanguageAdapter[],
    detected: DetectedAdapter[],
    lang: ProjectType | "auto" = "auto"
): LanguageAdapter | null {
    if (lang !== "auto") {
        const match = adapters.find((adapter) => adapter.projectType === lang);

        if (!match) {
            const known = adapters
                .map((adapter) => adapter.projectType)
                .filter(Boolean)
                .join(", ");

            throw new Error(`Unknown language "${lang}". Registered languages: ${known}.`);
        }

        return match;
    }

    return (
        detected.find((entry) => entry.adapter.ciSteps)?.adapter ??
        adapters.find((adapter) => adapter.id === "generic") ??
        null
    );
}
