import React, { useEffect, useState, useRef } from 'react';
import type { Figure, Point } from '../types';
import { getNodeAbsPos, getDistance, isPointNearSegment } from '../engine/math';
import { renderFigure } from '../engine/renderer';

interface CanvasViewProps {
    figures: Record<string, Figure>;
    onChange: (figures: Record<string, Figure>) => void;
    showStaticHandles: boolean;
    width: number;
    height: number;
    stageWidth?: number;
    stageHeight?: number;
    onSelectNode?: (nodeId: string | null) => void;
    onSelectFigure?: (figureId: string) => void;
    selectedNodeId?: string | null;
    selectedFigureId: string;
    onionSkins?: Record<string, Figure>[];
}

export const CanvasView: React.FC<CanvasViewProps> = ({
    figures,
    onChange,
    showStaticHandles,
    width,
    height,
    onSelectNode,
    onSelectFigure,
    selectedNodeId,
    selectedFigureId,
    onionSkins = [],
    stageWidth,
    stageHeight
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

    // Calculate topological depth of figures based on attachments (links)
    const sortedFigures = React.useMemo(() => {
        const nodeToFigureMap: Record<string, string> = {};
        Object.values(figures).forEach(fig => {
            Object.keys(fig.nodes).forEach(nodeId => {
                nodeToFigureMap[nodeId] = fig.id;
            });
        });

        const getFigureDepth = (figId: string, visited: Set<string> = new Set()): number => {
            if (visited.has(figId)) return 0;
            visited.add(figId);
            const fig = figures[figId];
            if (!fig) return 0;
            const rootNode = fig.nodes[fig.rootId];
            if (rootNode && rootNode.link) {
                const parentFigId = nodeToFigureMap[rootNode.link];
                if (parentFigId) {
                    return 1 + getFigureDepth(parentFigId, visited);
                }
            }
            return 0;
        };

        const getTreeRootId = (figId: string, visited: Set<string> = new Set()): string => {
            if (visited.has(figId)) return figId;
            visited.add(figId);
            const fig = figures[figId];
            if (!fig) return figId;
            const rootNode = fig.nodes[fig.rootId];
            if (rootNode && rootNode.link) {
                const parentFigId = nodeToFigureMap[rootNode.link];
                if (parentFigId) {
                    return getTreeRootId(parentFigId, visited);
                }
            }
            return figId;
        };

        const figureDepths: Record<string, number> = {};
        const figureRoots: Record<string, string> = {};

        Object.keys(figures).forEach(id => {
            figureDepths[id] = getFigureDepth(id);
            figureRoots[id] = getTreeRootId(id);
        });

        const selectedTreeRoot = selectedFigureId ? figureRoots[selectedFigureId] : null;

        return Object.entries(figures).map(([figId, fig]) => {
            const isSelectedTree = figureRoots[figId] === selectedTreeRoot;
            const score = (isSelectedTree ? 1000 : 0) + figureDepths[figId];
            return { figId, fig, score };
        }).sort((a, b) => a.score - b.score);
    }, [figures, selectedFigureId]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        // Draw Dark Backend
        ctx.fillStyle = '#111116';
        ctx.fillRect(0, 0, width, height);

        // Draw Stage Area
        if (stageWidth && stageHeight) {
            const offsetX = (width - stageWidth) / 2;
            const offsetY = (height - stageHeight) / 2;

            ctx.fillStyle = '#22222a'; // Lighter stage area
            ctx.fillRect(offsetX, offsetY, stageWidth, stageHeight);

            // Subtle stage border
            ctx.strokeStyle = '#333340';
            ctx.lineWidth = 2;
            ctx.strokeRect(offsetX, offsetY, stageWidth, stageHeight);
        }

        // Render Onion Skins
        onionSkins.forEach((skinState, index) => {
            const opacity = 0.1 + (index / onionSkins.length) * 0.2;
            Object.values(skinState).forEach(skin => {
                renderFigure(ctx, skin, {
                    showHandles: false,
                    showStaticHandles: false,
                    opacity,
                    colorOverride: '#444'
                });
            });
        });

        // Render figures topologically so connected items overlay properly
        sortedFigures.forEach(({ figId, fig }) => {
            const isSelected = figId === selectedFigureId;
            renderFigure(ctx, fig, {
                showHandles: true,
                showStaticHandles,
                isSelectedObject: isSelected,
                colorOverride: isSelected ? undefined : '#444',
                selectedNodeId: isSelected ? selectedNodeId : undefined
            });
        });

        // Highlight Selected Node / Segment
        const activeFigure = figures[selectedFigureId];
        if (selectedNodeId && activeFigure && activeFigure.nodes[selectedNodeId]) {
            const node = activeFigure.nodes[selectedNodeId];
            const pos = getNodeAbsPos(activeFigure, selectedNodeId);

            // Draw node highlight
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw segment highlight if it has a parent
            if (node.parentId) {
                const parentPos = getNodeAbsPos(activeFigure, node.parentId);
                ctx.beginPath();
                ctx.moveTo(parentPos.x, parentPos.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = node.thickness + 4;
                ctx.globalAlpha = 0.3;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }
    }, [figures, sortedFigures, showStaticHandles, width, height, stageWidth, stageHeight, selectedNodeId, selectedFigureId, onionSkins]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mousePos: Point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        let foundFigureId: string | null = null;
        let foundNodeId: string | null = null;

        const reversedFigures = [...sortedFigures].reverse();

        // 1. Try to find clicked handle (point) in all figures, top-down
        for (const { figId, fig } of reversedFigures) {
            const nodes = Object.values(fig.nodes).sort((a, b) => b.zOrder - a.zOrder);
            for (const node of nodes) {
                if (!showStaticHandles && node.handleType === 'STATIC') continue;
                const pos = getNodeAbsPos(fig, node.id);
                const dist = getDistance(mousePos, pos);
                if (dist < 15) {
                    foundFigureId = figId;
                    foundNodeId = node.id;
                    break;
                }
            }
            if (foundNodeId) break;
        }

        // 2. Try to find clicked segment (bone) if no handle found
        if (!foundNodeId) {
            for (const { figId, fig } of reversedFigures) {
                const nodes = Object.values(fig.nodes).sort((a, b) => b.zOrder - a.zOrder);
                for (const node of nodes) {
                    if (!node.parentId) continue;
                    const start = getNodeAbsPos(fig, node.parentId);
                    const end = getNodeAbsPos(fig, node.id);
                    // Use a hit-box slightly larger than the segment thickness
                    if (isPointNearSegment(mousePos, start, end, node.thickness / 2 + 5)) {
                        foundFigureId = figId;
                        foundNodeId = node.id;
                        break;
                    }
                }
                if (foundNodeId) break;
            }
        }

        // Handle figure selection switch if necessary
        if (foundFigureId && foundFigureId !== selectedFigureId && onSelectFigure) {
            onSelectFigure(foundFigureId);
        }

        setDraggingNodeId(foundNodeId);
        if (onSelectNode) onSelectNode(foundNodeId);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!draggingNodeId) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mousePos: Point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        const activeFigure = figures[selectedFigureId];
        if (!activeFigure) return;

        const node = activeFigure.nodes[draggingNodeId];
        if (!node) return;

        const newFigures = { ...figures };
        const newNodes = { ...activeFigure.nodes };

        let dx = 0;
        let dy = 0;

        if (!node.parentId) {
            // Root movement
            // Unlink if it was attached
            if (node.link) {
                newNodes[draggingNodeId] = { ...node, link: undefined, relX: mousePos.x, relY: mousePos.y };
            } else {
                dx = mousePos.x - node.relX;
                dy = mousePos.y - node.relY;
                newNodes[draggingNodeId] = { ...node, relX: mousePos.x, relY: mousePos.y };
            }
        } else {
            // Forward Kinematics (Rotation/Scaling)
            const isStretching = e.shiftKey || node.handleType === 'STRETCH';
            const oldAbsPos = getNodeAbsPos(activeFigure, draggingNodeId);

            if (isStretching) {
                // Stretching only acts locally on the immediate parent
                const parentPos = getNodeAbsPos(activeFigure, node.parentId);
                newNodes[draggingNodeId] = {
                    ...node,
                    relX: mousePos.x - parentPos.x,
                    relY: mousePos.y - parentPos.y
                };

                const newAbsPos = {
                    x: parentPos.x + newNodes[draggingNodeId].relX,
                    y: parentPos.y + newNodes[draggingNodeId].relY
                };
                dx = newAbsPos.x - oldAbsPos.x;
                dy = newAbsPos.y - oldAbsPos.y;
            } else {
                // Rotation Mode - Find true pivot by climbing STATIC joints
                let pivotNodeId = node.parentId;

                // Climb up if the intermediate parent is STATIC and not the root
                while (pivotNodeId && newNodes[pivotNodeId].parentId && newNodes[pivotNodeId].handleType === 'STATIC') {
                    pivotNodeId = newNodes[pivotNodeId].parentId!;
                }

                // If it climbed all the way to root, it will pivot around the root.
                // Otherwise it pivots around the first non-STATIC joint.
                const pivotAbsPos = getNodeAbsPos(activeFigure, pivotNodeId);

                // Calculate the rotation angle applied to the dragged node relative to the true pivot
                const oldAngle = Math.atan2(oldAbsPos.y - pivotAbsPos.y, oldAbsPos.x - pivotAbsPos.x);
                const newAngle = Math.atan2(mousePos.y - pivotAbsPos.y, mousePos.x - pivotAbsPos.x);
                const deltaAngle = newAngle - oldAngle;

                // Recursively apply rotation to ALL nodes that descend from the true pivot.
                // Because we only define relX/relY in our schema (relative to immediate parent), 
                // rotating a parent by an angle means its own relX/relY must be transformed by that angle.
                // Rotating a node's relX/relY effectively translates ALL of its children automatically 
                // when drawn, so we only need to rotate the direct children of the pivot, and the mathematics 
                // propagate naturally through the hierarchy up to the dragged node!

                // Find all direct children of the pivot 
                // Wait - rotating the subtree from the pivot means finding nodes in the chain from the pivot down to the dragged node.
                // Let's find the immediate child of the `pivotNodeId` that leads down to this branch, and rotate its relX/relY.

                let branchRootId = draggingNodeId;
                while (newNodes[branchRootId].parentId !== pivotNodeId && newNodes[branchRootId].parentId !== null) {
                    branchRootId = newNodes[branchRootId].parentId!;
                }

                if (newNodes[branchRootId].parentId === pivotNodeId) {
                    const s = Math.sin(deltaAngle);
                    const c = Math.cos(deltaAngle);

                    // Gather branchRoot and all its descendants to rotate them rigidly
                    const descendants = [branchRootId];
                    let i = 0;
                    while (i < descendants.length) {
                        const currId = descendants[i];
                        Object.values(newNodes).forEach(n => {
                            if (n.parentId === currId) {
                                descendants.push(n.id);
                            }
                        });
                        i++;
                    }

                    // Apply the rotation matrix to every descendant's relative vector
                    descendants.forEach(id => {
                        const targetNode = newNodes[id];
                        const oldX = targetNode.relX;
                        const oldY = targetNode.relY;
                        newNodes[id] = {
                            ...targetNode,
                            relX: oldX * c - oldY * s,
                            relY: oldX * s + oldY * c
                        };
                    });
                }

                // Calculate absolute delta of the dragged node recursively to cascade to linked figures
                // We fake a figure state block to calculate the new absolute pos
                const tempFigure = { ...activeFigure, nodes: newNodes };
                const newAbsPos = getNodeAbsPos(tempFigure, draggingNodeId);

                dx = newAbsPos.x - oldAbsPos.x;
                dy = newAbsPos.y - oldAbsPos.y;
            }
        }

        newFigures[selectedFigureId] = { ...activeFigure, nodes: newNodes };

        // Handle cascading links (if this figure moved, move everything attached to it recursively)
        if (dx !== 0 || dy !== 0) {
            const moveLinkedFigures = (anchorNodeId: string, deltaX: number, deltaY: number) => {
                Object.keys(newFigures).forEach(figId => {
                    if (figId === selectedFigureId) return;
                    const fig = newFigures[figId];
                    const rootNode = fig.nodes[fig.rootId];
                    if (rootNode && rootNode.link === anchorNodeId) {
                        newFigures[figId] = {
                            ...fig,
                            nodes: {
                                ...fig.nodes,
                                [fig.rootId]: {
                                    ...rootNode,
                                    relX: rootNode.relX + deltaX,
                                    relY: rootNode.relY + deltaY
                                }
                            }
                        };
                        // Recursively move things attached to THIS figure's nodes
                        Object.values(newFigures[figId].nodes).forEach(n => moveLinkedFigures(n.id, deltaX, deltaY));
                    }
                });
            };

            // If we moved the root, we move all children (FK), so anything attached to ANY node of this figure moves
            if (!node.parentId) {
                Object.values(newNodes).forEach(n => moveLinkedFigures(n.id, dx, dy));
            } else {
                // We only moved this specific node and its children
                const moveChildrenLinks = (nId: string, dX: number, dY: number) => {
                    moveLinkedFigures(nId, dX, dY);
                    newNodes[nId].children.forEach(childId => moveChildrenLinks(childId, dX, dY));
                };
                moveChildrenLinks(draggingNodeId, dx, dy);
            }
        }

        onChange(newFigures);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!draggingNodeId) return;

        const activeFigure = figures[selectedFigureId];
        if (activeFigure) {
            const node = activeFigure.nodes[draggingNodeId];

            // If dragging ROOT node, check if we can snap to something
            if (node && !node.parentId) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const mousePos: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

                    let snapTargetId: string | undefined;

                    // Look through all OTHER figures
                    for (const [figId, fig] of Object.entries(figures)) {
                        if (figId === selectedFigureId) continue;

                        for (const targetNode of Object.values(fig.nodes)) {
                            const targetPos = getNodeAbsPos(fig, targetNode.id);
                            if (getDistance(mousePos, targetPos) < 20) {
                                snapTargetId = targetNode.id;
                                break;
                            }
                        }
                        if (snapTargetId) break;
                    }

                    if (snapTargetId && node.link !== snapTargetId) {
                        // Snap successful
                        onChange({
                            ...figures,
                            [selectedFigureId]: {
                                ...activeFigure,
                                nodes: {
                                    ...activeFigure.nodes,
                                    [draggingNodeId]: {
                                        ...node,
                                        link: snapTargetId
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }

        setDraggingNodeId(null);
    };

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="bg-neutral-950 cursor-crosshair block"
        />
    );
};
