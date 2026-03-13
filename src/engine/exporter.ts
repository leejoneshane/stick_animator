import GIF from 'gif.js';
import type { Animation } from '../types';
import { renderFigure } from './renderer';

export async function exportToGif(
    animation: Animation,
    viewWidth: number,
    viewHeight: number,
    stageWidth: number,
    stageHeight: number,
    backgroundImageUrl: string | null,
    onProgress: (progress: number) => void
): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
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

        let bgImage: HTMLImageElement | null = null;
        if (backgroundImageUrl) {
            bgImage = await new Promise((res) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = () => res(null);
                img.src = backgroundImageUrl;
            });
        }

        const offsetX = -(viewWidth - stageWidth) / 2;
        const offsetY = -(viewHeight - stageHeight) / 2;

        animation.keyframes.forEach((frame) => {
            ctx.clearRect(0, 0, stageWidth, stageHeight);
            ctx.fillStyle = '#22222a'; // Stage Background
            ctx.fillRect(0, 0, stageWidth, stageHeight);

            if (bgImage) {
                const imgRatio = bgImage.width / bgImage.height;
                const stageRatio = stageWidth / stageHeight;
                let drawWidth, drawHeight, drawX, drawY;

                if (imgRatio > stageRatio) {
                    drawHeight = stageHeight;
                    drawWidth = bgImage.width * (stageHeight / bgImage.height);
                    drawX = (stageWidth - drawWidth) / 2;
                    drawY = 0;
                } else {
                    drawWidth = stageWidth;
                    drawHeight = bgImage.height * (stageWidth / bgImage.width);
                    drawX = 0;
                    drawY = (stageHeight - drawHeight) / 2;
                }
                ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
            }

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
