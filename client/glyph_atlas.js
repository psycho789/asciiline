'use strict';

/**
 * Glyph atlas builder and color-ASCII compositor (static-pages extended).
 * Supports dynamic glyph sets, charCode→atlasIndex lookup, triglyph additive passes,
 * and angle-binned rotated stamping.
 */
(function () {

const ROTATION_BINS = 16;

function buildCharLut() {
    const lut = new Array(128);
    for (let i = 0; i < 128; i++) {
        lut[i] = String.fromCharCode(i);
    }
    return lut;
}

function glyphsFromList(glyphList) {
    if (Array.isArray(glyphList)) {
        return glyphList.map((ch) => (typeof ch === 'string' ? ch : String.fromCharCode(ch)));
    }
    return [...glyphList];
}

function buildCharCodeToAtlasIndex(glyphs) {
    const map = new Uint16Array(65536);
    for (let i = 0; i < glyphs.length; i++) {
        const code = glyphs[i].charCodeAt(0);
        map[code] = i;
    }
    return map;
}

function buildGlyphAtlas(charWidth, charHeight, fontCss, glyphList) {
    const glyphs = glyphsFromList(glyphList);
    const atlasCols = 16;
    const cellW = Math.max(1, Math.ceil(charWidth));
    const cellH = charHeight;
    const atlasWidth = atlasCols * cellW;
    const atlasHeight = Math.ceil(glyphs.length / atlasCols) * cellH;

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
    actx.font = fontCss;
    actx.textBaseline = 'top';
    actx.fillStyle = '#ffffff';
    for (let i = 0; i < glyphs.length; i++) {
        const col = i % atlasCols;
        const row = Math.floor(i / atlasCols);
        actx.fillText(glyphs[i], col * cellW, row * cellH);
    }

    const imageData = actx.getImageData(0, 0, atlasWidth, atlasHeight);
    return {
        pixels: imageData.data,
        width: atlasWidth,
        height: atlasHeight,
        cellW,
        cellH,
        atlasCols,
        glyphCount: glyphs.length,
        charCodeToAtlasIndex: buildCharCodeToAtlasIndex(glyphs),
    };
}

function buildRotationAtlas(charWidth, charHeight, fontCss, glyphList) {
    const glyphs = glyphsFromList(glyphList);
    const cellW = Math.max(1, Math.ceil(charWidth));
    const cellH = charHeight;
    const pad = Math.ceil(Math.max(cellW, cellH) * 0.6);
    const binW = cellW + pad * 2;
    const binH = cellH + pad * 2;
    const atlasWidth = binW * ROTATION_BINS;
    const atlasHeight = binH * glyphs.length;

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
    actx.font = fontCss;
    actx.textBaseline = 'top';
    actx.fillStyle = '#ffffff';

    for (let gi = 0; gi < glyphs.length; gi++) {
        for (let bin = 0; bin < ROTATION_BINS; bin++) {
            const angle = (bin / ROTATION_BINS) * Math.PI * 2;
            const destX = bin * binW;
            const destY = gi * binH;
            actx.save();
            actx.translate(destX + binW * 0.5, destY + binH * 0.5);
            actx.rotate(angle);
            actx.fillText(glyphs[gi], -cellW * 0.5, -cellH * 0.5);
            actx.restore();
        }
    }

    const imageData = actx.getImageData(0, 0, atlasWidth, atlasHeight);
    return {
        pixels: imageData.data,
        width: atlasWidth,
        height: atlasHeight,
        cellW,
        cellH,
        binW,
        binH,
        rotationBins: ROTATION_BINS,
        charCodeToAtlasIndex: buildCharCodeToAtlasIndex(glyphs),
    };
}

function atlasIndexFor(atlas, charCode) {
    return atlas.charCodeToAtlasIndex[charCode] || 0;
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
    const atlasIndex = atlasIndexFor(atlas, charCode);
    const glyphCol = atlasIndex % atlasCols;
    const glyphRow = Math.floor(atlasIndex / atlasCols);
    const srcX0 = glyphCol * cellW;
    const srcY0 = glyphRow * cellH;

    for (let dy = 0; dy < cellH; dy++) {
        const destRow = destY + dy;
        if (destRow < 0) continue;
        for (let dx = 0; dx < cellW; dx++) {
            const srcIdx = ((srcY0 + dy) * atlasWidth + (srcX0 + dx)) * 4;
            if (atlasPixels[srcIdx] > 128) {
                const destIdx = (destRow * destWidth + (destX + dx)) * 4;
                if (destIdx < 0 || destIdx >= destData.length) continue;
                destData[destIdx] = r;
                destData[destIdx + 1] = g;
                destData[destIdx + 2] = b;
                destData[destIdx + 3] = 255;
            }
        }
    }
}

function stampGlyphAdditive(destData, destWidth, atlas, charCode, destX, destY, r, g, b) {
    const { pixels: atlasPixels, width: atlasWidth, cellW, cellH, atlasCols } = atlas;
    const atlasIndex = atlasIndexFor(atlas, charCode);
    const glyphCol = atlasIndex % atlasCols;
    const glyphRow = Math.floor(atlasIndex / atlasCols);
    const srcX0 = glyphCol * cellW;
    const srcY0 = glyphRow * cellH;

    for (let dy = 0; dy < cellH; dy++) {
        const destRow = destY + dy;
        if (destRow < 0) continue;
        for (let dx = 0; dx < cellW; dx++) {
            const srcIdx = ((srcY0 + dy) * atlasWidth + (srcX0 + dx)) * 4;
            if (atlasPixels[srcIdx] > 128) {
                const destIdx = (destRow * destWidth + (destX + dx)) * 4;
                if (destIdx < 0 || destIdx >= destData.length) continue;
                destData[destIdx] = Math.min(255, destData[destIdx] + r);
                destData[destIdx + 1] = Math.min(255, destData[destIdx + 1] + g);
                destData[destIdx + 2] = Math.min(255, destData[destIdx + 2] + b);
                destData[destIdx + 3] = 255;
            }
        }
    }
}

function stampGlyphRotated(destData, destWidth, rotationAtlas, charCode, destX, destY, r, g, b, angle) {
    const {
        pixels: atlasPixels,
        width: atlasWidth,
        binW,
        binH,
        rotationBins,
    } = rotationAtlas;
    const atlasIndex = atlasIndexFor(rotationAtlas, charCode);
    let bin = Math.round((angle / (Math.PI * 2)) * rotationBins) % rotationBins;
    if (bin < 0) bin += rotationBins;

    const srcX0 = bin * binW;
    const srcY0 = atlasIndex * binH;
    const padX = Math.floor((binW - rotationAtlas.cellW) * 0.5);
    const padY = Math.floor((binH - rotationAtlas.cellH) * 0.5);
    const offsetX = destX - padX;
    const offsetY = destY - padY;

    for (let dy = 0; dy < binH; dy++) {
        const destRow = offsetY + dy;
        if (destRow < 0) continue;
        for (let dx = 0; dx < binW; dx++) {
            const srcIdx = ((srcY0 + dy) * atlasWidth + (srcX0 + dx)) * 4;
            if (atlasPixels[srcIdx] > 128) {
                const destIdx = (destRow * destWidth + (offsetX + dx)) * 4;
                if (destIdx < 0 || destIdx >= destData.length) continue;
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
        atlas,
        destData,
        selectionBuffer,
        selectionRowStride,
        xPos,
        yPos,
        charWidth,
        charHeight,
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
        if (selectionBuffer) {
            selectionBuffer[row * selectionRowStride + col] = ch < 256 ? ch : 32;
        }
        col++;
        if (col >= gridCols) {
            col = 0;
            row++;
        }
    }
}

function compositeTriglyphFrame(options) {
    const {
        view,
        gridCols,
        width,
        atlas,
        destData,
        selectionBuffer,
        selectionRowStride,
        xPos,
        charWidth,
        charHeight,
        offset,
    } = options;

    fillBackground(destData, 5, 5, 5);

    const layers = [
        { dx: -offset, r: 255, g: 0, b: 64 },
        { dx: 0, r: 0, g: 255, b: 136 },
        { dx: offset, r: 0, g: 136, b: 255 },
    ];

    let col = 0;
    let row = 0;
    for (let idx = 0; idx < view.length; idx += 4) {
        const ch = view[idx];
        const destY = Math.round(row * charHeight);
        for (const layer of layers) {
            const baseX = xPos ? xPos[col] : col * charWidth;
            const destX = Math.round(baseX + layer.dx * charWidth);
            stampGlyphAdditive(destData, width, atlas, ch, destX, destY, layer.r, layer.g, layer.b);
        }
        if (selectionBuffer && layers[1]) {
            selectionBuffer[row * selectionRowStride + col] = ch < 256 ? ch : 32;
        }
        col++;
        if (col >= gridCols) {
            col = 0;
            row++;
        }
    }
}

function compositeRotatedAsciiFrame(options) {
    const {
        view,
        angles,
        gridCols,
        width,
        rotationAtlas,
        destData,
        selectionBuffer,
        selectionRowStride,
        xPos,
        yPos,
        charWidth,
        charHeight,
    } = options;

    fillBackground(destData, 5, 5, 5);

    let col = 0;
    let row = 0;
    let cellIdx = 0;
    for (let idx = 0; idx < view.length; idx += 4) {
        const ch = view[idx];
        const r = view[idx + 1];
        const g = view[idx + 2];
        const b = view[idx + 3];
        const angle = angles ? angles[cellIdx] : 0;
        const destX = xPos ? Math.round(xPos[col]) : Math.round(col * charWidth);
        const destY = yPos ? Math.round(yPos[row]) : Math.round(row * charHeight);
        if (Math.abs(angle) > 0.008) {
            stampGlyphRotated(destData, width, rotationAtlas, ch, destX, destY, r, g, b, angle);
        } else {
            stampGlyphRotated(destData, width, rotationAtlas, ch, destX, destY, r, g, b, 0);
        }
        if (selectionBuffer) {
            selectionBuffer[row * selectionRowStride + col] = ch < 256 ? ch : 32;
        }
        cellIdx++;
        col++;
        if (col >= gridCols) {
            col = 0;
            row++;
        }
    }
}

const AsciilineGlyphAtlas = {
    ROTATION_BINS,
    buildCharLut,
    buildGlyphAtlas,
    buildRotationAtlas,
    compositeColorAsciiFrame,
    compositeTriglyphFrame,
    compositeRotatedAsciiFrame,
};

if (typeof self !== 'undefined') {
    self.AsciilineGlyphAtlas = AsciilineGlyphAtlas;
}

})();
