import type { Figure, Point, FigureNode } from '../types';

/**
 * Calculates the absolute position of a node based on its parent hierarchy.
 */
export function getNodeAbsPos(figure: Figure, nodeId: string): Point {
    const node = figure.nodes[nodeId];
    if (!node) return { x: 0, y: 0 };

    if (!node.parentId) {
        return { x: node.relX, y: node.relY };
    }

    const parentPos = getNodeAbsPos(figure, node.parentId);
    return {
        x: parentPos.x + node.relX,
        y: parentPos.y + node.relY
    };
}

/**
 * Bilinear interpolation for a single property between two values.
 */
export function interpolate(v1: number, v2: number, t: number): number {
    return v1 + (v2 - v1) * t;
}

/**
 * Interpolates between two figure states.
 */
export function interpolateFigures(f1: Figure, f2: Figure, t: number): Figure {
    const newNodes: Record<string, FigureNode> = {};

    Object.keys(f1.nodes).forEach(id => {
        const n1 = f1.nodes[id];
        const n2 = f2.nodes[id];

        if (n2) {
            newNodes[id] = {
                ...n1,
                relX: interpolate(n1.relX, n2.relX, t),
                relY: interpolate(n1.relY, n2.relY, t),
                thickness: interpolate(n1.thickness, n2.thickness, t),
                zOrder: Math.round(interpolate(n1.zOrder, n2.zOrder, t))
            };
        } else {
            newNodes[id] = { ...n1 };
        }
    });

    return { ...f1, nodes: newNodes };
}

/**
 * Rotates a point around another point.
 */
export function rotatePoint(p: Point, center: Point, angle: number): Point {
    const s = Math.sin(angle);
    const c = Math.cos(angle);

    // translate point back to origin:
    const px = p.x - center.x;
    const py = p.y - center.y;

    // rotate point
    const xnew = px * c - py * s;
    const ynew = px * s + py * c;

    // translate point back:
    return {
        x: xnew + center.x,
        y: ynew + center.y
    };
}

/**
 * Calculates angle between two points in radians.
 */
export function getAngle(p1: Point, p2: Point): number {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Calculates distance between two points.
 */
export function getDistance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}
/**
 * Calculates distance from a point to a line segment.
 */
export function isPointNearSegment(p: Point, s1: Point, s2: Point, threshold: number): boolean {
    const dx = s2.x - s1.x;
    const dy = s2.y - s1.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return getDistance(p, s1) < threshold;

    let t = ((p.x - s1.x) * dx + (p.y - s1.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));

    const projection = {
        x: s1.x + t * dx,
        y: s1.y + t * dy
    };

    return getDistance(p, projection) < threshold;
}
