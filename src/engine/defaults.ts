import type { Figure, FigureNode, HandleType } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface SkeletonNodeTemplate {
    id: string;
    name: string;
    relX: number;
    relY: number;
    thickness: number;
    segment?: {
        color: string;
        shape: 'TRAPEZOID' | 'CIRCLE';
    };
    zOrder: number;
    handleType: string;
    parentId: string | null;
}

interface SkeletonTemplate {
    name: string;
    nodes: SkeletonNodeTemplate[];
}

export const createFigureFromTemplate = (template: SkeletonTemplate): Figure => {
    const figureId = uuidv4();
    const nodes: Record<string, FigureNode> = {};
    const idMap: Record<string, string> = {}; // internal ID -> UUID
    let rootId = '';

    // First pass: Generate UUIDs and find root
    template.nodes.forEach(n => {
        const uuid = uuidv4();
        idMap[n.id] = uuid;
        if (!n.parentId) rootId = uuid;
    });

    // Second pass: Create FigureNodes
    template.nodes.forEach(n => {
        const uuid = idMap[n.id];
        nodes[uuid] = {
            id: uuid,
            parentId: n.parentId ? idMap[n.parentId] : null,
            name: n.name,
            relX: n.relX,
            relY: n.relY,
            thickness: n.thickness,
            segment: n.segment ? {
                color: n.segment.color || '#ffffff',
                shape: (n.segment.shape === 'CIRCLE' ? 'CIRCLE' : 'TRAPEZOID')
            } : undefined,
            zOrder: n.zOrder,
            handleType: n.handleType as HandleType,
            isVisible: true,
            children: template.nodes
                .filter(child => child.parentId === n.id)
                .map(child => idMap[child.id])
        };
    });

    return { id: figureId, name: figureId, origine: template.name, nodes, rootId };
};

// Dynamic import of all JSON files in the skeletons directory
const templateModules = import.meta.glob('../skeletons/*.json', { eager: true });

export const availableTemplates = Object.entries(templateModules).map(([path, module]) => {
    const id = path.split('/').pop()?.replace('.json', '') || 'unknown';
    // Vite handles JSON imports by putting the content directly into the module or module.default
    const template = (module as any).default || module;
    const name = template.name || id;

    return {
        id,
        name,
        create: () => createFigureFromTemplate(template as SkeletonTemplate)
    };
});

// We still export these for backward compatibility or direct use if needed,
// but they can be gradually phased out in favor of `availableTemplates.find(t => t.id === '...')`
export const createDefaultStickman = (): Figure => {
    const stickmanTemplate = availableTemplates.find(t => t.id === 'stickman');
    return stickmanTemplate ? stickmanTemplate.create() : availableTemplates[0].create();
};

export const createDefaultSword = (): Figure => {
    const template = availableTemplates.find(t => t.id === 'sword');
    return template ? template.create() : availableTemplates[0].create();
};

export const createDefaultShield = (): Figure => {
    const template = availableTemplates.find(t => t.id === 'shield');
    return template ? template.create() : availableTemplates[0].create();
};
