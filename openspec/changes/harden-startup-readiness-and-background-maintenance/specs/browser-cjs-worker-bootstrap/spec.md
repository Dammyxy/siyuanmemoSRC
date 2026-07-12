## ADDED Requirements

### Requirement: CJS browser compatibility is installed lazily at the Worker boundary
The shipped CJS plugin SHALL acquire any required browser constructor surface only while creating the inline backend Worker and SHALL NOT mutate browser globals as a module-import side effect.

#### Scenario: Plugin module is imported without constructing the backend transport
- **WHEN** the CJS entry module and transport modules are evaluated but no backend Worker transport is constructed
- **THEN** `globalThis.window`, `globalThis.self`, `globalThis.Worker`, `globalThis.Blob`, and `globalThis.URL` descriptors SHALL remain unchanged

#### Scenario: Backend transport constructs the inline Worker
- **WHEN** `BrowserSrsBackendWorkerTransport` creates the Vite inline Worker wrapper
- **THEN** it SHALL acquire only the constructors or aliases proven necessary by the built wrapper
- **AND** compatibility setup SHALL be local to that construction boundary

### Requirement: Existing host globals are preserved
The CJS Worker bootstrap SHALL never overwrite an existing valid browser global or silently redefine a non-configurable host property.

#### Scenario: All required globals already exist
- **WHEN** the SiYuan host exposes valid `Worker`, `Blob`, `URL`, `window`, or `self` surfaces used by the built wrapper
- **THEN** the bootstrap SHALL reuse them without changing their values or property descriptors

#### Scenario: A required property is non-writable or non-configurable
- **WHEN** the built wrapper requires a missing/invalid surface that cannot be safely defined because of its descriptor
- **THEN** Worker construction SHALL fail explicitly with a safe compatibility reason
- **AND** it SHALL not partially mutate other globals and continue

### Requirement: Temporary compatibility aliases are restored
If explicit constructor injection is impossible and the built wrapper requires temporary global aliases, the bootstrap SHALL snapshot descriptors, install only missing requirements, and restore the original descriptors in `finally` after construction.

#### Scenario: Worker construction succeeds with temporary aliases
- **WHEN** temporary aliases are required and the inline Worker constructor returns successfully
- **THEN** every changed descriptor SHALL be restored immediately after construction
- **AND** the live Worker transport SHALL not depend on a detached import-time installer

#### Scenario: Worker construction throws
- **WHEN** the inline Worker wrapper throws during construction
- **THEN** descriptor restoration SHALL still run
- **AND** the original construction failure SHALL remain observable

#### Scenario: Two transports construct sequentially
- **WHEN** two plugin transport instances construct Workers in the same shared host
- **THEN** each construction SHALL preserve the host's pre-existing descriptor state
- **AND** neither instance SHALL inherit leaked temporary aliases from the other

### Requirement: Window and self aliases require built-bundle evidence
The bootstrap SHALL prefer explicit `Worker`, `Blob`, and `URL` constructor injection and SHALL NOT create `window` or `self` aliases unless the shipped CJS wrapper demonstrably reads them.

#### Scenario: Built wrapper uses explicit constructors only
- **WHEN** built-bundle inspection and smoke evaluation show that inline Worker creation does not require `window` or `self`
- **THEN** the bootstrap SHALL not define those aliases

#### Scenario: Built wrapper resolves a lexical or global alias later
- **WHEN** smoke evaluation proves the wrapper reads a browser alias after constructor return
- **THEN** implementation SHALL use an isolated long-lived adapter or another scoped mechanism proven safe for the wrapper lifecycle
- **AND** it SHALL not install a process-wide import-time alias

### Requirement: The shipped CJS bundle is the compatibility acceptance target
Compatibility tests SHALL evaluate the built `dist/index.js`/inline Worker construction shape in addition to source-level unit tests.

#### Scenario: Bundle runs in a SiYuan-like CJS host
- **WHEN** the built plugin is evaluated with lexical browser APIs, missing `globalThis` aliases, and the supported SiYuan CJS module surface
- **THEN** backend Worker construction SHALL succeed without persistent global pollution

#### Scenario: Bundle host lacks a required browser constructor
- **WHEN** neither explicit injection nor a safe host global provides a required constructor
- **THEN** startup SHALL fail with an explicit backend Worker compatibility error
- **AND** it SHALL not fall back to a renderer-side database implementation
