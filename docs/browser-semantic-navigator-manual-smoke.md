# Browser Semantic Navigator Manual Smoke

Date: 2026-05-16

Scope: OpenSpec change `add-browser-semantic-navigator`.

## Preconditions

- Plugin built and reloaded in SiYuan.
- At least one Concept card exists in Browser.
- At least one non-Concept card exists in Browser.
- Writer/follower smoke needs two plugin windows when available.

## Smoke Steps

1. Browser Semantic start/restore
   - Select a Concept card in Browser.
   - Start Semantic.
   - Expect a Semantic session rooted at that Concept.
   - Start Semantic again from same Concept before ending session.
   - Expect existing active same-root session restored, not a new old NeuralRoam queue mode.

2. Non-Concept unavailable
   - Select a non-Concept card.
   - Start Semantic.
   - Expect explicit unavailable state for missing Concept focus.
   - Expect no Semantic session created.

3. Candidate follow
   - In Browser Semantic Navigator, follow one candidate from each lens when available.
   - Expect narrative path appends actual followed nodes.
   - Expect non-active lens follow switches lens through the Semantic command result.

4. Station management
   - Create a node station.
   - Create a path station.
   - Open the path station.
   - Expect current node/path restored to station terminal state.
   - Archive the station.
   - Expect station hidden only after command success.
   - Expect events/evidence remain queryable; archive is not destructive undo.

5. Implicit-node guard
   - Navigate to an implicit knowledge node.
   - Expect no reveal, Again, Hard, Good, Easy, scheduling, or auto-create-card controls in Browser.

6. Open in Review handoff
   - From Browser Semantic Navigator, choose Open in Review.
   - Expect Review Semantic surface opens/focuses same Semantic session/current node.
   - Expect ordinary review-only session not created.

7. Writer unavailable
   - In follower mode, attempt follow/create/archive/restore/end when writer relay is unavailable.
   - Expect explicit `writer-unavailable`.
   - Expect current Browser station/path UI state remains visible until confirmed command success.

## Current Implementation Note

This smoke is the target runtime checklist. The current code slice supplies Browser-owned read model, component, and state/controller seams plus writer-owned station commands. Wiring into the mounted `SRSBrowser.vue` toolbar/panel remains the next integration slice.
