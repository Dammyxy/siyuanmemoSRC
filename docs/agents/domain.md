# Domain Docs

This repository uses a single-context domain-document layout.

## Before Exploring

- Read root `CONTEXT.md`.
- Read ADRs under `docs/adr/` relevant to the task.
- If either path is absent, proceed silently.

## Layout

```text
/
|-- CONTEXT.md
|-- docs/adr/
`-- src/
```

## Vocabulary

Use canonical terms from `CONTEXT.md` in issues, plans, hypotheses, tests,
and implementation. Avoid synonyms explicitly rejected by the glossary.

A missing concept may indicate vocabulary drift or a domain-model gap.
Record genuine gaps through the domain-modeling workflow.

## ADR Conflicts

Surface conflicts with existing ADRs explicitly. Do not silently override
a recorded decision.
