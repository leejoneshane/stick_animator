import GIF from 'gif.js';
import type { Animation } from '../types';
import { renderFigure } from './renderer';

export async function exportToGif(
    animation: Animation,
    viewWidth: number,
    viewHeight: number,
    stageWidth: number,
    stageHeight: number,
    onProgress: (progress: number) => void
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: stageWidth,
            height: stageHeight,
            workerScript: '/gif.worker.js'
        });

        const canvas = document.createElement('canvas');
        canvas.width = stageWidth;
        canvas.height = stageHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Could not get canvas context');

        const offsetX = -(viewWidth - stageWidth) / 2;
        const offsetY = -(viewHeight - stageHeight) / 2;

        animation.keyframes.forEach((frame) => {
            ctx.clearRect(0, 0, stageWidth, stageHeight);
            ctx.fillStyle = '#22222a'; // Stage Background
            ctx.fillRect(0, 0, stageWidth, stageHeight);

            ctx.save();
            ctx.translate(offsetX, offsetY);

            Object.values(frame.figureStates).forEach(figure => {
                renderFigure(ctx, figure, { showHandles: false, showStaticHandles: false });
            });

            ctx.restore();

            gif.addFrame(ctx, { copy: true, delay: 1000 / animation.fps });
        });

        gif.on('progress', (p) => onProgress(p));
        gif.on('finished', (blob) => resolve(blob));
        gif.render();
    });
}
