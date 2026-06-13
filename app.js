/**
 * ASCILINE ENGINE - Pure & Performant Logic
 * =========================================
 * No decorative animations. Pure WebSocket streaming
 * and high-performance canvas rendering.
 * Includes an "Invisible Selection Layer" for text selection.
 */

const player    = document.getElementById('ascii-player');
const canvas    = document.getElementById('ascii-canvas');
const ctx       = canvas.getContext('2d');
const statusEl  = document.getElementById('status');
const container = document.getElementById('player-container');
const overlay   = document.getElementById('play-overlay');
const audioEl   = document.getElementById('ascii-audio');
const volumeSlider = document.getElementById('volume-slider');

const { buildCharLut, buildGlyphAtlas, compositeColorAsciiFrame } =
    window.AsciilineGlyphAtlas;

// ── STATE ──
let state = 'IDLE'; // IDLE | PLAYING
let ws = null;
const frameBuffer = [];
const MAX_FRAME_BUFFER = 20;
let targetFps = 24;
let renderMode = 1;
let pixelMode = false;
let readyToRender = false;

// Grid & Dimensions
let gridCols = 0;
let charWidth = 0, charHeight = 0;
let xPos = null, yPos = null;

// Pixel Mode (--pixel) — ImageData pixel buffer
let dotImageData = null;

// Color ASCII atlas + compositor
let glyphAtlas = null;
let colorFrameImageData = null;
let selectionRowStride = 0;

// OffscreenCanvas render worker
const useRenderWorker =
    typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
let renderWorker = null;
let workerBusy = false;
let workerPendingView = null;

// Selection Layer optimization
const textDecoder = new TextDecoder();
let selectionBuffer = null;

// Timing & Metrics
let lastRenderTime = 0;
let frameCount = 0, currentFps = 0, lastFpsUpdate = 0;
let streamStartTime = 0;

const CHAR_LUT = buildCharLut();

// ═══════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════

function initRenderWorker() {
    if (!useRenderWorker) {
        return;
    }
    if (renderWorker) {
        renderWorker.terminate();
        renderWorker = null;
        workerBusy = false;
        workerPendingView = null;
    }
    renderWorker = new Worker('/static/client/render_worker.js');
    renderWorker.onmessage = (event) => {
        if (event.data.type !== 'frame') {
            return;
        }
        applyWorkerFrame(event.data);
        workerBusy = false;
        if (workerPendingView) {
            const pending = workerPendingView;
            workerPendingView = null;
            postFrameToWorker(pending);
        }
    };
    renderWorker.onerror = () => {
        workerBusy = false;
        workerPendingView = null;
    };
    syncWorkerInit();
}

function syncWorkerInit() {
    if (!renderWorker || !glyphAtlas) {
        return;
    }
    renderWorker.postMessage({
        type: 'init',
        atlas: {
            pixels: glyphAtlas.pixels,
            width: glyphAtlas.width,
            cellW: glyphAtlas.cellW,
            cellH: glyphAtlas.cellH,
            atlasCols: glyphAtlas.atlasCols,
        },
        width: canvas.width,
        height: canvas.height,
        xPos: xPos,
        yPos: yPos,
    });
}

function rebuildGlyphAtlas() {
    glyphAtlas = buildGlyphAtlas(charWidth, charHeight, CHAR_LUT);
    colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    syncWorkerInit();
}

function buildCanvas(cols, rows) {
    gridCols = cols;

    // Sizing and positioning for both layers
    const syncSize = (el) => {
        el.style.width  = container.clientWidth + 'px';
        el.style.height = container.clientHeight + 'px';
        el.style.objectFit = 'contain';
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
    };

    if (pixelMode) {
        // ── DOT MODE: 1 canvas pixel = 1 grid cell ──
        canvas.width  = cols;
        canvas.height = rows;
        canvas.style.display = 'block';
        canvas.style.imageRendering = 'pixelated';
        dotImageData = ctx.createImageData(cols, rows);
        // Pre-fill alpha channel to 255 (fully opaque)
        const d = dotImageData.data;
        for (let i = 3; i < d.length; i += 4) d[i] = 255;
        syncSize(canvas);
        glyphAtlas = null;
        colorFrameImageData = null;
        // Hide selection layer — no text to select in dot mode
        player.style.display = 'none';
    } else {
        // ── STANDARD ASCII MODES (1-5) ──
        canvas.style.imageRendering = '';
        dotImageData = null;
        ctx.font = 'bold 8px Courier New';
        charWidth = ctx.measureText('M').width;
        charHeight = 8;
        canvas.width  = cols * charWidth;
        canvas.height = rows * charHeight;
        canvas.style.display = 'block';

        // Selection Layer Buffer
        selectionRowStride = cols + 1;
        selectionBuffer = new Uint8Array(selectionRowStride * rows);
        for (let r = 0; r < rows; r++) {
            selectionBuffer[r * selectionRowStride + cols] = 10;
        }

        syncSize(canvas);

        player.style.width  = canvas.width + 'px';
        player.style.height = canvas.height + 'px';
        player.style.position = 'absolute';
        player.style.top = '0';
        player.style.left = '0';
        player.style.fontSize = '8px';
        player.style.lineHeight = '8px';
        syncSelectionTransform();

        ctx.font = 'bold 8px Courier New';
        ctx.textBaseline = 'top';
        xPos = new Float32Array(cols);
        yPos = new Float32Array(rows);
        for (let c = 0; c < cols; c++) xPos[c] = c * charWidth;
        for (let r = 0; r < rows; r++) yPos[r] = r * charHeight;

        if (renderMode !== 1) {
            rebuildGlyphAtlas();
            initRenderWorker();
        }
    }
}

function syncSelectionTransform() {
    if (pixelMode || !canvas.width || !canvas.height) return;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const fitScaleX = containerW / canvas.width;
    const fitScaleY = containerH / canvas.height;
    const fitScale  = Math.min(fitScaleX, fitScaleY);
    const renderedW = canvas.width  * fitScale;
    const renderedH = canvas.height * fitScale;
    const offsetX   = (containerW - renderedW) / 2;
    const offsetY   = (containerH - renderedH) / 2;
    player.style.transformOrigin = 'top left';
    player.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${fitScale})`;
}

function updateSelectionLayer() {
    player.style.display = 'block';
    player.style.color = 'transparent';
    player.textContent = textDecoder.decode(selectionBuffer);
}

function applyWorkerFrame(payload) {
    const { imageData, selectionBuffer: workerSelection, width, height } = payload;
    const pixels = new Uint8ClampedArray(imageData);
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    selectionBuffer.set(new Uint8Array(workerSelection));
    updateSelectionLayer();
}

function postFrameToWorker(view) {
    if (!renderWorker || !glyphAtlas) {
        renderColorAsciiFrame(view);
        return;
    }
    if (workerBusy) {
        workerPendingView = view;
        return;
    }
    workerBusy = true;
    const viewCopy = new Uint8Array(view);
    renderWorker.postMessage(
        {
            type: 'frame',
            view: viewCopy,
            gridCols,
            gridRows: selectionBuffer.length / selectionRowStride,
            width: canvas.width,
            height: canvas.height,
            charWidth,
            charHeight,
            selectionRowStride,
        },
        [viewCopy.buffer],
    );
}

function renderColorAsciiFrame(view) {
    if (
        !colorFrameImageData ||
        colorFrameImageData.width !== canvas.width ||
        colorFrameImageData.height !== canvas.height
    ) {
        colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    }

    compositeColorAsciiFrame({
        view,
        gridCols,
        gridRows: selectionBuffer.length / selectionRowStride,
        width: canvas.width,
        height: canvas.height,
        charWidth,
        charHeight,
        atlas: glyphAtlas,
        destData: colorFrameImageData.data,
        selectionBuffer,
        selectionRowStride,
        xPos,
        yPos,
    });

    ctx.putImageData(colorFrameImageData, 0, 0);
    updateSelectionLayer();
}

// ═══════════════════════════════════════
//  STREAM CONTROL
// ═══════════════════════════════════════

function startStream() {
    if (state !== 'IDLE') return;
    overlay.classList.add('hidden');
    statusEl.textContent = 'Connecting...';
    statusEl.style.color = 'var(--accent-color)';
    connectWebSocket();
}

function connectWebSocket() {
    frameBuffer.length = 0;
    frameCount = 0;
    currentFps = 0;

    // Audio is loaded later in INIT handler (Audio Ready Gate).
    // Don't preload here — causes race conditions with vol=0 (204 response).

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
            if (event.data.startsWith('Error:')) {
                statusEl.textContent = event.data;
                statusEl.style.color = '#ff0000';
                if (ws) ws.close();
                setTimeout(() => finishStream(), 3000);
                return;
            }
            if (event.data.startsWith('INIT:')) {
                const p = event.data.split(':');
                targetFps = parseFloat(p[1]);
                renderMode = parseInt(p[2]);
                pixelMode = (p.length > 5 && parseInt(p[5]) === 1);
                const sessionId = p.length > 6 ? p[6] : null;
                buildCanvas(parseInt(p[3]), parseInt(p[4]));

                // ── AUDIO READY GATE ──
                // Buffer video frames but don't render until audio is ready.
                // This prevents the 0.5s initial stutter.
                readyToRender = false;
                state = 'PLAYING';

                const beginRendering = () => {
                    readyToRender = true;
                    streamStartTime = performance.now();
                    lastRenderTime = performance.now();
                    lastFpsUpdate = lastRenderTime;
                    requestAnimationFrame(renderFrame);
                };

                if (audioEl) {
                    audioEl.pause();
                    audioEl.src = sessionId
                        ? '/audio?session=' + encodeURIComponent(sessionId)
                        : '/audio?' + Date.now();
                    audioEl.volume = volumeSlider ? volumeSlider.value : 1.0;
                    audioEl.load();
                    audioEl.play().catch(() => {});

                    // Wait for audio to actually start playing
                    if (audioEl.readyState >= 3) {
                        beginRendering();
                    } else {
                        audioEl.addEventListener('playing', beginRendering, { once: true });
                        // Fallback: if audio fails to load (vol=0 / 204), start after 500ms
                        setTimeout(() => {
                            if (!readyToRender) beginRendering();
                        }, 500);
                    }
                } else {
                    // No audio element at all → start immediately
                    beginRendering();
                }
        return;
            }
            
            // Mode 1: Text Frame with Timestamp
            const text = event.data;
            const newlineIdx = text.indexOf('\n');
            const frameIndex = parseInt(text.substring(0, newlineIdx));
            const frameTime = frameIndex / targetFps;
            const frameData = text.substring(newlineIdx + 1);
            frameBuffer.push({ data: frameData, time: frameTime });
        } else {
            // Binary Frames with 4-byte header
            const buffer = event.data;
            const view = new DataView(buffer);
            const frameIndex = view.getUint32(0, false); // Big-endian
            const frameTime = frameIndex / targetFps;
            const frameData = new Uint8Array(buffer, 4);
            frameBuffer.push({ data: frameData, time: frameTime });
        }

        while (frameBuffer.length > MAX_FRAME_BUFFER) frameBuffer.shift();
    };

    ws.onopen = () => { statusEl.textContent = 'Buffering...'; };

    ws.onclose = () => {
        if (state === 'PLAYING') {
            statusEl.textContent = 'Stream Ended.';
            statusEl.style.color = '#888';
            if (audioEl) audioEl.pause();
            setTimeout(() => finishStream(), 800);
        }
    };

    ws.onerror = () => {
        statusEl.textContent = 'Connection Error!';
        statusEl.style.color = '#ff0000';
        setTimeout(() => finishStream(), 2000);
    };
}

// ═══════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════

function renderFrame(now) {
    if (state !== 'PLAYING' || !readyToRender) return;
    requestAnimationFrame(renderFrame);

    // ── MASTER CLOCK LOGIC ──
    let masterClock;
    if (audioEl && audioEl.readyState >= 1 && !audioEl.paused) {
        masterClock = audioEl.currentTime;
    } else {
        masterClock = (now - streamStartTime) / 1000.0;
    }

    if (frameBuffer.length === 0) return;

    // A/V Sync: Drop frames that are too far behind the master clock (catch up)
    while (frameBuffer.length > 1 && frameBuffer[0].time < masterClock - 0.1) {
        frameBuffer.shift();
    }

    // A/V Sync: Wait if the frame is in the future
    if (frameBuffer[0].time > masterClock + 0.05) {
        return;
    }

    const frameObj = frameBuffer.shift();
    const frame = frameObj.data;

    frameCount++;
    if (now - lastFpsUpdate >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
        const modes = { 2: '512 Color', 3: '32K Color', 4: '262K Color', 5: '16M Ultra' };
        const label = (modes[renderMode] || 'B&W') + (pixelMode ? ' PIXEL' : '');
        statusEl.textContent = `FPS: ${currentFps}/${Math.round(targetFps)} | Buf: ${frameBuffer.length} | ${label}`;
    }

    lastRenderTime = now;

    if (renderMode === 1) {
        player.style.display = 'block';
        player.style.color = '#fff';
        player.textContent = frame;
    } else if (pixelMode) {
        // ── ZERO-COPY PIXEL MODE ──
        // Server sends raw BGR (3 bytes/pixel). We swap B↔R here.
        const view = frame; // Already a Uint8Array
        const data = dotImageData.data;
        // view: [B,G,R, B,G,R, ...] → data: [R,G,B,A, R,G,B,A, ...]
        for (let src = 0, dst = 0; src < view.length; src += 3, dst += 4) {
            data[dst]     = view[src + 2]; // R (from BGR)
            data[dst + 1] = view[src + 1]; // G
            data[dst + 2] = view[src];     // B
            // Alpha already set to 255 in buildCanvas
        }
        ctx.putImageData(dotImageData, 0, 0);
    } else {
        // ── COLOR MODES (2-5): atlas blit via ImageData (≤2 canvas ops) ──
        const view = frame;
        if (useRenderWorker && renderWorker) {
            postFrameToWorker(view);
        } else {
            renderColorAsciiFrame(view);
        }
    }
}

// ═══════════════════════════════════════
//  CLEANUP
// ═══════════════════════════════════════

function finishStream() {
    state = 'IDLE';
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    if (renderWorker) {
        renderWorker.terminate();
        renderWorker = null;
        workerBusy = false;
        workerPendingView = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    player.textContent = '';
    player.style.display = 'none';
    overlay.classList.remove('hidden');
    statusEl.textContent = 'Ready';
    statusEl.style.color = 'rgba(255,255,255,0.6)';
    readyToRender = false;
    frameBuffer.length = 0;
}

// ── EVENT LISTENERS ──
overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    startStream();
});

if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        if (audioEl) audioEl.volume = volumeSlider.value;
    });
}

window.addEventListener('resize', () => {
    const syncSize = (el) => {
        if (!el) return;
        el.style.width  = container.clientWidth + 'px';
        el.style.height = container.clientHeight + 'px';
    };
    syncSize(canvas);
    syncSize(player);
    syncSelectionTransform();
});
