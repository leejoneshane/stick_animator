import React, { useEffect, useState, useRef } from 'react';
import type { Figure, Point } from '../types';
import { getNodeAbsPos, getDistance, isPointNearSegment } from '../engine/math';
import { renderFigure } from '../engine/renderer';

interface CanvasViewProps {
    figures: Record<string, Figure>;
    onChange: (figures: Record<string, Figure>, skipHistory?: boolean) => void;
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
    onDragStart?: () => void;
    isFigureRotationMode?: boolean;
    backgroundImageUrl?: string | null;
}

export interface CanvasViewHandle {
    getSnapshot: () => string | undefined;
}

export const CanvasView = React.forwardRef<CanvasViewHandle, CanvasViewProps>(({
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
    stageHeight,
    onDragStart,
    isFigureRotationMode = false,
    backgroundImageUrl
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const dragStartedRef = useRef(false);
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

    // Load background image
    useEffect(() => {
        if (!backgroundImageUrl) {
            setBgImage(null);
            return;
        }
        const img = new Image();
        img.onload = () => setBgImage(img);
        img.src = backgroundImageUrl;
    }, [backgroundImageUrl]);

    React.useImperativeHandle(ref, () => ({
        getSnapshot: () => {
            const canvas = canvasRef.current;
            if (!canvas) return undefined;

            if (stageWidth && stageHeight) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = stageWidth / 2; // Thumbnail resolution scaling
                tempCanvas.height = stageHeight / 2;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    const offsetX = (canvas.width - stageWidth) / 2;
                    const offsetY = (canvas.height - stageHeight) / 2;
                    ctx.drawImage(
                        canvas,
                        offsetX, offsetY, stageWidth, stageHeight,
                        0, 0, tempCanvas.width, tempCanvas.height
                    );
                    return tempCanvas.toDataURL('image/jpeg', 0.7);
                }
            }
            return canvas.toDataURL('image/jpeg', 0.7);
        }
    }));

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
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, width, height);

        // Draw Stage Area
        if (stageWidth && stageHeight) {
            const offsetX = (width - stageWidth) / 2;
            const offsetY = (height - stageHeight) / 2;

            ctx.fillStyle = '#e2e8f0'; // Light gray stage area
            ctx.fillRect(offsetX, offsetY, stageWidth, stageHeight);

            // Draw Background Image
            if (bgImage) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(offsetX, offsetY, stageWidth, stageHeight);
                ctx.clip();

                const imgRatio = bgImage.width / bgImage.height;
                const stageRatio = stageWidth / stageHeight;
                let drawWidth, drawHeight, drawX, drawY;

                if (imgRatio > stageRatio) {
                    drawHeight = stageHeight;
                    drawWidth = bgImage.width * (stageHeight / bgImage.height);
                    drawX = offsetX + (stageWidth - drawWidth) / 2;
                    drawY = offsetY;
                } else {
                    drawWidth = stageWidth;
                    drawHeight = bgImage.height * (stageWidth / bgImage.width);
                    drawX = offsetX;
                    drawY = offsetY + (stageHeight - drawHeight) / 2;
                }
                ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
                ctx.restore();
            }

            // Subtle stage border
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 1;
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
    }, [figures, sortedFigures, showStaticHandles, width, height, stageWidth, stageHeight, selectedNodeId, selectedFigureId, onionSkins, bgImage]);

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

        let appliedDeltaAngle = 0;
        let rotatedNodes = new Set<string>();
        let hasMovement = false;

        if (!node.parentId) {
            // Root movement
            // Unlink if it was attached
            if (node.link) {
                newNodes[draggingNodeId] = { ...node, link: undefined, relX: mousePos.x, relY: mousePos.y };
            } else {
                newNodes[draggingNodeId] = { ...node, relX: mousePos.x, relY: mousePos.y };
            }
            hasMovement = true;
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
                hasMovement = true;
            } else {
                // Rotation Mode - Find true pivot by climbing STATIC joints
                let pivotNodeId = node.parentId;

                if (isFigureRotationMode) {
                    pivotNodeId = activeFigure.rootId;
                } else {
                    // Climb up if the intermediate parent is STATIC and not the root
                    while (pivotNodeId && newNodes[pivotNodeId].parentId && newNodes[pivotNodeId].handleType === 'STATIC') {
                        pivotNodeId = newNodes[pivotNodeId].parentId!;
                    }
                }

                // If it climbed all the way to root, it will pivot around the root.
                // Otherwise it pivots around the first non-STATIC joint.
                const pivotAbsPos = getNodeAbsPos(activeFigure, pivotNodeId);

                // Calculate the rotation angle applied to the dragged node relative to the true pivot
                const oldAngle = Math.atan2(oldAbsPos.y - pivotAbsPos.y, oldAbsPos.x - pivotAbsPos.x);
                const newAngle = Math.atan2(mousePos.y - pivotAbsPos.y, mousePos.x - pivotAbsPos.x);
                const deltaAngle = newAngle - oldAngle;
                appliedDeltaAngle = deltaAngle;

                // Recursively apply rotation to ALL nodes that descend from the true pivot.
                const descendants: string[] = [];

                if (isFigureRotationMode) {
                    // Gather ALL nodes except the root
                    Object.values(newNodes).forEach(n => {
                        if (n.id !== activeFigure.rootId) {
                            descendants.push(n.id);
                        }
                    });
                } else {
                    let branchRootId = draggingNodeId;
                    while (newNodes[branchRootId].parentId !== pivotNodeId && newNodes[branchRootId].parentId !== null) {
                        branchRootId = newNodes[branchRootId].parentId!;
                    }

                    if (newNodes[branchRootId].parentId === pivotNodeId) {
                        descendants.push(branchRootId);
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
                    }
                }

                if (descendants.length > 0) {
                    rotatedNodes = new Set(descendants);
                    const s = Math.sin(deltaAngle);
                    const c = Math.cos(deltaAngle);

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
                    hasMovement = true;
                }
            }
        }

        newFigures[selectedFigureId] = { ...activeFigure, nodes: newNodes };

        // Handle cascading links structurally through absolute anchor tracking
        if (hasMovement) {
            if (!dragStartedRef.current) {
                if (onDragStart) onDragStart();
                dragStartedRef.current = true;
            }

            const updateLinkedFigures = (anchorFigId: string, anchorRotatedSet: Set<string>, angle: number) => {
                const anchorFig = newFigures[anchorFigId];
                Object.keys(newFigures).forEach(figId => {
                    if (figId === selectedFigureId) return;
                    const fig = newFigures[figId];
                    const rootNode = fig.nodes[fig.rootId];

                    if (rootNode && rootNode.link && anchorFig.nodes[rootNode.link]) {
                        const isInheritingRotation = angle !== 0 && (anchorRotatedSet.has(rootNode.link) || anchorFigId !== selectedFigureId);
                        const newAnchorAbsPos = getNodeAbsPos(anchorFig, rootNode.link);

                        const updatedNodes = { ...fig.nodes };

                        updatedNodes[fig.rootId] = {
                            ...rootNode,
                            relX: newAnchorAbsPos.x,
                            relY: newAnchorAbsPos.y
                        };

                        if (isInheritingRotation && angle !== 0) {
                            const s = Math.sin(angle);
                            const c = Math.cos(angle);
                            Object.keys(updatedNodes).forEach(nId => {
                                if (nId !== fig.rootId) {
                                    const n = updatedNodes[nId];
                                    const oldX = n.relX;
                                    const oldY = n.relY;
                                    updatedNodes[nId] = {
                                        ...n,
                                        relX: oldX * c - oldY * s,
                                        relY: oldX * s + oldY * c
                                    };
                                }
                            });
                        }

                        newFigures[figId] = {
                            ...fig,
                            nodes: updatedNodes
                        };

                        const childRotatedSet = isInheritingRotation ? new Set(Object.keys(updatedNodes)) : new Set<string>();
                        updateLinkedFigures(figId, childRotatedSet, isInheritingRotation ? angle : 0);
                    }
                });
            };

            const mainRotatedSet = appliedDeltaAngle !== 0 ? rotatedNodes : new Set(Object.keys(newNodes));
            updateLinkedFigures(selectedFigureId, mainRotatedSet, appliedDeltaAngle);
        }

        onChange(newFigures, true);
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
                        }, true);
                    }
                }
            }
        }

        setDraggingNodeId(null);
        dragStartedRef.current = false;
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
});
