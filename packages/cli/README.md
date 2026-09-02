# repoready

> Make repositories open-source-ready in minutes.

Scans a repository, scores how prepared it is for public release, tells you
what's missing, and generates it.

```bash
npx repoready-cli doctor
npx repoready-cli fix --yes
```

Or install it:

```bash
npm install -g repoready-cli
repoready doctor
```

The package is `repoready-cli`; the command it installs is `repoready`.

> **Note:** run `npx repoready-cli`, not `npx repoready`. Without the `-cli`,
> npx fetches a different, unrelated package of that name.

## Commands

| Command | Description |
| --- | --- |
| `repoready doctor` | Scan a repository and report a readiness score. |
| `repoready fix` | Apply the recommended fixes in one guided pass. |
| `repoready check-deps` | Inspect dependency manifests, lockfiles, and update tooling. |
| `repoready init-readme` | Generate a starter `README.md`. |
| `repoready init-license` | Generate a `LICENSE`. |
| `repoready init-contributing` | Generate `CONTRIBUTING.md`. |
| `repoready init-code-of-conduct` | Generate `CODE_OF_CONDUCT.md`. |
| `repoready init-issues` | Generate GitHub issue templates. |
| `repoready init-pr-template` | Generate a GitHub pull request template. |
| `repoready init-ci` | Generate a GitHub Actions CI workflow. |
| `repoready init-security` | Generate a `SECURITY.md`. |
| `repoready init-dependabot` | Generate a Dependabot config for the detected ecosystems. |
| `repoready init-scorecard` | Generate an OpenSSF Scorecard workflow. |
| `repoready init-release` | Generate a release-please workflow and config. |

Every command takes `--cwd <path>` to target another directory. Generators take
`--dry-run`, `--force`, and `--yes`. Nothing is overwritten without `--force`.

Detects Node, TypeScript, Python, Go, Rust, Java, Ruby, and PHP, and tailors CI
workflows, install/test commands, and Dependabot ecosystems to what it finds.

```bash
repoready doctor --fail-under 80    # exit 1 in CI below a threshold
repoready doctor --json             # machine-readable
```

Requires Node 22+. Full documentation:
https://github.com/Jadeni77/RepoReady#readme

## License

MIT
