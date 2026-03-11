import type { Figure } from '../types';
import { getNodeAbsPos } from './math';

export function renderFigure(
    ctx: CanvasRenderingContext2D,
    figure: Figure,
    options: {
        showHandles: boolean;
        showStaticHandles: boolean;
        opacity?: number;
        colorOverride?: string;
        isSelectedObject?: boolean;
        selectedNodeId?: string | null;
    }
) {
    const { showHandles, showStaticHandles, opacity = 1, colorOverride, isSelectedObject = true } = options;

    // Sort nodes by zOrder for rendering
    const nodes = Object.values(figure.nodes).sort((a, b) => a.zOrder - b.zOrder);

    // Draw segments first
    nodes.forEach(node => {
        if (!node.parentId) return;

        const parent = figure.nodes[node.parentId];
        const start = getNodeAbsPos(figure, node.parentId);
        const end = getNodeAbsPos(figure, node.id);

        ctx.globalAlpha = opacity;

        let segColor = colorOverride || node.segment?.color || '#fff';
        if (!isSelectedObject) segColor = '#666';

        ctx.strokeStyle = segColor;
        ctx.fillStyle = segColor;

        if (node.segment?.shape === 'CIRCLE') {
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) / 2;
            ctx.beginPath();
            ctx.arc(midX, midY, radius, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Tapered segment (Trapezoid)
            const w1 = parent.thickness;
            const w2 = node.thickness;

            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0) {
                const nx = -dy / dist;
                const ny = dx / dist;

                // 4 corners of the trapezoid
                const p1x = start.x + nx * (w1 / 2);
                const p1y = start.y + ny * (w1 / 2);
                const p2x = start.x - nx * (w1 / 2);
                const p2y = start.y - ny * (w1 / 2);
                const p3x = end.x - nx * (w2 / 2);
                const p3y = end.y - ny * (w2 / 2);
                const p4x = end.x + nx * (w2 / 2);
                const p4y = end.y + ny * (w2 / 2);

                ctx.beginPath();
                ctx.moveTo(p1x, p1y);
                ctx.lineTo(p2x, p2y);
                ctx.lineTo(p3x, p3y);
                ctx.lineTo(p4x, p4y);
                ctx.closePath();
                ctx.fill();

                // Draw round joins at both ends for smooth rotation
                ctx.beginPath();
                ctx.arc(start.x, start.y, w1 / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(end.x, end.y, w2 / 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });

    // Draw handles if enabled
    if (showHandles) {
        nodes.forEach(node => {
            const isStatic = node.handleType === 'STATIC';
            if (!showStaticHandles && isStatic && isSelectedObject) return;

            const pos = getNodeAbsPos(figure, node.id);

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, isStatic ? 3 : 5, 0, Math.PI * 2);
            ctx.globalAlpha = opacity;

            const isThisNodeSelected = node.id === options.selectedNodeId;

            if (!isSelectedObject) {
                ctx.fillStyle = '#666'; // Unselected figure handles
            } else if (!node.parentId) {
                // Root Handle is ALWAYS Red if selected object
                ctx.fillStyle = '#ff0000';
            } else if (isThisNodeSelected) {
                if (node.handleType === 'ROTATE') {
                    ctx.fillStyle = '#ffcc00'; // Rotation handle
                } else if (node.handleType === 'STRETCH') {
                    ctx.fillStyle = '#34c759'; // Stretch handle
                } else {
                    ctx.fillStyle = '#999999'; // Static handle selected
                }
            } else {
                ctx.fillStyle = '#ffffff'; // Normal unselected nodes within active figure
            }

            ctx.fill();
            if (isSelectedObject &&
                (!node.parentId || isThisNodeSelected || (!node.parentId && isThisNodeSelected))) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
            } else {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        });
    }

    ctx.globalAlpha = 1.0;
}
