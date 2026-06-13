'use strict';

/**
 * Glyph atlas builder and color-ASCII compositor.
 * Shared by app.js (main thread) and render_worker.js (Web Worker).
 *
 * Wrapped in an IIFE so internal function declarations stay function-scoped
 * and do not pollute the shared global lexical scope, which would cause a
 * SyntaxError when app.js destructures the same names from AsciilineGlyphAtlas.
 */
(function () {

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
    const packed = (255 << 24) | (b << 16) | (g << 8) | r;
    new Uint32Array(destData.buffer).fill(packed);
}

function stampGlyph(destData, dest32, destWidth, atlas, charCode, destX, destY, r, g, b) {
    const { pixels: atlasPixels, width: atlasWidth, cellW, cellH, atlasCols } = atlas;
    const glyphCol = charCode % atlasCols;
    const glyphRow = Math.floor(charCode / atlasCols);
    const srcX0 = glyphCol * cellW;
    const srcY0 = glyphRow * cellH;
    const packed = (255 << 24) | (b << 16) | (g << 8) | r;

    for (let dy = 0; dy < cellH; dy++) {
        const destRow = destY + dy;
        for (let dx = 0; dx < cellW; dx++) {
            const srcIdx = ((srcY0 + dy) * atlasWidth + (srcX0 + dx)) * 4;
            if (atlasPixels[srcIdx] > 128) {
                dest32[destRow * destWidth + (destX + dx)] = packed;
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
    const dest32 = new Uint32Array(destData.buffer);

    let col = 0;
    let row = 0;
    for (let idx = 0; idx < view.length; idx += 4) {
        const ch = view[idx];
        const r = view[idx + 1];
        const g = view[idx + 2];
        const b = view[idx + 3];
        const destX = xPos ? Math.round(xPos[col]) : Math.round(col * charWidth);
        const destY = yPos ? Math.round(yPos[row]) : Math.round(row * charHeight);
        stampGlyph(destData, dest32, width, atlas, ch, destX, destY, r, g, b);
        selectionBuffer[row * selectionRowStride + col] = ch;
        col++;
        if (col >= gridCols) {
            col = 0;
            row++;
        }
    }
}

function applyDeltaFrame(options) {
    const {
        deltaView,
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

    const dest32 = new Uint32Array(destData.buffer);
    const changedCount =
        (deltaView[1] << 24) |
        (deltaView[2] << 16) |
        (deltaView[3] << 8) |
        deltaView[4];

    let off = 5;
    for (let i = 0; i < changedCount; i++, off += 6) {
        const cellIdx = (deltaView[off] << 8) | deltaView[off + 1];
        const ch = deltaView[off + 2];
        const r = deltaView[off + 3];
        const g = deltaView[off + 4];
        const b = deltaView[off + 5];
        const col = cellIdx % gridCols;
        const row = Math.floor(cellIdx / gridCols);
        const destX = xPos ? Math.round(xPos[col]) : Math.round(col * charWidth);
        const destY = yPos ? Math.round(yPos[row]) : Math.round(row * charHeight);
        stampGlyph(destData, dest32, width, atlas, ch, destX, destY, r, g, b);
        selectionBuffer[row * selectionRowStride + col] = ch;
    }
}

const AsciilineGlyphAtlas = {
    GLYPH_LUT_SIZE,
    buildCharLut,
    buildGlyphAtlas,
    compositeColorAsciiFrame,
    applyDeltaFrame,
};

if (typeof self !== 'undefined') {
    self.AsciilineGlyphAtlas = AsciilineGlyphAtlas;
}

})();
