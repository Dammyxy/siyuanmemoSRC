import type { AssociationType as CoreAssociationType, OrbitNodeType } from '@/core/queue/neural/types';

export { AssociationType, OrbitNodeType } from '@/core/queue/neural/types';

export interface NodeColor {
    background: string;
    border: string;
    highlight: {
        background: string;
        border: string;
    };
}

export interface EdgeColor {
    color: string;
    highlight?: string;
    hover?: string;
}

export interface GraphNode {
    id: string;
    label: string;
    title: string;
    type: 'history' | 'seed' | 'current' | 'missed' | 'candidate';
    isCurrent?: boolean;
    associationType?: CoreAssociationType;
    size: number;
    color: NodeColor;
    icon?: string;
    refs?: number;
    defs?: number;
    orbitNodeType?: OrbitNodeType;
}

export interface GraphEdge {
    from: string;
    to: string;
    arrows?: 'to' | 'from' | 'to,from';
    color?: EdgeColor;
    width?: number;
    label?: string;
}

export interface CandidateNode {
    id: string;
    type: CoreAssociationType;
    weight: number;
    reason: string;
}

export interface WindowConfig {
    size: {
        width: number;
        height: number;
    };
    position: {
        x: number;
        y: number;
    };
    visible: boolean;
}
