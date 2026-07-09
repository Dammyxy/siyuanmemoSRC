## REMOVED Requirements

### Requirement: Xiuyuan startup sync exposes staged lifecycle diagnostics
**Reason**: Native Riff startup synchronization is retired; startup performs no Native Riff scan or sync job.
**Migration**: Use Explicit Native Riff Import or Explicit Native Riff Adoption preview/apply.

### Requirement: Xiuyuan startup sync observes cooperative cancellation
**Reason**: The `xiuyuan-startup-sync` background job and staged lifecycle are removed.
**Migration**: Explicit import/adoption apply owns its own user-visible batch lifecycle and no longer runs from startup.

### Requirement: Existing Xiuyuan sync ownership remains unchanged
**Reason**: Continuous Xiuyuan Native Riff sync ownership is intentionally replaced by read-only explicit import.
**Migration**: Existing `riff-managed` cards use explicit in-place adoption; manual full/incremental sync no longer exists.

