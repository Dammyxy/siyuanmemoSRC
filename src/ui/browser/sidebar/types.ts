export type SidebarNodeKind = 'queue' | 'doc' | string;

export interface SidebarNode {
  id: string;
  kind: SidebarNodeKind;
  label: string;
  icon?: string;
  count?: number;
}

export interface SidebarSection {
  id: string;
  title: string;
  nodes: SidebarNode[];
}

export interface SidebarSelection {
  kind: SidebarNodeKind;
  ids: string[];
}
