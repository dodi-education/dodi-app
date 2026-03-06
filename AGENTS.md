# Codex Project Instructions (Dodi)

## Mistakes made by the Agent
- If the agent makes a mistake or introduces a bug it should note it down in a MISTAKES.md file which is excluded from git.
- Once noted in the MISTAKES.md agents should avoid the mistake and also similar mistakes.

Use Codex normally in this repository, and also apply the project rules in [CLAUDE.md](./CLAUDE.md).

## Instruction Order
1. Follow Codex system/developer/tool instructions first.
2. Follow explicit user requests next.
3. Then follow this `AGENTS.md`.
4. Treat `CLAUDE.md` as mandatory project conventions unless it conflicts with higher-priority instructions above.

## Required Behavior In This Repo
- Read and apply `CLAUDE.md` before making code changes.
- Use `CLAUDE.md` conventions for architecture, code style, security, testing, and workflow.
- If a `CLAUDE.md` rule conflicts with higher-priority instructions, follow higher-priority instructions and note the conflict briefly.
