import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
  DEFAULT_NEURAL_ROAM_ROUTE_NAME,
  migrateLegacyNeuralRoamStateToDefaultRoute,
} from '../routes';

describe('migrateLegacyNeuralRoamStateToDefaultRoute', () => {
  it('migrates v8 orbit and hyperspace assets into the default route', () => {
    const migrated = migrateLegacyNeuralRoamStateToDefaultRoute({
      version: 8,
      engineMode: 'hyperspace',
      orbit: {
        seedPool: [{
          nodeId: 'concept-a',
          nodeKind: 'concept',
          priority: 0.8,
          neighborsViewed: 2,
          addedAt: 1,
          nodePreview: 'Concept A',
        }],
        anchorPool: [{
          nodeId: 'station-a',
          nodeKind: 'virtual',
          priority: 0.6,
          neighborsViewed: 0,
          addedAt: 2,
          nodePreview: 'Station A',
        }],
        session: {
          displayPath: ['concept-a'],
          displayPathEventIds: ['event-orbit-a'],
          currentPathIndex: 0,
          navigationMode: 'explore',
          bookmarkPathIndex: null,
          history: [{
            eventId: 'event-orbit-a',
            nodeId: 'concept-a',
            nodePreview: 'Concept A',
            associationType: 'focus',
            reason: 'focus',
            visitedAt: 10,
            sessionId: 'orbit-session',
            engineMode: 'orbit',
            activationKind: 'focus-root',
          }],
          currentFocus: 'concept-a',
          currentFocusEventId: 'event-orbit-a',
          currentSessionId: 'orbit-session',
          visitedBlocks: ['concept-a'],
          exhaustedFocuses: [],
        },
      },
      hyperspace: {
        sourcePool: [{
          nodeId: 'hyper-source-a',
          nodeKind: 'element',
          role: 'activation-source',
          priority: 0.9,
          addedAt: 3,
          visitedAt: 4,
          nodePreview: 'Hyper Source A',
        }],
        anchorPool: [{
          nodeId: 'hyper-station-a',
          nodeKind: 'concept',
          role: 'orbit-center',
          priority: 0.7,
          addedAt: 5,
          visitedAt: 6,
          nodePreview: 'Hyper Station A',
        }],
        session: {
          displayPath: ['hyper-source-a'],
          displayPathEventIds: ['event-hyper-a'],
          currentPathIndex: 0,
          navigationMode: 'explore',
          bookmarkPathIndex: null,
          history: [{
            eventId: 'event-hyper-a',
            nodeId: 'hyper-source-a',
            nodePreview: 'Hyper Source A',
            associationType: 'semantic',
            reason: 'semantic',
            visitedAt: 20,
            sessionId: 'hyper-session',
            engineMode: 'hyperspace',
            activationKind: 'source-root',
          }],
          currentLeadSource: 'hyper-source-a',
          currentLeadSourceEventId: 'event-hyper-a',
          currentSessionId: 'hyper-session',
          visitedBlocks: ['hyper-source-a'],
          frontier: [],
        },
      },
      pendingAssociatedReviewCardIds: [],
      seenAssociatedReviewCardIds: [],
    }, 100);

    expect(migrated?.activeRouteId).toBe(DEFAULT_NEURAL_ROAM_ROUTE_ID);
    expect(migrated?.engineMode).toBe('hyperspace');
    expect(migrated?.routes[0].metadata).toMatchObject({
      id: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      name: DEFAULT_NEURAL_ROAM_ROUTE_NAME,
    });
    expect(migrated?.routes[0].seedPool.map((entry) => entry.nodeId)).toEqual(['concept-a', 'hyper-source-a']);
    expect(migrated?.routes[0].anchorPool.map((entry) => entry.nodeId)).toEqual(['station-a', 'hyper-station-a']);
    expect(migrated?.routes[0].sessions.orbit?.currentSessionId).toBe('orbit-session');
    expect(migrated?.routes[0].sessions.hyperspace?.currentSessionId).toBe('hyper-session');
    expect(migrated?.routes[0].history.map((entry) => [entry.engineMode, entry.nodeId])).toEqual([
      ['orbit', 'concept-a'],
      ['hyperspace', 'hyper-source-a'],
    ]);
  });

  it('migrates orbit-only seed and station state into the default route', () => {
    const migrated = migrateLegacyNeuralRoamStateToDefaultRoute({
      version: 6,
      seedPool: [{
        nodeId: 'concept-a',
        nodeKind: 'concept',
        priority: 0.5,
        neighborsViewed: 0,
        addedAt: 1,
        nodePreview: 'Concept A',
      }],
      anchorPool: [{
        nodeId: 'station-a',
        nodeKind: 'virtual',
        priority: 0.5,
        neighborsViewed: 0,
        addedAt: 2,
        nodePreview: 'Station A',
      }],
      session: {
        displayPath: [],
        currentPathIndex: -1,
        navigationMode: 'explore',
        bookmarkPathIndex: null,
        history: [],
        currentFocus: null,
        currentSessionId: null,
        visitedBlocks: [],
        exhaustedFocuses: [],
      },
    }, 100);

    expect(migrated?.engineMode).toBe('orbit');
    expect(migrated?.routes[0].seedPool.map((entry) => entry.nodeId)).toEqual(['concept-a']);
    expect(migrated?.routes[0].anchorPool.map((entry) => entry.nodeId)).toEqual(['station-a']);
    expect(migrated?.routes[0].sessions.hyperspace).toBeNull();
  });

  it('splits legacy focus pool entries by node kind', () => {
    const migrated = migrateLegacyNeuralRoamStateToDefaultRoute({
      version: 4,
      focusPool: [
        {
          nodeId: 'concept-a',
          nodeKind: 'concept',
          priority: 0.5,
          neighborsViewed: 0,
          addedAt: 1,
          nodePreview: 'Concept A',
        },
        {
          nodeId: 'virtual-a',
          nodeKind: 'virtual',
          priority: 0.5,
          neighborsViewed: 0,
          addedAt: 2,
          nodePreview: 'Virtual A',
        },
      ],
      session: {
        displayPath: [],
        currentPathIndex: -1,
        navigationMode: 'explore',
        bookmarkPathIndex: null,
        history: [],
        currentFocus: null,
        currentSessionId: null,
        visitedBlocks: [],
        exhaustedFocuses: [],
      },
    }, 100);

    expect(migrated?.routes[0].seedPool.map((entry) => entry.nodeId)).toEqual(['concept-a']);
    expect(migrated?.routes[0].anchorPool.map((entry) => entry.nodeId)).toEqual(['virtual-a']);
  });
});
