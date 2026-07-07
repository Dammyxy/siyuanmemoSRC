## MODIFIED Requirements

### Requirement: Projection rebuild decisions remain fail-closed and behavior-preserving
The reconciler SHALL preserve existing restart behavior for derived Review queue projection replacement and SHALL propagate reconciliation failures instead of hiding them behind fallback or compatibility paths. During ordinary Review scoring, reconciler and projection repair work SHALL consume explicit queue-impact or deferred-repair evidence and SHALL NOT require unrelated queue Module recreation before the visible Review card switches.

#### Scenario: Proven reviewed card is removed from stale projection
- **WHEN** journal and durable event evidence prove a Review already happened but the current queue projection still includes the reviewed card in the matching Review queue
- **THEN** the reconciler SHALL replace that queue projection from the authoritative card repository query so the reviewed card does not return to ready count after restart

#### Scenario: Deferred CDF repair is reconciled later
- **WHEN** Review CDF preparation records deferred repair evidence during ordinary scoring
- **THEN** the reconciler or explicit repair owner SHALL later consume that evidence without forcing the Review scoring hot path to create unrelated queue Modules

#### Scenario: Missing work is a no-op
- **WHEN** no relevant Review feedback journal entries, CDF deferred repair entries, or required projection dependencies are available
- **THEN** the reconciler SHALL complete without changing queue projection state

#### Scenario: Dependency failure propagates
- **WHEN** journal listing, durable event lookup, repository query, transaction execution, queue projection replacement, or deferred CDF repair reconciliation fails during reconciliation
- **THEN** the reconciler SHALL surface the failure to startup or diagnostics and SHALL NOT compute Review readiness from stale local queue state, legacy snapshots, or an alternate fallback path
