import type { DetectionResult, LanguageAdapter, RepoFiles } from "./types.js";

/** Detects a language from the presence of any marker file. */
function markerDetect(markers: string[]) {
    return async (files: RepoFiles): Promise<DetectionResult> => {
        for (const marker of markers) {
            if (await files.has(marker)) {
                return { detected: true, evidence: [marker] };
            }
        }
        return { detected: false };
    };
}

export const goAdapter: LanguageAdapter = {
    id: "go",
    name: "Go",
    projectType: "go",
    priority: 10,
    detect: markerDetect(["go.mod"]),
    installCommand: "go mod download",
    testCommand: "go test ./...",
    ciSteps: `      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: stable

      - name: Run tests
        run: go test ./...
`
};

export const rustAdapter: LanguageAdapter = {
    id: "rust",
    name: "Rust",
    projectType: "rust",
    priority: 10,
    detect: markerDetect(["Cargo.toml"]),
    installCommand: "cargo build",
    testCommand: "cargo test",
    ciSteps: `      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run tests
        run: cargo test
`
};

export const javaAdapter: LanguageAdapter = {
    id: "java",
    name: "Java",
    projectType: "java",
    priority: 10,
    detect: markerDetect(["pom.xml", "build.gradle"]),
    installCommand: "mvn --batch-mode install",
    testCommand: "mvn --batch-mode test",
    ciSteps: `      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"

      - name: Run tests
        run: mvn --batch-mode test
`
};

export const rubyAdapter: LanguageAdapter = {
    id: "ruby",
    name: "Ruby",
    projectType: "ruby",
    priority: 10,
    detect: markerDetect(["Gemfile"]),
    installCommand: "bundle install",
    testCommand: "bundle exec rspec",
    ciSteps: `      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with:
          bundler-cache: true

      - name: Run tests
        run: bundle exec rake
`
};

export const phpAdapter: LanguageAdapter = {
    id: "php",
    name: "PHP",
    projectType: "php",
    priority: 10,
    detect: markerDetect(["composer.json"]),
    installCommand: "composer install",
    testCommand: "composer test",
    ciSteps: `      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: "8.3"

      - name: Install dependencies
        run: composer install --prefer-dist --no-progress

      - name: Run tests
        run: composer test
`
};

/**
 * The fallback. Never auto-detected: it is reachable by ID when nothing else
 * matched, and via --lang generic. Keeping detect() false means it never
 * pollutes projectTypes and needs no special-casing elsewhere.
 */
export const genericAdapter: LanguageAdapter = {
    id: "generic",
    name: "Generic",
    projectType: "generic",
    priority: 0,
    detect: async () => ({ detected: false }),
    installCommand: "# Install dependencies with this project's package manager",
    testCommand: "# Run this project's test suite",
    ciSteps: `      - name: Placeholder check
        run: echo "Add project-specific CI steps here."
`
};

export const builtinAdapters: LanguageAdapter[] = [
    goAdapter,
    rustAdapter,
    javaAdapter,
    rubyAdapter,
    phpAdapter,
    genericAdapter
];
