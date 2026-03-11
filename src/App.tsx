import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Layers, Eye, EyeOff, ChevronUp, ChevronDown, Plus, Trash2, Download, Upload, Monitor, Undo2, Redo2, RotateCcw, Save, FolderOpen } from 'lucide-react';
import type { Figure, Keyframe, Animation, FigureNode, StageDimensions } from './types';

const STAGE_SIZES: Record<string, StageDimensions> = {
  '640x480': { width: 640, height: 480 },
  '800x600': { width: 800, height: 600 },
  '932x430': { width: 932, height: 430 },
  '430x932': { width: 430, height: 932 },
};
import { createDefaultStickman, createFigureFromTemplate } from './engine/defaults';
import { CanvasView } from './components/CanvasView';
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

  const addFrame = () => {
    const newFrame: Keyframe = {
      id: uuidv4(),
      figureStates: JSON.parse(JSON.stringify(currentKeyframe.figureStates)),
      duration: 0.5
    };
    const newKeyframes = [...animation.keyframes];
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
    newKeyframes.splice(currentFrameIndex, 0, newFrame);
    setAnimation({ ...animation, keyframes: newKeyframes });
  };

  const [selectedFrameIndices, setSelectedFrameIndices] = useState<number[]>([0]);

  const toggleFrameSelection = (index: number, isMulti: boolean) => {
    if (isMulti) {
      if (selectedFrameIndices.includes(index)) {
        setSelectedFrameIndices(selectedFrameIndices.filter(i => i !== index));
      } else {
        setSelectedFrameIndices([...selectedFrameIndices, index]);
      }
    } else {
      setSelectedFrameIndices([index]);
      setCurrentFrameIndex(index);
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
    <div className="flex flex-col h-screen bg-[#050508] text-white font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="relative w-full h-14 shrink-0 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-40">
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium tracking-wider text-neutral-200">火柴人動畫</h1>
          </div>
          <div className="flex items-center gap-5 bg-neutral-900 rounded-lg">
            <button onClick={undo} disabled={!canUndo} className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 hover:bg-neutral-800 rounded transition" title="復原 (Undo)">
              <i className="fa-solid fa-clock-rotate-left"></i>
            </button>
            <button onClick={redo} disabled={!canRedo} className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 hover:bg-neutral-800 rounded transition" title="重做 (Redo)">
              <i className="fa-solid fa-clock-rotate-right"></i>
            </button>
            <div className="w-px h-4 bg-neutral-800 mx-1" />
            <button onClick={() => { if (window.confirm('確定要清除所有進度並重設畫布嗎？')) reset(); }} className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition" title="清空重設 (Reset Workspace)">
              <i className="fa-solid fa-arrows-rotate"></i>
            </button>
            <i className="fa-solid fa-display"></i>
            <select
              value={currentStageSize}
              onChange={(e) => setCurrentStageSize(e.target.value)}
              className="bg-transparent text-xs text-blue-300 font-bold focus:outline-none cursor-pointer"
            >
              {Object.keys(STAGE_SIZES).map(size => (
                <option key={size} value={size} className="bg-neutral-900 text-white font-bold">{size}</option>
              ))}
            </select>
          </div>
          <div className="w-px h-4 bg-neutral-800 mx-2" />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveProject}
              className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg transition-all text-xs border border-neutral-700 hover:border-neutral-500"
              title="儲存專案 (Save Project)"
            >
              <Save className="w-4 h-4" /> 儲存專案
            </button>
            <label
              className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg transition-all text-xs border border-neutral-700 hover:border-neutral-500 cursor-pointer"
              title="讀取專案 (Load Project)"
            >
              <FolderOpen className="w-4 h-4" /> 讀取專案
              <input type="file" accept=".project" className="hidden" onChange={handleLoadProject} />
            </label>
            <div className="w-px h-4 bg-neutral-800 mx-1" />
            <button
              onClick={handleExportGif}
              disabled={exporting}
              className="flex items-center gap-3 px-4 py-1.5 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-lg transition-all font-black text-xs shadow-xl shadow-blue-900/40 active:scale-95 disabled:opacity-50 ring-1 ring-blue-400/30"
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
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center cursor-not-allowed"
            onClick={(e) => { e.stopPropagation(); alert('播放時無法編輯影格內容'); }}
          >
            <div className="bg-red-500/90 text-white px-8 py-4 rounded-2xl font-black shadow-[0_0_50px_rgba(239,68,68,0.5)] flex items-center gap-4 text-xl tracking-widest pointer-events-none">
              <i className="fa-solid fa-pause text-[24px]" /> 播放時無法編輯影格內容
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
        <div className="w-16 border-r border-white/5 bg-[#0a0a0f] flex flex-col items-center py-4 z-20 shadow-2xl gap-4">
          <button
            onClick={() => setIsLibraryModalOpen(true)}
            className="p-3 bg-neutral-800/50 hover:bg-neutral-700/80 rounded-xl text-neutral-400 hover:text-white transition-all group"
            title="新增物件"
          >
            <i className="w-16 h-16 fa-solid fa-circle-plus"></i>
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
            className="p-3 bg-neutral-800/50 hover:bg-red-500/20 rounded-xl text-neutral-400 hover:text-red-400 transition-all group disabled:opacity-30"
            title="移除物件"
            disabled={!currentKeyframe.figureStates[selectedFigureId]}
          >
            <i className="w-16 h-16 fa-solid fa-trash-can"></i>
          </button>

          <div className="w-8 h-px bg-neutral-800 my-2" />

          <button
            className="p-3 bg-neutral-800/50 hover:bg-neutral-700/80 rounded-xl text-neutral-400 hover:text-white transition-all group disabled:opacity-30"
            title="匯出物件"
            disabled={!currentFigure}
            onClick={() => {
              if (!currentFigure) return;

              // De-instantiate the live Figure back into a generic SkeletonTemplate
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
            <i className="w-16 h-16 fa-solid fa-download"></i>
          </button>

          <button
            className="p-3 bg-neutral-800/50 hover:bg-neutral-700/80 rounded-xl text-neutral-400 hover:text-white transition-all group relative"
            title="匯入物件"
          >
            <i className="w-16 h-16 fa-solid fa-upload"></i>
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
                    // Detect if the loaded JSON is a raw Template (Array of nodes) or a saved live state
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
          <div className="relative group shadow-[0_0_150px_rgba(0,0,0,0.9)] rounded-3xl overflow-hidden border border-white/5 bg-[#050508]">
            <CanvasView
              figures={currentKeyframe.figureStates}
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
        <div className="w-[300px] border-l border-white/5 bg-[#0a0a0f] flex flex-col z-20 shadow-2xl overflow-y-auto">
          <section className="p-6 border-b border-white/5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.3em] opacity-60">Inspector / 屬性面板</h3>
              <div className="flex gap-2">
                <button
                  onClick={inverseSelection}
                  title="循環 / 反選"
                  className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-blue-400 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 rotate-180" />
                </button>
                {selectedNodeId && currentFigure && currentFigure.nodes[selectedNodeId] && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-neutral-800 rounded text-neutral-400">
                    {currentFigure.nodes[selectedNodeId]?.name}
                  </span>
                )}
              </div>
            </div>

            {selectedNodeId && currentFigure && currentFigure.nodes[selectedNodeId] ? (
              <div className="space-y-4">
                {selectedFrameIndices.length > 1 && (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-400 font-bold mb-2">
                    🔥 正在批次編輯 {selectedFrameIndices.length} 個影格
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-400 block">層級控制 (前後順序)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={currentFigure.nodes[selectedNodeId].zOrder}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (selectedFrameIndices.length > 1) batchUpdateProperty('zOrder', val);
                        else updateNodeProperty(selectedNodeId, 'zOrder', val);
                      }}
                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          const val = currentFigure.nodes[selectedNodeId].zOrder + 1;
                          if (selectedFrameIndices.length > 1) batchUpdateProperty('zOrder', val);
                          else updateNodeProperty(selectedNodeId, 'zOrder', val);
                        }}
                        className="p-1 hover:bg-neutral-750 rounded bg-neutral-800 border border-neutral-700"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          const val = currentFigure.nodes[selectedNodeId].zOrder - 1;
                          if (selectedFrameIndices.length > 1) batchUpdateProperty('zOrder', val);
                          else updateNodeProperty(selectedNodeId, 'zOrder', val);
                        }}
                        className="p-1 hover:bg-neutral-750 rounded bg-neutral-800 border border-neutral-700"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-400 block mb-2">控制桿類型</label>
                  {!currentFigure.nodes[selectedNodeId].parentId ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 py-2 px-1 rounded-lg border bg-neutral-800 border-neutral-700 text-neutral-500 text-center text-[10px] font-bold tracking-wider">
                        核心節點 (ROOT)
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {!Object.values(currentFigure.nodes).some(n => n.parentId === selectedNodeId) ? null : (
                        <button
                          onClick={() => updateNodeProperty(selectedNodeId, 'handleType', 'ROTATE')}
                          title="僅限旋轉"
                          className={`flex-1 py-2 px-1 rounded-lg border text-[10px] font-bold tracking-wider transition-all ${currentFigure.nodes[selectedNodeId].handleType === 'ROTATE' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500'}`}
                        >
                          旋轉
                        </button>
                      )}
                      <button
                        onClick={() => updateNodeProperty(selectedNodeId, 'handleType', 'STRETCH')}
                        title="伸展與縮放"
                        className={`flex-1 py-2 px-1 rounded-lg border text-[10px] font-bold tracking-wider transition-all ${currentFigure.nodes[selectedNodeId].handleType === 'STRETCH' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500'}`}
                      >
                        伸展
                      </button>
                      <button
                        onClick={() => updateNodeProperty(selectedNodeId, 'handleType', 'STATIC')}
                        title="靜態關節"
                        className={`flex-1 py-2 px-1 rounded-lg border text-[10px] font-bold tracking-wider transition-all ${currentFigure.nodes[selectedNodeId].handleType === 'STATIC' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500'}`}
                      >
                        靜態
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-400 block">線條粗度 (px)</label>
                    <input
                      type="number"
                      value={currentFigure.nodes[selectedNodeId].thickness}
                      min="1" max="100"
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value));
                        if (selectedFrameIndices.length > 1) batchUpdateProperty('thickness', val);
                        else updateNodeProperty(selectedNodeId, 'thickness', val);
                      }}
                      className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-blue-500"
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
                    className="w-full accent-blue-500 h-1.5 bg-neutral-800 rounded-lg appearance-none"
                  />
                </div>

                {currentFigure.nodes[selectedNodeId].parentId !== null && (
                  <div className="pt-4 border-t border-neutral-700/50 space-y-4">
                    <label className="text-xs font-semibold text-neutral-400 block italic">🎨 節點段屬性 (軀幹)</label>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-neutral-500 block">形狀</label>
                      <div className="flex p-1 bg-neutral-900 rounded-lg w-full">
                        <button
                          onClick={() => {
                            const seg = currentFigure.nodes[selectedNodeId].segment || { color: '#ffffff', shape: 'TRAPEZOID' };
                            updateNodeProperty(selectedNodeId, 'segment', { ...seg, shape: 'TRAPEZOID' });
                          }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${(!currentFigure.nodes[selectedNodeId].segment || currentFigure.nodes[selectedNodeId].segment?.shape === 'TRAPEZOID') ? 'bg-neutral-700 text-white shadow' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                          梯形 (一般)
                        </button>
                        <button
                          onClick={() => {
                            const seg = currentFigure.nodes[selectedNodeId].segment || { color: '#ffffff', shape: 'TRAPEZOID' };
                            updateNodeProperty(selectedNodeId, 'segment', { ...seg, shape: 'CIRCLE' });
                          }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${currentFigure.nodes[selectedNodeId].segment?.shape === 'CIRCLE' ? 'bg-neutral-700 text-white shadow' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                          圓形
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-neutral-500 block">顏色選擇</label>
                      <ColorPalette
                        selectedColor={currentFigure.nodes[selectedNodeId].segment?.color || '#ffffff'}
                        onColorSelect={(color) => {
                          const currentSegment = currentFigure.nodes[selectedNodeId].segment || { color: '#ffffff', shape: 'TRAPEZOID' };
                          const updatedSegment = { ...currentSegment, color };
                          if (selectedFrameIndices.length > 1) batchUpdateProperty('segment', updatedSegment);
                          else updateNodeProperty(selectedNodeId, 'segment', updatedSegment);
                        }}
                      />
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono mt-2">
                        <span>當前顏色碼</span>
                        <span className="bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">{currentFigure.nodes[selectedNodeId].segment?.color || '#ffffff'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 px-4 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/50 flex flex-col items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-neutral-300 hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={isFigureRotationMode}
                    onChange={e => setIsFigureRotationMode(e.target.checked)}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-blue-500 focus:ring-blue-500/30"
                  />
                  <span className="text-sm font-bold">物件旋轉</span>
                </label>
                <p className="text-[10px] text-neutral-500 text-left leading-relaxed">
                  勾選此項時，拖拉任一節點皆會以核心為中心，保留現有樣態旋轉整個物件。取消勾選則為預設操作。
                </p>
              </div>
            )}
          </section>

          <section className="p-6 border-b border-white/5">
            <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-4">動畫設定</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-400">當前影格</span>
                <span className="text-xl font-mono text-blue-400 font-black">{String(currentFrameIndex + 1).padStart(2, '0')} / {animation.keyframes.length}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-400">洋蔥皮殘影</span>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => setOnionSkinCount(n)}
                        className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${onionSkinCount === n ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-400">播放速度 (FPS)</span>
                  <span className="text-[10px] font-bold text-neutral-500">{animation.fps}</span>
                </div>
                <input
                  type="range" min="1" max="30"
                  value={animation.fps}
                  onChange={(e) => setAnimation({ ...animation, fps: Number(e.target.value) })}
                  className="w-full accent-blue-500 h-1 bg-neutral-800 rounded-lg appearance-none"
                />
              </div>
            </div>
          </section>

          <section className="p-6 mt-auto">
            <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-4">檢視設定</h3>
            <div className="space-y-4">
              <button
                onClick={() => setShowStaticHandles(!showStaticHandles)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all border ${showStaticHandles
                  ? 'bg-neutral-800 border-neutral-700 text-neutral-200'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-500'
                  }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider">顯示靜態節點</span>
                {showStaticHandles ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </section>
        </div>
      </div >

      {/* Footer - Timeline */}
      <footer className="h-44 w-full glass-header m-2 rounded-2xl flex flex-row p-4 gap-6 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] z-10">
        <div className="flex flex-col justify-center shrink-0 bg-neutral-900/40 rounded-xl border border-white/5 p-4 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentFrameIndex(Math.max(0, currentFrameIndex - 1))}
                className="p-3 hover:bg-neutral-800/50 rounded-xl transition-all border border-transparent hover:border-white/10 group active:scale-90"
              >
                <i className="fa-solid fa-backward-step opacity-40 group-hover:opacity-100" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-5 rounded-2xl transition-all shadow-2xl active:scale-95 ${isPlaying
                  ? 'bg-neutral-800 text-blue-400 border border-blue-500/30'
                  : 'bg-blue-600 text-white border border-blue-400/50 glow-blue'
                  }`}
              >
                {isPlaying ? <i className="fa-solid fa-pause text-xl" /> : <i className="fa-solid fa-play text-xl relative left-[2px]" />}
              </button>
              <button
                onClick={() => setCurrentFrameIndex((currentFrameIndex + 1) % animation.keyframes.length)}
                className="p-3 hover:bg-neutral-800/50 rounded-xl transition-all border border-transparent hover:border-white/10 group active:scale-90"
              >
                <i className="fa-solid fa-forward-step opacity-40 group-hover:opacity-100" />
              </button>

              <div className="flex flex-col items-center gap-1 mr-2">
                <span className="text-[9px] font-bold text-neutral-600 uppercase">補幀比例: {interpolationRatio.toFixed(1)}</span>
                <input
                  type="range" min="0.1" max="0.9" step="0.1"
                  value={interpolationRatio}
                  onChange={(e) => setInterpolationRatio(Number(e.target.value))}
                  className="w-16 accent-blue-500 h-1 bg-neutral-800 rounded-lg appearance-none"
                />
              </div>

              <button
                onClick={insertInbetween}
                disabled={currentFrameIndex === 0}
                className="p-3 text-neutral-600 hover:text-red-500 hover:bg-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20 active:scale-95"
                title="自動補幀"
              >
                <i className="fa-solid fa-magic-wand-sparkles opacity-60 hover:opacity-100" />
              </button>

              <button
                onClick={addFrame}
                className="p-3 text-neutral-600 hover:text-red-500 hover:bg-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20 active:scale-95"
                title="新增影格"
              >
                <i className="fa-solid fa-film opacity-60 hover:opacity-100" />
              </button>

              <button
                onClick={deleteFrame}
                className="p-3 text-neutral-600 hover:text-red-500 hover:bg-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20 active:scale-95"
                title="刪除影格"
              >
                <i className="fa-solid fa-trash opacity-60 hover:opacity-100" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex gap-3 overflow-x-auto pb-2 px-2 custom-scrollbar mask-fade-edges items-center">
          {animation.keyframes.map((frame, index) => (
            <div
              key={frame.id}
              onClick={(e) => toggleFrameSelection(index, e.shiftKey || e.metaKey || e.ctrlKey)}
              className={`min-w-[90px] h-full rounded-xl border-2 cursor-pointer transition-all flex flex-col relative group overflow-hidden
                ${selectedFrameIndices.includes(index)
                  ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                  : index === currentFrameIndex
                    ? 'border-neutral-600 bg-neutral-800/80 shadow-inner'
                    : 'border-neutral-800 bg-neutral-800/50 hover:border-neutral-600 hover:bg-neutral-800'}`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 transition-all ${selectedFrameIndices.includes(index) ? 'bg-blue-500' : 'bg-transparent'}`} />
              <div className="flex-1 flex items-center justify-center p-2 opacity-60 group-hover:opacity-100 transition-opacity">
                <div className="w-10 h-10 border border-neutral-700/50 rounded flex items-center justify-center rotate-1 group-hover:rotate-0 transition-transform">
                  <i className="fa-regular fa-image opacity-30 group-hover:opacity-60 text-lg" />
                </div>
              </div>
              <div className="bg-neutral-900/50 p-1.5 flex justify-center">
                <span className={`text-[9px] font-black font-mono transition-colors ${selectedFrameIndices.includes(index) ? 'text-blue-400' : 'text-neutral-600'}`}>
                  #{String(index + 1).padStart(2, '0')}
                </span>
              </div>
            </div>
          ))}
          <button
            onClick={addFrame}
            className="min-w-[90px] h-full rounded-xl border-2 border-neutral-800 border-dashed hover:border-neutral-600 hover:bg-neutral-800/30 flex items-center justify-center text-neutral-700 hover:text-neutral-500 transition-all font-black text-xl"
          >
            +
          </button>
        </div>
      </footer>
    </div >
  );
};

export default App;
