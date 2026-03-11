import React from 'react';

interface ColorPaletteProps {
    onColorSelect: (color: string) => void;
    selectedColor?: string;
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({ onColorSelect, selectedColor }) => {
    // Generate a standard 256 color palette (web safeish or just a good spread)
    const colors: string[] = [];

    // Pivot Pro Specific: 16x16 grid (256 colors)
    // 16 Grayscale tones
    for (let i = 0; i < 16; i++) {
        const l = Math.round(i * (100 / 15));
        colors.push(`hsl(0, 0%, ${l}%)`);
    }

    // 240 Colorful tones
    // 20 hues * 3 saturations * 4 lightnesses = 240
    const sats = [100, 75, 50];
    const lights = [80, 60, 40, 20];

    for (const s of sats) {
        for (const l of lights) {
            for (let h = 0; h < 360; h += 18) {
                colors.push(`hsl(${h}, ${s}%, ${l}%)`);
            }
        }
    }

    return (
        <div
            className="grid gap-0.5 p-1 bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden shadow-inner"
            style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}
        >
            {colors.slice(0, 256).map((color, i) => (
                <div
                    key={i}
                    onClick={() => onColorSelect(color)}
                    className={`cursor-pointer hover:scale-125 hover:z-10 transition-transform ${selectedColor === color ? 'ring-1 ring-white z-10' : ''}`}
                    style={{ backgroundColor: color, width: '100%', height: '16px' }}
                    title={color}
                />
            ))}
        </div>
    );
};
