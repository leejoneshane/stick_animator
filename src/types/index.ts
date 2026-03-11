export interface Point {
  x: number;
  y: number;
}

export interface StageDimensions {
  width: number;
  height: number;
}

export type HandleType = 'STRETCH' | 'ROTATE' | 'STATIC';

export interface Segment {
  color: string;
  shape: 'TRAPEZOID' | 'CIRCLE';
}

export interface FigureNode {
  id: string;
  parentId: string | null;
  name: string;

  // Position relative to parent (or absolute if root)
  relX: number;
  relY: number;

  // Visual properties
  thickness: number;
  segment?: Segment;
  zOrder: number;

  // Control properties
  handleType: HandleType;
  isVisible: boolean; // Static handles can be hidden

  // Hierarchy
  children: string[];

  // Relationship
  link?: string; // ID of the node in another figure that this node is attached to
}

export interface Figure {
  id: string;
  name: string;
  origine?: string;
  nodes: Record<string, FigureNode>;
  rootId: string;
}

export interface Keyframe {
  id: string;
  figureStates: Record<string, Figure>; // figureId -> Figure state at this frame
  duration: number; // For manual in-betweening control (0-1)
  thumbnail?: string; // Base64 DataURL representation of the frame stage
}

export interface Animation {
  keyframes: Keyframe[];
  fps: number;
}
