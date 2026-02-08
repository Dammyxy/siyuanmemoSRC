/**
 * Infrastructure-level graph rendering types.
 * Keep renderer option types here to avoid UI layer coupling.
 */

/**
 * vis-network configuration options (simplified)
 */
export interface VisNetworkOptions {
    nodes?: any;
    edges?: any;
    physics?: any;
    interaction?: any;
    layout?: any;
}

/**
 * Focus options
 */
export interface FocusOptions {
    animation?: {
        duration: number;
        easingFunction: string;
    };
    scale?: number;
}
