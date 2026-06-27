# RepoReady

> Make repositories open-source-ready in minutes.

RepoReady scans a repository, scores how prepared it is for public/open-source
release, and tells you exactly what's missing — a README, license, CI workflow,
contributing guide, tests, and more.

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

## Usage

```
repoready doctor [options]
```

| Option | Description |
| --- | --- |
| `--json` | Output machine-readable JSON instead of text. |
| `--fail-under <score>` | Exit with code `1` if the score is below this number (0–100). Useful in CI. |

### Example

```
$ repoready doctor
RepoReady Score: 29/100
Root: /path/to/your/repo
Detected: node

community
   ❌ README: No README file found.
   ❌ License: No license file found
   ⚠️ Code of Conduct: No code of conduct found.

automation
   ❌ CI Workflow: No Github Actions workflow directory found.

dependencies
   ✅ Dependency Manifest: package.json found
   ✅ Lock File: package-lock.json found

Suggested fixes:
    1. Run repoready init-license.
    ...
```

### CI usage

Fail the build if the repo drops below a readiness threshold:

```bash
repoready doctor --fail-under 80
```

## What it checks

Checks are grouped into categories, each contributing to the overall score out of 100:

- **community** — README, license, contributing guide, code of conduct, issue/PR templates
- **automation** — CI workflow (GitHub Actions)
- **structure** — environment example file, tests
- **dependencies** — dependency manifest, lock file
- **security** — security-related hygiene

## Project structure

This is an npm-workspaces monorepo:

| Package | Description |
| --- | --- |
| [`@repoready/core`](packages/core) | Repo scanning, health checks, scoring, and output formatting. |
| [`@repoready/cli`](packages/cli) | Commander-based CLI that exposes the `repoready` command. |

### Development

```bash
npm install                          # install workspace deps
npm run build                        # build all packages
npm run typecheck                    # type-check the whole monorepo
npm run dev -w @repoready/cli -- doctor   # run the CLI from source
```

Built with TypeScript (NodeNext modules) and [tsup](https://tsup.egoist.dev/).

## Roadmap

Scaffolding commands referenced by the doctor's suggestions are planned:

- `repoready init-license`
- `repoready init-contributing`
- `repoready init-code-of-conduct`
- `repoready init-ci`
- `repoready init-issue` / `init-pr-template`
- `repoready generate-tests`

## License

TBD.
