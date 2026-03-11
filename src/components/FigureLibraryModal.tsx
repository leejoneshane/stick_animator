import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Figure } from '../types';
import { availableTemplates } from '../engine/defaults';
import { renderFigure } from '../engine/renderer';

interface FigureLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (figure: Figure) => void;
}

export const FigureLibraryModal: React.FC<FigureLibraryModalProps> = ({
    isOpen,
    onClose,
    onAdd
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Render preview
        const template = availableTemplates[selectedIndex];
        if (template) {
            // Generate a temporary figure for preview
            const previewFigure = template.create();

            // Re-center logic
            // We want to force the root node to the canvas center purely for preview purposes
            const rootNode = previewFigure.nodes[previewFigure.rootId];
            if (rootNode) {
                rootNode.relX = canvas.width / 2;
                rootNode.relY = canvas.height / 2;
            }

            // Draw with no controls (no static handles shown necessarily, but selection logic false)
            renderFigure(ctx, previewFigure, {
                showHandles: true,
                showStaticHandles: false,
                isSelectedObject: true
            });
        }
    }, [isOpen, selectedIndex]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0f0f15] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden w-[800px] h-[550px] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center bg-[#151520]">
                    <h2 className="text-lg font-bold text-neutral-200">新增物件圖庫</h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
                        ✕
                    </button>
                </div>

                {/* Content Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Library List */}
                    <div className="w-[280px] border-r border-neutral-800 bg-[#0f0f15] overflow-y-auto p-4 space-y-2">
                        {availableTemplates.map((template, index) => (
                            <button
                                key={template.id}
                                onClick={() => setSelectedIndex(index)}
                                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedIndex === index
                                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                    : 'text-neutral-400 hover:bg-neutral-800 border border-transparent hover:border-neutral-700/50'
                                    }`}
                            >
                                {template.name}
                            </button>
                        ))}
                    </div>

                    {/* Right: Preview Canvas */}
                    <div className="flex-1 bg-[#050508] relative flex items-center justify-center overflow-hidden">
                        <canvas
                            ref={canvasRef}
                            width={500}
                            height={450}
                            className="bg-transparent"
                            style={{ maxWidth: '100%', maxHeight: '100%' }}
                        />
                        <div className="absolute top-4 left-6 text-xs text-neutral-600 italic">
                            物件即時預覽
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-neutral-800 bg-[#151520] flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => {
                            const template = availableTemplates[selectedIndex];
                            if (template) {
                                // Re-generate to ensure entirely fresh IDs outside of preview logic
                                const newFigure = template.create();
                                // Overwrite the ID just in case
                                newFigure.id = `fig-${uuidv4().slice(0, 8)}`;
                                onAdd(newFigure);
                                onClose();
                            }
                        }}
                        className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all"
                        style={{ boxShadow: '0 0 15px rgba(37,99,235,0.4)' }}
                    >
                        新增此物件
                    </button>
                </div>
            </div>
        </div>
    );
};
