# CDF Live Relation Authority

This note documents the first live-authority domain layer for CDF definition and descriptor cards. It is a developer contract, not a finished UI workflow.

## Authority

CDF definition and descriptor relations are derived from live SiYuan block structure and block references. `fieldMapping` is a derived snapshot for existing render/interoperability paths only. If live derive fails, the relation is blocked or unavailable; `fieldMapping` must not reactivate it.

Live relation identity is:

```text
sourceBlockId + conceptBlockId + relationKind
```

Supported relation kinds:

- `definition-forward`
- `definition-reverse`
- `descriptor-forward`
- `descriptor-reverse`

Both-direction operators expand into two independent directional relations.

## Card Source Grammar

The parser recognizes these operators with longest-match priority:

- Item: `>>`, `<<`, `<>`, `>>>`
- Definition: `::`, `:>`, `:<`, `:::`
- Descriptor: `;;`, `;<`, `;<>`, `;;;`

Fullwidth and Chinese-angle variants are equivalent to ASCII forms, including mixed-width operators. Operator-like text inside fenced code, inline code, and math is ignored. A source block with more than one main operator records blocking `invalid-source-grammar`.

Definition concepts bind from refs in the source block itself. Descriptor concepts bind from the nearest live direct-child concept boundary. Heading/document fallback is intentionally rejected for live CDF binding.

## Statuses

Relation status:

- `active-live`
- `orphaned-by-live-relation`
- `duplicate-live-relation`
- `legacy-relation-unavailable`

Content status:

- `content-complete`
- `content-incomplete`

Queue eligibility requires `active-live`, no blocking live relation issue, and content not `content-incomplete`.

## Deferred Modes

The first live-authority slice does not provide editable relation chips, concept picker, direction mutation, duplicate FSRS merge, repair undo/history, or session cap redesign. Those remain second-version work after live parser, reconciler, structured editor, Browser repair, and Review session insertion are wired into runtime flows.
