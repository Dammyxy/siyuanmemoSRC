## ADDED Requirements

### Requirement: SQL-first card runtime treats faceKey as semantic locator authority
The SQL-first card runtime SHALL preserve `faceKey` as the authoritative review-instance locator and SHALL ensure active runtime reads prefer hydrated `faceKey` over projection metadata.

#### Scenario: Hydrated SQL card ignores stale projection face index
- **WHEN** a SQL-hydrated card contains `faceKey.faceIndex` and stale legacy `meta.faceIndex`
- **THEN** active runtime consumers SHALL select the review instance identified by `faceKey.faceIndex`

#### Scenario: Projection metadata remains non-authoritative
- **WHEN** SQL projection columns or legacy `meta` fields disagree with full payload `faceKey`
- **THEN** semantic locator reads SHALL use the full payload `faceKey`
- **AND** projection metadata SHALL NOT be treated as the source of truth for review-instance identity

#### Scenario: Legacy fallback is explicit compatibility-read
- **WHEN** an old SQL row lacks `faceKey` but still has legacy `meta.faceIndex` or `meta.typeMarker`
- **THEN** active runtime MAY use legacy metadata to keep the card readable
- **AND** the fallback SHALL remain named compatibility behavior until the card is migrated or repaired
