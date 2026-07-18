# Issue Tracker: GitHub

Issues and PRDs live in `Dammyxy/siyuan-plugin-siyuanmemo` GitHub Issues.

The Git remote points elsewhere. Every `gh` command must explicitly include:

`--repo Dammyxy/siyuan-plugin-siyuanmemo`

## Commands

- Create: `gh issue create --repo Dammyxy/siyuan-plugin-siyuanmemo --title "..." --body "..."`
- Read: `gh issue view <number> --repo Dammyxy/siyuan-plugin-siyuanmemo --comments`
- List: `gh issue list --repo Dammyxy/siyuan-plugin-siyuanmemo --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --repo Dammyxy/siyuan-plugin-siyuanmemo --body "..."`
- Label: `gh issue edit <number> --repo Dammyxy/siyuan-plugin-siyuanmemo --add-label "..."`
- Close: `gh issue close <number> --repo Dammyxy/siyuan-plugin-siyuanmemo --comment "..."`

Use `--body-file` for long Markdown bodies.

## Pull Requests As A Triage Surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and PRs. Resolve an ambiguous
reference with `gh pr view <number> --repo Dammyxy/siyuan-plugin-siyuanmemo`,
then fall back to `gh issue view <number> --repo Dammyxy/siyuan-plugin-siyuanmemo`.

## Skill Vocabulary

- "Publish to the issue tracker" means create a GitHub issue.
- "Fetch the relevant ticket" means read the issue and its comments.
- `/wayfinder` uses one `wayfinder:map` issue plus linked child issues.
- Prefer native GitHub sub-issues and issue dependencies.
- If unavailable, use task lists and `Blocked by: #<number>` lines.
- Claim work with `gh issue edit <number> --repo Dammyxy/siyuan-plugin-siyuanmemo --add-assignee @me`.
