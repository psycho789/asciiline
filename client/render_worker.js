'use strict';

importScripts('/static/client/glyph_atlas.js');

const { compositeColorAsciiFrame, applyDeltaFrame } = self.AsciilineGlyphAtlas;

let atlas = null;
let frameBuffer = null;
let selectionBuffer = null;
let xPos = null;
let yPos = null;
let gridCols = 0;
let gridRows = 0;
let selectionRowStride = 0;
let canvasWidth = 0;
let canvasHeight = 0;
let charWidth = 0;
let charHeight = 0;

function postCompositedFrame() {
    const imageBuffer = frameBuffer.buffer;
    const selectionBufferCopy = selectionBuffer.buffer;
    self.postMessage(
        {
            type: 'frame',
            imageData: imageBuffer,
            selectionBuffer: selectionBufferCopy,
            width: canvasWidth,
            height: canvasHeight,
        },
        [imageBuffer, selectionBufferCopy],
    );
}

self.onmessage = (event) => {
    const msg = event.data;

    if (msg.type === 'init') {
        atlas = msg.atlas;
        frameBuffer = new Uint8ClampedArray(msg.width * msg.height * 4);
        canvasWidth = msg.width;
        canvasHeight = msg.height;
        xPos = new Float32Array(msg.xPos);
        yPos = new Float32Array(msg.yPos);
        gridCols = msg.gridCols;
        gridRows = msg.gridRows;
        selectionRowStride = msg.selectionRowStride;
        selectionBuffer = new Uint8Array(gridRows * selectionRowStride);
        for (let r = 0; r < gridRows; r++) {
            selectionBuffer[r * selectionRowStride + gridCols] = 10;
        }
        return;
    }

    if (msg.type === 'reclaim') {
        frameBuffer = new Uint8ClampedArray(msg.buffer);
        return;
    }

    if (msg.type === 'frame') {
        const view = new Uint8Array(msg.buffer, msg.payloadOffset);
        charWidth = msg.charWidth;
        charHeight = msg.charHeight;

        compositeColorAsciiFrame({
            view,
            gridCols,
            gridRows,
            width: canvasWidth,
            height: canvasHeight,
            charWidth,
            charHeight,
            atlas,
            destData: frameBuffer,
            selectionBuffer,
            selectionRowStride,
            xPos,
            yPos,
        });

        postCompositedFrame();
    }

    if (msg.type === 'delta') {
        charWidth = msg.charWidth;
        charHeight = msg.charHeight;
        const deltaView = new Uint8Array(msg.buffer, msg.payloadOffset);

        applyDeltaFrame({
            deltaView,
            gridCols,
            gridRows,
            width: canvasWidth,
            height: canvasHeight,
            charWidth,
            charHeight,
            atlas,
            destData: frameBuffer,
            selectionBuffer,
            selectionRowStride,
            xPos,
            yPos,
        });

        postCompositedFrame();
    }
};
