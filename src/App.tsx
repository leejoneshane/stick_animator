import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Layers, Eye, EyeOff, Save, FolderOpen } from 'lucide-react';
import type { Figure, Keyframe, Animation, FigureNode, StageDimensions } from './types';

const STAGE_SIZES: Record<string, StageDimensions> = {
  '640x480': { width: 640, height: 480 },
  '800x600': { width: 800, height: 600 },
  '932x430': { width: 932, height: 430 },
  '430x932': { width: 430, height: 932 },
};
import { createDefaultStickman, createFigureFromTemplate } from './engine/defaults';
import { CanvasView, type CanvasViewHandle } from './components/CanvasView';
import { FigureLibraryModal } from './components/FigureLibraryModal';
import { ColorPalette } from './components/ColorPalette';
import { interpolateFigures } from './engine/math';

const LOCAL_STORAGE_KEY = 'pivot_animator_pro_save_state';

// Generic Undo/Redo Hook wrapping local storage
function useHistory<T>(initialState: T, maxHistorySize = 50) {
  const [state, setInternalState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : initialState;
    } catch {
      return initialState;
    }
  });

  const [history, setHistory] = useState<T[]>([]);
  const [redos, setRedos] = useState<T[]>([]);

  // Push explicit generic
  const pushToHistory = useCallback(() => {
    setInternalState((curr) => {
      setHistory((prev) => [...prev, curr].slice(-maxHistorySize));
      setRedos([]);
      return curr;
    });
  }, [maxHistorySize]);

  // Push absolute change
  const setState = useCallback((newState: T | ((curr: T) => T), skipHistory = false) => {
    setInternalState((curr) => {
      const resolvedState = typeof newState === 'function' ? (newState as Function)(curr) : newState;
      if (!skipHistory) {
        setHistory((prev) => [...prev, curr].slice(-maxHistorySize));
        setRedos([]);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(resolvedState));
      return resolvedState;
    });
  }, [maxHistorySize]);

  // Jump back
  const undo = useCallback(() => {
    setInternalState((curr) => {
      if (history.length === 0) return curr;
      const prev = history[history.length - 1];
      setHistory(history.slice(0, -1));
      setRedos((r) => [...r, curr]);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prev));
      return prev;
    });
  }, [history]);

  // Jump forward
  const redo = useCallback(() => {
    setInternalState((curr) => {
      if (redos.length === 0) return curr;
      const next = redos[redos.length - 1];
      setRedos(redos.slice(0, -1));
      setHistory((h) => [...h, curr]);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [redos]);

  // Delete all storage
  const reset = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setHistory([]);
    setRedos([]);
    setInternalState(initialState);
  }, [initialState]);

  return { state, setState, undo, redo, reset, pushToHistory, canUndo: history.length > 0, canRedo: redos.length > 0 };
}

const App: React.FC = () => {
  const {
    state: animation,
    setState: setAnimation,
    undo, redo, reset, canUndo, canRedo, pushToHistory
  } = useHistory<Animation>({
    keyframes: [{ id: uuidv4(), figureStates: { 'stickman': createDefaultStickman() }, duration: 0.5 }],
    fps: 12
  });
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showStaticHandles, setShowStaticHandles] = useState(true);
  const [onionSkinCount, setOnionSkinCount] = useState(1);
  const [selectedFigureId, setSelectedFigureId] = useState('stickman');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [interpolationRatio, setInterpolationRatio] = useState(0.5);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [currentStageSize, setCurrentStageSize] = useState<string>('800x600');
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isFigureRotationMode, setIsFigureRotationMode] = useState(false);
  const canvasContainerRef = React.useRef<HTMLDivElement>(null);
  const canvasViewRef = React.useRef<CanvasViewHandle>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  const handleBackgroundImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
      const url = URL.createObjectURL(file);
      setBackgroundImageUrl(url);
    }
  };

  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Playback control
  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % animation.keyframes.length);
      }, 1000 / animation.fps);
    }
    return () => clearInterval(interval);
  }, [isPlaying, animation.fps, animation.keyframes.length]);

  const currentKeyframe = animation.keyframes[currentFrameIndex];
  const currentFigure = currentKeyframe.figureStates[selectedFigureId];

  const handleFigureChange = (newFigure: Figure, skipHistory = false) => {
    const newKeyframes = [...animation.keyframes];
    newKeyframes[currentFrameIndex] = {
      ...newKeyframes[currentFrameIndex],
      figureStates: { ...newKeyframes[currentFrameIndex].figureStates, [selectedFigureId]: newFigure }
    };
    setAnimation({ ...animation, keyframes: newKeyframes }, skipHistory);
  };

  const handleScaleFigure = (factor: number) => {
    if (!currentFigure) return;
    const newNodes = { ...currentFigure.nodes };
    Object.keys(newNodes).forEach(key => {
      const n = newNodes[key];
      const updated = { ...n, thickness: n.thickness * factor };
      if (key !== currentFigure.rootId) {
        updated.relX = n.relX * factor;
        updated.relY = n.relY * factor;
      }
      newNodes[key] = updated;
    });
    const newFigure = { ...currentFigure, nodes: newNodes };
    handleFigureChange(newFigure);
  };

  const addFrame = () => {
    const snapshot = !isPlaying ? canvasViewRef.current?.getSnapshot() : undefined;
    const newFrame: Keyframe = {
      id: uuidv4(),
      figureStates: JSON.parse(JSON.stringify(currentKeyframe.figureStates)),
      duration: 0.5
    };
    const newKeyframes = [...animation.keyframes];
    if (snapshot) newKeyframes[currentFrameIndex] = { ...newKeyframes[currentFrameIndex], thumbnail: snapshot };
    newKeyframes.splice(currentFrameIndex + 1, 0, newFrame);
    setAnimation({ ...animation, keyframes: newKeyframes });
    setCurrentFrameIndex(currentFrameIndex + 1);
  };

  const deleteFrame = () => {
    if (animation.keyframes.length <= 1) return;
    const filteredKeyframes = animation.keyframes.filter((_, i) => i !== currentFrameIndex);
    setAnimation({ ...animation, keyframes: filteredKeyframes });
    setCurrentFrameIndex(Math.max(0, currentFrameIndex - 1));
  };

  const insertInbetween = () => {
    if (currentFrameIndex === 0) return;
    const snapshot = !isPlaying ? canvasViewRef.current?.getSnapshot() : undefined;
    const prevFrame = animation.keyframes[currentFrameIndex - 1];
    const nextFrame = animation.keyframes[currentFrameIndex];

    // Create new interpolated figure states for each figure
    const newFigureStates: Record<string, Figure> = {};
    Object.keys(nextFrame.figureStates).forEach(figId => {
      newFigureStates[figId] = interpolateFigures(
        prevFrame.figureStates[figId],
        nextFrame.figureStates[figId],
        interpolationRatio
      );
    });

    const newFrame: Keyframe = {
      id: uuidv4(),
      figureStates: newFigureStates,
      duration: 0.5
    };

    const newKeyframes = [...animation.keyframes];
    if (snapshot) newKeyframes[currentFrameIndex] = { ...newKeyframes[currentFrameIndex], thumbnail: snapshot };
    newKeyframes.splice(currentFrameIndex, 0, newFrame);
    setAnimation({ ...animation, keyframes: newKeyframes });
  };

  const [selectedFrameIndices, setSelectedFrameIndices] = useState<number[]>([0]);

  const navigateFrame = (newIndex: number) => {
    if (newIndex === currentFrameIndex) return;
    if (!isPlaying) {
      const snapshot = canvasViewRef.current?.getSnapshot();
      if (snapshot) {
        const newKeyframes = [...animation.keyframes];
        newKeyframes[currentFrameIndex] = { ...newKeyframes[currentFrameIndex], thumbnail: snapshot };
        setAnimation({ ...animation, keyframes: newKeyframes }, true);
      }
    }
    setCurrentFrameIndex(newIndex);
  };

  const toggleFrameSelection = (index: number, isMulti: boolean) => {
    if (isMulti) {
      if (selectedFrameIndices.includes(index)) {
        setSelectedFrameIndices(selectedFrameIndices.filter(i => i !== index));
      } else {
        setSelectedFrameIndices([...selectedFrameIndices, index]);
      }
    } else {
      setSelectedFrameIndices([index]);
      navigateFrame(index);
    }
  };

  const batchUpdateProperty = (property: keyof FigureNode, value: any) => {
    if (!selectedNodeId) return;
    const newKeyframes = [...animation.keyframes];
    selectedFrameIndices.forEach(idx => {
      const fig = { ...newKeyframes[idx].figureStates[selectedFigureId] };
      if (fig.nodes[selectedNodeId]) {
        fig.nodes[selectedNodeId] = { ...fig.nodes[selectedNodeId], [property]: value };
        newKeyframes[idx].figureStates[selectedFigureId] = fig;
      }
    });
    setAnimation({ ...animation, keyframes: newKeyframes });
  };

  const updateNodeProperty = (nodeId: string, property: keyof FigureNode, value: any) => {
    const newFigure = { ...currentFigure };
    const newNode = { ...newFigure.nodes[nodeId], [property]: value };
    newFigure.nodes = { ...newFigure.nodes, [nodeId]: newNode };
    handleFigureChange(newFigure);
  };

  const inverseSelection = () => {
    if (!selectedNodeId) return;
    const nodeIds = Object.keys(currentFigure.nodes);
    const currentIndex = nodeIds.indexOf(selectedNodeId);
    if (currentIndex !== -1) {
      setSelectedNodeId(nodeIds[(currentIndex + 1) % nodeIds.length]);
    }
  };

  const handleAddShape = (type: 'LINE' | 'CIRCLE') => {
    const newFigId = uuidv4();
    const rootId = uuidv4();
    const endId = uuidv4();

    const shapeName = type === 'LINE' ? '線條' : '圓形';
    const shapeEnum = type === 'LINE' ? 'TRAPEZOID' : 'CIRCLE';

    const newFig: Figure = {
      id: newFigId,
      name: newFigId,
      origine: shapeName,
      rootId: rootId,
      nodes: {
        [rootId]: {
          id: rootId, name: 'Root',
          relX: STAGE_SIZES[currentStageSize].width / 2,
          relY: STAGE_SIZES[currentStageSize].height / 2,
          thickness: type === 'LINE' ? 10 : 40,
          handleType: 'STATIC', parentId: null, zOrder: 1,
          isVisible: true, children: [endId]
        },
        [endId]: {
          id: endId, name: 'End',
          relX: 0, relY: type === 'LINE' ? 50 : 50,
          thickness: type === 'LINE' ? 10 : 40,
          handleType: 'STRETCH', parentId: rootId, zOrder: 1,
          segment: { shape: shapeEnum, color: '#ffffff' },
          isVisible: true, children: []
        }
      }
    };

    const newKeyframes = animation.keyframes.map((k, idx) => {
      if (idx === currentFrameIndex) {
        return { ...k, figureStates: { ...k.figureStates, [newFigId]: newFig } };
      }
      return k;
    });
    setAnimation({ ...animation, keyframes: newKeyframes });
    setSelectedFigureId(newFigId);
    setSelectedNodeId(endId);
  };

  const handleExtendNode = () => {
    if (!currentFigure || !selectedNodeId) return;
    const parentNode = currentFigure.nodes[selectedNodeId];
    if (!parentNode) return;

    const newNodeId = uuidv4();
    const newFig = { ...currentFigure };

    newFig.nodes = {
      ...newFig.nodes,
      [newNodeId]: {
        id: newNodeId,
        name: `Node_${Object.keys(newFig.nodes).length}`,
        relX: 0,
        relY: 20,
        thickness: parentNode.thickness,
        handleType: 'STRETCH',
        parentId: selectedNodeId,
        zOrder: parentNode.zOrder + 1,
        segment: { shape: 'TRAPEZOID', color: '#ffffff' },
        isVisible: true,
        children: []
      }
    };

    newFig.nodes[selectedNodeId] = {
      ...parentNode,
      children: [...(parentNode.children || []), newNodeId]
    };

    handleFigureChange(newFig);
    setSelectedNodeId(newNodeId);
  };

  const handleRemoveNode = () => {
    if (!currentFigure || !selectedNodeId) return;
    const nodeToRemove = currentFigure.nodes[selectedNodeId];
    // Cannot delete root node this way (must use remove object)
    if (!nodeToRemove || !nodeToRemove.parentId) return;

    // Ensure it is truly an end/leaf node
    if (Object.values(currentFigure.nodes).some(n => n.parentId === selectedNodeId)) return;

    const newFig = { ...currentFigure };
    const parentId = nodeToRemove.parentId;
    const newNodes = { ...newFig.nodes };

    delete newNodes[selectedNodeId];

    if (newNodes[parentId]) {
      newNodes[parentId] = {
        ...newNodes[parentId],
        children: (newNodes[parentId].children || []).filter(id => id !== selectedNodeId)
      };
    }

    newFig.nodes = newNodes;
    handleFigureChange(newFig);
    setSelectedNodeId(parentId);
  };

  const isEndNodeSelected = selectedNodeId && currentFigure && !Object.values(currentFigure.nodes).some(n => n.parentId === selectedNodeId);

  const handleSaveProject = () => {
    const projectData = {
      version: '1.0.0',
      animation,
      currentStageSize,
      onionSkinCount,
      interpolationRatio
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    a.download = `${timestamp}.project`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.animation && parsed.currentStageSize) {
          setAnimation(parsed.animation, true); // skipHistory so it starts fresh or tracks from load
          setCurrentStageSize(parsed.currentStageSize);
          if (parsed.onionSkinCount !== undefined) setOnionSkinCount(parsed.onionSkinCount);
          if (parsed.interpolationRatio !== undefined) setInterpolationRatio(parsed.interpolationRatio);

          setCurrentFrameIndex(0);
          setSelectedFrameIndices([0]);
          pushToHistory(); // Record the loaded state as the new baseline
        } else {
          alert('專案檔案格式不正確或已毀損。');
        }
      } catch (err) {
        console.error("Failed to load project", err);
        alert('讀取專案失敗。');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const [exporting, setExporting] = useState(false);
  const handleExportGif = async () => {
    setExporting(true);
    try {
      const { exportToGif } = await import('./engine/exporter');
      const blob = await exportToGif(
        animation,
        canvasSize.width,
        canvasSize.height,
        STAGE_SIZES[currentStageSize].width,
        STAGE_SIZES[currentStageSize].height,
        (p: number) => console.log(`Exporting: ${Math.round(p * 100)} %`)
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'animation.gif';
      a.click();
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };


  return (
    <div className="flex flex-col h-screen bg-transparent text-slate-800 dark:text-slate-100 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="relative w-full h-12 shrink-0 glass-header flex items-center justify-between px-6 z-40">
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-widest bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 text-transparent bg-clip-text font-['Outfit'] pr-2">
              火柴人動畫
            </h1>
          </div>
          <div className="flex items-center gap-5 bg-white/40 dark:bg-slate-900/60 rounded-lg p-1">
            <button onClick={undo} disabled={!canUndo} className="p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 disabled:opacity-30 rounded transition" title="復原 (Undo)">
              <i className="fa-solid fa-clock-rotate-left"></i>
            </button>
            <button onClick={redo} disabled={!canRedo} className="p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 disabled:opacity-30 rounded transition" title="重做 (Redo)">
              <i className="fa-solid fa-clock-rotate-right"></i>
            </button>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
            <button onClick={() => { if (window.confirm('確定要清除所有進度並重設畫布嗎？')) reset(); }} className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition" title="清空重設 (Reset Workspace)">
              <i className="fa-solid fa-arrows-rotate"></i>
            </button>
            <i className="fa-solid fa-display text-slate-500 dark:text-slate-400 ml-2"></i>
            <select
              value={currentStageSize}
              onChange={(e) => setCurrentStageSize(e.target.value)}
              className="bg-transparent text-xs text-blue-800 dark:text-blue-300 font-bold focus:outline-none cursor-pointer pr-1"
            >
              {Object.keys(STAGE_SIZES).map(size => (
                <option key={size} value={size} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold">{size}</option>
              ))}
            </select>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
            <label
              className="p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded transition cursor-pointer"
              title="上傳舞台背景圖"
            >
              <i className="fa-regular fa-image"></i>
              <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" onChange={handleBackgroundImageUpload} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveProject}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-all text-xs border border-slate-300/50 dark:border-slate-700 shadow-sm"
              title="儲存專案"
            >
              <Save className="w-4 h-4" /> 儲存專案
            </button>
            <label
              className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-all text-xs border border-slate-300/50 dark:border-slate-700 shadow-sm cursor-pointer"
              title="讀取專案"
            >
              <FolderOpen className="w-4 h-4" /> 讀取專案
              <input type="file" accept=".project" className="hidden" onChange={handleLoadProject} />
            </label>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
            <button
              onClick={handleExportGif}
              disabled={exporting}
              className="flex items-center gap-3 px-4 py-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-lg transition-all font-black text-xs shadow-md shadow-blue-500/30 active:scale-95 disabled:opacity-50 border-none"
            >
              <i className={`fa-solid ${exporting ? 'fa-spinner animate-spin' : 'fa-download'}`} /> {exporting ? '匯出中...' : '匯出 GIF'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex flex-1 h-full relative z-10 w-full overflow-hidden">
        {isPlaying && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 text-white/90 px-6 py-3 rounded-full font-bold flex items-center gap-3 text-sm tracking-widest shadow-2xl" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
              <i className="fa-solid fa-pause text-red-400" /> 播放時無法編輯影格內容
            </div>
          </div>
        )}
        <FigureLibraryModal
          isOpen={isLibraryModalOpen}
          onClose={() => setIsLibraryModalOpen(false)}
          onAdd={(newFigure) => {
            const newKeyframes = animation.keyframes.map(k => ({
              ...k,
              figureStates: { ...k.figureStates, [newFigure.id]: newFigure }
            }));
            setAnimation({ ...animation, keyframes: newKeyframes });
            setSelectedFigureId(newFigure.id);
          }}
        />

        {/* Left Toolbar (Tools) */}
        <div className="w-24 border-r border-slate-200/50 dark:border-white/5 glass-panel flex flex-col items-center py-4 z-20 gap-3 overflow-y-auto">

          {/* Row 1: Shapes */}
          <div className="grid grid-cols-2 gap-2 w-full px-2">
            <button
              onClick={() => handleAddShape('LINE')}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all shadow-sm group flex items-center justify-center aspect-square"
              title="新增線條"
            >
              <i className="fa-solid fa-minus text-2xl group-hover:scale-110 transition-transform"></i>
            </button>
            <button
              onClick={() => handleAddShape('CIRCLE')}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all shadow-sm group flex items-center justify-center aspect-square"
              title="新增圓形"
            >
              <i className="fa-regular fa-circle text-2xl group-hover:scale-110 transition-transform"></i>
            </button>
          </div>

          {/* Row 2: Nodes */}
          <div className="grid grid-cols-2 gap-2 w-full px-2">
            <button
              onClick={handleExtendNode}
              disabled={!isEndNodeSelected}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all shadow-sm group flex items-center justify-center aspect-square disabled:opacity-30 disabled:pointer-events-none"
              title="新增節點 (從末端延伸)"
            >
              <i className="fa-solid fa-diagram-project text-xl group-hover:scale-110 transition-transform"></i>
            </button>
            <button
              onClick={handleRemoveNode}
              disabled={!isEndNodeSelected || (currentFigure && !currentFigure.nodes[selectedNodeId!]?.parentId)}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-xl text-slate-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all shadow-sm group flex items-center justify-center aspect-square disabled:opacity-30 disabled:pointer-events-none"
              title="移除末端節點"
            >
              <i className="fa-solid fa-scissors text-xl group-hover:scale-110 transition-transform"></i>
            </button>
          </div>

          <div className="w-16 h-px bg-slate-300 dark:bg-slate-700 my-1" />

          {/* Row 3: Add / Delete Figure */}
          <div className="grid grid-cols-2 gap-2 w-full px-2">
            <button
              onClick={() => setIsLibraryModalOpen(true)}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all shadow-sm group flex items-center justify-center aspect-square"
              title="新增物件"
            >
              <i className="fa-solid fa-circle-plus text-xl group-hover:scale-110 transition-transform"></i>
            </button>
            <button
              onClick={() => {
                if (!selectedFigureId) return;
                const newFigureStates = { ...currentKeyframe.figureStates };
                delete newFigureStates[selectedFigureId];

                const newKeyframes = [...animation.keyframes];
                newKeyframes[currentFrameIndex] = {
                  ...currentKeyframe,
                  figureStates: newFigureStates
                };
                setAnimation({ ...animation, keyframes: newKeyframes });
                setSelectedFigureId(Object.keys(newFigureStates)[0] || 'none');
              }}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl text-slate-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all shadow-sm group flex items-center justify-center aspect-square disabled:opacity-30"
              title="移除物件"
              disabled={!currentKeyframe.figureStates[selectedFigureId]}
            >
              <i className="fa-solid fa-trash-can text-xl group-hover:scale-110 transition-transform"></i>
            </button>
          </div>

          {/* Row 4: Scale Up / Scale Down */}
          <div className="grid grid-cols-2 gap-2 w-full px-2">
            <button
              onClick={() => handleScaleFigure(1.1)}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-xl text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-sm group flex items-center justify-center aspect-square"
              title="物件放大 10%"
            >
              <i className="fa-solid fa-magnifying-glass-plus text-xl group-hover:scale-110 transition-transform"></i>
            </button>
            <button
              onClick={() => handleScaleFigure(0.9)}
              className="p-2 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-xl text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-sm group flex items-center justify-center aspect-square"
              title="物件縮小 10%"
            >
              <i className="fa-solid fa-magnifying-glass-minus text-xl group-hover:scale-110 transition-transform"></i>
            </button>
          </div>

          <div className="w-16 h-px bg-slate-300 dark:bg-slate-700 my-1 flex-shrink-0" />

          <button
            className="p-3 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-2xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all shadow-sm group flex items-center justify-center aspect-square flex-shrink-0 disabled:opacity-30"
            title="匯出物件"
            disabled={!currentFigure}
            onClick={() => {
              if (!currentFigure) return;

              const idMap: Record<string, string> = {};
              Object.values(currentFigure.nodes).forEach((n, i) => {
                idMap[n.id] = `node_${i}`;
              });

              const templateNodes = Object.values(currentFigure.nodes).map(n => ({
                id: idMap[n.id],
                name: n.name,
                relX: Math.round(n.relX * 1000) / 1000,
                relY: Math.round(n.relY * 1000) / 1000,
                thickness: n.thickness,
                ...(n.segment ? { segment: n.segment } : {}),
                zOrder: n.zOrder,
                handleType: n.handleType,
                parentId: n.parentId ? idMap[n.parentId] : null
              }));

              const exportTemplate = {
                name: currentFigure.origine || currentFigure.nodes[currentFigure.rootId]?.name || "匯出物件",
                nodes: templateNodes
              };

              const blob = new Blob([JSON.stringify(exportTemplate, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const objectName = currentFigure.origine || currentFigure.nodes[currentFigure.rootId]?.name || currentFigure.id;
              a.download = `${objectName}.figure`;
              a.click();
            }}
          >
            <i className="fa-solid fa-download text-3xl group-hover:scale-110 transition-transform"></i>
          </button>

          <button
            className="p-3 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700/80 rounded-2xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all shadow-sm group relative flex items-center justify-center aspect-square flex-shrink-0"
            title="匯入物件"
          >
            <i className="fa-solid fa-upload text-3xl group-hover:scale-110 transition-transform"></i>
            <input
              type="file"
              accept=".figure,.json"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  try {
                    const parsed = JSON.parse(event.target?.result as string);

                    let importedFigure: Figure;
                    if (parsed.nodes && Array.isArray(parsed.nodes)) {
                      importedFigure = createFigureFromTemplate(parsed);
                    } else if (parsed.id && parsed.nodes) {
                      importedFigure = parsed as Figure;
                    } else {
                      throw new Error("Invalid object schema");
                    }

                    const newKeyframes = animation.keyframes.map(k => ({
                      ...k,
                      figureStates: { ...k.figureStates, [importedFigure.id]: importedFigure }
                    }));
                    setAnimation({ ...animation, keyframes: newKeyframes });
                    setSelectedFigureId(importedFigure.id);
                  } catch (err) {
                    alert("無效的 JSON 檔案");
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }}
            />
          </button>
        </div>

        {/* Center - Canvas Area */}
        <section ref={canvasContainerRef} className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
          <div className="relative group rounded-3xl overflow-hidden border border-slate-300/50 dark:border-white/5 bg-slate-200 dark:bg-[#1a1a24]" style={{ boxShadow: '0 0 150px rgba(0,0,0,0.5)' }}>
            <CanvasView
              ref={canvasViewRef}
              figures={currentKeyframe.figureStates}
              backgroundImageUrl={backgroundImageUrl}
              isFigureRotationMode={isFigureRotationMode}
              onChange={(newFigures, skipHistory = false) => {
                const newKeyframes = [...animation.keyframes];
                newKeyframes[currentFrameIndex] = {
                  ...currentKeyframe,
                  figureStates: newFigures
                };
                setAnimation({ ...animation, keyframes: newKeyframes }, skipHistory);
              }}
              onDragStart={() => pushToHistory()}
              showStaticHandles={showStaticHandles}
              width={canvasSize.width}
              height={canvasSize.height}
              stageWidth={STAGE_SIZES[currentStageSize].width}
              stageHeight={STAGE_SIZES[currentStageSize].height}
              onSelectNode={setSelectedNodeId}
              onSelectFigure={setSelectedFigureId}
              selectedNodeId={selectedNodeId}
              selectedFigureId={selectedFigureId}
              onionSkins={
                currentFrameIndex > 0
                  ? animation.keyframes
                    .slice(Math.max(0, currentFrameIndex - onionSkinCount), currentFrameIndex)
                    .map(k => k.figureStates)
                  : []
              }
            />
          </div>
        </section>

        {/* Right Sidebar (Properties) */}
        <div className="w-[300px] border-l border-slate-200/50 dark:border-white/5 glass-panel flex flex-col z-20 overflow-y-auto custom-scrollbar shadow-xl text-blue-900 dark:text-blue-100">
          <section className="p-6 border-b border-slate-200/50 dark:border-white/5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">屬性面板</h3>
              <div className="flex gap-2">
                <button
                  onClick={inverseSelection}
                  title="循環 / 反選"
                  className="p-1 hover:bg-white/50 dark:hover:bg-slate-800 rounded opacity-70 hover:opacity-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <Layers className="w-4 h-4" />
                </button>
                {selectedNodeId && currentFigure && currentFigure.nodes[selectedNodeId] && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-slate-800 rounded text-blue-800 dark:text-blue-300 shadow-sm border border-blue-200 dark:border-transparent">
                    {currentFigure.nodes[selectedNodeId]?.name}
                  </span>
                )}
              </div>
            </div>

            {/* Object Rotation Control (Always Visible) */}
            <div className="p-3 mb-6 border border-slate-200 dark:border-slate-700/50 rounded-xl bg-slate-50 dark:bg-slate-900/30 flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="勾選此項時，拖曳任一節點皆會連帶原物件全身結構一起旋轉。">
                <input
                  type="checkbox"
                  checked={isFigureRotationMode}
                  onChange={e => setIsFigureRotationMode(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-blue-500 focus:ring-blue-500/30"
                />
                <span className="text-sm font-bold">物件旋轉模式</span>
              </label>
            </div>

            {selectedNodeId && currentFigure && currentFigure.nodes[selectedNodeId] ? (
              <div className="space-y-6">
                {selectedFrameIndices.length > 1 && (
                  <div className="p-2 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded text-[10px] text-amber-700 dark:text-amber-400 font-bold mb-2 shadow-sm">
                    🔥 正在批次編輯 {selectedFrameIndices.length} 個影格
                  </div>
                )}
                <div className="space-y-3">
                  <label className="text-xs font-bold block opacity-80">層級控制 (前後順序)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={currentFigure.nodes[selectedNodeId].zOrder}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (selectedFrameIndices.length > 1) batchUpdateProperty('zOrder', val);
                        else updateNodeProperty(selectedNodeId, 'zOrder', val);
                      }}
                      className="w-full h-12 bg-white/60 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 text-lg font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold block opacity-80 mb-2">控制桿類型</label>
                  {!currentFigure.nodes[selectedNodeId].parentId ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 py-2.5 px-2 rounded-xl border bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-center text-xs font-black tracking-widest shadow-inner">
                        核心節點 (ROOT)
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {!Object.values(currentFigure.nodes).some(n => n.parentId === selectedNodeId) ? null : (
                        <button
                          onClick={() => updateNodeProperty(selectedNodeId, 'handleType', 'ROTATE')}
                          title="僅限旋轉"
                          className={`flex-1 py-2.5 px-2 rounded-xl border text-xs font-bold tracking-wider transition-all shadow-sm ${currentFigure.nodes[selectedNodeId].handleType === 'ROTATE' ? 'bg-blue-500 border-blue-400 text-white' : 'bg-white/60 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}`}
                        >
                          旋轉
                        </button>
                      )}
                      <button
                        onClick={() => updateNodeProperty(selectedNodeId, 'handleType', 'STRETCH')}
                        title="伸展與縮放"
                        className={`flex-1 py-2.5 px-2 rounded-xl border text-xs font-bold tracking-wider transition-all shadow-sm ${currentFigure.nodes[selectedNodeId].handleType === 'STRETCH' ? 'bg-purple-500 border-purple-400 text-white' : 'bg-white/60 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}`}
                      >
                        伸展
                      </button>
                      <button
                        onClick={() => updateNodeProperty(selectedNodeId, 'handleType', 'STATIC')}
                        title="靜態關節"
                        className={`flex-1 py-2.5 px-2 rounded-xl border text-xs font-bold tracking-wider transition-all shadow-sm ${currentFigure.nodes[selectedNodeId].handleType === 'STATIC' ? 'bg-amber-500 border-amber-400 text-white' : 'bg-white/60 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}`}
                      >
                        靜止
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold opacity-80 block">線條粗度 (px)</label>
                    <input
                      type="number"
                      value={currentFigure.nodes[selectedNodeId].thickness}
                      min="1" max="100"
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value));
                        if (selectedFrameIndices.length > 1) batchUpdateProperty('thickness', val);
                        else updateNodeProperty(selectedNodeId, 'thickness', val);
                      }}
                      className="w-16 bg-white/60 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>
                  <input
                    type="range" min="1" max="100"
                    value={currentFigure.nodes[selectedNodeId].thickness}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (selectedFrameIndices.length > 1) batchUpdateProperty('thickness', val);
                      else updateNodeProperty(selectedNodeId, 'thickness', val);
                    }}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer"
                  />
                </div>

                {currentFigure.nodes[selectedNodeId].parentId !== null && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                    <label className="text-xs font-bold opacity-80 block italic">🎨 節點段屬性 (軀幹)</label>

                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-80 block">形狀</label>
                      <div className="flex p-1 bg-slate-200 dark:bg-slate-900 rounded-lg w-full shadow-inner border border-slate-300 dark:border-slate-800">
                        <button
                          onClick={() => {
                            const seg = currentFigure.nodes[selectedNodeId].segment || { color: '#ffffff', shape: 'TRAPEZOID' };
                            updateNodeProperty(selectedNodeId, 'segment', { ...seg, shape: 'TRAPEZOID' });
                          }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${(!currentFigure.nodes[selectedNodeId].segment || currentFigure.nodes[selectedNodeId].segment?.shape === 'TRAPEZOID') ? 'bg-white dark:bg-slate-700 text-blue-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                          梯形 (一般)
                        </button>
                        <button
                          onClick={() => {
                            const seg = currentFigure.nodes[selectedNodeId].segment || { color: '#ffffff', shape: 'TRAPEZOID' };
                            updateNodeProperty(selectedNodeId, 'segment', { ...seg, shape: 'CIRCLE' });
                          }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${currentFigure.nodes[selectedNodeId].segment?.shape === 'CIRCLE' ? 'bg-white dark:bg-slate-700 text-blue-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                          圓形
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-80 block">顏色選擇</label>
                      <ColorPalette
                        selectedColor={currentFigure.nodes[selectedNodeId].segment?.color || '#ffffff'}
                        onColorSelect={(color) => {
                          const currentSegment = currentFigure.nodes[selectedNodeId].segment || { color: '#ffffff', shape: 'TRAPEZOID' };
                          const updatedSegment = { ...currentSegment, color };
                          if (selectedFrameIndices.length > 1) batchUpdateProperty('segment', updatedSegment);
                          else updateNodeProperty(selectedNodeId, 'segment', updatedSegment);
                        }}
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-2">
                        <span className="opacity-80">當前顏色碼</span>
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">{currentFigure.nodes[selectedNodeId].segment?.color || '#ffffff'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs font-bold border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/20">
                請點擊畫布上的節點來編輯屬性
              </div>
            )}
          </section>

          <section className="p-6 border-b border-slate-200/50 dark:border-white/5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-60">動畫設定</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold opacity-80">當前影格</span>
                <span className="text-xl font-mono text-blue-600 dark:text-blue-400 font-black">{String(currentFrameIndex + 1).padStart(2, '0')} / {animation.keyframes.length}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold opacity-80">洋蔥皮殘影</span>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => setOnionSkinCount(n)}
                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black border transition-all ${onionSkinCount === n ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold opacity-80">播放速度 (FPS)</span>
                  <span className="text-xs font-black">{animation.fps}</span>
                </div>
                <input
                  type="range" min="1" max="30"
                  value={animation.fps}
                  onChange={(e) => setAnimation({ ...animation, fps: Number(e.target.value) })}
                  className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </section>

          <section className="p-6 mt-auto">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-60">檢視設定</h3>
            <div className="space-y-4">
              <button
                onClick={() => setShowStaticHandles(!showStaticHandles)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all border font-bold ${showStaticHandles
                  ? 'bg-blue-50 dark:bg-white/10 border-blue-200 dark:border-white/20 text-blue-900 dark:text-white'
                  : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-70'
                  }`}
              >
                <span className="text-xs uppercase tracking-wider">顯示靜態節點</span>
                {showStaticHandles ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </section>
        </div>
      </div >

      {/* Footer - Timeline */}
      <footer className="h-36 w-full glass-header mb-0 flex flex-row p-4 gap-6 z-10 text-slate-800 dark:text-slate-100">
        <div className="flex flex-col justify-center shrink-0 bg-white/40 dark:bg-slate-900/60 rounded-xl border border-white/40 dark:border-white/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateFrame(Math.max(0, currentFrameIndex - 1))}
                className="p-3 hover:bg-white/50 dark:hover:bg-slate-800/50 rounded-xl transition-all border border-transparent hover:border-slate-300 dark:hover:border-slate-700 group active:scale-90"
              >
                <i className="fa-solid fa-backward-step opacity-50 group-hover:opacity-100 text-xl" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`w-16 h-16 rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center ${isPlaying
                  ? 'bg-white/80 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                  : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border border-blue-400'
                  }`}
                style={!isPlaying ? { boxShadow: '0 0 20px rgba(59,130,246,0.5)' } : {}}
              >
                {isPlaying ? <i className="fa-solid fa-pause text-2xl" /> : <i className="fa-solid fa-play text-2xl relative left-[2px]" />}
              </button>
              <button
                onClick={() => navigateFrame((currentFrameIndex + 1) % animation.keyframes.length)}
                className="p-3 hover:bg-white/50 dark:hover:bg-slate-800/50 rounded-xl transition-all border border-transparent hover:border-slate-300 dark:hover:border-slate-700 group active:scale-90"
              >
                <i className="fa-solid fa-forward-step opacity-50 group-hover:opacity-100 text-xl" />
              </button>

              <div className="flex flex-col items-center gap-1 mx-2">
                <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider">補幀比例: {interpolationRatio.toFixed(1)}</span>
                <input
                  type="range" min="0.1" max="0.9" step="0.1"
                  value={interpolationRatio}
                  onChange={(e) => setInterpolationRatio(Number(e.target.value))}
                  className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="w-px h-10 bg-slate-300 dark:bg-slate-700 mx-2" />

              <button
                onClick={insertInbetween}
                disabled={currentFrameIndex === 0}
                className="p-3 opacity-70 hover:opacity-100 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-95"
                title="自動補幀"
              >
                <i className="fa-solid fa-magic-wand-sparkles text-2xl" />
              </button>

              <button
                onClick={addFrame}
                className="p-3 opacity-70 hover:opacity-100 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-95"
                title="新增影格"
              >
                <i className="fa-solid fa-film text-2xl" />
              </button>

              <button
                onClick={deleteFrame}
                className="p-3 opacity-70 hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-95"
                title="刪除影格"
              >
                <i className="fa-solid fa-trash text-2xl" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex gap-3 overflow-x-auto pb-2 px-2 custom-scrollbar mask-fade-edges items-center">
          {animation.keyframes.map((frame, index) => (
            <div
              key={frame.id}
              onClick={(e) => toggleFrameSelection(index, e.shiftKey || e.metaKey || e.ctrlKey)}
              className={`min-w-[110px] h-full rounded-2xl border-2 cursor-pointer transition-all flex flex-col relative group overflow-hidden bg-white/40 dark:bg-slate-800/50 backdrop-blur-sm
                ${selectedFrameIndices.includes(index)
                  ? 'border-blue-500 dark:border-blue-400 bg-blue-50/80 dark:bg-blue-900/20'
                  : index === currentFrameIndex
                    ? 'border-slate-400 dark:border-slate-500 bg-white/80 dark:bg-slate-700/80 shadow-inner'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white/60 dark:hover:bg-slate-700'}`}
            >
              {selectedFrameIndices.includes(index) && (
                <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: '0 0 20px rgba(59,130,246,0.3) inset' }} />
              )}
              <div className={`absolute top-0 left-0 right-0 h-1.5 transition-all z-20 ${selectedFrameIndices.includes(index) ? 'bg-blue-500 dark:bg-blue-400' : 'bg-transparent'}`} />

              {/* Full-bleed Thumbnail */}
              <div className="absolute inset-0 w-full h-full flex items-center justify-center p-1 opacity-80 group-hover:opacity-100 transition-opacity z-10">
                {frame.thumbnail ? (
                  <img src={frame.thumbnail} alt={`Frame ${index + 1}`} className="w-full h-full object-contain rounded-xl shadow-inner mix-blend-multiply dark:mix-blend-lighten" />
                ) : (
                  <i className="fa-regular fa-image opacity-30 text-3xl" />
                )}
              </div>

              {/* Floating Frame Index */}
              <div className="absolute bottom-1 right-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm z-20">
                <span className={`text-[11px] font-black font-mono transition-colors tracking-widest ${selectedFrameIndices.includes(index) ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  #{String(index + 1).padStart(2, '0')}
                </span>
              </div>
            </div>
          ))}
          <button
            onClick={addFrame}
            className="min-w-[110px] h-full rounded-2xl border-2 border-slate-300 dark:border-slate-700 border-dashed hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 flex flex-col gap-2 items-center justify-center text-slate-400 hover:text-blue-500 transition-all font-black text-3xl"
          >
            +
            <span className="text-[10px] uppercase tracking-widest font-bold">New Frame</span>
          </button>
        </div>
      </footer>
    </div >
  );
};

export default App;
