/**
 * ASCILINE — Static client-side engine (GitHub Pages)
 * Video decode + ASCII / Pixel rendering + typographic LOOK presets.
 */

const player = document.getElementById('ascii-player');
const canvas = document.getElementById('ascii-canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const container = document.getElementById('player-container');
const typewriterCursor = document.getElementById('typewriter-cursor');
const overlay = document.getElementById('play-overlay');
const video = document.getElementById('ascii-video');
const volumeSlider = document.getElementById('volume-slider');
const modeAsciiBtn = document.getElementById('mode-ascii');
const modePixelBtn = document.getElementById('mode-pixel');
const copyFrameBtn = document.getElementById('copy-frame-btn');
const fxPicker = document.getElementById('fx-picker');
const fxHintEl = document.getElementById('fx-hint');
const trackPrevBtn = document.getElementById('track-prev');
const trackNextBtn = document.getElementById('track-next');

const PALETTE =
    " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";
const PALETTE_LEN = PALETTE.length;
const QB_MAP = { 5: 0, 4: 2, 3: 3, 2: 5 };
const CORRUPT_CHARS = '$#@!?0123456789ABCDEF';
const WAVE_CHARS = '~\\/-|';
const AUTO_RIPPLE_CHAR_SETS = [
    '~\\/-|',
    '*+.`',
    '#@!$%',
    '><^v',
    '()[]{',
    'xX+=-',
];
const AUTO_RIPPLE_PATTERNS = ['nova', 'scatter', 'sweep', 'rain', 'quake', 'converge', 'chain', 'supernova'];
const DOT_CHAR = 0xb7; // ·
const BLOCK_CHAR = 0x2588; // █

const FONT_STACK = [
    { css: "bold 8px 'Courier New', monospace", size: 8, family: "'Courier New', monospace" },
    { css: "bold 10px 'VT323', monospace", size: 10, family: "'VT323', monospace" },
    { css: "bold 8px 'IBM Plex Mono', monospace", size: 8, family: "'IBM Plex Mono', monospace" },
    { css: "bold 6px 'Press Start 2P', monospace", size: 6, family: "'Press Start 2P', monospace" },
];

const THERMAL_COLORS = ['#001133', '#003366', '#00f3ff', '#39ff14', '#ffaa00', '#ff0040'];

const BRAILLE_LUT = (() => {
    const dots = [0x00, 0x01, 0x05, 0x0d, 0x1f, 0x3d, 0x7b, 0xff];
    return dots.map((d) => String.fromCharCode(0x2800 + d));
})();

const FX_PRESETS = {
    clean: {
        label: 'CLEAN',
        tip: 'Standard render — no effects',
        hint: 'Standard render with source colors — ASCII uses characters, PIXEL uses colored blocks.',
        css: 'fx-clean',
        asciiOnly: false,
        pixelOk: true,
    },
    triglyph: {
        label: 'RGB',
        tip: 'Chromatic split',
        hint: 'Three offset layers in red, green, and blue — holographic terminal bleed.',
        hintAscii: 'Three offset text layers composited like a holographic terminal.',
        css: 'fx-triglyph',
        asciiOnly: true,
        pixelOk: true,
    },
    braille: {
        label: 'BRAILLE',
        tip: 'Unicode braille blocks',
        hint: 'Brightness maps to braille dot density — a completely different typographic alphabet.',
        css: 'fx-braille',
        asciiOnly: true,
    },
    duotone: {
        label: 'HALFTONE',
        tip: 'Two-symbol print',
        hint: 'The frame collapses to block and dot characters — letterpress halftone made of pure text.',
        css: 'fx-duotone',
        asciiOnly: true,
    },
    typewriter: {
        label: 'TYPE',
        tip: 'Teletype scan reveal',
        hint: 'Each frame prints left to right with a blinking cursor, like live teletype output.',
        css: 'fx-typewriter',
        asciiOnly: true,
    },
    corrupt: {
        label: 'CORRUPT',
        tip: 'Buffer glitch',
        hint: 'Random rectangles of garbled characters simulate memory corruption of the text buffer.',
        css: 'fx-corrupt',
        asciiOnly: true,
    },
    selection: {
        label: 'SELECT',
        tip: 'Highlight live text',
        hint: 'Drag across the player to select live video text — readable glyphs pop over the color layer.',
        action: 'Drag to select text on the player.',
        css: 'fx-selection',
        asciiOnly: true,
        interactive: true,
    },
    phosphor: {
        label: 'PHOSPHOR',
        tip: 'Afterimage trail',
        hint: 'Previous frames smear behind new ones — CRT phosphor persistence.',
        hintAscii: 'Glyph-shaped afterimages as characters fade into the next frame.',
        css: 'fx-phosphor',
        asciiOnly: true,
        pixelOk: true,
    },
    thermal: {
        label: 'THERMAL',
        tip: 'Heatmap',
        hint: 'Brightness mapped to a cold-to-hot color ramp.',
        hintAscii: 'Character color follows brightness as temperature.',
        css: 'fx-thermal',
        asciiOnly: true,
        pixelOk: true,
    },
    interlace: {
        label: 'INTERLACE',
        tip: 'Broadcast rows',
        hint: 'Odd and even rows update on alternating frames with scanlines.',
        hintAscii: 'Grid-native broadcast signal — only odd or even rows refresh each frame.',
        css: 'fx-interlace',
        asciiOnly: true,
        pixelOk: true,
    },
    'font-morph': {
        label: 'FONTS',
        tip: 'Cycle typeface',
        hint: 'Same frame, different typeface — the image changes because glyphs are the pixels.',
        action: 'Click FONTS again to cycle typeface.',
        css: 'fx-font-morph',
        asciiOnly: true,
        interactive: true,
    },
    ripple: {
        label: 'RIPPLE',
        tip: 'Click the grid',
        hint: 'Click the player to send a radial wave through the character field.',
        action: 'Click anywhere on the player while playing.',
        css: 'fx-ripple',
        asciiOnly: true,
        interactive: true,
    },
    broadcast: {
        label: 'CRT',
        tip: 'Retro broadcast',
        hint: 'Scanlines, vignette, interlaced rows, and phosphor-green hot highlights.',
        hintAscii: 'Interlaced rows, scanlines, vignette, and phosphor-green on dense characters.',
        css: 'fx-broadcast',
        asciiOnly: true,
        pixelOk: true,
    },
    resonate: {
        label: 'RESONATE',
        tip: 'Audio-reactive',
        hint: 'Bass widens RGB split and boosts phosphor smear — turn volume up.',
        hintAscii: 'Bass corrupts the buffer, widens RGB split, and speeds teletype reveal.',
        action: 'Turn volume up — reacts to the video soundtrack.',
        css: 'fx-resonate',
        asciiOnly: true,
        pixelOk: true,
        interactive: true,
    },
    'auto-ripple': {
        label: 'GHOST',
        tip: 'Autonomous ripple engine',
        hint: 'Random patterns — nova bursts, scatter shots, chain blasts, quakes — fire on their own schedule.',
        action: 'Click the player to add your own ripples to the chaos.',
        css: 'fx-ripple fx-auto-ripple',
        asciiOnly: true,
        interactive: true,
    },
    hole: {
        label: 'HOLE',
        tip: 'Singularity tears space',
        hint: 'A singularity drifts through the grid, warping characters into the accretion disk and devouring them at the event horizon.',
        css: 'fx-hole',
        asciiOnly: true,
    },
    rend: {
        label: 'REND',
        tip: 'Reality tears apart',
        hint: 'The frame rips along a random fracture — both halves drift apart, exposing the void between them, then it heals and tears again.',
        css: 'fx-rend',
        asciiOnly: true,
    },
    melt: {
        label: 'MELT',
        tip: 'Columns drip downward',
        hint: 'Each column drips at a different speed — the image slowly runs and pools like paint, then cycles.',
        css: 'fx-melt',
        asciiOnly: true,
    },
};

const CHAR_LUT = new Array(256);
for (let i = 0; i < 256; i++) CHAR_LUT[i] = String.fromCharCode(i);

function charStr(code) {
    return code < 256 ? CHAR_LUT[code] : String.fromCharCode(code);
}

const offscreen = document.createElement('canvas');
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

let siteConfig = null;
let playlistIndex = 0;
let state = 'IDLE';
let preferPixel = sessionStorage.getItem('asciiline-pixel') === '1';
let activeFx = sessionStorage.getItem('asciiline-fx') || 'clean';
if (!FX_PRESETS[activeFx]) activeFx = 'clean';

let renderMode = 3;
let pixelMode = false;
let lastFrameText = '';
let copyStatusTimer = null;
let fontMorphIndex = parseInt(sessionStorage.getItem('asciiline-font-idx') || '0', 10) % FONT_STACK.length;

let gridCols = 0;
let gridRows = 0;
let charWidth = 0;
let charHeight = 0;
let xPos = null;
let yPos = null;
let selectionBuffer = null;

let frameCount = 0;
let lastFpsUpdate = 0;
let lastMediaTime = -1;
let usingRvfc = false;
let frameParity = 0;

let trailCanvas = null;
let trailCtx = null;
let cellHold = null;
let prevChars = null;
let corruptZones = [];
let nextCorruptAt = 0;
let ripples = [];
let autoRipplePendingFires = [];
let autoRippleNextAt = 0;
let autoRipplePatternCursor = 0;

// HOLE state
let holeX = 0, holeY = 0, holePulse = 0;

// REND state
let rendOffset = 0, rendAngle = 0, rendCenterX = 0, rendCenterY = 0;
let rendPhase = 0, rendPhaseStart = 0;

// MELT state
let meltStartTime = 0;
let meltColSpeeds = null;
let meltColPhase = null;

let audioCtx = null;
let analyser = null;
let audioSource = null;
let audioEnergy = 0;
let triglyphOffset = 2;
let pixelHold = null;

const THERMAL_RGB = THERMAL_COLORS.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});

// ── FX SYSTEM ─────────────────────────────────────────────

function fxWorksInCurrentMode(id) {
    const preset = FX_PRESETS[id];
    if (!preset) return false;
    if (!pixelMode) return true;
    return preset.pixelOk === true;
}

function effectiveFx() {
    if (pixelMode && FX_PRESETS[activeFx]?.asciiOnly && !FX_PRESETS[activeFx]?.pixelOk) return 'clean';
    return activeFx;
}

function resetFxState() {
    corruptZones = [];
    nextCorruptAt = performance.now() + 600;
    ripples = [];
    autoRipplePendingFires = [];
    autoRippleNextAt = 0;
    frameParity = 0;
    pixelHold = null;
    if (gridCols > 0 && gridRows > 0) {
        const n = gridCols * gridRows;
        cellHold = new Uint8Array(n);
        prevChars = new Uint8Array(n);
    }
    if (trailCanvas && trailCtx) {
        trailCtx.fillStyle = '#050505';
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
}

function applyFx(id, { cycleFont = false } = {}) {
    if (!FX_PRESETS[id]) return;

    if (pixelMode && FX_PRESETS[id].asciiOnly && !FX_PRESETS[id].pixelOk) {
        flashCopyStatus('This LOOK preset is ASCII-only — switch to ASCII mode');
        return;
    }

    if (id === 'font-morph' && activeFx === 'font-morph' && cycleFont) {
        fontMorphIndex = (fontMorphIndex + 1) % FONT_STACK.length;
        sessionStorage.setItem('asciiline-font-idx', String(fontMorphIndex));
        if (state === 'PLAYING' && !pixelMode && gridCols > 0) {
            buildCanvas(gridCols, gridRows);
        }
        updateFxPickerUI();
        return;
    }

    activeFx = id;
    sessionStorage.setItem('asciiline-fx', id);
    container.className = FX_PRESETS[id].css;
    resetFxState();
    updateFxPickerUI();

    if (id === 'resonate' && state === 'PLAYING') initAudioAnalyser();
    if (id === 'hole') initHole();
    if (id === 'rend') initRend();
    if (id === 'melt') initMelt();

    if (id === 'font-morph' && state === 'PLAYING' && !pixelMode && gridCols > 0) {
        buildCanvas(gridCols, gridRows);
    }

    updateFxHint();
}

function updateFxHint() {
    if (!fxHintEl) return;
    const preset = FX_PRESETS[activeFx] || FX_PRESETS.clean;
    const labelEl = fxHintEl.querySelector('.fx-hint-label');
    const textEl = fxHintEl.querySelector('.fx-hint-text');

    let label = preset.label;
    if (activeFx === 'font-morph') {
        const names = ['Courier', 'VT323', 'IBM Plex', 'Press Start 2P'];
        label = `${preset.label} · ${names[fontMorphIndex]}`;
    }

    if (labelEl) labelEl.textContent = label;

    let body = preset.hint || preset.tip;
    if (pixelMode && preset.hintAscii && !preset.pixelOk) {
        body = preset.hintAscii;
    } else if (pixelMode && preset.pixelOk && preset.hint) {
        body = preset.hint;
    } else if (!pixelMode && preset.hintAscii) {
        body = preset.hintAscii;
    } else if (preset.hint) {
        body = preset.hint;
    }

    if (pixelMode && preset.asciiOnly && !preset.pixelOk) {
        body = 'This preset is ASCII-only — typographic effects need the character grid. Switch to ASCII mode.';
    } else if (!pixelMode && preset.asciiOnly && preset.pixelOk) {
        body = body + ' Also works in PIXEL mode with canvas-native rendering.';
    }

    if (textEl) {
        textEl.innerHTML = '';
        const main = document.createElement('span');
        main.textContent = body;
        textEl.appendChild(main);
        if (preset.action && (!pixelMode || preset.pixelOk)) {
            const action = document.createElement('span');
            action.className = 'fx-hint-action';
            action.textContent = preset.action;
            textEl.appendChild(action);
        }
    }
}

function updateFxPickerUI() {
    if (!fxPicker) return;
    fxPicker.querySelectorAll('.fx-chip').forEach((btn) => {
        const id = btn.dataset.fx;
        const preset = FX_PRESETS[id];
        const on = id === activeFx;
        const asciiOnly = pixelMode && preset?.asciiOnly && !preset?.pixelOk;
        btn.classList.toggle('active', on);
        btn.disabled = false;
        btn.dataset.asciiOnly = asciiOnly ? 'true' : 'false';
        btn.setAttribute('aria-selected', String(on));
        btn.setAttribute('aria-pressed', String(on));
        btn.tabIndex = on ? 0 : -1;
    });
    updateFxHint();
}

function buildFxPicker() {
    if (!fxPicker) return;
    fxPicker.innerHTML = '';
    for (const [id, preset] of Object.entries(FX_PRESETS)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fx-chip';
        btn.dataset.fx = id;
        if (preset.interactive) btn.dataset.interactive = 'true';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-describedby', 'fx-hint');

        const nameEl = document.createElement('span');
        nameEl.className = 'fx-chip-name';
        nameEl.textContent = preset.label;

        const tipEl = document.createElement('span');
        tipEl.className = 'fx-chip-tip';
        tipEl.textContent = preset.tip;

        const badgeEl = document.createElement('span');
        badgeEl.className = 'fx-chip-badge';
        badgeEl.textContent = 'ASCII';
        badgeEl.title = 'ASCII mode only — click to switch and apply';

        btn.appendChild(nameEl);
        btn.appendChild(tipEl);
        btn.appendChild(badgeEl);

        btn.addEventListener('click', () => {
            const isAsciiOnly = preset.asciiOnly && !preset.pixelOk;
            if (pixelMode && isAsciiOnly) {
                // Auto-switch to ASCII mode, then apply effect
                setPreferPixel(false, { reconnect: state === 'PLAYING' });
                // Wait one tick for mode switch to settle before applying fx
                setTimeout(() => applyFx(id, { cycleFont: id === 'font-morph' && activeFx === 'font-morph' }), 50);
            } else {
                applyFx(id, { cycleFont: id === 'font-morph' && activeFx === 'font-morph' });
            }
        });
        fxPicker.appendChild(btn);
    }
    updateFxPickerUI();
}

function getActiveFont() {
    if (effectiveFx() === 'font-morph') return FONT_STACK[fontMorphIndex];
    return FONT_STACK[0];
}

function initAudioAnalyser() {
    if (audioCtx || !video) return;
    try {
        audioCtx = new AudioContext();
        audioSource = audioCtx.createMediaElementSource(video);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioSource.connect(analyser);
        analyser.connect(audioCtx.destination);
    } catch (_) {
        audioCtx = null;
    }
}

function updateAudioEnergy() {
    if (!analyser || effectiveFx() !== 'resonate') {
        audioEnergy = 0;
        container.classList.remove('fx-beat');
        return;
    }
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    let bass = 0;
    for (let i = 0; i < 10; i++) bass += bins[i];
    audioEnergy = bass / (10 * 255);
    triglyphOffset = 2 + Math.floor(audioEnergy * 4);
    container.classList.toggle('fx-beat', audioEnergy > 0.55);

    if (audioEnergy > 0.65 && performance.now() >= nextCorruptAt) {
        spawnCorruptZone();
        nextCorruptAt = performance.now() + 200;
    }
}

function spawnCorruptZone() {
    if (gridCols < 4 || gridRows < 4) return;
    const h = 2 + Math.floor(Math.random() * 8);
    const w = 4 + Math.floor(Math.random() * 20);
    const row0 = Math.floor(Math.random() * Math.max(1, gridRows - h));
    const col0 = Math.floor(Math.random() * Math.max(1, gridCols - w));
    const chars = new Uint8Array(h * w);
    for (let i = 0; i < chars.length; i++) {
        chars[i] = CORRUPT_CHARS.charCodeAt(Math.floor(Math.random() * CORRUPT_CHARS.length));
    }
    corruptZones.push({ row0, row1: row0 + h - 1, col0, col1: col0 + w - 1, decay: 4, chars });
    if (corruptZones.length > 6) corruptZones.shift();
}

function updateCorrupt(now) {
    const fx = effectiveFx();
    if (fx !== 'corrupt' && fx !== 'broadcast' && fx !== 'resonate') return;

    if (fx === 'corrupt' && now >= nextCorruptAt) {
        spawnCorruptZone();
        nextCorruptAt = now + 800 + Math.random() * 700;
    }

    corruptZones = corruptZones.filter((z) => {
        z.decay -= 0.04;
        return z.decay > 0;
    });
}

function getTypewriterCol(now) {
    const speed = effectiveFx() === 'resonate' ? Math.max(12, 40 - audioEnergy * 28) : 40;
    return Math.floor((now / speed) % (gridCols + 12));
}

function updateTypewriterCursor(colReveal) {
    const fx = effectiveFx();
    if (!typewriterCursor || (fx !== 'typewriter' && !(fx === 'resonate' && audioEnergy > 0.3))) return;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const fitScaleX = containerW / canvas.width;
    const fitScaleY = containerH / canvas.height;
    const fitScale = Math.min(fitScaleX, fitScaleY);
    const renderedW = canvas.width * fitScale;
    const renderedH = canvas.height * fitScale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;
    const colX = offsetX + colReveal * charWidth * fitScale;
    typewriterCursor.style.left = `${colX}px`;
    typewriterCursor.style.top = `${offsetY}px`;
    typewriterCursor.style.height = `${renderedH}px`;
}

function applyCorrupt(charCode, row, col) {
    const fx = effectiveFx();
    if (fx !== 'corrupt' && fx !== 'resonate') return charCode;

    for (const z of corruptZones) {
        if (row < z.row0 || row > z.row1 || col < z.col0 || col > z.col1) continue;
        const idx = (row - z.row0) * (z.col1 - z.col0 + 1) + (col - z.col0);
        return z.chars[idx % z.chars.length];
    }
    return charCode;
}

function rippleOverride(charCode, col, row, now) {
    const fx = effectiveFx();
    if (fx !== 'ripple' && fx !== 'auto-ripple') return charCode;
    ripples = ripples.filter((r) => now - r.startTime < (r.duration ?? 500));
    for (const rip of ripples) {
        const age = now - rip.startTime;
        const dist = Math.hypot(col - rip.col, row - rip.row);
        const speed = rip.speed ?? 0.12;
        const width = rip.width ?? 1.8;
        const waveFront = age * speed;
        if (Math.abs(dist - waveFront) < width) {
            const chars = rip.charSet || WAVE_CHARS;
            const phase = ((Math.floor((dist - waveFront) * 4)) % chars.length + chars.length) % chars.length;
            return chars.charCodeAt(phase);
        }
    }
    return charCode;
}

function fireRippleAt(col, row, now, opts) {
    ripples.push({
        col: Math.max(0, Math.min(gridCols - 1, Math.round(col))),
        row: Math.max(0, Math.min(gridRows - 1, Math.round(row))),
        startTime: now,
        speed: opts?.speed ?? 0.12,
        duration: opts?.duration ?? 500,
        width: opts?.width ?? 1.8,
        charSet: opts?.charSet ?? WAVE_CHARS,
    });
}

function scheduleAutoRipplePattern(now) {
    if (gridCols === 0 || gridRows === 0) return;
    const pattern = AUTO_RIPPLE_PATTERNS[autoRipplePatternCursor % AUTO_RIPPLE_PATTERNS.length];
    autoRipplePatternCursor++;

    const rndCol = () => 1 + Math.floor(Math.random() * (gridCols - 2));
    const rndRow = () => 1 + Math.floor(Math.random() * (gridRows - 2));
    const rndCs = () => AUTO_RIPPLE_CHAR_SETS[Math.floor(Math.random() * AUTO_RIPPLE_CHAR_SETS.length)];
    const rndSpd = () => 0.06 + Math.random() * 0.22;
    const rndW = () => 1.0 + Math.random() * 2.5;

    const queue = autoRipplePendingFires;

    switch (pattern) {
        case 'nova':
            queue.push({ fireAt: now, col: rndCol(), row: rndRow(), speed: 0.18 + Math.random() * 0.12, duration: 700, width: 2.5 + Math.random() * 1.5, charSet: rndCs() });
            break;

        case 'scatter': {
            const count = 5 + Math.floor(Math.random() * 7);
            for (let i = 0; i < count; i++) queue.push({ fireAt: now, col: rndCol(), row: rndRow(), speed: rndSpd(), duration: 400 + Math.random() * 400, width: rndW(), charSet: rndCs() });
            break;
        }

        case 'sweep': {
            const vertical = Math.random() < 0.5;
            const fixed = vertical ? rndCol() : rndRow();
            const count = 8 + Math.floor(Math.random() * 6);
            const cs = rndCs();
            for (let i = 0; i < count; i++) {
                const pos = Math.floor((i / count) * (vertical ? gridRows : gridCols));
                queue.push({ fireAt: now + i * 65, col: vertical ? fixed : pos, row: vertical ? pos : fixed, speed: rndSpd(), duration: 500, width: 1.5, charSet: cs });
            }
            break;
        }

        case 'rain': {
            const count = 12 + Math.floor(Math.random() * 12);
            for (let i = 0; i < count; i++) queue.push({ fireAt: now + i * 110 + Math.random() * 55, col: rndCol(), row: rndRow(), speed: 0.06 + Math.random() * 0.08, duration: 350, width: 1.2, charSet: '~`.' });
            break;
        }

        case 'quake': {
            const ec = rndCol();
            const er = rndRow();
            const count = 12 + Math.floor(Math.random() * 10);
            for (let i = 0; i < count; i++) queue.push({ fireAt: now + Math.random() * 450, col: ec + Math.round((Math.random() - 0.5) * 10), row: er + Math.round((Math.random() - 0.5) * 6), speed: rndSpd(), duration: 300 + Math.random() * 300, width: 1.0 + Math.random() * 1.5, charSet: '#@!$%' });
            break;
        }

        case 'converge': {
            const corners = [
                { col: 1, row: 1 },
                { col: gridCols - 2, row: 1 },
                { col: 1, row: gridRows - 2 },
                { col: gridCols - 2, row: gridRows - 2 },
            ];
            const cs = rndCs();
            corners.forEach((pt, i) => queue.push({ fireAt: now + i * 45, col: pt.col, row: pt.row, speed: 0.14 + Math.random() * 0.06, duration: 650, width: 2.0, charSet: cs }));
            break;
        }

        case 'chain': {
            const oc = rndCol();
            const or_ = rndRow();
            queue.push({ fireAt: now, col: oc, row: or_, speed: 0.22, duration: 450, width: 2.8, charSet: AUTO_RIPPLE_CHAR_SETS[0] });
            for (let i = 0; i < 6; i++) {
                const ang = (i / 6) * Math.PI * 2;
                queue.push({ fireAt: now + 300, col: oc + Math.round(Math.cos(ang) * 12), row: or_ + Math.round(Math.sin(ang) * 7), speed: rndSpd(), duration: 420, width: rndW(), charSet: rndCs() });
            }
            for (let i = 0; i < 12; i++) {
                const ang = (i / 12) * Math.PI * 2;
                queue.push({ fireAt: now + 600, col: oc + Math.round(Math.cos(ang) * 22), row: or_ + Math.round(Math.sin(ang) * 13), speed: rndSpd(), duration: 380, width: rndW(), charSet: rndCs() });
            }
            break;
        }

        case 'supernova': {
            const sc = rndCol();
            const sr = rndRow();
            for (let i = 0; i < 5; i++) queue.push({ fireAt: now + i * 90, col: sc, row: sr, speed: 0.10 + i * 0.06, duration: 650, width: 1.8 + i * 0.6, charSet: AUTO_RIPPLE_CHAR_SETS[i % AUTO_RIPPLE_CHAR_SETS.length] });
            break;
        }
    }
}

function tickAutoRipple(now) {
    if (effectiveFx() !== 'auto-ripple' || state !== 'PLAYING' || pixelMode) return;
    if (gridCols === 0 || gridRows === 0) return;

    let i = 0;
    while (i < autoRipplePendingFires.length) {
        const entry = autoRipplePendingFires[i];
        if (now >= entry.fireAt) {
            fireRippleAt(entry.col, entry.row, now, entry);
            autoRipplePendingFires.splice(i, 1);
        } else {
            i++;
        }
    }

    if (autoRipplePendingFires.length === 0 && now >= autoRippleNextAt) {
        scheduleAutoRipplePattern(now);
        autoRippleNextAt = now + 1000 + Math.random() * 2800;
    }
}

function pickCharFromGray(gray) {
    const fx = effectiveFx();
    if (fx === 'braille') return BRAILLE_LUT[Math.min(7, Math.floor(gray / 32))].charCodeAt(0);
    if (fx === 'duotone') return gray > 128 ? BLOCK_CHAR : DOT_CHAR;
    return PALETTE.charCodeAt(paletteIndex(gray));
}

function pickFillColor(r, g, b, gray) {
    const fx = effectiveFx();
    if (fx === 'thermal') {
        const idx = paletteIndex(gray);
        const t = idx / (PALETTE_LEN - 1);
        const ci = Math.min(THERMAL_COLORS.length - 1, Math.floor(t * THERMAL_COLORS.length));
        return THERMAL_COLORS[ci];
    }
    if (fx === 'broadcast') {
        const idx = paletteIndex(gray);
        if (idx > PALETTE_LEN * 0.65) return '#39ff14';
        const t = idx / (PALETTE_LEN - 1);
        const ci = Math.min(THERMAL_COLORS.length - 1, Math.floor(t * THERMAL_COLORS.length));
        return THERMAL_COLORS[ci];
    }
    if (fx === 'duotone') {
        return gray > 128 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},0.25)`;
    }
    const qb = QB_MAP[renderMode] || 0;
    let rr = r;
    let gg = g;
    let bb = b;
    if (qb > 0) {
        rr = (rr >> qb) << qb;
        gg = (gg >> qb) << qb;
        bb = (bb >> qb) << qb;
    }
    return `rgb(${rr},${gg},${bb})`;
}

function shouldUseInterlaceHold(row) {
    const fx = effectiveFx();
    if (fx !== 'interlace' && fx !== 'broadcast') return false;
    return (row + frameParity) % 2 !== 0;
}

function resolveCell(data, row, col, now) {
    const { srcCol, srcRow, override, edgeHeat } = distortCell(col, row);
    if (override) return override;

    const i = (srcRow * gridCols + srcCol) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = grayFromRGB(r, g, b);
    const cellIdx = row * gridCols + col;

    let charCode = pickCharFromGray(gray);

    if (shouldUseInterlaceHold(row) && cellHold[cellIdx] > 0) {
        charCode = cellHold[cellIdx];
    } else {
        charCode = applyCorrupt(charCode, row, col);
        charCode = rippleOverride(charCode, col, row, now);

        const fx = effectiveFx();
        if (fx === 'typewriter' || (fx === 'resonate' && audioEnergy > 0.3)) {
            const colReveal = getTypewriterCol(now);
            updateTypewriterCursor(colReveal);
            if (col > colReveal) {
                charCode = prevChars[cellIdx] > 0 ? prevChars[cellIdx] : 46;
            }
        }

        cellHold[cellIdx] = charCode;
        prevChars[cellIdx] = charCode;
    }

    // HOLE accretion disk — heat chars near the event horizon
    if (effectiveFx() === 'hole') {
        const dx = col - holeX;
        const dy = (row - holeY) * 1.8;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const HORIZON = 2.1 + holePulse * 1.3;
        const heatEnd = HORIZON * 4.5;
        if (dist < heatEnd) {
            const heat = Math.max(0, 1 - (dist - HORIZON) / (heatEnd - HORIZON));
            const hotChar = heat > 0.55
                ? BLOCK_CHAR
                : PALETTE.charCodeAt(Math.floor(PALETTE_LEN * (0.5 + heat * 0.5)));
            return {
                charCode: hotChar,
                r: Math.min(255, r + Math.round(heat * 220)),
                g: Math.min(255, g * (1 - heat * 0.78) + Math.round(heat * 32)),
                b: Math.min(255, b * (1 - heat * 0.92)),
                gray,
            };
        }
    }

    // REND tear-edge glow
    if (edgeHeat) {
        return {
            charCode: PALETTE.charCodeAt(Math.floor(PALETTE_LEN * (0.65 + edgeHeat * 0.35))),
            r: Math.min(255, r + Math.round(edgeHeat * 100)),
            g: Math.min(255, g + Math.round(edgeHeat * 35)),
            b: Math.min(255, b + Math.round(edgeHeat * 90)),
            gray,
        };
    }

    return { charCode, r, g, b, gray };
}

function applyPostFx() {
    const fx = effectiveFx();
    const usePhosphor = fx === 'phosphor' || (fx === 'resonate' && audioEnergy > 0.35);
    if (!usePhosphor || !trailCanvas) return;

    trailCtx.globalAlpha = fx === 'resonate' ? 0.72 + audioEnergy * 0.12 : 0.78;
    trailCtx.drawImage(trailCanvas, 0, 0);
    trailCtx.globalAlpha = 1;
    trailCtx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(trailCanvas, 0, 0);
}

function ensurePixelTrail() {
    if (!trailCanvas || trailCanvas.width !== gridCols || trailCanvas.height !== gridRows) {
        trailCanvas = document.createElement('canvas');
        trailCanvas.width = gridCols;
        trailCanvas.height = gridRows;
        trailCtx = trailCanvas.getContext('2d');
        trailCtx.fillStyle = '#050505';
        trailCtx.fillRect(0, 0, gridCols, gridRows);
    }
}

function renderPixelTriglyph() {
    const off = Math.max(1, Math.floor(triglyphOffset / (pixelMode ? 1 : 1)));
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, gridCols, gridRows);
    ctx.globalCompositeOperation = 'lighter';

    const layers = [
        { dx: -off, filter: 'sepia(1) saturate(6) hue-rotate(300deg) brightness(1.05)' },
        { dx: 0, filter: 'sepia(1) saturate(4) hue-rotate(90deg) brightness(1.05)' },
        { dx: off, filter: 'sepia(1) saturate(6) hue-rotate(200deg) brightness(1.05)' },
    ];

    for (const layer of layers) {
        ctx.save();
        ctx.filter = layer.filter;
        ctx.drawImage(video, layer.dx, 0, gridCols, gridRows);
        ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
}

function renderPixelThermal() {
    offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    const { data } = offCtx.getImageData(0, 0, gridCols, gridRows);
    const out = ctx.createImageData(gridCols, gridRows);
    const od = out.data;

    for (let i = 0; i < data.length; i += 4) {
        const gray = grayFromRGB(data[i], data[i + 1], data[i + 2]);
        const idx = paletteIndex(gray);
        const t = idx / (PALETTE_LEN - 1);
        const ci = Math.min(THERMAL_RGB.length - 1, Math.floor(t * THERMAL_RGB.length));
        const rgb = THERMAL_RGB[ci];
        od[i] = rgb[0];
        od[i + 1] = rgb[1];
        od[i + 2] = rgb[2];
        od[i + 3] = 255;
    }

    ctx.putImageData(out, 0, 0);
}

function renderPixelInterlace() {
    offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    const src = offCtx.getImageData(0, 0, gridCols, gridRows);

    if (!pixelHold || pixelHold.width !== gridCols || pixelHold.height !== gridRows) {
        pixelHold = ctx.createImageData(gridCols, gridRows);
        for (let i = 3; i < pixelHold.data.length; i += 4) pixelHold.data[i] = 255;
    }

    for (let row = 0; row < gridRows; row++) {
        if ((row + frameParity) % 2 !== 0) continue;
        const off = row * gridCols * 4;
        pixelHold.data.set(src.data.subarray(off, off + gridCols * 4), off);
    }

    ctx.putImageData(pixelHold, 0, 0);
}

function renderPixelBroadcast() {
    renderPixelInterlace();
}

function renderPixel(now) {
    const fx = effectiveFx();

    if (fx === 'triglyph' || (fx === 'resonate' && audioEnergy > 0.2)) {
        renderPixelTriglyph();
    } else if (fx === 'thermal') {
        renderPixelThermal();
    } else if (fx === 'interlace' || fx === 'broadcast') {
        if (fx === 'broadcast') renderPixelBroadcast();
        else renderPixelInterlace();
    } else {
        ctx.drawImage(video, 0, 0, gridCols, gridRows);
    }

    lastFrameText = '';
}

// ── CONFIG & GEOMETRY ─────────────────────────────────────

function currentPlaylistEntry() {
    if (!siteConfig) return null;
    if (siteConfig.playlist) return siteConfig.playlist[playlistIndex % siteConfig.playlist.length];
    return { src: siteConfig.video, ascii: siteConfig.ascii, pixel: siteConfig.pixel };
}

async function loadConfig() {
    const res = await fetch('config.json');
    if (!res.ok) throw new Error('Failed to load config.json');
    siteConfig = await res.json();
    const entry = currentPlaylistEntry();
    video.src = entry.src;
    video.loop = siteConfig.playlist ? false : Boolean(siteConfig.loop);
    updateTrackLabel();
}

function advancePlaylist() {
    if (!siteConfig?.playlist) return;
    playlistIndex = (playlistIndex + 1) % siteConfig.playlist.length;
    const entry = currentPlaylistEntry();
    video.src = entry.src;
    updateTrackLabel();
}

function updateTrackLabel() {
    const row = document.getElementById('ctrl-bar-track');
    const el = document.getElementById('track-label');
    if (!siteConfig?.playlist || siteConfig.playlist.length <= 1) {
        if (row) row.hidden = true;
        return;
    }
    if (row) row.hidden = false;
    if (!el) return;
    const total = siteConfig.playlist.length;
    const src = currentPlaylistEntry()?.src || '';
    const name = src.replace(/^.*\//, '').replace(/\.mp4$/i, '');
    el.textContent = `${playlistIndex + 1}/${total} · ${name}`;
}

function currentRenderPrefs() {
    const entry = currentPlaylistEntry();
    if (!entry) return { mode: 3, cols: 220 };
    return preferPixel ? (entry.pixel || { mode: 5, cols: 400 }) : (entry.ascii || { mode: 3, cols: 220 });
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
        syncSize(canvas);
        player.style.display = 'none';
        ensurePixelTrail();
    } else {
        canvas.style.imageRendering = '';
        const font = getActiveFont();
        ctx.font = font.css;
        charWidth = ctx.measureText('M').width;
        charHeight = font.size;
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
        player.style.fontFamily = font.family;
        player.style.fontSize = `${font.size}px`;
        player.style.lineHeight = `${font.size}px`;
        player.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${fitScale})`;

        ctx.font = font.css;
        ctx.textBaseline = 'top';
        xPos = new Float32Array(cols);
        yPos = new Float32Array(rows);
        for (let c = 0; c < cols; c++) xPos[c] = c * charWidth;
        for (let r = 0; r < rows; r++) yPos[r] = r * charHeight;

        trailCanvas = document.createElement('canvas');
        trailCanvas.width = canvas.width;
        trailCanvas.height = canvas.height;
        trailCtx = trailCanvas.getContext('2d');
        trailCtx.fillStyle = '#050505';
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

        resetFxState();
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
    } catch (_) { /* fallback */ }

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
    const fxLabel = FX_PRESETS[activeFx]?.label || 'CLEAN';
    return (modes[renderMode] || 'B&W') + (pixelMode ? ' PIXEL' : '') + ` | ${fxLabel}`;
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

function renderTriglyph(data, now) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = getActiveFont().css;
    ctx.textBaseline = 'top';
    ctx.globalCompositeOperation = 'lighter';

    const off = triglyphOffset;
    const layers = [
        { dx: -off, color: '#ff0040' },
        { dx: 0, color: '#00ff88' },
        { dx: off, color: '#0088ff' },
    ];
    const lines = new Array(gridRows);
    for (let r = 0; r < gridRows; r++) lines[r] = '';

    for (const layer of layers) {
        ctx.fillStyle = layer.color;
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const { charCode } = resolveCell(data, row, col, now);
                ctx.fillText(charStr(charCode), xPos[col] + layer.dx, yPos[row]);
                if (layer.dx === 0) {
                    lines[row] += charStr(charCode);
                    if (charCode < 256) selectionBuffer[row * (gridCols + 1) + col] = charCode;
                }
            }
        }
    }

    ctx.globalCompositeOperation = 'source-over';
    player.style.display = 'block';
    player.style.color = 'transparent';
    player.textContent = lines.join('\n');
    lastFrameText = player.textContent;
}

function renderColorAscii(data, now) {
    const fx = effectiveFx();

    if (fx === 'triglyph' || (fx === 'resonate' && audioEnergy > 0.25)) {
        renderTriglyph(data, now);
        return;
    }

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = getActiveFont().css;
    ctx.textBaseline = 'top';

    let prevFill = '';
    const lines = new Array(gridRows);
    for (let r = 0; r < gridRows; r++) lines[r] = '';

    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const { charCode, r, g, b, gray } = resolveCell(data, row, col, now);
            const fill = pickFillColor(r, g, b, gray);
            if (fill !== prevFill) {
                ctx.fillStyle = fill;
                prevFill = fill;
            }
            ctx.fillText(charStr(charCode), xPos[col], yPos[row]);
            lines[row] += charStr(charCode);
            if (charCode < 256) selectionBuffer[row * (gridCols + 1) + col] = charCode;
        }
    }

    player.style.display = 'block';
    player.style.color = 'transparent';
    player.textContent = lines.join('\n');
    lastFrameText = player.textContent;
}

function renderBwAscii(data, now) {
    const lines = new Array(gridRows);
    for (let row = 0; row < gridRows; row++) {
        let line = '';
        for (let col = 0; col < gridCols; col++) {
            const { charCode } = resolveCell(data, row, col, now);
            line += charStr(charCode);
        }
        lines[row] = line;
    }
    player.style.display = 'block';
    player.style.color = '#fff';
    player.textContent = lines.join('\n');
    lastFrameText = player.textContent;
}

function renderPixelFrame(now) {
    renderPixel(now);
    applyPostFx();
}

// ── DISTORTION EFFECTS ────────────────────────────────────

function initHole() {
    holeX = gridCols * 0.5;
    holeY = gridRows * 0.5;
    holePulse = 0;
}

function tickHole(now) {
    if (effectiveFx() !== 'hole') return;
    const t = now * 0.001;
    holeX = gridCols * (0.5 + Math.sin(t * 0.19) * 0.27);
    holeY = gridRows * (0.5 + Math.cos(t * 0.13) * 0.27);
    holePulse = 0.5 + Math.sin(t * 0.37) * 0.5;
}

function initRend() {
    rendAngle = Math.random() * Math.PI;
    rendCenterX = gridCols * (0.25 + Math.random() * 0.5);
    rendCenterY = gridRows * (0.25 + Math.random() * 0.5);
    rendOffset = 0;
    rendPhase = 0;
    rendPhaseStart = performance.now();
}

function tickRend(now) {
    if (effectiveFx() !== 'rend') return;
    const age = (now - rendPhaseStart) * 0.001;
    if (rendPhase === 0) {
        rendOffset = Math.min(gridCols * 0.2, age * gridCols * 0.065);
        if (age > 3.2) { rendPhase = 1; rendPhaseStart = now; }
    } else if (rendPhase === 1) {
        if (age > 2.2) { rendPhase = 2; rendPhaseStart = now; }
    } else {
        rendOffset = Math.max(0, rendOffset * (1 - age * 0.6));
        if (rendOffset < 0.3) {
            rendAngle = Math.random() * Math.PI;
            rendCenterX = gridCols * (0.2 + Math.random() * 0.6);
            rendCenterY = gridRows * (0.2 + Math.random() * 0.6);
            rendOffset = 0;
            rendPhase = 0;
            rendPhaseStart = now;
        }
    }
}

function initMelt() {
    meltStartTime = performance.now();
    if (!gridCols) return;
    meltColSpeeds = new Float32Array(gridCols);
    meltColPhase = new Float32Array(gridCols);
    for (let c = 0; c < gridCols; c++) {
        meltColSpeeds[c] = 0.006 + Math.random() * 0.022;
        meltColPhase[c] = Math.random() * gridRows;
    }
}

// Returns { srcCol, srcRow, override } — override is non-null to short-circuit resolveCell
function distortCell(col, row) {
    const fx = effectiveFx();

    if (fx === 'hole') {
        const dx = col - holeX;
        const dy = (row - holeY) * 1.8;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const HORIZON = 2.1 + holePulse * 1.3;
        const STRENGTH = 2.0 + holePulse * 3.8;

        if (dist < HORIZON) {
            const edge = dist / HORIZON;
            return {
                srcCol: col, srcRow: row,
                override: {
                    charCode: edge > 0.6 ? BLOCK_CHAR : 32,
                    r: Math.round(edge * 170 * (0.35 + holePulse * 0.65)),
                    g: Math.round(edge * 18),
                    b: Math.round(edge * 55),
                    gray: 0,
                },
            };
        }

        const pull = Math.min(0.97, STRENGTH / (dist * 1.15));
        const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(col + (holeX - col) * pull)));
        const srcRow = Math.max(0, Math.min(gridRows - 1, Math.round(row + (holeY - row) * pull)));
        return { srcCol, srcRow, override: null };
    }

    if (fx === 'rend') {
        const tearDirX = Math.cos(rendAngle);
        const tearDirY = Math.sin(rendAngle);
        const perpX = Math.sin(rendAngle);
        const perpY = -Math.cos(rendAngle);
        const relC = col - rendCenterX;
        const relR = row - rendCenterY;
        const distToTear = Math.abs(relC * tearDirY - relR * tearDirX);
        const voidHalf = rendOffset * 0.32;
        const edgeHalf = rendOffset * 0.58;

        if (distToTear < voidHalf && rendOffset > 0.4) {
            const isEdge = distToTear > voidHalf * 0.55;
            return {
                srcCol: col, srcRow: row,
                override: { charCode: isEdge ? BLOCK_CHAR : 32, r: isEdge ? 55 : 5, g: isEdge ? 20 : 5, b: isEdge ? 80 : 5, gray: 5 },
            };
        }

        if (distToTear < edgeHalf && rendOffset > 0.4) {
            const heat = (edgeHalf - distToTear) / (edgeHalf - voidHalf);
            const side = (relC * perpX + relR * perpY) > 0 ? 1 : -1;
            const shift = rendOffset * 0.5 * side;
            const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(col + perpX * shift)));
            const srcRow = Math.max(0, Math.min(gridRows - 1, Math.round(row + perpY * shift)));
            return {
                srcCol, srcRow,
                override: null,
                edgeHeat: heat,
            };
        }

        const side = (relC * perpX + relR * perpY) > 0 ? 1 : -1;
        const shift = rendOffset * 0.5 * side;
        const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(col + perpX * shift)));
        const srcRow = Math.max(0, Math.min(gridRows - 1, Math.round(row + perpY * shift)));
        return { srcCol, srcRow, override: null };
    }

    if (fx === 'melt' && meltColSpeeds && col < meltColSpeeds.length) {
        const elapsed = performance.now() - meltStartTime;
        const drift = meltColSpeeds[col] * elapsed + meltColPhase[col];
        const driftRow = Math.floor(drift);
        const wobble = Math.sin((row * 0.28 + drift * 0.08) * Math.PI) * 1.8;
        const srcRow = ((row - driftRow) % gridRows + gridRows) % gridRows;
        const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(col + wobble)));
        return { srcCol, srcRow, override: null };
    }

    return { srcCol: col, srcRow: row, override: null };
}

function processFrame(now) {
    if (state !== 'PLAYING' || video.paused || video.ended) return;

    frameParity = 1 - frameParity;
    updateAudioEnergy();
    updateCorrupt(now);
    tickAutoRipple(now);
    tickHole(now);
    tickRend(now);

    if (pixelMode) {
        renderPixelFrame(now);
    } else {
        offCtx.drawImage(video, 0, 0, gridCols, gridRows);
        const { data } = offCtx.getImageData(0, 0, gridCols, gridRows);
        if (renderMode === 1) renderBwAscii(data, now);
        else renderColorAscii(data, now);
        applyPostFx();
    }

    updateFpsStatus(now);
    updateCopyFrameButton();

    const fx = effectiveFx();
    container.classList.toggle(
        'fx-typing-active',
        !pixelMode && (fx === 'typewriter' || (fx === 'resonate' && audioEnergy > 0.3))
    );
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

    if (pixelMode && FX_PRESETS[activeFx]?.asciiOnly && !FX_PRESETS[activeFx]?.pixelOk) {
        activeFx = 'clean';
        sessionStorage.setItem('asciiline-fx', 'clean');
        container.className = 'fx-clean';
    }

    if (video.readyState < 1) {
        await new Promise((resolve, reject) => {
            video.addEventListener('loadedmetadata', resolve, { once: true });
            video.addEventListener('error', () => reject(new Error('Video failed to load')), { once: true });
        });
    }

    const cols = prefs.cols;
    const rows = calcAutoRows(cols, video.videoWidth, video.videoHeight, pixelMode);
    buildCanvas(cols, rows);
    updateFxPickerUI();
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
        if (effectiveFx() === 'resonate') initAudioAnalyser();
        if (effectiveFx() === 'hole') initHole();
        if (effectiveFx() === 'rend') initRend();
        if (effectiveFx() === 'melt') initMelt();
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
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
    container.classList.remove('fx-beat');
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
            if (effectiveFx() === 'resonate') initAudioAnalyser();
            if (effectiveFx() === 'hole') initHole();
            if (effectiveFx() === 'rend') initRend();
            if (effectiveFx() === 'melt') initMelt();
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
    pixelMode = usePixel;
    sessionStorage.setItem('asciiline-pixel', usePixel ? '1' : '0');
    updateModeToggleUI();
    updateCopyFrameButton();
    updateFxPickerUI();
    if (reconnect) restartWithMode();
}

function pointerToGrid(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;
    const fitScaleX = containerW / canvas.width;
    const fitScaleY = containerH / canvas.height;
    const fitScale = Math.min(fitScaleX, fitScaleY);
    const renderedW = canvas.width * fitScale;
    const renderedH = canvas.height * fitScale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;
    const localX = clientX - rect.left - offsetX;
    const localY = clientY - rect.top - offsetY;
    const col = Math.floor(localX / (charWidth * fitScale));
    const row = Math.floor(localY / (charHeight * fitScale));
    return { col, row };
}

// ── EVENT LISTENERS ───────────────────────────────────────

overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    startStream();
});

container.addEventListener('pointerdown', (e) => {
    if (state !== 'PLAYING' || pixelMode) return;
    const fx = effectiveFx();
    if (fx !== 'ripple' && fx !== 'auto-ripple') return;
    if (e.target.closest('#play-overlay')) return;
    const { col, row } = pointerToGrid(e.clientX, e.clientY);
    if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return;
    fireRippleAt(col, row, performance.now(), {});
    container.setPointerCapture(e.pointerId);
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

async function jumpToTrack(delta) {
    if (!siteConfig?.playlist) return;
    playlistIndex = (playlistIndex + delta + siteConfig.playlist.length) % siteConfig.playlist.length;
    const entry = currentPlaylistEntry();
    video.src = entry.src;
    updateTrackLabel();
    if (state === 'PLAYING') {
        finishStream();
        await startStream();
    }
}

if (trackPrevBtn) trackPrevBtn.addEventListener('click', () => jumpToTrack(-1));
if (trackNextBtn) trackNextBtn.addEventListener('click', () => jumpToTrack(1));

video.addEventListener('ended', async () => {
    if (video.loop) return;
    if (state !== 'PLAYING') return;
    if (siteConfig?.playlist && siteConfig.playlist.length > 1) {
        advancePlaylist();
        await startStream();
    } else if (siteConfig?.loop) {
        video.currentTime = 0;
        video.play().catch(() => {});
    } else {
        finishStream();
    }
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

buildFxPicker();
container.className = FX_PRESETS[activeFx]?.css || 'fx-clean';

if (fxPicker) {
    fxPicker.addEventListener('keydown', (e) => {
        const chips = [...fxPicker.querySelectorAll('.fx-chip')];
        const idx = chips.findIndex((c) => c.dataset.fx === activeFx);
        if (e.key === 'ArrowRight' && idx < chips.length - 1) {
            e.preventDefault();
            chips[idx + 1].focus();
            applyFx(chips[idx + 1].dataset.fx);
        } else if (e.key === 'ArrowLeft' && idx > 0) {
            e.preventDefault();
            chips[idx - 1].focus();
            applyFx(chips[idx - 1].dataset.fx);
        }
    });
}

loadConfig()
    .then(() => {
        updateModeToggleUI();
        updateCopyFrameButton();
        updateFxPickerUI();
        updateFxHint();
    })
    .catch((err) => {
        statusEl.textContent = err.message;
        statusEl.style.color = '#ff0000';
    });
