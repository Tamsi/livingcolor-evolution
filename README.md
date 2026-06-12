# Hermes Curator

Autonomous system that keeps [Hermes Skills](https://github.com/livingcolor/hermes-skills) up to date by monitoring role-aligned sources (security, architecture, QA, agile), auditing skills, and opening improvement PRs.

## How it works

```
Trend Scout → Extract → Normalize → Audit → Refactor → Evaluate → Pull Request
```

1. **Source Fetcher** fetches role-aligned sources from `config/sources.yaml`
2. **Knowledge Extractor** turns raw findings into structured practices (LLM via `@hermes/runner`, fallback rule-based)
3. **Knowledge Normalizer** deduplicates and merges sources
4. **Skill Auditor** loads skills from `hermes-skills/registry/` and scores them
5. **Skill Refactorer** proposes additive prompt patches
6. **Evaluator** runs `@hermes/evaluator` — blocks regressions
7. **PR Generator** opens a GitHub PR (or writes a local draft)

### Sources configuration

Role-to-source mappings live in `config/sources.yaml`. Each role lists one or more sources; findings are tagged with the role so audits stay focused (e.g. OWASP for `security-auditor`, Scrum.org for `ticket-analyst`).

| Type | Required fields | Description |
|------|-----------------|-------------|
| `rss` | `url` | RSS or Atom feed; parses recent entries |
| `changelog_url` | `url` | Plain-text changelog URL; parses version lines |
| `github_releases` | `repo` | GitHub release notes for `owner/repo` |

Optional `confidence` (0–1) weights finding trust per source. Tier rules (`tier1` / `tier2`) control auto-apply vs review in the PR pipeline.

## Quick start

```bash
pnpm install
pnpm build

# Full audit + report (no PR)
pnpm curator run

# Full pipeline + PR draft (or real PR with GITHUB_TOKEN)
GITHUB_TOKEN=ghp_... pnpm curator pr
```

## Environment

| Variable | Description |
|----------|-------------|
| `CURATOR_SKILLS_PATH` | Path to skill registry (default: `../hermes-skills/registry`) |
| `CURATOR_TARGET_REPO` | GitHub target (`owner/repo`) |
| `GITHUB_TOKEN` | Token for PR creation |
| `CURATOR_ROOT` | Project root override |
| `HERMES_LLM_PROVIDER` | Override LLM provider (`anthropic`, `openai`, `gemini`, `ollama`) |
| `CURATOR_LLM_MODEL` | Optional model override (e.g. `claude-sonnet-4-20250514`) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / … | Credentials for LLM extraction |
| `CURATOR_MOCK_LLM` | Offline extraction without API (`true`) |
| `HERMES_MOCK_LLM` | Same as `CURATOR_MOCK_LLM` (hermes-skills convention) |

**Default LLM selection:** first available among Anthropic → OpenAI → Gemini. Ollama is used only when `HERMES_LLM_PROVIDER=ollama` is set explicitly. Without any API key, extraction falls back to rule-based mode.

## Schedule

Every **Sunday at 04:00 UTC** via `.github/workflows/curator-weekly.yml`.

## Architecture

Hexagonal monorepo — see `docs/superpowers/specs/2026-06-12-hermes-curator-v1-design.md`.

## License

MIT
