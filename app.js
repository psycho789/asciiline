/**
 * ASCILINE ENGINE - Pure & Performant Logic
 * =========================================
 * Wrapped in IIFE with Stream/Render/Metrics namespaces.
 */

(function () {
    'use strict';

/*
 * Stream state machine
 * ─────────────────────────────────────────────────────────
 *   IDLE  ──startStream()──►  PLAYING  ──finishStream()──►  IDLE
 *                               │  ▲
 *                          onclose  reconnectStream()
 *                               │  │
 *                               ▼  │
 *                           (retrying — Stream.reconnecting=true)
 *
 * Invariants on transition TO IDLE:
 *   Stream.frameBuffer.length = 0
 *   Render.renderWorker terminated
 *   audioEl paused and src cleared
 */

// ── STREAM PREFS (cols + aspect, persisted in localStorage) ──
const COLS_MIN = 120;
const COLS_MAX = 800;
const COLS_DEFAULT = 280;
const STORAGE_COLS = 'asciiline.cols';
const STORAGE_ASPECT = 'asciiline.aspect';

function loadStreamCols() {
    const stored = parseInt(localStorage.getItem(STORAGE_COLS) || '', 10);
    if (Number.isFinite(stored) && stored >= COLS_MIN && stored <= COLS_MAX) {
        return stored;
    }
    return COLS_DEFAULT;
}

function loadStreamAspect() {
    const stored = localStorage.getItem(STORAGE_ASPECT) || 'auto';
    const allowed = ['auto', '16:9', '4:3', '21:9', '1:1'];
    return allowed.includes(stored) ? stored : 'auto';
}

const RECONNECT_MAX_RETRIES = 3;
const MAX_FRAME_BUFFER = 20;

const Stream = {
    ws: null,
    state: 'IDLE',
    frameBuffer: [],
    targetFps: 24,
    renderMode: 1,
    pixelMode: false,
    readyToRender: false,
    reconnecting: false,
    reconnectRetries: 0,
    streamCols: loadStreamCols(),
    streamAspect: loadStreamAspect(),
    gridCols: 0,
    gridRows: 0,
};

const Render = {
    glyphAtlas: null,
    colorFrameImageData: null,
    charWidth: 0,
    charHeight: 0,
    xPos: null,
    yPos: null,
    selectionBuffer: null,
    selectionRowStride: 0,
    dotImageData: null,
    renderWorker: null,
    workerBusy: false,
    workerPendingFrame: null,
    workerBusySince: 0,
    useRenderWorker: typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined',
    textDecoder: new TextDecoder(),
};

const Metrics = {
    frameCount: 0,
    currentFps: 0,
    currentBitrate: 0,
    bytesReceivedWindow: 0,
    lastFpsUpdate: 0,
    streamStartTime: 0,
    lastRenderTime: 0,
    frameDropCount: 0,
    workerBusyWindowMs: 0,
    renderMsSum: 0,
    renderMsCount: 0,
    _workerBusySince: 0,
};

const metricsPanel = document.getElementById('metrics-panel');
const mFps = document.getElementById('m-fps');
const mNet = document.getElementById('m-net');
const mDrops = document.getElementById('m-drops');
const mWrk = document.getElementById('m-wrk');
const mRend = document.getElementById('m-rend');

const player    = document.getElementById('ascii-player');
const canvas    = document.getElementById('ascii-canvas');
const ctx       = canvas.getContext('2d');
const statusEl  = document.getElementById('status');
const streamStatsEl = document.getElementById('stream-stats');
const container = document.getElementById('player-container');
const overlay   = document.getElementById('play-overlay');
const audioEl   = document.getElementById('ascii-audio');
const volumeSlider = document.getElementById('volume-slider');
const colsSlider = document.getElementById('cols-slider');
const colsValueEl = document.getElementById('cols-value');
const aspectSelect = document.getElementById('aspect-select');

const { buildCharLut, buildGlyphAtlas, compositeColorAsciiFrame, applyDeltaFrame } =
    window.AsciilineGlyphAtlas;

const CHAR_LUT = buildCharLut();

function messageByteLength(data) {
    if (typeof data === 'string') {
        return new TextEncoder().encode(data).byteLength;
    }
    if (data instanceof ArrayBuffer) {
        return data.byteLength;
    }
    if (ArrayBuffer.isView(data)) {
        return data.byteLength;
    }
    return 0;
}

function formatBitrate(bytesPerSec) {
    if (bytesPerSec >= 1024 * 1024) {
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytesPerSec >= 1024) {
        return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${bytesPerSec} B/s`;
}

function updateStreamStats() {
    if (!streamStatsEl) {
        return;
    }
    if (Stream.state !== 'PLAYING') {
        streamStatsEl.hidden = true;
        return;
    }
    streamStatsEl.hidden = false;
    streamStatsEl.textContent =
        `FPS ${Metrics.currentFps}/${Math.round(Stream.targetFps)}`
        + ` · NET ${formatBitrate(Metrics.currentBitrate)}`
        + ` · GRID ${Stream.gridCols}×${Stream.gridRows}`
        + ` · BUF ${Stream.frameBuffer.length}`;
}

function resetStreamMetrics() {
    Metrics.frameCount = 0;
    Metrics.currentFps = 0;
    Metrics.bytesReceivedWindow = 0;
    Metrics.currentBitrate = 0;
    Metrics.lastFpsUpdate = 0;
    Metrics.frameDropCount = 0;
    Metrics.workerBusyWindowMs = 0;
    Metrics.renderMsSum = 0;
    Metrics.renderMsCount = 0;
    updateStreamStats();
    updateMetricsPanel();
}

function updateMetricsPanel() {
    if (!metricsPanel || metricsPanel.hidden) {
        return;
    }
    if (mFps) {
        mFps.textContent = `${Metrics.currentFps}/${Math.round(Stream.targetFps)}`;
    }
    if (mNet) {
        mNet.textContent = formatBitrate(Metrics.currentBitrate);
    }
    if (mDrops) {
        mDrops.textContent = String(Metrics.frameDropCount);
    }
    const workerPct = Metrics.frameCount > 0
        ? Math.round((Metrics.workerBusyWindowMs / 1000) * 100)
        : 0;
    if (mWrk) {
        mWrk.textContent = String(workerPct);
    }
    const renderMs = Metrics.renderMsCount > 0
        ? (Metrics.renderMsSum / Metrics.renderMsCount).toFixed(1)
        : '—';
    if (mRend) {
        mRend.textContent = String(renderMs);
    }
}

// ═══════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════

function initRenderWorker() {
    if (!Render.useRenderWorker) {
        return;
    }
    if (Render.renderWorker) {
        Render.renderWorker.terminate();
        Render.renderWorker = null;
        Render.workerBusy = false;
        Render.workerPendingFrame = null;
    }
    try {
        Render.renderWorker = new Worker('/static/client/render_worker.js');
    } catch {
        Render.useRenderWorker = false;
        Render.renderWorker = null;
        return;
    }
    Render.renderWorker.onmessage = (event) => {
        if (event.data.type !== 'frame') {
            return;
        }
        applyWorkerFrame(event.data);
        Render.workerBusy = false;
        if (Render.workerPendingFrame) {
            const pending = Render.workerPendingFrame;
            Render.workerPendingFrame = null;
            postFrameToWorker(pending.buffer, pending.payloadOffset, pending.isDelta);
        }
    };
    Render.renderWorker.onerror = () => {
        Render.renderWorker.terminate();
        Render.renderWorker = null;
        Render.useRenderWorker = false;
        Render.workerBusy = false;
        if (Render.workerPendingFrame) {
            const pending = Render.workerPendingFrame;
            Render.workerPendingFrame = null;
            renderColorAsciiFrame(pending.buffer, pending.payloadOffset);
        }
    };
    syncWorkerInit();
}

function syncWorkerInit() {
    if (!Render.renderWorker || !Render.glyphAtlas) {
        return;
    }
    Render.renderWorker.postMessage({
        type: 'init',
        atlas: {
            pixels: Render.glyphAtlas.pixels,
            width: Render.glyphAtlas.width,
            cellW: Render.glyphAtlas.cellW,
            cellH: Render.glyphAtlas.cellH,
            atlasCols: Render.glyphAtlas.atlasCols,
        },
        width: canvas.width,
        height: canvas.height,
        xPos: Render.xPos,
        yPos: Render.yPos,
        gridRows: Stream.gridRows,
        gridCols: Stream.gridCols,
        selectionRowStride: Render.selectionRowStride,
    });
}

function rebuildGlyphAtlas() {
    Render.glyphAtlas = buildGlyphAtlas(Render.charWidth, Render.charHeight, CHAR_LUT);
    Render.colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    syncWorkerInit();
}

function buildCanvas(cols, rows) {
    Stream.gridCols = cols;
    Stream.gridRows = rows;

    // Sizing and positioning for both layers
    const syncSize = (el) => {
        el.style.width  = container.clientWidth + 'px';
        el.style.height = container.clientHeight + 'px';
        el.style.objectFit = 'contain';
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
    };

    if (Stream.pixelMode) {
        // ── DOT MODE: 1 canvas pixel = 1 grid cell ──
        canvas.width  = cols;
        canvas.height = rows;
        canvas.style.display = 'block';
        canvas.style.imageRendering = 'pixelated';
        Render.dotImageData = ctx.createImageData(cols, rows);
        // Pre-fill alpha channel to 255 (fully opaque)
        const d = Render.dotImageData.data;
        for (let i = 3; i < d.length; i += 4) d[i] = 255;
        syncSize(canvas);
        Render.glyphAtlas = null;
        Render.colorFrameImageData = null;
        // Hide selection layer — no text to select in dot mode
        player.style.display = 'none';
    } else {
        // ── STANDARD ASCII MODES (1-5) ──
        canvas.style.imageRendering = '';
        Render.dotImageData = null;
        ctx.font = 'bold 8px Courier New';
        Render.charWidth = ctx.measureText('M').width;
        Render.charHeight = 8;
        canvas.width  = cols * Render.charWidth;
        canvas.height = rows * Render.charHeight;
        canvas.style.display = 'block';

        // Selection Layer Buffer
        Render.selectionRowStride = cols + 1;
        Render.selectionBuffer = new Uint8Array(Render.selectionRowStride * rows);
        for (let r = 0; r < rows; r++) {
            Render.selectionBuffer[r * Render.selectionRowStride + cols] = 10;
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
        Render.xPos = new Float32Array(cols);
        Render.yPos = new Float32Array(rows);
        for (let c = 0; c < cols; c++) Render.xPos[c] = c * Render.charWidth;
        for (let r = 0; r < rows; r++) Render.yPos[r] = r * Render.charHeight;

        if (Stream.renderMode !== 1) {
            rebuildGlyphAtlas();
            initRenderWorker();
        }
    }
}

function syncSelectionTransform() {
    if (Stream.pixelMode || !canvas.width || !canvas.height) return;
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
    player.textContent = Render.textDecoder.decode(Render.selectionBuffer);
}

function applyWorkerFrame(payload) {
    const { imageData, selectionBuffer: workerSelection, width, height } = payload;
    const pixels = new Uint8ClampedArray(imageData);
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    Render.selectionBuffer.set(new Uint8Array(workerSelection));
    updateSelectionLayer();
    if (Render.renderWorker) {
        Render.renderWorker.postMessage({ type: 'reclaim', buffer: imageData }, [imageData]);
    }
}

function postFrameToWorker(buffer, payloadOffset, isDelta = false) {
    if (!Render.renderWorker || !Render.glyphAtlas) {
        if (isDelta) {
            renderDeltaFrame(buffer, payloadOffset);
        } else {
            renderColorAsciiFrame(buffer, payloadOffset);
        }
        return;
    }
    if (Render.workerBusy) {
        Render.workerPendingFrame = { buffer, payloadOffset, isDelta };
        return;
    }
    Render.workerBusy = true;
    Render.workerBusySince = performance.now();
    Render.renderWorker.postMessage(
        {
            type: isDelta ? 'delta' : 'frame',
            buffer,
            payloadOffset,
            charWidth: Render.charWidth,
            charHeight: Render.charHeight,
        },
        [buffer],
    );
}

function renderColorAsciiFrame(buffer, payloadOffset) {
    const view = new Uint8Array(buffer, payloadOffset);
    if (
        !Render.colorFrameImageData ||
        Render.colorFrameImageData.width !== canvas.width ||
        Render.colorFrameImageData.height !== canvas.height
    ) {
        Render.colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    }

    compositeColorAsciiFrame({
        view,
        gridCols: Stream.gridCols,
        gridRows: Render.selectionBuffer.length / Render.selectionRowStride,
        width: canvas.width,
        height: canvas.height,
        charWidth: Render.charWidth,
        charHeight: Render.charHeight,
        atlas: Render.glyphAtlas,
        destData: Render.colorFrameImageData.data,
        selectionBuffer: Render.selectionBuffer,
        selectionRowStride: Render.selectionRowStride,
        xPos: Render.xPos,
        yPos: Render.yPos,
    });

    ctx.putImageData(Render.colorFrameImageData, 0, 0);
    updateSelectionLayer();
}

function renderDeltaFrame(buffer, payloadOffset) {
    if (
        !Render.colorFrameImageData ||
        Render.colorFrameImageData.width !== canvas.width ||
        Render.colorFrameImageData.height !== canvas.height
    ) {
        Render.colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    }

    applyDeltaFrame({
        deltaView: new Uint8Array(buffer, payloadOffset),
        gridCols: Stream.gridCols,
        gridRows: Stream.gridRows,
        width: canvas.width,
        height: canvas.height,
        charWidth: Render.charWidth,
        charHeight: Render.charHeight,
        atlas: Render.glyphAtlas,
        destData: Render.colorFrameImageData.data,
        selectionBuffer: Render.selectionBuffer,
        selectionRowStride: Render.selectionRowStride,
        xPos: Render.xPos,
        yPos: Render.yPos,
    });

    ctx.putImageData(Render.colorFrameImageData, 0, 0);
    updateSelectionLayer();
}

// ═══════════════════════════════════════
//  STREAM CONTROL
// ═══════════════════════════════════════

function startStream() {
    if (Stream.state !== 'IDLE') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        statusEl.textContent = 'Motion reduced — enable animations to play.';
        return;
    }
    overlay.classList.add('hidden');
    statusEl.textContent = 'Connecting...';
    statusEl.style.color = 'var(--accent-color)';
    connectWebSocket();
}

function buildWsUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    params.set('cols', String(Stream.streamCols));
    params.set('aspect', Stream.streamAspect);
    return `${protocol}//${location.host}/ws?${params.toString()}`;
}

function closeActiveWebSocket() {
    return new Promise((resolve) => {
        if (!Stream.ws) {
            resolve();
            return;
        }
        const socket = Stream.ws;
        Stream.ws = null;
        if (socket.readyState === WebSocket.CLOSED) {
            resolve();
            return;
        }
        const finish = () => resolve();
        socket.addEventListener('close', finish, { once: true });
        socket.addEventListener('error', finish, { once: true });
        socket.close();
        setTimeout(finish, 2000);
    });
}

function reconnectStream() {
    if (Stream.reconnecting) {
        return;
    }
    Stream.reconnecting = true;
    Stream.reconnectRetries = 0;
    Stream.readyToRender = false;
    Stream.frameBuffer.length = 0;
    Metrics.frameCount = 0;
    if (Render.renderWorker) {
        Render.renderWorker.terminate();
        Render.renderWorker = null;
        Render.workerBusy = false;
        Render.workerPendingFrame = null;
    }
    if (audioEl) {
        audioEl.pause();
        audioEl.src = '';
    }
    statusEl.textContent = 'Reconnecting...';
    statusEl.style.color = 'var(--accent-color)';
    closeActiveWebSocket().then(() => connectWebSocket(true));
}

function persistStreamPrefs() {
    localStorage.setItem(STORAGE_COLS, String(Stream.streamCols));
    localStorage.setItem(STORAGE_ASPECT, Stream.streamAspect);
}

function applyStreamSettingChange() {
    persistStreamPrefs();
    if (Stream.state === 'PLAYING') {
        reconnectStream();
    }
}

function scheduleReconnectRetry() {
    if (Stream.reconnectRetries >= RECONNECT_MAX_RETRIES) {
        Stream.reconnecting = false;
        statusEl.textContent = 'Connection Error!';
        statusEl.style.color = '#ff0000';
        setTimeout(() => finishStream(), 2000);
        return;
    }
    Stream.reconnectRetries += 1;
    statusEl.textContent = `Reconnecting (${Stream.reconnectRetries}/${RECONNECT_MAX_RETRIES})...`;
    statusEl.style.color = 'var(--accent-color)';
    closeActiveWebSocket().then(() => {
        setTimeout(() => connectWebSocket(true), 150 * Stream.reconnectRetries);
    });
}

function connectWebSocket(isReconnect = false) {
    resetStreamMetrics();
    Stream.frameBuffer.length = 0;

    // Audio is loaded later in INIT handler (Audio Ready Gate).
    // Don't preload here — causes race conditions with vol=0 (204 response).

    Stream.ws = new WebSocket(buildWsUrl());
    Stream.ws.binaryType = 'arraybuffer';

    Stream.ws.onmessage = (event) => {
        Metrics.bytesReceivedWindow += messageByteLength(event.data);

        if (typeof event.data === 'string') {
            if (event.data === 'DONE:') {
                statusEl.textContent = 'Stream complete.';
                setTimeout(() => finishStream(), 800);
                return;
            }
            if (event.data.startsWith('Error:')) {
                statusEl.textContent = event.data;
                statusEl.style.color = '#ff0000';
                if (Stream.ws) Stream.ws.close();
                setTimeout(() => finishStream(), 3000);
                return;
            }
            if (event.data.startsWith('INIT:')) {
                const p = event.data.split(':');
                Stream.targetFps = parseFloat(p[1]);
                Stream.renderMode = parseInt(p[2]);
                Stream.pixelMode = (p.length > 5 && parseInt(p[5]) === 1);
                const sessionId = p.length > 6 ? p[6] : null;
                buildCanvas(parseInt(p[3]), parseInt(p[4]));
                updateStreamStats();

                // ── AUDIO READY GATE ──
                // Buffer video frames but don't render until audio is ready.
                // This prevents the 0.5s initial stutter.
                Stream.readyToRender = false;
                Stream.state = 'PLAYING';

                const beginRendering = () => {
                    if (Stream.readyToRender) return;
                    Stream.readyToRender = true;
                    Metrics.streamStartTime = performance.now();
                    Metrics.lastRenderTime = performance.now();
                    Metrics.lastFpsUpdate = Metrics.lastRenderTime;
                    statusEl.textContent = 'Streaming';
                    updateStreamStats();
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
                            if (!Stream.readyToRender) beginRendering();
                        }, 500);
                    }
                } else {
                    // No audio element at all → start immediately
                    beginRendering();
                }
        return;
            }

            // Legacy text mode-1 path (pre-binary)
            const text = event.data;
            const newlineIdx = text.indexOf('\n');
            const frameIndex = parseInt(text.substring(0, newlineIdx));
            const frameTime = frameIndex / Stream.targetFps;
            const frameData = text.substring(newlineIdx + 1);
            Stream.frameBuffer.push({ data: frameData, time: frameTime, isText: true });
        } else {
            // Binary Frames with 4-byte header
            const buffer = event.data;
            const view = new DataView(buffer);
            const frameIndex = view.getUint32(0, false); // Big-endian
            const frameTime = frameIndex / Stream.targetFps;
            Stream.frameBuffer.push({ buffer, payloadOffset: 4, time: frameTime });
        }

        while (Stream.frameBuffer.length > MAX_FRAME_BUFFER) Stream.frameBuffer.shift();
        if (Stream.state === 'PLAYING') {
            updateStreamStats();
        }
    };

    Stream.ws.onopen = () => {
        Stream.reconnecting = false;
        Stream.reconnectRetries = 0;
        statusEl.textContent = 'Buffering...';
    };

    Stream.ws.onclose = () => {
        if (Stream.reconnecting) {
            return;
        }
        if (Stream.state === 'PLAYING') {
            statusEl.textContent = 'Stream Ended.';
            statusEl.style.color = '#888';
            if (audioEl) audioEl.pause();
            setTimeout(() => finishStream(), 800);
        }
    };

    Stream.ws.onerror = () => {
        if (isReconnect || Stream.reconnecting) {
            scheduleReconnectRetry();
            return;
        }
        statusEl.textContent = 'Connection Error!';
        statusEl.style.color = '#ff0000';
        setTimeout(() => finishStream(), 2000);
    };
}

// ═══════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════

function renderFrame(now) {
    if (Stream.state !== 'PLAYING' || !Stream.readyToRender) return;
    requestAnimationFrame(renderFrame);
    updateStreamStats();
    if (Render.workerBusy) {
        Metrics.workerBusyWindowMs += now - (Metrics._workerBusySince || now);
    }
    Metrics._workerBusySince = Render.workerBusy ? now : 0;

    if (
        Render.useRenderWorker &&
        Render.workerBusy &&
        now - Render.workerBusySince > 500
    ) {
        Render.useRenderWorker = false;
        Render.workerBusy = false;
        if (Render.renderWorker) {
            Render.renderWorker.terminate();
            Render.renderWorker = null;
        }
        if (Render.workerPendingFrame) {
            const pending = Render.workerPendingFrame;
            Render.workerPendingFrame = null;
            if (pending.isDelta) {
                renderDeltaFrame(pending.buffer, pending.payloadOffset);
            } else {
                renderColorAsciiFrame(pending.buffer, pending.payloadOffset);
            }
        }
    }

    // ── MASTER CLOCK LOGIC ──
    let masterClock;
    if (audioEl && audioEl.readyState >= 1 && !audioEl.paused) {
        masterClock = audioEl.currentTime;
    } else {
        masterClock = (now - Metrics.streamStartTime) / 1000.0;
    }

    if (Stream.frameBuffer.length === 0) return;

    // A/V Sync: Drop frames that are too far behind the master clock (catch up)
    while (Stream.frameBuffer.length > 1 && Stream.frameBuffer[0].time < masterClock - 0.1) {
        Stream.frameBuffer.shift();
        Metrics.frameDropCount += 1;
    }

    // A/V Sync: Wait if the frame is in the future
    if (Stream.frameBuffer[0].time > masterClock + 0.05) {
        return;
    }

    const frameObj = Stream.frameBuffer.shift();

    Metrics.frameCount++;
    if (now - Metrics.lastFpsUpdate >= 1000) {
        Metrics.currentFps = Metrics.frameCount;
        Metrics.currentBitrate = Metrics.bytesReceivedWindow;
        Metrics.bytesReceivedWindow = 0;
        Metrics.frameCount = 0;
        Metrics.lastFpsUpdate = now;
    }

    Metrics.lastRenderTime = now;

    if (Stream.renderMode === 1) {
        player.style.display = 'block';
        player.style.color = '#fff';
        if (frameObj.isText) {
            player.textContent = frameObj.data;
        } else {
            const chars = new Uint8Array(frameObj.buffer, frameObj.payloadOffset);
            let text = '';
            for (let r = 0; r < Stream.gridRows; r++) {
                const start = r * Stream.gridCols;
                for (let c = 0; c < Stream.gridCols; c++) {
                    text += String.fromCharCode(chars[start + c]);
                }
                if (r < Stream.gridRows - 1) {
                    text += '\n';
                }
            }
            player.textContent = text;
        }
    } else if (Stream.pixelMode) {
        // ── ZERO-COPY PIXEL MODE ──
        const view = new Uint8Array(frameObj.buffer, frameObj.payloadOffset);
        const data = Render.dotImageData.data;
        const dest32 = new Uint32Array(data.buffer);
        for (let src = 0, i = 0; src < view.length; src += 3, i++) {
            dest32[i] = (255 << 24) | (view[src] << 16) | (view[src + 1] << 8) | view[src + 2];
        }
        ctx.putImageData(Render.dotImageData, 0, 0);
    } else if (Stream.renderMode === 6) {
        const { buffer, payloadOffset } = frameObj;
        const frameType = new Uint8Array(buffer, payloadOffset)[0];
        if (frameType === 0x01) {
            if (Render.useRenderWorker && Render.renderWorker) {
                postFrameToWorker(buffer, payloadOffset, true);
            } else {
                const t0 = performance.now();
                renderDeltaFrame(buffer, payloadOffset);
                Metrics.renderMsSum += performance.now() - t0;
                Metrics.renderMsCount += 1;
            }
        } else {
            const cellOffset = payloadOffset + 1;
            if (Render.useRenderWorker && Render.renderWorker) {
                postFrameToWorker(buffer, cellOffset, false);
            } else {
                const t0 = performance.now();
                renderColorAsciiFrame(buffer, cellOffset);
                Metrics.renderMsSum += performance.now() - t0;
                Metrics.renderMsCount += 1;
            }
        }
    } else {
        // ── COLOR MODES (2-5): atlas blit via ImageData (≤2 canvas ops) ──
        const { buffer, payloadOffset } = frameObj;
        if (Render.useRenderWorker && Render.renderWorker) {
            postFrameToWorker(buffer, payloadOffset, false);
        } else {
            const t0 = performance.now();
            renderColorAsciiFrame(buffer, payloadOffset);
            Metrics.renderMsSum += performance.now() - t0;
            Metrics.renderMsCount += 1;
        }
    }
}

// ═══════════════════════════════════════
//  CLEANUP
// ═══════════════════════════════════════

function finishStream() {
    Stream.reconnecting = false;
    Stream.reconnectRetries = 0;
    Stream.state = 'IDLE';
    if (Stream.ws) { Stream.ws.onclose = null; Stream.ws.close(); Stream.ws = null; }
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    if (Render.renderWorker) {
        Render.renderWorker.terminate();
        Render.renderWorker = null;
        Render.workerBusy = false;
        Render.workerPendingFrame = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    player.textContent = '';
    player.style.display = 'none';
    overlay.classList.remove('hidden');
    statusEl.textContent = 'Ready';
    statusEl.style.color = 'rgba(255,255,255,0.6)';
    Stream.readyToRender = false;
    Stream.frameBuffer.length = 0;
    resetStreamMetrics();
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

if (colsSlider) {
    colsSlider.value = String(Stream.streamCols);
    if (colsValueEl) colsValueEl.textContent = String(Stream.streamCols);
    colsSlider.addEventListener('input', () => {
        Stream.streamCols = parseInt(colsSlider.value, 10);
        if (colsValueEl) colsValueEl.textContent = String(Stream.streamCols);
    });
    colsSlider.addEventListener('change', () => {
        applyStreamSettingChange();
    });
}

if (aspectSelect) {
    aspectSelect.value = Stream.streamAspect;
    aspectSelect.addEventListener('change', () => {
        Stream.streamAspect = aspectSelect.value;
        applyStreamSettingChange();
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

if (typeof ResizeObserver !== 'undefined') {
    const containerObserver = new ResizeObserver(() => {
        syncSelectionTransform();
    });
    containerObserver.observe(container);
}

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'M') {
        if (metricsPanel) {
            metricsPanel.hidden = !metricsPanel.hidden;
            updateMetricsPanel();
        }
    }
});

})();

