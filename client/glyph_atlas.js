'use strict';

/**
 * Glyph atlas builder and color-ASCII compositor.
 * Shared by app.js (main thread) and render_worker.js (Web Worker).
 */

const GLYPH_LUT_SIZE = 128;

function buildCharLut() {
    const lut = new Array(GLYPH_LUT_SIZE);
    for (let i = 0; i < GLYPH_LUT_SIZE; i++) {
        lut[i] = String.fromCharCode(i);
    }
    return lut;
}

function buildGlyphAtlas(charWidth, charHeight, charLut) {
    const atlasCols = 16;
    const cellW = Math.max(1, Math.ceil(charWidth));
    const cellH = charHeight;
    const atlasWidth = atlasCols * cellW;
    const atlasHeight = Math.ceil(charLut.length / atlasCols) * cellH;

    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(atlasWidth, atlasHeight);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = atlasWidth;
        canvas.height = atlasHeight;
    }

    const actx = canvas.getContext('2d');
    actx.fillStyle = '#000000';
    actx.fillRect(0, 0, atlasWidth, atlasHeight);
    actx.font = 'bold 8px Courier New';
    actx.textBaseline = 'top';
    actx.fillStyle = '#ffffff';
    for (let i = 0; i < charLut.length; i++) {
        const col = i % atlasCols;
        const row = Math.floor(i / atlasCols);
        actx.fillText(charLut[i], col * cellW, row * cellH);
    }

    const imageData = actx.getImageData(0, 0, atlasWidth, atlasHeight);
    return {
        pixels: imageData.data,
        width: atlasWidth,
        height: atlasHeight,
        cellW,
        cellH,
        atlasCols,
    };
}

function fillBackground(destData, r, g, b) {
    for (let i = 0; i < destData.length; i += 4) {
        destData[i] = r;
        destData[i + 1] = g;
        destData[i + 2] = b;
        destData[i + 3] = 255;
    }
}

function stampGlyph(destData, destWidth, atlas, charCode, destX, destY, r, g, b) {
    const { pixels: atlasPixels, width: atlasWidth, cellW, cellH, atlasCols } = atlas;
    const glyphCol = charCode % atlasCols;
    const glyphRow = Math.floor(charCode / atlasCols);
    const srcX0 = glyphCol * cellW;
    const srcY0 = glyphRow * cellH;

    for (let dy = 0; dy < cellH; dy++) {
        const destRow = destY + dy;
        for (let dx = 0; dx < cellW; dx++) {
            const srcIdx = ((srcY0 + dy) * atlasWidth + (srcX0 + dx)) * 4;
            if (atlasPixels[srcIdx] > 128) {
                const destIdx = (destRow * destWidth + (destX + dx)) * 4;
                destData[destIdx] = r;
                destData[destIdx + 1] = g;
                destData[destIdx + 2] = b;
                destData[destIdx + 3] = 255;
            }
        }
    }
}

function compositeColorAsciiFrame(options) {
    const {
        view,
        gridCols,
        width,
        charWidth,
        charHeight,
        atlas,
        destData,
        selectionBuffer,
        selectionRowStride,
        xPos,
        yPos,
    } = options;

    fillBackground(destData, 5, 5, 5);

    let col = 0;
    let row = 0;
    for (let idx = 0; idx < view.length; idx += 4) {
        const ch = view[idx];
        const r = view[idx + 1];
        const g = view[idx + 2];
        const b = view[idx + 3];
        const destX = xPos ? Math.round(xPos[col]) : Math.round(col * charWidth);
        const destY = yPos ? Math.round(yPos[row]) : Math.round(row * charHeight);
        stampGlyph(destData, width, atlas, ch, destX, destY, r, g, b);
        selectionBuffer[row * selectionRowStride + col] = ch;
        col++;
        if (col >= gridCols) {
            col = 0;
            row++;
        }
    }
}

const AsciilineGlyphAtlas = {
    GLYPH_LUT_SIZE,
    buildCharLut,
    buildGlyphAtlas,
    compositeColorAsciiFrame,
};

if (typeof self !== 'undefined') {
    self.AsciilineGlyphAtlas = AsciilineGlyphAtlas;
}
