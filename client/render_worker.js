'use strict';

importScripts('/static/client/glyph_atlas.js');

const { compositeColorAsciiFrame } = self.AsciilineGlyphAtlas;

let atlas = null;
let frameBuffer = null;
let xPos = null;
let yPos = null;

self.onmessage = (event) => {
    const msg = event.data;

    if (msg.type === 'init') {
        atlas = msg.atlas;
        frameBuffer = new Uint8ClampedArray(msg.width * msg.height * 4);
        xPos = new Float32Array(msg.xPos);
        yPos = new Float32Array(msg.yPos);
        return;
    }

    if (msg.type === 'frame') {
        const {
            view,
            gridCols,
            gridRows,
            width,
            height,
            charWidth,
            charHeight,
            selectionRowStride,
        } = msg;

        const selectionBuffer = new Uint8Array(gridRows * selectionRowStride);
        for (let r = 0; r < gridRows; r++) {
            selectionBuffer[r * selectionRowStride + gridCols] = 10;
        }

        compositeColorAsciiFrame({
            view,
            gridCols,
            gridRows,
            width,
            height,
            charWidth,
            charHeight,
            atlas,
            destData: frameBuffer,
            selectionBuffer,
            selectionRowStride,
            xPos,
            yPos,
        });

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
