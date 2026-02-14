/**
 * OrbitGraphUseCase - 应用层用例
 *
 * 负责组合图谱数据服务与配置存储，输出 UI 需要的聚合结果。
 */

import type { NeuralRoamQueue } from '@/queues/NeuralRoamQueue';
import { AssociationType } from '@/core/queue/neural/types';
import type { GraphNode, GraphEdge, WindowConfig } from '@/application/graph/types';
import { GraphDataService } from './GraphDataService';
import { GraphStorageService } from './GraphStorageService';

export interface OrbitGraphResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Map<string, { x: number; y: number }>;
    currentNodeId: string | null;
    highlightedNodes: Set<string>;
    directionCounts: Record<AssociationType, number>;
}

export class OrbitGraphUseCase {
    private dataService: GraphDataService;
    private storageService: GraphStorageService;

    constructor(queue: NeuralRoamQueue, storageService?: GraphStorageService) {
        this.dataService = new GraphDataService(queue);
        this.storageService = storageService ?? new GraphStorageService();
    }

    getDefaultDirections(): AssociationType[] {
        return [
            AssociationType.REF_LINK,
            AssociationType.HIERARCHY,
            AssociationType.TAG,
            AssociationType.SIBLING,
        ];
    }

    loadDirections(availableDirections: AssociationType[]): Set<AssociationType> {
        const savedDirections = this.storageService.loadDirections();
        const directions = new Set(Array.from(savedDirections) as AssociationType[]);
        return directions.size > 0 ? directions : new Set(availableDirections);
    }

    saveDirections(directions: Set<AssociationType>): void {
        this.storageService.saveDirections(new Set(Array.from(directions) as string[]));
    }

    loadWindowConfig(): WindowConfig | null {
        return this.storageService.loadWindowConfig();
    }

    saveWindowConfig(config: WindowConfig): void {
        this.storageService.saveWindowConfig(config);
    }

    async loadOrbitGraph(selectedDirections: Set<AssociationType>): Promise<OrbitGraphResult> {
        const orbitData = await this.dataService.getOrbitGraphData(selectedDirections);
        const currentNodeId = this.dataService.getCurrentNode();
        const highlightedNodes = new Set(this.dataService.getHistoryPath());

        const directionCounts: Record<AssociationType, number> = {} as any;
        this.getDefaultDirections().forEach(direction => {
            directionCounts[direction] = 0;
        });
        for (const node of orbitData.nodes) {
            if (node.type === 'candidate' && node.associationType) {
                directionCounts[node.associationType] = (directionCounts[node.associationType] || 0) + 1;
            }
        }

        return {
            nodes: orbitData.nodes,
            edges: orbitData.edges,
            positions: orbitData.positions,
            currentNodeId,
            highlightedNodes,
            directionCounts,
        };
    }
}
