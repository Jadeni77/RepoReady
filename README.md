# RepoReady

> Make repositories open-source-ready in minutes.

RepoReady scans a repository, scores how prepared it is for public/open-source
release, tells you exactly what's missing — a README, license, CI workflow,
contributing guide, tests, and more — and then generates the missing files for
you.

```
$ repoready doctor
RepoReady Score: 34/100
...
$ repoready fix --yes
Applied 8 file(s)

$ repoready doctor
RepoReady Score: 86/100
```

## Quick start

```bash
# from a clone of this repo
npm install
npm run build

# scan the current directory
node packages/cli/dist/index.js doctor
```

Or run it straight from source during development (no build step):

```bash
npm run dev -w @repoready/cli -- doctor
```

## Commands

| Command | Description |
| --- | --- |
| `repoready doctor` | Scan a repository and report a readiness score. |
| `repoready fix` | Apply the recommended fixes in one guided pass. |
| `repoready check-deps` | Inspect dependency manifests, lockfiles, and update tooling. |
| `repoready init-readme [path]` | Generate a starter `README.md`. |
| `repoready init-license` | Generate a `LICENSE`. |
| `repoready init-contributing` | Generate `CONTRIBUTING.md`. |
| `repoready init-code-of-conduct` | Generate `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1). |
| `repoready init-issues` | Generate GitHub issue templates. |
| `repoready init-pr-template` | Generate a GitHub pull request template. |
| `repoready init-ci` | Generate a GitHub Actions CI workflow. |

Every command accepts `--cwd <path>` to target a directory other than the
current one.

### `repoready doctor`

| Option | Description |
| --- | --- |
| `--json` | Output machine-readable JSON instead of text. |
| `--fail-under <score>` | Exit with code `1` if the score is below this number (0–100). Useful in CI. |
| `--only <items>` | Run only matching check IDs or categories, e.g. `--only community,security`. |
| `--skip <items>` | Skip matching check IDs or categories, e.g. `--skip code-of-conduct`. |

```
$ repoready doctor
RepoReady Score: 34/100
Points: 34/100
Root: /path/to/your/repo
Detected project type: Node

Category Scores:
   Community: 30/100 (15/50)
   Automation: 0/100 (0/15)
   Dependencies: 80/100 (12/15)

Community
   ✅ README: README.md found.
   ❌ License: No license file found.
   ⚠️ Code of Conduct: No code of conduct found.

Automation
   ❌ CI Workflow: No GitHub Actions workflow directory found.

Suggested fixes:
    1. Run repoready init-license.
    2. Run repoready init-code-of-conduct.
    3. Run repoready init-ci.
```

Fail a build if the repo drops below a readiness threshold:

```bash
repoready doctor --fail-under 80
```

### `repoready fix`

Runs `doctor`, maps each failing check to a generator, and applies the fixes.

| Option | Description |
| --- | --- |
| `--dry-run` | Show what would change without writing anything. |
| `--yes` | Apply every safe fix without confirmation. |
| `--interactive` | Choose which fixes to apply. |
| `--force` | Allow fixes that would overwrite existing files. |
| `--json` | Output machine-readable JSON. |
| `--lang <lang>` | CI language template override. |
| `--license <id>` / `--author <name>` | Passed through to the license generator. |

Only **safe** fixes — ones that create files that do not already exist — run by
default. A fix that would overwrite your work is reported but never applied
without `--force`.

### `repoready check-deps`

Reports what it can see on disk: manifests, lockfiles, Dependabot/Renovate
config, unbounded version ranges, and unpinned Python requirements. It then
names the tool to run next. RepoReady orchestrates best-in-class tools rather
than reimplementing them, so it never makes network calls itself.

| Option | Description |
| --- | --- |
| `--json` | Output machine-readable JSON. |
| `--strict` | Exit with code `1` if any warning or failure is found. |

### `repoready init-*`

All generators share the same write-safety flags:

| Option | Description |
| --- | --- |
| `--dry-run` | Print the file contents without writing them. |
| `--force` | Overwrite an existing file. Without it, existing files are left alone. |
| `--yes` | Skip the confirmation prompt (implied when not attached to a TTY). |

`init-license` also takes `--license <id>` (`mit`, `isc`, `bsd-2-clause`,
`bsd-3-clause`, `unlicense`; defaults to `mit`) and `--author <name>`, which
otherwise falls back to `package.json`, then `git config user.name`.

`init-ci` takes `--lang <lang>` (`auto`, `node`, `python`, `go`, `rust`, `java`,
`ruby`, `php`, `generic`) and detects the language from the repo by default.

## What it checks

Checks are grouped into categories, each contributing to the overall score out
of 100:

- **community** — README, license, contributing guide, code of conduct, issue/PR templates
- **automation** — CI workflow (GitHub Actions)
- **structure** — environment example file, tests
- **dependencies** — dependency manifest, lockfile
- **security** — `.gitignore` hygiene, including whether `.env` is ignored

Language detection covers Node, Python, Go, Rust, Java, Ruby, and PHP, and
falls back to a generic profile.

## Configuration

Drop a `repoready.config.json` (or `.repoready.json`) at the repo root:

```json
{
  "checks": {
    "code-of-conduct": false
  },
  "license": "mit",
  "author": "Your Name"
}
```

Setting a check to `false` removes it from the run and from the score.

## Project structure

This is an npm-workspaces monorepo:

| Package | Description |
| --- | --- |
| [`@repoready/core`](packages/core) | Repo scanning, health checks, scoring, generators, and output formatting. |
| [`@repoready/cli`](packages/cli) | Commander-based CLI that exposes the `repoready` command. |

[`examples/`](examples) holds deliberately bare repos (`node-basic`,
`python-basic`) used both as demos and as read-only test fixtures.

### Development

```bash
npm install                                # install workspace deps
npm run build                              # build all packages
npm run typecheck                          # type-check the whole monorepo
npm test                                   # run the test suite
npm run check                              # typecheck + test
npm run dev -w @repoready/cli -- doctor    # run the CLI from source
```

Tests use the built-in `node:test` runner via `tsx`, so there is no test
framework dependency.

Built with TypeScript (NodeNext modules) and [tsup](https://tsup.egoist.dev/).

## Roadmap

- Language adapter plugin interface (`plugin-node`, `plugin-python`, `plugin-github`)
- `repoready init-dependabot`, `init-scorecard`, `init-release`
- Optional AI layer (`--ai`), disabled by default and bring-your-own-key
- npm release, Homebrew tap, standalone binaries

## License

TBD.
