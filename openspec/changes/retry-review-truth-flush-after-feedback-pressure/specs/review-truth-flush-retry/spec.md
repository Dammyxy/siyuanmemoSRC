# review-truth-flush-retry Specification

## ADDED Requirements

### Requirement: Truth Flush Pressure Suppression Retries

When queued Review truth flush attempts a SiYuan persistence host effect while Review feedback requests are active and the transport rejects it with pressure suppression, the client SHALL keep queued journal truth entries pending and SHALL retry the flush after pressure clears instead of recording a terminal pending error.

#### Scenario: Queued truth flush is suppressed during active feedback

- **GIVEN** queued Review truth journal entries
- **AND** a Review feedback request is still in flight
- **WHEN** queued truth flush attempts `truth.writeBinary` and receives `review.feedback suppressed SiYuan persistence host effect truth.writeBinary`
- **THEN** the entries remain queued
- **AND** no terminal pending truth flush error is recorded for that pressure condition
- **AND** a later flush retry is scheduled

### Requirement: Non-Pressure Truth Flush Errors Remain Visible

Queued Review truth flush errors that are not pressure suppression SHALL remain visible as pending errors.

#### Scenario: Truth flush fails for a real persistence error

- **GIVEN** queued Review truth journal entries
- **WHEN** truth flush fails with an error other than pressure suppression
- **THEN** the pending error remains visible
- **AND** the existing explicit unavailable diagnostics are preserved
