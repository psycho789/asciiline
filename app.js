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
const fxPanelEl      = document.getElementById('fx-panel');
const fxPanelName    = document.getElementById('fx-panel-name');
const fxPanelBadge   = document.getElementById('fx-panel-badge');
const fxPanelDesc    = document.getElementById('fx-panel-desc');
const fxPanelAction  = document.getElementById('fx-panel-action');
const fxPanelControls = document.getElementById('fx-panel-controls');
const trackPrevBtn = document.getElementById('track-prev');
const trackNextBtn = document.getElementById('track-next');

const PALETTE =
    " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";
const PALETTE_LEN = PALETTE.length;
const QB_MAP = { 5: 0, 4: 2, 3: 3, 2: 5 };
const CORRUPT_CHARS = '$#@!?0123456789ABCDEF';
const WAVE_CHARS = '~\\/-|';
const AUTO_RIPPLE_CHAR_SETS = [
    '~\\/-|',       // wave
    '\u2588\u2593\u2592\u2591',   // block fill ░▒▓█
    '\u2591\u2592\u2593',         // block decay
    '#@!$%',        // heavy glyph
    '\u00b7\u2218\u25CB\u25CE',   // expanding circles ·∘○◎
    '><^v',         // arrows
    '01',           // binary
    'ASCILINE',     // brand
    '+\u00d7*',     // cross/star
    '([{}])',       // brackets
];

// Weighted pattern pool — higher weight = fires more often
const AUTO_RIPPLE_POOL = [
    { name: 'nova',         weight: 3 },
    { name: 'scatter',      weight: 4 },
    { name: 'sweep',        weight: 3 },
    { name: 'rain',         weight: 3 },
    { name: 'quake',        weight: 3 },
    { name: 'converge',     weight: 2 },
    { name: 'chain',        weight: 2 },
    { name: 'supernova',    weight: 2 },
    { name: 'tsunami',      weight: 2 },
    { name: 'shatter',      weight: 1 },
    { name: 'interference', weight: 2 },
    { name: 'pulse_storm',  weight: 1 },
    { name: 'strobe_flood', weight: 1 },
    { name: 'bullseye',     weight: 2 },
    { name: 'spiral',       weight: 2 },
    { name: 'snake',        weight: 2 },
    { name: 'cross',        weight: 2 },
    { name: 'invaders',     weight: 1 },
    { name: 'lightning',    weight: 2 },
    { name: 'megaburst',    weight: 1 },
    { name: 'matrix_col',   weight: 2 },
    { name: 'heartbeat',    weight: 2 },
];

function pickAutoRipplePattern() {
    const total = AUTO_RIPPLE_POOL.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of AUTO_RIPPLE_POOL) {
        r -= p.weight;
        if (r <= 0) return p.name;
    }
    return AUTO_RIPPLE_POOL[0].name;
}
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
        fullDesc: 'The video renders exactly as-is — no modifications. ASCII mode maps pixel brightness to characters; PIXEL mode renders colored blocks.',
        css: 'fx-clean',
        asciiOnly: false,
        pixelOk: true,
    },
    triglyph: {
        label: 'RGB',
        tip: 'Chromatic split',
        hint: 'Three offset layers in red, green, and blue — holographic terminal bleed.',
        hintAscii: 'Three offset text layers composited like a holographic terminal.',
        fullDesc: 'The frame is drawn three times — red, green, and blue — each shifted slightly apart. The overlap creates a holographic chromatic split effect.',
        css: 'fx-triglyph',
        asciiOnly: true,
        pixelOk: true,
    },
    braille: {
        label: 'BRAILLE',
        tip: 'Unicode braille blocks',
        hint: 'Brightness maps to braille dot density — a completely different typographic alphabet.',
        fullDesc: 'Each area of the video maps to a Braille symbol. More dots = brighter. Fewer dots = darker. The whole image becomes a living Braille display.',
        css: 'fx-braille',
        asciiOnly: true,
    },
    duotone: {
        label: 'HALFTONE',
        tip: 'Two-symbol print',
        hint: 'The frame collapses to block and dot characters — letterpress halftone made of pure text.',
        fullDesc: 'The entire image is reduced to just two characters — a filled block for bright areas, a tiny dot for dark. Like a high-contrast letterpress print.',
        css: 'fx-duotone',
        asciiOnly: true,
    },
    typewriter: {
        label: 'TYPE',
        tip: 'Teletype scan reveal',
        hint: 'Each frame prints left to right with a blinking cursor, like live teletype output.',
        fullDesc: 'Each video frame gets typed out from left to right with a blinking cursor — like a teletype machine printing a live transmission in real time.',
        css: 'fx-typewriter',
        asciiOnly: true,
    },
    corrupt: {
        label: 'CORRUPT',
        tip: 'Buffer glitch',
        hint: 'Random rectangles of garbled characters simulate memory corruption of the text buffer.',
        fullDesc: 'Randomly trashes large blocks of characters to simulate corrupted video memory — like a broken file being read from a failing drive. Use the sliders below to control how intense and how big the glitches are.',
        controls: [
            { id: 'corrupt-intensity', label: 'How intense?', min: 0.3, max: 3.0, step: 0.1, def: 1.0 },
            { id: 'corrupt-size',      label: 'Zone size',    min: 0.3, max: 2.5, step: 0.1, def: 1.0 },
        ],
        css: 'fx-corrupt',
        asciiOnly: true,
    },
    selection: {
        label: 'SELECT',
        tip: 'Highlight live text',
        hint: 'Drag across the player to select live video text — readable glyphs pop over the color layer.',
        fullDesc: 'The video is made of real, selectable characters. Drag to highlight any region — you can copy the ASCII art directly from a live video frame.',
        action: 'Click and drag across the video to highlight and copy characters.',
        css: 'fx-selection',
        asciiOnly: true,
        interactive: true,
    },
    phosphor: {
        label: 'PHOSPHOR',
        tip: 'Afterimage trail',
        hint: 'Previous frames smear behind new ones — CRT phosphor persistence.',
        hintAscii: 'Glyph-shaped afterimages as characters fade into the next frame.',
        fullDesc: 'Previous frames fade slowly behind the current one, exactly like a CRT monitor that keeps glowing after the image changes. Fast motion leaves long trails.',
        controls: [
            { id: 'phosphor-trail', label: 'Trail length', min: 0.30, max: 0.96, step: 0.01, def: 0.78 },
        ],
        css: 'fx-phosphor',
        asciiOnly: true,
        pixelOk: true,
    },
    thermal: {
        label: 'THERMAL',
        tip: 'Heatmap',
        hint: 'Brightness mapped to a cold-to-hot color ramp.',
        hintAscii: 'Character color follows brightness as temperature.',
        fullDesc: 'Pixel brightness maps to a temperature color scale — dark areas are cold (black/blue), bright areas are hot (yellow/red). Like a thermal camera.',
        css: 'fx-thermal',
        asciiOnly: true,
        pixelOk: true,
    },
    interlace: {
        label: 'INTERLACE',
        tip: 'Broadcast rows',
        hint: 'Odd and even rows update on alternating frames with scanlines.',
        hintAscii: 'Grid-native broadcast signal — only odd or even rows refresh each frame.',
        fullDesc: 'Odd-numbered and even-numbered rows update on alternating frames — exactly how broadcast TV worked. The gaps between rows create visible scanlines.',
        css: 'fx-interlace',
        asciiOnly: true,
        pixelOk: true,
    },
    'font-morph': {
        label: 'FONTS',
        tip: 'Change typeface',
        hint: 'Same frame, different typeface — the image changes because glyphs are the pixels.',
        fullDesc: 'Because characters ARE the pixels, switching the typeface changes the entire look of the video. Pick any of the four typefaces below — each produces a completely different visual.',
        fontButtons: true,
        action: 'Pick a typeface below.',
        css: 'fx-font-morph',
        asciiOnly: true,
        interactive: true,
    },
    ripple: {
        label: 'RIPPLE',
        tip: 'Click the grid',
        hint: 'Click the player to send a radial wave through the character field.',
        fullDesc: 'Click anywhere on the video to send a wave rippling outward through the characters. The wave distorts each character it passes. Use the sliders to control how large and how fast the waves travel.',
        action: 'Click anywhere on the video to create a ripple.',
        controls: [
            { id: 'ripple-size',  label: 'Wave size',  min: 0.5, max: 4.0, step: 0.1, def: 1.0 },
            { id: 'ripple-speed', label: 'Wave speed', min: 0.4, max: 2.5, step: 0.1, def: 1.0 },
        ],
        css: 'fx-ripple',
        asciiOnly: true,
        interactive: true,
    },
    broadcast: {
        label: 'CRT',
        tip: 'Retro broadcast',
        hint: 'Scanlines, vignette, interlaced rows, and phosphor-green hot highlights.',
        hintAscii: 'Interlaced rows, scanlines, vignette, and phosphor-green on dense characters.',
        fullDesc: 'Simulates an old CRT television — horizontal scanlines, dark vignette borders, and phosphor-green highlights on the brightest characters.',
        css: 'fx-broadcast',
        asciiOnly: true,
        pixelOk: true,
    },
    resonate: {
        label: 'RESONATE',
        tip: 'Audio-reactive',
        hint: 'Bass widens RGB split and boosts phosphor smear — turn volume up.',
        hintAscii: 'Bass corrupts the buffer, widens RGB split, and speeds teletype reveal.',
        fullDesc: 'The video\'s own audio drives the visuals in real time — bass notes widen the RGB color split, boost the phosphor trail, and corrupt the buffer. Turn the volume up for full effect.',
        action: 'Turn volume up — the audio track controls the effect.',
        audioLevel: true,
        css: 'fx-resonate',
        asciiOnly: true,
        pixelOk: true,
        interactive: true,
    },
    soundwave: {
        label: 'WAVEFORM',
        tip: 'Audio warps the image',
        hint: 'The audio waveform bends every column — louder = more warp. Bass beats fire ripples.',
        fullDesc: 'The audio waveform physically bends the image — each column shifts up or down based on the sound at that exact moment. Silence = still. Loud music = violent distortion. Bass drops also fire ripples.',
        action: 'Turn volume up — every sound physically warps the image.',
        audioLevel: true,
        css: 'fx-soundwave fx-ripple',
        asciiOnly: true,
        interactive: true,
    },
    beatstrike: {
        label: 'BEATFIRE',
        tip: 'Beat-triggered ripples',
        hint: 'Each detected beat fires a ripple scaled to its intensity — light taps, massive drops all look different.',
        fullDesc: 'Every detected beat fires a ripple wave. Light taps send small rings; hard hits launch double novas; massive bass drops blast multi-ring explosions outward. The harder the beat, the bigger the effect.',
        action: 'Turn volume up — every beat launches a ripple wave.',
        audioLevel: true,
        css: 'fx-beatstrike fx-ripple',
        asciiOnly: true,
        interactive: true,
    },
    spectra: {
        label: 'SPECTRA',
        tip: 'Frequency-band distortion',
        hint: 'Each horizontal band maps to a frequency — bass rows tear on kicks, mids shift on snares.',
        fullDesc: 'Each horizontal strip of the image is tied to a specific frequency range. The low-frequency (bass) strips at the bottom tear sideways on kick drums. Mid-frequency strips shift on snares. The whole image becomes an EQ visualizer.',
        action: 'Turn volume up — different instruments distort different parts of the image.',
        audioLevel: true,
        css: 'fx-spectra',
        asciiOnly: true,
        interactive: true,
    },
    'auto-ripple': {
        label: 'GHOST',
        tip: 'Autonomous ripple engine',
        hint: 'Random patterns — nova bursts, scatter shots, chain blasts, quakes — fire on their own schedule.',
        fullDesc: 'An autonomous ripple engine runs on its own — firing tsunamis, spirals, shatters, interference waves, and more on a random schedule. You can also click the video to add your own. Use the slider to control how chaotic it gets.',
        action: 'Click the video to add your own ripples to the chaos.',
        controls: [
            { id: 'ghost-chaos', label: 'Chaos level', min: 0.3, max: 3.0, step: 0.1, def: 1.0 },
        ],
        css: 'fx-ripple fx-auto-ripple',
        asciiOnly: true,
        interactive: true,
    },
    hole: {
        label: 'HOLE',
        tip: 'Singularity tears space',
        hint: 'A singularity drifts through the grid, warping characters toward it and devouring them at the event horizon.',
        fullDesc: 'A black hole drifts through the character grid. Nearby characters bend toward it — the closer they get, the more they warp. Characters that reach the event horizon are devoured. Use the slider to control its gravitational pull.',
        controls: [
            { id: 'hole-gravity', label: 'Gravity strength', min: 0.3, max: 3.0, step: 0.1, def: 1.0 },
        ],
        css: 'fx-hole',
        asciiOnly: true,
    },
    rend: {
        label: 'REND',
        tip: 'Reality tears apart',
        hint: 'The frame rips along a random fracture — both halves drift apart, exposing the void between them, then it heals and tears again.',
        fullDesc: 'The video frame tears apart along a diagonal line. The two halves drift away from each other, exposing a glowing void between them, then the tear heals — and rips again somewhere else.',
        css: 'fx-rend',
        asciiOnly: true,
    },
    melt: {
        label: 'MELT',
        tip: 'Columns drip downward',
        hint: 'Each column drips at a different speed — the image slowly runs and pools like paint, then cycles.',
        fullDesc: 'Each column of the image drips downward at its own random speed, like wet paint running. The image slowly pools and smears before resetting. Use the slider to control how fast it melts.',
        controls: [
            { id: 'melt-speed', label: 'Drip speed', min: 0.3, max: 3.0, step: 0.1, def: 1.0 },
        ],
        css: 'fx-melt',
        asciiOnly: true,
    },
};

// Populate fxParams defaults from FX_PRESETS controls definitions
const fxParams = {};
for (const preset of Object.values(FX_PRESETS)) {
    if (preset.controls) {
        for (const ctrl of preset.controls) {
            fxParams[ctrl.id] = ctrl.def;
        }
    }
}

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
let audioEnergy = 0;    // bass energy 0-1 (backward compat)
let audioRms = 0;       // RMS volume 0-1
let audioBass = 0;      // low-freq energy 0-1
let audioFreqData = null;  // Uint8Array frequency bins
let audioWaveform = null;  // Uint8Array time-domain samples
let audioBeat = false;     // true this frame if beat detected
let audioBeatHistory = null;
let audioBeatIdx = 0;
let lastBeatAt = 0;
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

    if (AUDIO_REACTIVE_FX.has(id) && state === 'PLAYING') initAudioAnalyser();
    if (id === 'hole') initHole();
    if (id === 'rend') initRend();
    if (id === 'melt') initMelt();

    if (id === 'font-morph' && state === 'PLAYING' && !pixelMode && gridCols > 0) {
        buildCanvas(gridCols, gridRows);
    }

    buildFxPanel(activeFx);
}

function buildFxPanel(id) {
    if (!fxPanelEl) return;
    const preset = FX_PRESETS[id] || FX_PRESETS.clean;
    const FONT_NAMES = ['Courier', 'VT323', 'IBM Plex Mono', 'Press Start 2P'];

    // Name + optional font badge
    let label = preset.label;
    if (id === 'font-morph') label = `${preset.label} · ${FONT_NAMES[fontMorphIndex]}`;
    if (fxPanelName) fxPanelName.textContent = label;

    // Badge: ASCII-only warning when in pixel mode
    if (fxPanelBadge) {
        const isAsciiOnly = pixelMode && preset.asciiOnly && !preset.pixelOk;
        fxPanelBadge.textContent = isAsciiOnly ? 'ASCII only — switch to ASCII mode for full effect' : '';
        fxPanelBadge.hidden = !isAsciiOnly;
    }

    // Description — use fullDesc first, fall back to hint
    if (fxPanelDesc) {
        let body = preset.fullDesc || preset.hint || preset.tip || '';
        if (pixelMode && preset.asciiOnly && !preset.pixelOk) {
            body = 'This effect needs the ASCII character grid. Click the ASCII button above to switch modes.';
        }
        fxPanelDesc.textContent = body;
    }

    // Action hint
    if (fxPanelAction) {
        const showAction = preset.action && (!pixelMode || preset.pixelOk);
        fxPanelAction.textContent = showAction ? `→ ${preset.action}` : '';
        fxPanelAction.hidden = !showAction;
    }

    // Controls area
    if (!fxPanelControls) return;
    fxPanelControls.innerHTML = '';

    if (preset.fontButtons) {
        // Font picker buttons
        const row = document.createElement('div');
        row.className = 'fx-font-row';
        FONT_NAMES.forEach((name, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fx-font-btn' + (idx === fontMorphIndex ? ' active' : '');
            btn.textContent = name;
            btn.title = `Switch to ${name} typeface`;
            btn.addEventListener('click', () => {
                fontMorphIndex = idx;
                sessionStorage.setItem('asciiline-font-idx', String(idx));
                if (state === 'PLAYING' && !pixelMode && gridCols > 0) buildCanvas(gridCols, gridRows);
                buildFxPanel(activeFx);
            });
            row.appendChild(btn);
        });
        fxPanelControls.appendChild(row);

    } else if (preset.audioLevel) {
        // Audio level bar
        const barWrap = document.createElement('div');
        barWrap.className = 'fx-audio-bar';
        barWrap.title = 'Live audio level';
        const barFill = document.createElement('div');
        barFill.className = 'fx-audio-fill';
        barFill.id = 'fx-audio-fill';
        barWrap.appendChild(barFill);
        const barLabel = document.createElement('span');
        barLabel.className = 'fx-audio-label';
        barLabel.textContent = 'Turn volume up for full effect';
        fxPanelControls.appendChild(barWrap);
        fxPanelControls.appendChild(barLabel);

    } else if (preset.controls) {
        // Sliders
        preset.controls.forEach((ctrl) => {
            const row = document.createElement('div');
            row.className = 'fx-ctrl-row';

            const lbl = document.createElement('label');
            lbl.className = 'fx-ctrl-label';
            lbl.textContent = ctrl.label;
            lbl.setAttribute('for', `fx-ctrl-${ctrl.id}`);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.id = `fx-ctrl-${ctrl.id}`;
            slider.className = 'fx-ctrl-range';
            slider.min = String(ctrl.min);
            slider.max = String(ctrl.max);
            slider.step = String(ctrl.step);
            slider.value = String(fxParams[ctrl.id] ?? ctrl.def);
            slider.setAttribute('aria-label', ctrl.label);

            const valDisplay = document.createElement('output');
            valDisplay.className = 'fx-ctrl-val';
            valDisplay.setAttribute('for', `fx-ctrl-${ctrl.id}`);
            valDisplay.textContent = slider.value;

            slider.addEventListener('input', () => {
                fxParams[ctrl.id] = parseFloat(slider.value);
                valDisplay.textContent = slider.value;
            });

            row.appendChild(lbl);
            row.appendChild(slider);
            row.appendChild(valDisplay);
            fxPanelControls.appendChild(row);
        });
    }
}

function updateAudioLevelBar() {
    const fill = document.getElementById('fx-audio-fill');
    if (!fill) return;
    const pct = Math.min(100, Math.round((audioRms || 0) * 400));
    fill.style.width = `${pct}%`;
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
    buildFxPanel(activeFx);
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
        btn.setAttribute('aria-describedby', 'fx-panel');

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

const AUDIO_REACTIVE_FX = new Set(['resonate', 'soundwave', 'beatstrike', 'spectra']);

function updateAudioEnergy(now) {
    const fx = effectiveFx();
    if (!analyser || !AUDIO_REACTIVE_FX.has(fx)) {
        audioEnergy = 0;
        audioRms = 0;
        audioBass = 0;
        audioBeat = false;
        container.classList.remove('fx-beat');
        return;
    }

    // Frequency domain
    if (!audioFreqData || audioFreqData.length !== analyser.frequencyBinCount)
        audioFreqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(audioFreqData);

    // Time domain (waveform)
    if (!audioWaveform || audioWaveform.length !== analyser.fftSize)
        audioWaveform = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(audioWaveform);

    // Bass energy (bins 0-9)
    let bass = 0;
    for (let i = 0; i < 10; i++) bass += audioFreqData[i];
    audioBass = bass / (10 * 255);
    audioEnergy = audioBass; // backward compat

    // RMS from waveform
    let rmsSum = 0;
    for (let i = 0; i < audioWaveform.length; i++) {
        const s = (audioWaveform[i] - 128) / 128;
        rmsSum += s * s;
    }
    audioRms = Math.sqrt(rmsSum / audioWaveform.length);

    // Beat detection — fire when bass spikes above local history average
    if (!audioBeatHistory) audioBeatHistory = new Float32Array(44);
    audioBeatHistory[audioBeatIdx] = audioBass;
    audioBeatIdx = (audioBeatIdx + 1) % audioBeatHistory.length;
    let histAvg = 0;
    for (let i = 0; i < audioBeatHistory.length; i++) histAvg += audioBeatHistory[i];
    histAvg /= audioBeatHistory.length;
    audioBeat = audioBass > histAvg * 1.5 && audioBass > 0.18 && (now - lastBeatAt) > 260;
    if (audioBeat) lastBeatAt = now;

    triglyphOffset = 2 + Math.floor(audioBass * 4);
    container.classList.toggle('fx-beat', audioBass > 0.55);

    if (fx === 'resonate' && audioBass > 0.65 && now >= nextCorruptAt) {
        spawnCorruptZone();
        nextCorruptAt = now + 200;
    }
}

function spawnCorruptZone() {
    if (gridCols < 4 || gridRows < 4) return;
    const sz = fxParams['corrupt-size'] ?? 1.0;
    // 15% chance: full-width tear band (entire row width, very dramatic)
    const fullBand = Math.random() < 0.15;
    const h = fullBand
        ? Math.round((2 + Math.floor(Math.random() * 3)) * sz)
        : Math.round((5 + Math.floor(Math.random() * 16)) * sz);
    const w = fullBand
        ? gridCols
        : Math.round((10 + Math.floor(Math.random() * 38)) * sz);
    const row0 = Math.floor(Math.random() * Math.max(1, gridRows - h));
    const col0 = fullBand ? 0 : Math.floor(Math.random() * Math.max(1, gridCols - w));
    const chars = new Uint8Array(h * w);
    for (let i = 0; i < chars.length; i++) {
        chars[i] = CORRUPT_CHARS.charCodeAt(Math.floor(Math.random() * CORRUPT_CHARS.length));
    }
    const maxZones = Math.round(10 + (fxParams['corrupt-intensity'] ?? 1.0) * 4);
    corruptZones.push({ row0, row1: row0 + h - 1, col0, col1: col0 + w - 1, decay: 4, chars });
    if (corruptZones.length > maxZones) corruptZones.shift();
}

function updateCorrupt(now) {
    const fx = effectiveFx();
    if (fx !== 'corrupt' && fx !== 'broadcast' && fx !== 'resonate') return;

    if (fx === 'corrupt' && now >= nextCorruptAt) {
        spawnCorruptZone();
        const intensity = fxParams['corrupt-intensity'] ?? 1.0;
        nextCorruptAt = now + (300 + Math.random() * 500) / intensity;
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
    const pattern = pickAutoRipplePattern();

    const q = autoRipplePendingFires;
    const rC  = () => 1 + Math.floor(Math.random() * (gridCols - 2));
    const rR  = () => 1 + Math.floor(Math.random() * (gridRows - 2));
    const rCs = () => AUTO_RIPPLE_CHAR_SETS[Math.floor(Math.random() * AUTO_RIPPLE_CHAR_SETS.length)];
    const rSpd= () => 0.06 + Math.random() * 0.22;
    const rW  = () => 1.0 + Math.random() * 2.5;
    const clampC = (c) => Math.max(1, Math.min(gridCols - 2, Math.round(c)));
    const clampR = (r) => Math.max(1, Math.min(gridRows - 2, Math.round(r)));

    switch (pattern) {

        // ── EXISTING (tightened) ──────────────────────────────
        case 'nova':
            q.push({ fireAt: now, col: rC(), row: rR(),
                speed: 0.18 + Math.random() * 0.12, duration: 900,
                width: 3 + Math.random() * 2, charSet: rCs() });
            break;

        case 'scatter': {
            const n = 6 + Math.floor(Math.random() * 10);
            const cs = rCs();
            for (let i = 0; i < n; i++)
                q.push({ fireAt: now + i * 40, col: rC(), row: rR(), speed: rSpd(),
                    duration: 400 + Math.random() * 500, width: rW(), charSet: cs });
            break;
        }

        case 'sweep': {
            const vert = Math.random() < 0.5;
            const fixed = vert ? rC() : rR();
            const n = 10 + Math.floor(Math.random() * 8);
            const cs = rCs();
            for (let i = 0; i < n; i++) {
                const pos = Math.floor((i / n) * (vert ? gridRows : gridCols));
                q.push({ fireAt: now + i * 50, col: vert ? fixed : pos, row: vert ? pos : fixed,
                    speed: rSpd(), duration: 550, width: 1.8, charSet: cs });
            }
            break;
        }

        case 'rain': {
            const n = 14 + Math.floor(Math.random() * 14);
            for (let i = 0; i < n; i++)
                q.push({ fireAt: now + i * 90 + Math.random() * 60, col: rC(), row: rR(),
                    speed: 0.05 + Math.random() * 0.07, duration: 400, width: 1.3, charSet: '~`.' });
            break;
        }

        case 'quake': {
            const ec = rC(), er = rR();
            const n = 14 + Math.floor(Math.random() * 12);
            for (let i = 0; i < n; i++)
                q.push({ fireAt: now + Math.random() * 600,
                    col: clampC(ec + (Math.random() - 0.5) * 14),
                    row: clampR(er + (Math.random() - 0.5) * 8),
                    speed: rSpd(), duration: 350 + Math.random() * 350,
                    width: 1.0 + Math.random() * 2.0, charSet: '#@!$%' });
            break;
        }

        case 'converge': {
            const cs = rCs();
            [[1,1],[gridCols-2,1],[1,gridRows-2],[gridCols-2,gridRows-2]].forEach(([c,r],i) =>
                q.push({ fireAt: now + i * 55, col: c, row: r,
                    speed: 0.12 + Math.random() * 0.08, duration: 800, width: 2.5, charSet: cs }));
            break;
        }

        case 'chain': {
            const oc = rC(), or_ = rR();
            q.push({ fireAt: now, col: oc, row: or_, speed: 0.22, duration: 500, width: 3.0, charSet: AUTO_RIPPLE_CHAR_SETS[0] });
            for (let i = 0; i < 6; i++) {
                const a = (i/6)*Math.PI*2;
                q.push({ fireAt: now+300, col: clampC(oc+Math.cos(a)*13), row: clampR(or_+Math.sin(a)*7),
                    speed: rSpd(), duration: 450, width: rW(), charSet: rCs() });
            }
            for (let i = 0; i < 12; i++) {
                const a = (i/12)*Math.PI*2;
                q.push({ fireAt: now+650, col: clampC(oc+Math.cos(a)*24), row: clampR(or_+Math.sin(a)*14),
                    speed: rSpd(), duration: 400, width: rW(), charSet: rCs() });
            }
            break;
        }

        case 'supernova': {
            const sc = rC(), sr = rR();
            for (let i = 0; i < 8; i++)
                q.push({ fireAt: now + i * 70, col: sc, row: sr,
                    speed: 0.06 + i * 0.055, duration: 800,
                    width: 2.2 + i * 0.5, charSet: AUTO_RIPPLE_CHAR_SETS[i % AUTO_RIPPLE_CHAR_SETS.length] });
            break;
        }

        // ── NEW: MACRO SCALE ──────────────────────────────────

        // TSUNAMI — a thick wall of block chars sweeps the entire frame
        case 'tsunami': {
            const cs = '\u2588\u2593\u2592\u2591'; // █▓▒░
            const fromRight = Math.random() < 0.5;
            const edgeC = fromRight ? gridCols - 1 : 0;
            for (let r = 0; r < gridRows; r += 2)
                q.push({ fireAt: now, col: edgeC, row: r,
                    speed: 0.020, duration: 8000, width: 10.0, charSet: cs });
            break;
        }

        // SHATTER — grid of simultaneous ring origins (glass breaking)
        case 'shatter': {
            const cs = '\u2592\u2591\u2588\u2593'; // mixed blocks
            const nx = Math.max(2, Math.floor(gridCols / 12));
            const ny = Math.max(2, Math.floor(gridRows / 6));
            for (let ix = 0; ix <= nx; ix++)
                for (let iy = 0; iy <= ny; iy++) {
                    const delay = Math.random() * 120;
                    q.push({ fireAt: now + delay,
                        col: clampC((ix/nx)*(gridCols-2)+1),
                        row: clampR((iy/ny)*(gridRows-2)+1),
                        speed: 0.12 + Math.random() * 0.08, duration: 900,
                        width: 1.4, charSet: cs });
                }
            break;
        }

        // INTERFERENCE — two slow opposing waves that meet in the middle
        case 'interference': {
            const cs = rCs();
            const mr = Math.floor(gridRows / 2);
            const spd = 0.028 + Math.random() * 0.018;
            const w = 3.5 + Math.random() * 2.0;
            q.push({ fireAt: now, col: 0, row: mr, speed: spd, duration: 6000, width: w, charSet: cs });
            q.push({ fireAt: now, col: gridCols-1, row: mr, speed: spd, duration: 6000, width: w, charSet: cs });
            // vertical version
            if (Math.random() < 0.4) {
                const mc = Math.floor(gridCols / 2);
                q.push({ fireAt: now+200, col: mc, row: 0, speed: spd, duration: 6000, width: w, charSet: rCs() });
                q.push({ fireAt: now+200, col: mc, row: gridRows-1, speed: spd, duration: 6000, width: w, charSet: rCs() });
            }
            break;
        }

        // PULSE_STORM — 25 slow overlapping wide waves drowning the whole frame
        case 'pulse_storm': {
            const n = 22 + Math.floor(Math.random() * 12);
            for (let i = 0; i < n; i++)
                q.push({ fireAt: now + i * 220,
                    col: rC(), row: rR(),
                    speed: 0.022 + Math.random() * 0.035,
                    duration: 4000 + Math.random() * 2000,
                    width: 3.0 + Math.random() * 4.0,
                    charSet: AUTO_RIPPLE_CHAR_SETS[i % AUTO_RIPPLE_CHAR_SETS.length] });
            break;
        }

        // STROBE_FLOOD — 60 fast block-char bursts covering the whole frame
        case 'strobe_flood': {
            const cs = '\u2588\u2593\u2592\u2591';
            const n = 55 + Math.floor(Math.random() * 30);
            for (let i = 0; i < n; i++)
                q.push({ fireAt: now + Math.random() * 250,
                    col: rC(), row: rR(),
                    speed: 0.16 + Math.random() * 0.16,
                    duration: 320, width: 3.0, charSet: cs });
            break;
        }

        // BULLSEYE — 12 perfectly-spaced concentric rings from center
        case 'bullseye': {
            const cc = Math.floor(gridCols/2), cr = Math.floor(gridRows/2);
            const cs = rCs();
            const interval = 180;
            for (let i = 0; i < 12; i++)
                q.push({ fireAt: now + i * interval, col: cc, row: cr,
                    speed: 0.048, duration: 3500, width: 2.0, charSet: cs });
            break;
        }

        // ── NEW: SHAPED PATHS ─────────────────────────────────

        // SPIRAL — 40 origins spiraling outward from center, staggered
        case 'spiral': {
            const cc = gridCols/2, cr = gridRows/2;
            const cs = rCs();
            const n = 40 + Math.floor(Math.random() * 20);
            for (let i = 0; i < n; i++) {
                const t = i/n;
                const angle = t * Math.PI * (Math.random() < 0.5 ? 4 : 6);
                const radius = t * Math.min(gridCols, gridRows) * 0.42;
                q.push({ fireAt: now + i * 55,
                    col: clampC(cc + Math.cos(angle) * radius),
                    row: clampR(cr + Math.sin(angle) * radius * 0.5),
                    speed: rSpd(), duration: 650, width: 1.8, charSet: cs });
            }
            break;
        }

        // SNAKE — origins along a sine-wave S-curve sweeping left to right
        case 'snake': {
            const n = 45 + Math.floor(Math.random() * 20);
            const cs = rCs();
            const freq = 2 + Math.floor(Math.random() * 3);
            const amp = 0.3 + Math.random() * 0.25;
            for (let i = 0; i < n; i++) {
                const t = i/n;
                const col = clampC(t * (gridCols-2) + 1);
                const row = clampR(gridRows * (0.5 + amp * Math.sin(t * Math.PI * 2 * freq)));
                q.push({ fireAt: now + i * 45, col, row, speed: rSpd(), duration: 550, width: rW(), charSet: cs });
            }
            break;
        }

        // CROSS — origins fill a horizontal + vertical line simultaneously
        case 'cross': {
            const mc = Math.floor(gridCols/2), mr = Math.floor(gridRows/2);
            const cs = rCs();
            for (let c = 1; c < gridCols-1; c += 3)
                q.push({ fireAt: now + c*7, col: c, row: mr, speed: 0.14, duration: 700, width: 2.0, charSet: cs });
            for (let r = 1; r < gridRows-1; r += 2)
                q.push({ fireAt: now + r*14, col: mc, row: r, speed: 0.14, duration: 700, width: 2.0, charSet: cs });
            break;
        }

        // INVADERS — fire ripples from a Space Invaders sprite pattern
        case 'invaders': {
            const sprite = [
                [0,1,0,1,0],
                [1,1,1,1,1],
                [1,0,1,0,1],
                [0,1,0,1,0],
            ];
            const cc = rC(), cr = rR();
            const cs = rCs();
            sprite.forEach((row, ry) =>
                row.forEach((on, cx) => {
                    if (!on) return;
                    q.push({ fireAt: now + (ry*5+cx)*35,
                        col: clampC(cc + (cx-2)*10),
                        row: clampR(cr + (ry-1)*6),
                        speed: 0.13, duration: 700, width: 2.5, charSet: cs });
                }));
            break;
        }

        // ── NEW: TEMPORAL ─────────────────────────────────────

        // LIGHTNING — rapid-fire staccato bursts alternating thin/fast + thick/slow
        case 'lightning': {
            const oc = rC(), or_ = rR();
            for (let i = 0; i < 22; i++) {
                const even = i % 2 === 0;
                q.push({ fireAt: now + i * 38, col: oc, row: or_,
                    speed: even ? 0.32 : 0.07,
                    duration: even ? 220 : 350,
                    width: even ? 1.2 : 5.0,
                    charSet: '#@!$%' });
            }
            break;
        }

        // MEGABURST — 20 rings from one point, speeds fan out from v.slow to v.fast
        case 'megaburst': {
            const oc = rC(), or_ = rR();
            for (let i = 0; i < 20; i++) {
                const t = i/19;
                q.push({ fireAt: now + i * 35, col: oc, row: or_,
                    speed: 0.04 + t * 0.38,
                    duration: 1800 - i * 75,
                    width: 3.5 - t * 2.0,
                    charSet: AUTO_RIPPLE_CHAR_SETS[i % AUTO_RIPPLE_CHAR_SETS.length] });
            }
            break;
        }

        // MATRIX_COL — every cell in a column fires outward simultaneously
        case 'matrix_col': {
            const col = rC();
            const cs = rCs();
            for (let r = 0; r < gridRows; r++)
                q.push({ fireAt: now + r * 18, col,
                    row: clampR(r),
                    speed: 0.10 + Math.random() * 0.08, duration: 600, width: 1.8, charSet: cs });
            break;
        }

        // HEARTBEAT — ECG-like P/QRS/T wave rhythm from same point
        case 'heartbeat': {
            const oc = rC(), or_ = rR(), cs = rCs();
            const beats = [
                { t: 0,    spd: 0.12, w: 1.5, dur: 500 },
                { t: 80,   spd: 0.28, w: 5.5, dur: 300 },
                { t: 140,  spd: 0.22, w: 4.0, dur: 350 },
                { t: 420,  spd: 0.09, w: 2.5, dur: 700 },
                { t: 820,  spd: 0.12, w: 1.5, dur: 500 },  // next beat
                { t: 900,  spd: 0.28, w: 5.5, dur: 300 },
                { t: 960,  spd: 0.22, w: 4.0, dur: 350 },
            ];
            beats.forEach(b =>
                q.push({ fireAt: now + b.t, col: oc, row: or_,
                    speed: b.spd, duration: b.dur, width: b.w, charSet: cs }));
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
        // Wide variance: short gap for quick patterns, longer gap after heavy ones
        const r = Math.random();
        const baseGap = r < 0.15 ? 400 + Math.random() * 600      // 15%: very fast back-to-back
                       : r < 0.6  ? 800 + Math.random() * 1800     // 45%: normal
                       :             2200 + Math.random() * 2800;   // 40%: longer pause
        const chaos = fxParams['ghost-chaos'] ?? 1.0;
        autoRippleNextAt = now + baseGap / chaos;
    }
}

function tickBeatstrike(now) {
    const fx = effectiveFx();
    if ((fx !== 'beatstrike' && fx !== 'soundwave') || state !== 'PLAYING' || pixelMode) return;
    if (!audioBeat || gridCols === 0 || gridRows === 0) return;

    const rC = () => 1 + Math.floor(Math.random() * (gridCols - 2));
    const rR = () => 1 + Math.floor(Math.random() * (gridRows - 2));
    const rCs = () => AUTO_RIPPLE_CHAR_SETS[Math.floor(Math.random() * AUTO_RIPPLE_CHAR_SETS.length)];

    if (audioBass > 0.72) {
        // Massive hit — burst of 5 rings from a cluster of origins
        const oc = rC(), or_ = rR();
        for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * Math.PI * 2;
            fireRippleAt(
                oc + Math.cos(ang) * 10, or_ + Math.sin(ang) * 5, now,
                { speed: 0.12 + audioBass * 0.20, duration: 750,
                  width: 3.5 + audioBass * 3.0, charSet: '\u2588\u2593\u2592\u2591' }
            );
        }
    } else if (audioBass > 0.44) {
        // Strong hit — double nova, staggered speeds
        const c = rC(), r = rR();
        fireRippleAt(c, r, now,
            { speed: 0.10 + audioBass * 0.12, duration: 650, width: 2.5 + audioBass * 2, charSet: '#@!$%' });
        fireRippleAt(c, r, now + 110,
            { speed: 0.24 + audioBass * 0.08, duration: 420, width: 1.8, charSet: '~\\/-|' });
    } else {
        // Light tap — single ripple, sized to bass energy
        fireRippleAt(rC(), rR(), now, {
            speed: 0.08 + audioBass * 0.12,
            duration: 380 + audioBass * 300,
            width: 1.2 + audioBass * 2.5,
            charSet: rCs(),
        });
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

    const trailBase = fxParams['phosphor-trail'] ?? 0.78;
    trailCtx.globalAlpha = fx === 'resonate' ? Math.min(0.97, trailBase + audioEnergy * 0.12) : trailBase;
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
        const gravMul = fxParams['hole-gravity'] ?? 1.0;
        const HORIZON = 2.1 + holePulse * 1.3;
        const STRENGTH = (2.0 + holePulse * 3.8) * gravMul;

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
        const drift = meltColSpeeds[col] * elapsed * (fxParams['melt-speed'] ?? 1.0) + meltColPhase[col];
        const driftRow = Math.floor(drift);
        const wobble = Math.sin((row * 0.28 + drift * 0.08) * Math.PI) * 1.8;
        const srcRow = ((row - driftRow) % gridRows + gridRows) % gridRows;
        const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(col + wobble)));
        return { srcCol, srcRow, override: null };
    }

    // SOUNDWAVE — audio waveform bends rows; amplitude scales with RMS volume
    if (fx === 'soundwave' || fx === 'beatstrike') {
        if (audioWaveform && audioWaveform.length >= 2) {
            // Linearly interpolate waveform samples → smooth per-column displacement
            const t = (col / Math.max(1, gridCols - 1)) * (audioWaveform.length - 2);
            const i0 = Math.floor(t);
            const i1 = i0 + 1;
            const frac = t - i0;
            const wSample = audioWaveform[i0] * (1 - frac) + audioWaveform[i1] * frac;
            const wave = (wSample - 128) / 128; // −1 … +1

            if (fx === 'soundwave') {
                // Vertical displacement — columns undulate up/down with waveform
                const amplitude = 2 + audioRms * 32;
                const srcRow = Math.max(0, Math.min(gridRows - 1, Math.round(row + wave * amplitude)));
                // Subtle horizontal shimmer from waveform derivative
                const deriv = (audioWaveform[Math.min(audioWaveform.length - 1, i1 + 1)] - audioWaveform[i0]) / 256;
                const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(col + deriv * audioRms * 12)));
                return { srcCol, srcRow, override: null };
            }
        }
        // beatstrike: no coordinate distortion — only fires ripples via tickBeatstrike
        return { srcCol: col, srcRow: row, override: null };
    }

    // SPECTRA — each horizontal band maps to a frequency; high amplitude → sideways shift
    if (fx === 'spectra') {
        if (audioFreqData && audioFreqData.length > 0) {
            // Map rows to frequency bins: bottom rows → bass, top rows → mids
            const binIdx = Math.floor((1 - row / Math.max(1, gridRows - 1)) * Math.min(audioFreqData.length - 1, 80));
            const amp = audioFreqData[binIdx] / 255; // 0 → 1
            // Alternating shift direction creates a "torn bands" aesthetic
            const dir = Math.sin(row * 0.8) >= 0 ? 1 : -1;
            const maxShift = 4 + amp * 20 + audioRms * 14;
            const shift = Math.round(dir * amp * maxShift);
            const srcCol = Math.max(0, Math.min(gridCols - 1, col + shift));
            return { srcCol, srcRow: row, override: null };
        }
        return { srcCol: col, srcRow: row, override: null };
    }

    return { srcCol: col, srcRow: row, override: null };
}

function processFrame(now) {
    if (state !== 'PLAYING' || video.paused || video.ended) return;

    frameParity = 1 - frameParity;
    updateAudioEnergy(now);
    updateAudioLevelBar();
    updateCorrupt(now);
    tickAutoRipple(now);
    tickBeatstrike(now);
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
        if (AUDIO_REACTIVE_FX.has(effectiveFx())) initAudioAnalyser();
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
            if (AUDIO_REACTIVE_FX.has(effectiveFx())) initAudioAnalyser();
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
    const sizeMul  = fxParams['ripple-size']  ?? 1.0;
    const speedMul = fxParams['ripple-speed'] ?? 1.0;
    fireRippleAt(col, row, performance.now(), {
        width: 1.8 * sizeMul,
        speed: 0.12 * speedMul,
        duration: 500,
    });
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
    })
    .catch((err) => {
        statusEl.textContent = err.message;
        statusEl.style.color = '#ff0000';
    });
