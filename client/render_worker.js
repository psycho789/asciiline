'use strict';

importScripts('glyph_atlas.js');

const {
    compositeColorAsciiFrame,
    compositeTriglyphFrame,
    compositeRotatedAsciiFrame,
} = self.AsciilineGlyphAtlas;

let atlas = null;
let rotationAtlas = null;
let frameBuffer = null;
let xPos = null;
let yPos = null;

self.onmessage = (event) => {
    const msg = event.data;

    if (msg.type === 'init') {
        atlas = msg.atlas;
        rotationAtlas = msg.rotationAtlas || null;
        frameBuffer = new Uint8ClampedArray(msg.width * msg.height * 4);
        xPos = new Float32Array(msg.xPos);
        yPos = new Float32Array(msg.yPos);
        return;
    }

    if (msg.type === 'frame') {
        const {
            view,
            angles,
            mode,
            gridCols,
            gridRows,
            width,
            height,
            charWidth,
            charHeight,
            selectionRowStride,
            triglyphOffset,
        } = msg;

        const selectionBuffer = new Uint8Array(gridRows * selectionRowStride);
        for (let r = 0; r < gridRows; r++) {
            selectionBuffer[r * selectionRowStride + gridCols] = 10;
        }

        const baseOpts = {
            view,
            gridCols,
            width,
            height,
            charWidth,
            charHeight,
            destData: frameBuffer,
            selectionBuffer,
            selectionRowStride,
            xPos,
            yPos,
        };

        if (mode === 'triglyph') {
            compositeTriglyphFrame({
                ...baseOpts,
                atlas,
                offset: triglyphOffset || 2,
            });
        } else if (mode === 'rotated') {
            compositeRotatedAsciiFrame({
                ...baseOpts,
                rotationAtlas: rotationAtlas || atlas,
                angles: angles ? new Float32Array(angles) : null,
            });
        } else {
            compositeColorAsciiFrame({
                ...baseOpts,
                atlas,
            });
        }

        const imageBuffer = frameBuffer.buffer;
        const selectionBufferCopy = selectionBuffer.buffer;
        self.postMessage(
            {
                type: 'frame',
                imageData: imageBuffer,
                selectionBuffer: selectionBufferCopy,
                width,
                height,
            },
            [imageBuffer, selectionBufferCopy],
        );

        frameBuffer = new Uint8ClampedArray(width * height * 4);
    }
};
