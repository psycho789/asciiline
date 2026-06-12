/**
 * ASCILINE — Static client-side engine (GitHub Pages)
 * Video decode + ASCII / Pixel rendering entirely in the browser.
 */

const player = document.getElementById('ascii-player');
const canvas = document.getElementById('ascii-canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const container = document.getElementById('player-container');
const overlay = document.getElementById('play-overlay');
const video = document.getElementById('ascii-video');
const volumeSlider = document.getElementById('volume-slider');
const modeAsciiBtn = document.getElementById('mode-ascii');
const modePixelBtn = document.getElementById('mode-pixel');
const copyFrameBtn = document.getElementById('copy-frame-btn');

const PALETTE =
    " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";
const PALETTE_LEN = PALETTE.length;
const QB_MAP = { 5: 0, 4: 2, 3: 3, 2: 5 };

const CHAR_LUT = new Array(128);
for (let i = 0; i < 128; i++) CHAR_LUT[i] = String.fromCharCode(i);

const textDecoder = new TextDecoder();
const offscreen = document.createElement('canvas');
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

let siteConfig = null;
let state = 'IDLE';
let preferPixel = sessionStorage.getItem('asciiline-pixel') === '1';
let renderMode = 3;
let pixelMode = false;
let lastFrameText = '';
let copyStatusTimer = null;

let gridCols = 0;
let gridRows = 0;
let charWidth = 0;
let charHeight = 0;
let xPos = null;
let yPos = null;
let dotImageData = null;
let selectionBuffer = null;

let frameCount = 0;
let lastFpsUpdate = 0;
let lastMediaTime = -1;
let usingRvfc = false;

// ── CONFIG & GEOMETRY ─────────────────────────────────────

async function loadConfig() {
    const res = await fetch('config.json');
    if (!res.ok) throw new Error('Failed to load config.json');
    siteConfig = await res.json();
    video.src = siteConfig.video;
    video.loop = Boolean(siteConfig.loop);
}

function currentRenderPrefs() {
    if (!siteConfig) return { mode: 3, cols: 220 };
    return preferPixel ? siteConfig.pixel : siteConfig.ascii;
}

function calcAutoRows(cols, vidW, vidH, isPixel) {
    const ratio = vidW / Math.max(vidH, 1);
    if (isPixel) return Math.max(1, Math.round(cols / ratio));
    return Math.max(1, Math.round(cols / ratio / 2));
}

function resolveRenderMode(mode) {
    if (pixelMode && mode === 1) return 3;
    return mode;
}

function grayFromRGB(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function paletteIndex(gray) {
    return Math.min(PALETTE_LEN - 1, Math.floor(gray / (256 / PALETTE_LEN)));
}

// ── CANVAS SETUP ──────────────────────────────────────────

function buildCanvas(cols, rows) {
    gridCols = cols;
    gridRows = rows;

    const syncSize = (el) => {
        el.style.width = container.clientWidth + 'px';
        el.style.height = container.clientHeight + 'px';
        el.style.objectFit = 'contain';
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
    };

    offscreen.width = cols;
    offscreen.height = rows;

    if (pixelMode) {
        canvas.width = cols;
        canvas.height = rows;
        canvas.style.display = 'block';
        canvas.style.imageRendering = 'pixelated';
        dotImageData = null;
        syncSize(canvas);
        player.style.display = 'none';
    } else {
        canvas.style.imageRendering = '';
        dotImageData = null;
        ctx.font = 'bold 8px Courier New';
        charWidth = ctx.measureText('M').width;
        charHeight = 8;
        canvas.width = cols * charWidth;
        canvas.height = rows * charHeight;
        canvas.style.display = 'block';

        selectionBuffer = new Uint8Array((cols + 1) * rows);
        for (let r = 0; r < rows; r++) selectionBuffer[r * (cols + 1) + cols] = 10;

        syncSize(canvas);

        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        const fitScaleX = containerW / canvas.width;
        const fitScaleY = containerH / canvas.height;
        const fitScale = Math.min(fitScaleX, fitScaleY);
        const renderedW = canvas.width * fitScale;
        const renderedH = canvas.height * fitScale;
        const offsetX = (containerW - renderedW) / 2;
        const offsetY = (containerH - renderedH) / 2;

        player.style.width = canvas.width + 'px';
        player.style.height = canvas.height + 'px';
        player.style.position = 'absolute';
        player.style.top = '0';
        player.style.left = '0';
        player.style.transformOrigin = 'top left';
        player.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${fitScale})`;
        player.style.fontSize = '8px';
        player.style.lineHeight = '8px';

        ctx.font = 'bold 8px Courier New';
        ctx.textBaseline = 'top';
        xPos = new Float32Array(cols);
        yPos = new Float32Array(rows);
        for (let c = 0; c < cols; c++) xPos[c] = c * charWidth;
        for (let r = 0; r < rows; r++) yPos[r] = r * charHeight;
    }
    updateCopyFrameButton();
}

// ── UI HELPERS ────────────────────────────────────────────

function updateModeToggleUI() {
    if (!modeAsciiBtn || !modePixelBtn) return;
    modeAsciiBtn.classList.toggle('active', !preferPixel);
    modePixelBtn.classList.toggle('active', preferPixel);
    modeAsciiBtn.setAttribute('aria-pressed', String(!preferPixel));
    modePixelBtn.setAttribute('aria-pressed', String(preferPixel));
}

function updateCopyFrameButton() {
    if (!copyFrameBtn) return;
    const canCopy = state === 'PLAYING' && !pixelMode && lastFrameText.length > 0;
    copyFrameBtn.disabled = !canCopy;
    copyFrameBtn.title = pixelMode
        ? 'Copy is only available in ASCII mode'
        : 'Copy the current ASCII frame to clipboard';
}

function flashCopyStatus(message) {
    if (!statusEl) return;
    if (copyStatusTimer) clearTimeout(copyStatusTimer);
    statusEl.textContent = message;
    statusEl.style.color = 'var(--accent-color)';
    copyStatusTimer = setTimeout(() => { copyStatusTimer = null; }, 1500);
}

async function copyCurrentFrame() {
    if (!lastFrameText || pixelMode || state !== 'PLAYING') return;
    try {
        await navigator.clipboard.writeText(lastFrameText);
        flashCopyStatus('Frame copied!');
        return;
    } catch (_) { /* fallback below */ }

    if (player && player.textContent) {
        const range = document.createRange();
        range.selectNodeContents(player);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try {
            if (document.execCommand('copy')) flashCopyStatus('Frame copied!');
            else flashCopyStatus('Copy failed');
        } catch (_) {
            flashCopyStatus('Copy failed');
        }
        sel.removeAllRanges();
    }
}

function statusLabel() {
    const modes = { 2: '512 Color', 3: '32K Color', 4: '262K Color', 5: '16M Ultra' };
    return (modes[renderMode] || 'B&W') + (pixelMode ? ' PIXEL' : '');
}

function updateFpsStatus(now) {
    frameCount++;
    if (now - lastFpsUpdate < 1000) return;
    const target = video.playbackRate > 0 ? Math.round(30) : 24;
    statusEl.textContent = `FPS: ${frameCount}/${target} | ${statusLabel()}`;
    frameCount = 0;
    lastFpsUpdate = now;
}

// ── RENDER PATHS ──────────────────────────────────────────

function renderBwAscii(data) {
    const lines = new Array(gridRows);
    for (let row = 0; row < gridRows; row++) {
        let line = '';
        const rowOff = row * gridCols * 4;
        for (let col = 0; col < gridCols; col++) {
            const i = rowOff + col * 4;
            const gray = grayFromRGB(data[i], data[i + 1], data[i + 2]);
            line += PALETTE[paletteIndex(gray)];
        }
        lines[row] = line;
    }
    player.style.display = 'block';
    player.style.color = '#fff';
    player.textContent = lines.join('\n');
    lastFrameText = player.textContent;
}

function renderColorAscii(data) {
    const qb = QB_MAP[renderMode] || 0;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 8px Courier New';
    ctx.textBaseline = 'top';

    let prevPacked = -1;
    for (let row = 0; row < gridRows; row++) {
        const rowOff = row * gridCols * 4;
        for (let col = 0; col < gridCols; col++) {
            const i = rowOff + col * 4;
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            const gray = grayFromRGB(r, g, b);
            const charCode = PALETTE.charCodeAt(paletteIndex(gray));

            if (qb > 0) {
                r = (r >> qb) << qb;
                g = (g >> qb) << qb;
                b = (b >> qb) << qb;
            }
            const packed = (r << 16) | (g << 8) | b;
            if (packed !== prevPacked) {
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                prevPacked = packed;
            }
            ctx.fillText(CHAR_LUT[charCode], xPos[col], yPos[row]);
            selectionBuffer[row * (gridCols + 1) + col] = charCode;
        }
    }

    player.style.display = 'block';
    player.style.color = 'transparent';
    player.textContent = textDecoder.decode(selectionBuffer);
    lastFrameText = player.textContent;
}

function renderPixel() {
    ctx.drawImage(video, 0, 0, gridCols, gridRows);
    lastFrameText = '';
}

function processFrame(now) {
    if (state !== 'PLAYING' || video.paused || video.ended) return;

    if (pixelMode) {
        renderPixel();
    } else {
        offCtx.drawImage(video, 0, 0, gridCols, gridRows);
        const { data } = offCtx.getImageData(0, 0, gridCols, gridRows);
        if (renderMode === 1) renderBwAscii(data);
        else renderColorAscii(data);
    }

    updateFpsStatus(now);
    updateCopyFrameButton();
}

// ── FRAME LOOP ────────────────────────────────────────────

function onVideoFrame(now, metadata) {
    if (state !== 'PLAYING') return;
    if (metadata && metadata.mediaTime === lastMediaTime) {
        scheduleFrame();
        return;
    }
    if (metadata) lastMediaTime = metadata.mediaTime;
    processFrame(now);
    scheduleFrame();
}

function onRafFrame(now) {
    if (state !== 'PLAYING') return;
    const t = video.currentTime;
    if (t === lastMediaTime) {
        requestAnimationFrame(onRafFrame);
        return;
    }
    lastMediaTime = t;
    processFrame(now);
    requestAnimationFrame(onRafFrame);
}

function scheduleFrame() {
    if (state !== 'PLAYING') return;
    if (usingRvfc && typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(onVideoFrame);
    }
}

function startFrameLoop() {
    lastMediaTime = -1;
    frameCount = 0;
    lastFpsUpdate = performance.now();
    usingRvfc = typeof video.requestVideoFrameCallback === 'function';
    if (usingRvfc) {
        video.requestVideoFrameCallback(onVideoFrame);
    } else {
        requestAnimationFrame(onRafFrame);
    }
}

function stopFrameLoop() {
    state = 'IDLE';
    lastMediaTime = -1;
}

// ── PLAYBACK ──────────────────────────────────────────────

async function initPlayback() {
    const prefs = currentRenderPrefs();
    pixelMode = preferPixel;
    renderMode = resolveRenderMode(prefs.mode);

    if (video.readyState < 1) {
        await new Promise((resolve, reject) => {
            video.addEventListener('loadedmetadata', resolve, { once: true });
            video.addEventListener('error', () => reject(new Error('Video failed to load')), { once: true });
        });
    }

    const cols = prefs.cols;
    const rows = calcAutoRows(cols, video.videoWidth, video.videoHeight, pixelMode);
    buildCanvas(cols, rows);
}

async function startStream() {
    if (state !== 'IDLE') return;
    overlay.classList.add('hidden');
    statusEl.textContent = 'Loading...';
    statusEl.style.color = 'var(--accent-color)';

    try {
        await initPlayback();
        video.volume = volumeSlider ? parseFloat(volumeSlider.value) : 1;
        await video.play();
        state = 'PLAYING';
        startFrameLoop();
    } catch (err) {
        statusEl.textContent = 'Playback error: ' + err.message;
        statusEl.style.color = '#ff0000';
        overlay.classList.remove('hidden');
        state = 'IDLE';
    }
}

function finishStream() {
    stopFrameLoop();
    video.pause();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    player.textContent = '';
    player.style.display = 'none';
    overlay.classList.remove('hidden');
    statusEl.textContent = 'Ready';
    statusEl.style.color = 'rgba(255,255,255,0.6)';
    lastFrameText = '';
    if (copyStatusTimer) {
        clearTimeout(copyStatusTimer);
        copyStatusTimer = null;
    }
    updateCopyFrameButton();
}

async function restartWithMode() {
    const wasPlaying = state === 'PLAYING';
    const t = video.currentTime;
    stopFrameLoop();
    video.pause();

    statusEl.textContent = 'Switching mode...';
    statusEl.style.color = 'var(--accent-color)';

    try {
        await initPlayback();
        video.currentTime = t;
        if (wasPlaying) {
            await video.play();
            state = 'PLAYING';
            startFrameLoop();
        } else {
            state = 'IDLE';
            overlay.classList.remove('hidden');
        }
    } catch (err) {
        statusEl.textContent = 'Mode switch failed';
        statusEl.style.color = '#ff0000';
        finishStream();
    }
}

function setPreferPixel(usePixel, { reconnect = false } = {}) {
    preferPixel = usePixel;
    sessionStorage.setItem('asciiline-pixel', usePixel ? '1' : '0');
    updateModeToggleUI();
    updateCopyFrameButton();
    if (reconnect) restartWithMode();
}

// ── EVENT LISTENERS ───────────────────────────────────────

overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    startStream();
});

if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        video.volume = parseFloat(volumeSlider.value);
    });
}

if (modeAsciiBtn) {
    modeAsciiBtn.addEventListener('click', () => {
        if (!preferPixel) return;
        setPreferPixel(false, { reconnect: true });
    });
}

if (modePixelBtn) {
    modePixelBtn.addEventListener('click', () => {
        if (preferPixel) return;
        setPreferPixel(true, { reconnect: true });
    });
}

if (copyFrameBtn) {
    copyFrameBtn.addEventListener('click', () => copyCurrentFrame());
}

video.addEventListener('ended', () => {
    if (!video.loop && state === 'PLAYING') finishStream();
});

window.addEventListener('resize', () => {
    if (gridCols > 0 && gridRows > 0 && !pixelMode) {
        buildCanvas(gridCols, gridRows);
    } else if (pixelMode && gridCols > 0) {
        canvas.style.width = container.clientWidth + 'px';
        canvas.style.height = container.clientHeight + 'px';
    }
});

// ── BOOT ──────────────────────────────────────────────────

loadConfig()
    .then(() => {
        updateModeToggleUI();
        updateCopyFrameButton();
    })
    .catch((err) => {
        statusEl.textContent = err.message;
        statusEl.style.color = '#ff0000';
    });
