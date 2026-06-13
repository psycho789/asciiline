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
const fxPanelCompat = document.getElementById('fx-panel-compat');
const fxResetBtn = document.getElementById('fx-reset-btn');
const trackPrevBtn = document.getElementById('track-prev');
const trackNextBtn = document.getElementById('track-next');
const transportPlayBtn = document.getElementById('transport-play');
const seekSlider = document.getElementById('seek-slider');
const timeCurrentEl = document.getElementById('time-current');
const timeDurationEl = document.getElementById('time-duration');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const fxPanelEmpty = document.getElementById('fx-panel-empty');
const demoToggleBtn = document.getElementById('demo-toggle');
const studioAudioControls = document.getElementById('studio-audio-controls');
const studioRenderControls = document.getElementById('studio-render-controls');
const catFilterEl = document.getElementById('fx-cat-filter');
const volLabel = document.getElementById('vol-label');

const {
    buildGlyphAtlas,
    buildRotationAtlas,
    compositeColorAsciiFrame,
    compositeTriglyphFrame,
    compositeRotatedAsciiFrame,
} = window.AsciilineGlyphAtlas;

const textDecoder = new TextDecoder();
const RESONATE_TRIGLYPH_THRESHOLD = 0.25;

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

/** Default ASCII grid width — same as `stream_server.py --cols 320`. */
const DEFAULT_ASCII_COLS = 320;
const DEFAULT_PIXEL_COLS = 520;

const GRID_COLS_STORAGE = {
    ascii: 'asciiline-ascii-cols',
    pixel: 'asciiline-pixel-cols',
};

const GRID_COLS_LIMITS = {
    ascii: { min: 120, max: 450, step: 10 },
    pixel: { min: 200, max: 900, step: 10 },
};

let gridColsSliderEl = null;
let gridColsValEl = null;

const BRAILLE_LUT = (() => {
    const dots = [0x00, 0x01, 0x05, 0x0d, 0x1f, 0x3d, 0x7b, 0xff];
    return dots.map((d) => String.fromCharCode(0x2800 + d));
})();

/** Global audio tuning — always visible in the control pane. */
const GLOBAL_AUDIO_CONTROLS = [
    { id: 'audio-bass-eq', label: 'Bass', min: -12, max: 12, step: 1, def: 4, unit: 'dB' },
    { id: 'audio-treble-eq', label: 'Treble', min: -12, max: 12, step: 1, def: 0, unit: 'dB' },
    { id: 'audio-kick-sens', label: 'Kick', min: 0.0, max: 1.0, step: 0.05, def: 0.82 },
];

/** WAVEFORM “bass bump” profile — quick centered hit, no lingering shake. */
const SOUNDWAVE_BUMP_IDS = [
    'wave-amplitude', 'wave-shimmer', 'wave-burst', 'wave-bass-drive', 'wave-bounce',
];

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
            { id: 'corrupt-intensity', label: 'How intense?', min: 0.3, max: 8.0, step: 0.1, def: 1.0 },
            { id: 'corrupt-size',      label: 'Zone size',    min: 0.3, max: 5.0, step: 0.1, def: 1.0 },
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
            { id: 'phosphor-trail', label: 'Trail length', min: 0.30, max: 0.99, step: 0.01, def: 0.78 },
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
            { id: 'ripple-size',  label: 'Wave size',  min: 0.5, max: 7.0, step: 0.1, def: 1.0 },
            { id: 'ripple-speed', label: 'Wave speed', min: 0.4, max: 5.0, step: 0.1, def: 1.0 },
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
        controls: [
            { id: 'resonate-drive', label: 'Audio drive', min: 0.3, max: 6.0, step: 0.1, def: 1.0 },
        ],
        css: 'fx-resonate',
        asciiOnly: true,
        pixelOk: true,
        interactive: true,
    },
    soundwave: {
        label: 'WAVEFORM',
        tip: 'Bass bump warp',
        hint: 'Quick centered punch on kicks — turn volume up. Open Advanced to widen or smooth it out.',
        fullDesc: 'The audio waveform physically bends the image — each column shifts up or down based on the sound at that exact moment. Turn volume up, then use Warp strength, Shimmer, and Beat burst to dial in smooth waves vs hard rap-style bass blips.',
        action: 'Turn volume up — bass hits bump the center of the frame.',
        controls: [
            { id: 'wave-amplitude', label: 'Warp strength', min: 0.5, max: 18.0, step: 0.1, def: 3.5 },
            { id: 'wave-shimmer',  label: 'Shimmer',       min: 0.0, max: 6.0, step: 0.1, def: 0.0 },
            { id: 'wave-burst',    label: 'Beat burst',    min: 0.0, max: 1.0, step: 0.05, def: 1.0 },
        ],
        advancedControls: [
            { id: 'wave-bass-drive', label: 'Sub bass hit', min: 0.0, max: 1.0, step: 0.05, def: 0.9 },
            { id: 'wave-bounce',     label: 'Bounce hang',  min: 0.0, max: 1.0, step: 0.05, def: 0.12 },
        ],
        css: 'fx-soundwave',
        asciiOnly: true,
        interactive: true,
    },
    beatstrike: {
        label: 'BEATFIRE',
        tip: 'Beat-triggered ripples',
        hint: 'Each detected beat fires a ripple scaled to its intensity — light taps, massive drops all look different.',
        fullDesc: 'Every detected beat fires a ripple wave. Light taps send small rings; hard hits launch double novas; massive bass drops blast multi-ring explosions outward. Use Beat power to scale how big each hit looks.',
        action: 'Turn volume up — every beat launches a ripple wave.',
        audioLevel: true,
        controls: [
            { id: 'beat-power', label: 'Beat power', min: 0.3, max: 6.0, step: 0.1, def: 1.2 },
        ],
        advancedControls: [],
        css: 'fx-beatstrike fx-ripple',
        asciiOnly: true,
        interactive: true,
    },
    spectra: {
        label: 'SPECTRA',
        tip: 'Frequency-band distortion',
        hint: 'Each horizontal band maps to a frequency — bass rows tear on kicks, mids shift on snares.',
        fullDesc: 'Each horizontal strip of the image is tied to a specific frequency range. Bass rows tear on kicks, mids shift on snares. Use Band tear to control how far each frequency band rips sideways.',
        action: 'Turn volume up — different instruments distort different parts of the image.',
        audioLevel: true,
        controls: [
            { id: 'spectra-tear', label: 'Band tear', min: 0.3, max: 7.0, step: 0.1, def: 1.3 },
        ],
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
            { id: 'ghost-chaos', label: 'Chaos level', min: 0.3, max: 6.0, step: 0.1, def: 1.0 },
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
            { id: 'hole-gravity', label: 'Gravity strength', min: 0.3, max: 6.0, step: 0.1, def: 1.0 },
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
            { id: 'melt-speed', label: 'Drip speed', min: 0.3, max: 5.0, step: 0.1, def: 1.0 },
        ],
        css: 'fx-melt',
        asciiOnly: true,
    },
    haze: {
        label: 'HAZE', tip: 'Soft Gaussian blur',
        hint: 'The entire canvas is softened — detail dissolves into atmosphere.',
        fullDesc: 'The entire canvas is softened with a Gaussian blur — fine detail dissolves into hazy atmosphere while brightness lifts slightly.',
        css: 'fx-haze', asciiOnly: false, pixelOk: true,
    },
    spectrum: {
        label: 'SPECTRUM', tip: 'Infinite color cycle',
        hint: 'The full color spectrum rotates across the canvas continuously.',
        fullDesc: 'The full color spectrum rotates across the canvas continuously — an infinite hue spin that turns the video into a living rainbow transmission.',
        css: 'fx-spectrum', asciiOnly: false, pixelOk: true,
    },
    punch: {
        label: 'PUNCH', tip: 'Cinematic contrast',
        hint: 'Hard contrast crush — blacks go deep, highlights pop.',
        fullDesc: 'Hard contrast crush — blacks go deep, highlights pop. A cinematic grade that makes every frame feel like a blockbuster trailer.',
        css: 'fx-punch', asciiOnly: false, pixelOk: true,
    },
    invert: {
        label: 'INVERT', tip: 'Negative exposure',
        hint: 'Full color inversion — a photographic negative of the video.',
        fullDesc: 'Full color inversion — the video becomes a photographic negative, with hue rotated back so skin tones stay alien but readable.',
        css: 'fx-invert', asciiOnly: false, pixelOk: true,
    },
    aura: {
        label: 'AURA', tip: 'Neon drop-shadow',
        hint: 'Every bright edge bleeds cyan neon light into the dark.',
        fullDesc: 'Every bright edge bleeds cyan neon light into the dark — the image radiates like a backlit holographic sign.',
        css: 'fx-aura', asciiOnly: false, pixelOk: true,
    },
    chrome: {
        label: 'CHROME', tip: 'Tinted monochrome drift',
        hint: 'Full desaturation to sepia, then hue slowly drifts through every color.',
        fullDesc: 'Full desaturation to sepia, then hue slowly drifts through every color — a chrome-plated transmission that never stops shifting tint.',
        css: 'fx-chrome', asciiOnly: false, pixelOk: true,
    },
    neon: {
        label: 'NEON', tip: 'Character glow halo',
        hint: 'Every character radiates cyan neon — invisible text, visible light.',
        fullDesc: 'Every character radiates cyan neon — the text layer is invisible but the glow halo floats over the canvas like a sign in the dark.',
        css: 'fx-neon', asciiOnly: true,
    },
    screen: {
        label: 'SCREEN', tip: 'Screen blend with page',
        hint: 'Dark areas become transparent — the player bleeds into the page behind it.',
        fullDesc: 'Dark areas become transparent — the player screen-blends into the page behind it, bleeding the video into the blog layout.',
        css: 'fx-screen', asciiOnly: false, pixelOk: true,
    },
    glass: {
        label: 'GLASS', tip: 'Frosted glass backdrop',
        hint: 'The player background frosted — page content beneath blurs and saturates.',
        fullDesc: 'The player background becomes frosted glass — page content beneath blurs and saturates through a semi-transparent panel.',
        css: 'fx-glass', asciiOnly: false, pixelOk: true,
    },
    shred: {
        label: 'SHRED', tip: 'Frame tears and drifts',
        hint: 'The clip boundary warps and twists — the image tears at its own edges.',
        fullDesc: 'The clip boundary warps and twists on a loop — the image tears at its own edges like paper caught in a shredder.',
        css: 'fx-shred', asciiOnly: false, pixelOk: true,
    },
    lens: {
        label: 'LENS', tip: 'Barrel fisheye',
        hint: 'The grid warps through a virtual lens — center magnified, edges compressed.',
        fullDesc: 'The character grid warps through a virtual barrel lens — center magnified, edges compressed into a fisheye bulge.',
        controls: [
            { id: 'lens-strength', label: 'Barrel strength', min: 0.15, max: 1.8, step: 0.05, def: 0.45 },
        ],
        css: 'fx-lens', asciiOnly: true,
    },
    swirl: {
        label: 'SWIRL', tip: 'Space spirals inward',
        hint: 'Distance from center determines twist angle — the image funnels into a vortex.',
        fullDesc: 'Distance from center determines twist angle — the image funnels into a slowly rotating vortex.',
        controls: [
            { id: 'swirl-twist', label: 'Twist amount', min: 0.3, max: 5.0, step: 0.1, def: 1.0 },
        ],
        css: 'fx-swirl', asciiOnly: true,
    },
    fold: {
        label: 'FOLD', tip: '4-way mirror fold',
        hint: 'The frame folds into quadrant symmetry — one corner tiled four times.',
        fullDesc: 'The frame folds into quadrant symmetry — one corner of the image is mirrored four ways like a kaleidoscope.',
        css: 'fx-fold', asciiOnly: true, pixelOk: true,
    },
    radar: {
        label: 'RADAR', tip: 'Polar coordinate wrap',
        hint: 'Columns become angles, rows become radius — the image curls into rings.',
        fullDesc: 'Columns become angles and rows become radius — the flat image curls into concentric radar rings.',
        css: 'fx-radar', asciiOnly: true,
    },
    decay: {
        label: 'DECAY', tip: 'Chars burn out slowly',
        hint: 'Dense chars persist after the video moves on — a slow typographic afterburn.',
        fullDesc: 'Dense characters persist after the video moves on — a slow typographic afterburn where bright glyphs linger and fade like phosphor ash.',
        css: 'fx-decay', asciiOnly: true,
    },
    prism: {
        label: 'PRISM', tip: 'Gradient floods the text',
        hint: 'A single scrolling spectrum gradient fills every character — the image lives in color bands.',
        fullDesc: 'A single scrolling spectrum gradient fills every character — the image lives in sweeping color bands independent of source pixel color.',
        css: 'fx-prism', asciiOnly: true,
    },
    rotwave: {
        label: 'VORTEX', tip: 'Wave rotates each char',
        hint: 'A sine wave sweeps rotation across the grid — characters tilt and right themselves as the wave passes.',
        fullDesc: 'A sine wave sweeps rotation across the grid — characters tilt and right themselves as the wave passes through the field.',
        css: 'fx-rotwave', asciiOnly: true,
    },
    orbit: {
        label: 'ORBIT', tip: 'Characters spin outward',
        hint: 'Each char rotates based on distance and direction from center — the image feels alive.',
        fullDesc: 'Each character rotates based on distance and direction from center — the whole image feels like it is slowly spinning alive.',
        css: 'fx-orbit', asciiOnly: true,
    },
    plasma: {
        label: 'PLASMA', tip: 'Fluid smoke distortion',
        hint: 'SVG feTurbulence warps every pixel of the canvas — the image dissolves into fluid smoke.',
        fullDesc: 'SVG feTurbulence warps every pixel of the canvas — the image dissolves into fluid smoke that never repeats the same pattern twice.',
        css: 'fx-plasma', asciiOnly: false, pixelOk: true,
    },
    bloom: {
        label: 'BLOOM', tip: 'Luminance bleeds outward',
        hint: 'Bright regions bloom — screen-blended Gaussian blur adds light-bleed to every hot pixel.',
        fullDesc: 'Bright regions bloom outward — screen-blended Gaussian blur adds light-bleed to every hot pixel like an overexposed photograph.',
        css: 'fx-bloom', asciiOnly: false, pixelOk: true,
    },
    tilt3d: {
        label: '3D TILT', tip: 'Holographic mouse tilt',
        hint: 'Move the mouse over the player — perspective transforms track your position like a hologram.',
        fullDesc: 'Move the mouse over the player — perspective transforms track your position like a holographic card tilting in 3D space.',
        action: 'Move the mouse over the video to tilt the view.',
        css: 'fx-tilt3d', asciiOnly: false, pixelOk: true, interactive: true,
    },
    'pulse-clip': {
        label: 'PULSE', tip: 'Audio-driven window',
        hint: 'The frame clips to an ellipse that breathes with the audio — loud moments expand the view.',
        fullDesc: 'The frame clips to an ellipse that breathes with the audio — loud moments expand the visible window, silence shrinks it to a tight portal.',
        action: 'Turn volume up. The window grows and shrinks with sound.',
        audioLevel: true,
        controls: [
            { id: 'pulse-breath', label: 'Breath amount', min: 0.3, max: 6.0, step: 0.1, def: 1.3 },
        ],
        css: 'fx-pulse-clip', asciiOnly: false, pixelOk: true, interactive: true,
    },
    edge: {
        label: 'EDGES', tip: 'Sobel edge detection',
        hint: 'Sobel kernel extracts every edge — the video becomes a moving line-art drawing.',
        fullDesc: 'Sobel edge detection extracts every contour — the video becomes a moving line-art drawing traced in source colors.',
        css: 'fx-edge', pixelOnly: true,
    },
    relief: {
        label: 'RELIEF', tip: 'Directional emboss',
        hint: 'Pixel differences from northwest become depth — the video gains a 3D relief texture.',
        fullDesc: 'Pixel differences from northwest lighting become depth — the video gains a 3D embossed relief texture.',
        css: 'fx-relief', pixelOnly: true,
    },
    crisp: {
        label: 'CRISP', tip: 'Unsharp mask clarity',
        hint: 'High-frequency sharpening kernel — every edge snaps, texture becomes razor detail.',
        fullDesc: 'High-frequency sharpening kernel — every edge snaps and texture becomes razor-sharp detail.',
        css: 'fx-crisp', pixelOnly: true,
    },
    retro: {
        label: 'RETRO', tip: 'Bayer ordered dither',
        hint: '4×4 Bayer matrix reduces color depth — the video becomes a retro 4-level display.',
        fullDesc: 'A 4×4 Bayer matrix reduces color depth — the video becomes a retro four-level display like an old LCD.',
        css: 'fx-retro', pixelOnly: true,
    },
    dots: {
        label: 'DOTS', tip: 'Colored halftone circles',
        hint: 'Each pixel becomes a colored dot sized to its brightness — a moving magazine halftone.',
        fullDesc: 'Each pixel becomes a colored dot sized to its brightness — a moving magazine halftone printed in full color.',
        css: 'fx-dots', pixelOnly: true,
    },
    echo: {
        label: 'ECHO', tip: 'Double exposure echo',
        hint: 'Two exposures of the same frame at different scales composite on screen blend.',
        fullDesc: 'Two exposures of the same frame at different scales composite together — a pulsing double-exposure echo.',
        css: 'fx-echo', pixelOnly: true,
    },
    film: {
        label: 'FILM', tip: 'Analog film grain',
        hint: 'Per-pixel luminance noise — silver halide grain on every frame.',
        fullDesc: 'Per-pixel luminance noise on every frame — silver halide grain like analog film stock.',
        css: 'fx-film', pixelOnly: true,
    },
    roll: {
        label: 'ROLL', tip: 'Frame rolls on its axis',
        hint: 'The frame rocks back and forth on a slow sinusoidal tilt — analog warp instability.',
        fullDesc: 'The frame rocks back and forth on a slow sinusoidal tilt — analog warp instability like a loose projector gate.',
        css: 'fx-roll', pixelOnly: true,
    },
};

/** Preset groups — coolest categories first; `clean` is reset-only, not listed here. */
const FX_CATEGORIES = [
    {
        id: 'sound',
        label: 'Sound',
        presets: ['resonate', 'soundwave', 'beatstrike', 'spectra', 'pulse-clip'],
    },
    {
        id: 'chaos',
        label: 'Chaos',
        presets: ['auto-ripple', 'corrupt', 'rend', 'hole', 'melt', 'ripple', 'shred'],
    },
    {
        id: 'typo',
        label: 'Typo',
        presets: ['triglyph', 'braille', 'duotone', 'typewriter', 'font-morph', 'selection', 'neon', 'prism', 'decay'],
    },
    {
        id: 'warp',
        label: 'Warp',
        presets: ['lens', 'swirl', 'fold', 'radar', 'orbit', 'rotwave', 'tilt3d', 'echo', 'roll'],
    },
    {
        id: 'crt',
        label: 'CRT',
        presets: ['phosphor', 'interlace', 'broadcast', 'thermal', 'retro', 'dots', 'film'],
    },
    {
        id: 'color',
        label: 'Color',
        presets: ['spectrum', 'punch', 'invert', 'aura', 'chrome', 'haze', 'plasma', 'bloom', 'screen', 'glass', 'edge', 'relief', 'crisp'],
    },
];

const FX_COMPAT_LABEL = { ascii: 'A', pixel: 'P', both: '✦' };
const FX_COMPAT_TITLE = {
    ascii: 'ASCII mode only',
    pixel: 'Pixel mode only',
    both: 'Works in ASCII and Pixel',
};

function fxCompatKind(preset) {
    if (preset.pixelOnly) return 'pixel';
    if (preset.asciiOnly && !preset.pixelOk) return 'ascii';
    return 'both';
}

function setCompatMark(el, kind) {
    if (!el) return;
    el.dataset.compat = kind;
    el.textContent = FX_COMPAT_LABEL[kind];
    el.title = FX_COMPAT_TITLE[kind];
    el.hidden = false;
}

function hideCompatMark(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
    delete el.dataset.compat;
}

function saveCategoryFilter() {
    sessionStorage.setItem(CAT_FILTER_KEY, categoryFilterMode);
}

function isCategoryVisible(catId) {
    if (categoryFilterMode === 'all') return true;
    if (categoryFilterMode === 'none') return false;
    return categoryFilterMode === catId;
}

function updateCategoryFilterUI() {
    if (catFilterEl) {
        catFilterEl.querySelectorAll('.fx-cat-pill').forEach((pill) => {
            const cat = pill.dataset.cat;
            pill.classList.toggle('active', cat === categoryFilterMode);
            pill.setAttribute('aria-pressed', String(cat === categoryFilterMode));
        });
    }
    if (fxPicker) {
        fxPicker.querySelectorAll('.fx-category').forEach((section) => {
            section.hidden = !isCategoryVisible(section.dataset.category);
        });
    }
}

function getVisiblePresetIds() {
    const ids = [];
    for (const cat of FX_CATEGORIES) {
        if (!isCategoryVisible(cat.id)) continue;
        for (const id of cat.presets) {
            if (FX_PRESETS[id]) ids.push(id);
        }
    }
    return ids;
}

function updateHudLookLabel() {
    const hudLabel = document.getElementById('hud-look-label');
    if (!hudLabel) return;
    const name = activeFx === 'clean' ? 'CLEAN' : (FX_PRESETS[activeFx]?.label || 'CLEAN');
    hudLabel.textContent = demoEnabled ? `DEMO · ${name}` : name;
    hudLabel.classList.toggle('demo-active', demoEnabled);
}

function stopDemoMode() {
    if (demoIntervalId) {
        clearInterval(demoIntervalId);
        demoIntervalId = null;
    }
    demoEnabled = false;
    if (demoToggleBtn) {
        demoToggleBtn.classList.remove('active');
        demoToggleBtn.setAttribute('aria-pressed', 'false');
    }
    updateHudLookLabel();
}

function advanceDemoPreset() {
    const ids = getVisiblePresetIds();
    if (!ids.length) return;
    const idx = ids.indexOf(activeFx);
    const next = ids[(idx + 1) % ids.length];
    applyFx(next, { fromDemo: true });
}

function startDemoMode() {
    stopDemoMode();
    const ids = getVisiblePresetIds();
    if (!ids.length) return;
    demoEnabled = true;
    if (demoToggleBtn) {
        demoToggleBtn.classList.add('active');
        demoToggleBtn.setAttribute('aria-pressed', 'true');
    }
    if (!ids.includes(activeFx)) applyFx(ids[0], { fromDemo: true });
    else updateHudLookLabel();
    demoIntervalId = setInterval(advanceDemoPreset, DEMO_MS);
}

function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function isPlaybackActive() {
    return state === 'PLAYING' || state === 'PAUSED';
}

function updateTransportUI() {
    if (!transportPlayBtn) return;
    const active = isPlaybackActive();
    transportPlayBtn.hidden = !active;
    const playing = state === 'PLAYING' && !video.paused;
    transportPlayBtn.textContent = playing ? '\u23F8' : '\u25B6';
    transportPlayBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (seekSlider) {
        const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
        seekSlider.disabled = !active || !hasDuration;
        if (hasDuration && !seekDragging) {
            seekSlider.value = String(Math.round((video.currentTime / video.duration) * 1000));
        }
    }
    if (timeCurrentEl) timeCurrentEl.textContent = formatTime(video.currentTime);
    if (timeDurationEl) timeDurationEl.textContent = formatTime(video.duration);
}

function pausePlayback() {
    if (state !== 'PLAYING') return;
    video.pause();
    state = 'PAUSED';
    lastMediaTime = -1;
    lastFpsMediaSample = -1;
    cancelFrameLoop();
    updateTransportUI();
}

function resumePlayback() {
    if (state !== 'PAUSED') return;
    video.play().then(async () => {
        state = 'PLAYING';
        initAudioAnalyser();
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        startFrameLoop();
        updateTransportUI();
    }).catch(() => {});
}

function togglePlayback() {
    if (state === 'IDLE') {
        startStream();
        return;
    }
    if (state === 'PLAYING') pausePlayback();
    else if (state === 'PAUSED') resumePlayback();
}

// Populate fxParams defaults from FX_PRESETS + global audio controls
const fxParams = {};
const CONTROL_DEFS = {};
for (const ctrl of GLOBAL_AUDIO_CONTROLS) {
    fxParams[ctrl.id] = ctrl.def;
    CONTROL_DEFS[ctrl.id] = ctrl;
}
for (const preset of Object.values(FX_PRESETS)) {
    for (const list of [preset.controls, preset.advancedControls]) {
        if (!list) continue;
        for (const ctrl of list) {
            fxParams[ctrl.id] = ctrl.def;
            CONTROL_DEFS[ctrl.id] = ctrl;
        }
    }
}

function fxParam(id, def = 1) {
    const raw = fxParams[id] ?? def;
    const ctrl = CONTROL_DEFS[id];
    if (!ctrl) return raw;
    const span = ctrl.max - ctrl.min;
    if (span <= 0) return raw;
    const t = (raw - ctrl.min) / span;
    if (t <= 0.5) return raw;
    const boosted = Math.pow((t - 0.5) * 2, 0.45);
    return ctrl.min + span * (0.5 + boosted * 0.5);
}

const CAT_FILTER_KEY = 'asciiline-cat-filter';
const ALL_CATEGORY_IDS = FX_CATEGORIES.map((c) => c.id);

function loadCategoryFilterMode() {
    const raw = sessionStorage.getItem(CAT_FILTER_KEY);
    if (!raw) return 'all';
    if (raw === 'all' || raw === 'none') return raw;
    if (ALL_CATEGORY_IDS.includes(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            const valid = parsed.filter((id) => ALL_CATEGORY_IDS.includes(id));
            if (valid.length === 0) return 'none';
            if (valid.length === ALL_CATEGORY_IDS.length) return 'all';
            if (valid.length === 1) return valid[0];
            return 'all';
        }
    } catch {
        // legacy or invalid — default to all
    }
    return 'all';
}

let categoryFilterMode = loadCategoryFilterMode();

let demoIntervalId = null;
let demoEnabled = false;
const DEMO_MS = 8000;
let lastVolume = 1;
let seekDragging = false;

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
let selectionRowStride = 0;

let glyphAtlas = null;
let rotationAtlas = null;
let colorFrameImageData = null;
let cellViewBuffer = null;
let cellAngleBuffer = null;
let useRenderWorker =
    typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
let renderWorker = null;
let workerBusy = false;
let workerPendingFrame = null;
let workerBusySince = 0;

let frameCount = 0;
let lastFpsUpdate = 0;
let lastMediaTime = -1;
let lastRenderTs = 0;
let lastFpsMediaSample = -1;
let videoFrameRate = 24;
let rafHandle = 0;
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
let decayBuffer = null;

let audioCtx = null;
let analyser = null;
let audioSource = null;
let bassFilter = null;
let trebleFilter = null;
let audioEnergy = 0;    // bass energy 0-1 (backward compat)
let audioRms = 0;       // RMS volume 0-1
let audioBass = 0;      // low-freq energy 0-1
let audioSubBass = 0;   // sub/low kick band 0-1
let audioFreqData = null;  // Uint8Array frequency bins
let audioWaveform = null;  // Uint8Array time-domain samples
let audioBeat = false;     // true this frame if beat detected
let audioBeatHistory = null;
let audioBeatIdx = 0;
let waveBurstEnv = 0;      // decaying punch envelope for WAVEFORM burst mode
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
    if (!pixelMode && preset.pixelOnly) return false;
    if (!pixelMode) return true;
    return preset.pixelOk === true;
}

function effectiveFx() {
    if (!pixelMode && FX_PRESETS[activeFx]?.pixelOnly) return 'clean';
    if (pixelMode && FX_PRESETS[activeFx]?.asciiOnly && !FX_PRESETS[activeFx]?.pixelOk) return 'clean';
    return activeFx;
}

function fxUsesRippleEngine(fx) {
    return fx === 'ripple' || fx === 'auto-ripple' || fx === 'beatstrike' || fx === 'soundwave';
}

function applySoundwaveBumpDefaults() {
    for (const id of SOUNDWAVE_BUMP_IDS) {
        const ctrl = CONTROL_DEFS[id];
        if (ctrl) fxParams[id] = ctrl.def;
    }
    waveBurstEnv = 0;
}

function buildGlobalAudioBar() {
    if (!studioAudioControls) return;
    studioAudioControls.innerHTML = '';
    GLOBAL_AUDIO_CONTROLS.forEach((ctrl) => {
        appendFxControlRow(ctrl, studioAudioControls, { compact: true });
    });
}

function gridColsLimitsFor(pixel = preferPixel) {
    return GRID_COLS_LIMITS[pixel ? 'pixel' : 'ascii'];
}

function loadUserCols(pixel = preferPixel) {
    const key = GRID_COLS_STORAGE[pixel ? 'pixel' : 'ascii'];
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return null;
    const lim = gridColsLimitsFor(pixel);
    return Math.min(lim.max, Math.max(lim.min, n));
}

function saveUserCols(cols, pixel = preferPixel) {
    const key = GRID_COLS_STORAGE[pixel ? 'pixel' : 'ascii'];
    sessionStorage.setItem(key, String(cols));
}

function resolvePlaybackCols(configCols) {
    return loadUserCols(preferPixel) ?? configCols;
}

function formatGridSizeLabel(cols, rows) {
    return `${cols} × ${rows}`;
}

function updateGridColsBarLabel(cols, rows) {
    if (!gridColsValEl) return;
    if (rows != null) {
        gridColsValEl.textContent = formatGridSizeLabel(cols, rows);
        return;
    }
    if (video.videoWidth > 0 && video.videoHeight > 0) {
        const r = calcAutoRows(cols, video.videoWidth, video.videoHeight, preferPixel);
        gridColsValEl.textContent = formatGridSizeLabel(cols, r);
    } else {
        gridColsValEl.textContent = String(cols);
    }
}

function syncGridColsSlider() {
    if (!gridColsSliderEl) return;
    const lim = gridColsLimitsFor();
    const prefs = currentRenderPrefs();
    const cols = resolvePlaybackCols(prefs.cols);
    gridColsSliderEl.min = String(lim.min);
    gridColsSliderEl.max = String(lim.max);
    gridColsSliderEl.step = String(lim.step);
    gridColsSliderEl.value = String(cols);
    updateGridColsBarLabel(cols);
}

function rebuildGridIfPlaying() {
    if (state !== 'PLAYING' && state !== 'PAUSED') return;
    if (!video.videoWidth || !video.videoHeight) return;
    const prefs = currentRenderPrefs();
    const cols = resolvePlaybackCols(prefs.cols);
    const rows = calcAutoRows(cols, video.videoWidth, video.videoHeight, pixelMode);
    resetFxState();
    layoutPlayerContainer();
    buildCanvas(cols, rows);
    updateGridColsBarLabel(cols, rows);
}

function buildGridColsBar() {
    if (!studioRenderControls) return;
    studioRenderControls.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'fx-ctrl-row fx-ctrl-row-compact';

    const lbl = document.createElement('label');
    lbl.className = 'fx-ctrl-label';
    lbl.textContent = 'Cols';
    lbl.setAttribute('for', 'grid-cols-slider');

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'grid-cols-slider';
    slider.className = 'fx-ctrl-range';
    slider.setAttribute('aria-label', 'Grid columns — detail vs performance');

    const valDisplay = document.createElement('output');
    valDisplay.className = 'fx-ctrl-val grid-cols-val';
    valDisplay.id = 'grid-cols-val';
    valDisplay.setAttribute('for', 'grid-cols-slider');

    slider.addEventListener('input', () => {
        stopDemoMode();
        const cols = parseInt(slider.value, 10);
        saveUserCols(cols);
        updateGridColsBarLabel(cols);
        rebuildGridIfPlaying();
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(valDisplay);
    studioRenderControls.appendChild(row);

    gridColsSliderEl = slider;
    gridColsValEl = valDisplay;
    syncGridColsSlider();
}

function resetFxState() {
    removeTilt3d();
    container.style.clipPath = '';
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
        decayBuffer = new Float32Array(n);
    }
    if (trailCanvas && trailCtx) {
        trailCtx.fillStyle = '#050505';
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
}

function applyFx(id, { cycleFont = false, fromDemo = false } = {}) {
    if (!FX_PRESETS[id]) return;
    if (!fromDemo) stopDemoMode();

    if (pixelMode && FX_PRESETS[id].asciiOnly && !FX_PRESETS[id].pixelOk) {
        flashCopyStatus('This LOOK preset is ASCII-only — switch to ASCII mode');
        return;
    }

    if (!pixelMode && FX_PRESETS[id].pixelOnly) {
        flashCopyStatus('This LOOK preset is PIXEL-only — switch to PIXEL mode');
        return;
    }

    if (id === 'font-morph' && activeFx === 'font-morph' && cycleFont) {
        fontMorphIndex = (fontMorphIndex + 1) % FONT_STACK.length;
        sessionStorage.setItem('asciiline-font-idx', String(fontMorphIndex));
        if (state === 'PLAYING' && !pixelMode && gridCols > 0) {
            const rows = calcAutoRows(gridCols, video.videoWidth, video.videoHeight, false);
            buildCanvas(gridCols, rows);
        }
        updateFxPickerUI();
        return;
    }

    activeFx = id;
    sessionStorage.setItem('asciiline-fx', id);
    if (id === 'soundwave' && !fromDemo) applySoundwaveBumpDefaults();
    container.className = FX_PRESETS[id].css;
    resetFxState();
    updateFxPickerUI();

    if (state === 'PLAYING') initAudioAnalyser();
    if (id === 'tilt3d') initTilt3d();
    else removeTilt3d();
    if (id === 'hole') initHole();
    if (id === 'rend') initRend();
    if (id === 'melt') initMelt();

    if (id === 'font-morph' && state === 'PLAYING' && !pixelMode && gridCols > 0) {
        const rows = calcAutoRows(gridCols, video.videoWidth, video.videoHeight, false);
        buildCanvas(gridCols, rows);
    }

    buildFxPanel(activeFx);
}

function formatFxCtrlValue(ctrl, raw) {
    const n = parseFloat(raw);
    if (ctrl.unit === 'dB') {
        const sign = n > 0 ? '+' : '';
        return `${sign}${n} dB`;
    }
    return raw;
}

function appendFxControlRow(ctrl, container, { compact = false } = {}) {
    const row = document.createElement('div');
    row.className = 'fx-ctrl-row' + (compact ? ' fx-ctrl-row-compact' : '');

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
    valDisplay.textContent = formatFxCtrlValue(ctrl, slider.value);

    slider.addEventListener('input', () => {
        fxParams[ctrl.id] = parseFloat(slider.value);
        valDisplay.textContent = formatFxCtrlValue(ctrl, slider.value);
        if (ctrl.id === 'corrupt-intensity' || ctrl.id === 'corrupt-size') {
            nextCorruptAt = 0;
        }
        if (ctrl.id === 'audio-bass-eq' || ctrl.id === 'audio-treble-eq') {
            updateAudioEq();
        }
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(valDisplay);
    container.appendChild(row);
}

function buildFxPanel(id) {
    if (!fxPanelEl) return;
    const preset = FX_PRESETS[id] || FX_PRESETS.clean;
    const FONT_NAMES = ['Courier', 'VT323', 'IBM Plex Mono', 'Press Start 2P'];

    // Name + optional font badge
    let label = preset.label;
    if (id === 'font-morph') label = `${preset.label} · ${FONT_NAMES[fontMorphIndex]}`;
    if (fxPanelName) fxPanelName.textContent = label;

    if (id === 'clean') {
        hideCompatMark(fxPanelCompat);
    } else {
        setCompatMark(fxPanelCompat, fxCompatKind(preset));
    }

    if (fxResetBtn) {
        fxResetBtn.classList.toggle('active', id === 'clean');
    }

    // Mode mismatch note (only when selected preset can't run in current mode)
    if (fxPanelBadge) {
        const isAsciiOnly = pixelMode && preset.asciiOnly && !preset.pixelOk;
        const isPixelOnly = !pixelMode && preset.pixelOnly;
        fxPanelBadge.textContent = isAsciiOnly
            ? 'Switch to ASCII to use this'
            : isPixelOnly
                ? 'Switch to Pixel to use this'
                : '';
        fxPanelBadge.hidden = !isAsciiOnly && !isPixelOnly;
    }

    // Description — short hint when sliders are shown so controls + Advanced fit
    if (fxPanelDesc) {
        let body = preset.fullDesc || preset.hint || preset.tip || '';
        if (id !== 'clean' && (preset.controls?.length || preset.advancedControls?.length)) {
            body = preset.hint || preset.tip || body;
        }
        if (id !== 'clean' && pixelMode && preset.asciiOnly && !preset.pixelOk) {
            body = 'This effect needs the ASCII character grid. Switch to ASCII mode in the panel header.';
        } else if (id !== 'clean' && !pixelMode && preset.pixelOnly) {
            body = 'This effect needs Pixel mode. Switch to Pixel in the panel header.';
        }
        fxPanelDesc.textContent = body;
    }

    // Action hint — slot always reserved in layout
    if (fxPanelAction) {
        const showAction = id !== 'clean' && preset.action && (!pixelMode || preset.pixelOk);
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
                if (state === 'PLAYING' && !pixelMode && gridCols > 0) {
                    const rows = calcAutoRows(gridCols, video.videoWidth, video.videoHeight, false);
                    buildCanvas(gridCols, rows);
                }
                buildFxPanel(activeFx);
            });
            row.appendChild(btn);
        });
        fxPanelControls.appendChild(row);

    } else if (preset.audioLevel) {
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
    }

    if (preset.advancedControls?.length) {
        const advanced = document.createElement('details');
        advanced.className = 'fx-advanced';
        const summary = document.createElement('summary');
        summary.textContent = preset.advancedLabel || 'Advanced — bass / EQ';
        advanced.appendChild(summary);
        const inner = document.createElement('div');
        inner.className = 'fx-advanced-inner';
        preset.advancedControls.forEach((ctrl) => appendFxControlRow(ctrl, inner, { compact: true }));
        advanced.appendChild(inner);
        fxPanelControls.appendChild(advanced);
    }

    if (preset.controls) {
        preset.controls.forEach((ctrl) => appendFxControlRow(ctrl, fxPanelControls));
    }

    const hasTunables = Boolean(
        preset.controls?.length || preset.advancedControls?.length
            || preset.fontButtons || preset.audioLevel,
    );
    if (fxPanelEmpty) {
        fxPanelEmpty.hidden = hasTunables;
    }
}

function updateAudioLevelBar() {
    const fill = document.getElementById('fx-audio-fill');
    if (!fill) return;
    const pct = Math.min(100, Math.round((audioRms || 0) * 400));
    fill.style.width = `${pct}%`;
}

function updateWaveformVis() {
    const canvas = document.getElementById('fx-waveform-canvas');
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 200;
    const cssH = canvas.clientHeight || 32;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }

    const vctx = canvas.getContext('2d');
    vctx.clearRect(0, 0, w, h);
    vctx.fillStyle = 'rgba(5, 5, 8, 0.55)';
    vctx.fillRect(0, 0, w, h);

    const midY = h * 0.5;
    vctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    vctx.lineWidth = 1;
    vctx.beginPath();
    vctx.moveTo(0, midY);
    vctx.lineTo(w, midY);
    vctx.stroke();

    const live = analyser && state === 'PLAYING' && !video.paused && audioWaveform;
    if (!live) return;

    const n = audioWaveform.length;
    const step = w / n;
    vctx.beginPath();
    for (let i = 0; i < n; i++) {
        const x = i * step;
        const y = midY - ((audioWaveform[i] - 128) / 128) * (h * 0.42);
        if (i === 0) vctx.moveTo(x, y);
        else vctx.lineTo(x, y);
    }
    vctx.strokeStyle = 'rgba(0, 243, 255, 0.85)';
    vctx.lineWidth = Math.max(1, dpr);
    vctx.stroke();

    if (waveBurstEnv > 0.04 || (effectiveFx() === 'soundwave' && audioSubBass > 0.2)) {
        const burstAmt = Math.max(waveBurstEnv, audioSubBass * fxParam('wave-bass-drive', 0.9) * 0.65);
        const burstH = burstAmt * h * 0.9;
        const grad = vctx.createLinearGradient(0, midY - burstH, 0, midY + burstH);
        grad.addColorStop(0, `rgba(240, 160, 64, ${0.15 + burstAmt * 0.35})`);
        grad.addColorStop(0.5, `rgba(255, 90, 60, ${0.25 + burstAmt * 0.45})`);
        grad.addColorStop(1, `rgba(240, 160, 64, ${0.15 + burstAmt * 0.35})`);
        vctx.fillStyle = grad;
        vctx.fillRect(0, midY - burstH * 0.5, w, burstH);
    }

    if (audioBeat) {
        vctx.fillStyle = 'rgba(255, 120, 60, 0.9)';
        vctx.fillRect(w - 4 * dpr, 0, 3 * dpr, h);
    }
}

function updateFxPickerUI() {
    if (!fxPicker) return;
    let activeChip = null;
    fxPicker.querySelectorAll('.fx-chip').forEach((btn) => {
        const id = btn.dataset.fx;
        const preset = FX_PRESETS[id];
        const on = id === activeFx;
        const needsAscii = pixelMode && preset?.asciiOnly && !preset?.pixelOk;
        const needsPixel = !pixelMode && preset?.pixelOnly;
        btn.classList.toggle('active', on);
        btn.disabled = false;
        if (needsAscii) {
            btn.dataset.switchHint = 'Switches to ASCII';
        } else if (needsPixel) {
            btn.dataset.switchHint = 'Switches to Pixel';
        } else {
            delete btn.dataset.switchHint;
        }
        btn.setAttribute('aria-selected', String(on));
        btn.setAttribute('aria-pressed', String(on));
        btn.tabIndex = on ? 0 : -1;
        if (on) activeChip = btn;
    });
    buildFxPanel(activeFx);
    updateHudLookLabel();
    if (activeChip) {
        activeChip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function createFxChip(id, preset) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fx-chip';
    btn.dataset.fx = id;
    if (preset.interactive) btn.dataset.interactive = 'true';
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-describedby', 'fx-panel');

    const compatEl = document.createElement('span');
    compatEl.className = 'fx-chip-compat';
    const kind = fxCompatKind(preset);
    setCompatMark(compatEl, kind);
    compatEl.setAttribute('aria-hidden', 'true');

    const nameEl = document.createElement('span');
    nameEl.className = 'fx-chip-name';
    nameEl.textContent = preset.label;

    const tipEl = document.createElement('span');
    tipEl.className = 'fx-chip-tip';
    tipEl.textContent = preset.tip;

    btn.appendChild(compatEl);
    btn.appendChild(nameEl);
    btn.appendChild(tipEl);

    btn.addEventListener('click', () => {
        const isAsciiOnly = preset.asciiOnly && !preset.pixelOk;
        const isPixelOnly = preset.pixelOnly;
        if (pixelMode && isAsciiOnly) {
            setPreferPixel(false, { reconnect: isPlaybackActive() });
            setTimeout(() => applyFx(id, { cycleFont: id === 'font-morph' && activeFx === 'font-morph' }), 50);
        } else if (!pixelMode && isPixelOnly) {
            setPreferPixel(true, { reconnect: isPlaybackActive() });
            setTimeout(() => applyFx(id, { cycleFont: id === 'font-morph' && activeFx === 'font-morph' }), 50);
        } else {
            applyFx(id, { cycleFont: id === 'font-morph' && activeFx === 'font-morph' });
        }
    });
    return btn;
}

function buildFxPicker() {
    if (!fxPicker) return;
    fxPicker.innerHTML = '';
    for (const cat of FX_CATEGORIES) {
        const section = document.createElement('div');
        section.className = 'fx-category';
        section.dataset.category = cat.id;

        const label = document.createElement('div');
        label.className = 'fx-category-label';
        label.textContent = cat.label;

        const grid = document.createElement('div');
        grid.className = 'fx-category-grid';

        for (const id of cat.presets) {
            const preset = FX_PRESETS[id];
            if (!preset) continue;
            grid.appendChild(createFxChip(id, preset));
        }

        section.appendChild(label);
        section.appendChild(grid);
        fxPicker.appendChild(section);
    }
    updateFxPickerUI();
    updateCategoryFilterUI();
}

function getActiveFont() {
    if (effectiveFx() === 'font-morph') return FONT_STACK[fontMorphIndex];
    return FONT_STACK[0];
}

function updateAudioEq() {
    if (!bassFilter || !trebleFilter) return;
    bassFilter.gain.value = fxParams['audio-bass-eq'] ?? 4;
    trebleFilter.gain.value = fxParams['audio-treble-eq'] ?? 0;
}

function ensureAudioAnalyser() {
    if (!audioCtx && state === 'PLAYING' && video) initAudioAnalyser();
}

function initAudioAnalyser() {
    if (audioCtx || !video) return;
    try {
        audioCtx = new AudioContext();
        audioSource = audioCtx.createMediaElementSource(video);
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 110;
        bassFilter.Q.value = 0.7;
        trebleFilter = audioCtx.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 3000;
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioSource.connect(bassFilter);
        bassFilter.connect(trebleFilter);
        trebleFilter.connect(analyser);
        analyser.connect(audioCtx.destination);
        updateAudioEq();
    } catch (_) {
        audioCtx = null;
        bassFilter = null;
        trebleFilter = null;
    }
}

const AUDIO_REACTIVE_FX = new Set(['resonate', 'soundwave', 'beatstrike', 'spectra', 'pulse-clip']);

function updateAudioEnergy(now) {
    const fx = effectiveFx();
    const playing = state === 'PLAYING' && !video.paused;
    if (playing) ensureAudioAnalyser();

    if (playing && analyser) {
        if (!audioFreqData || audioFreqData.length !== analyser.frequencyBinCount)
            audioFreqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(audioFreqData);

        if (!audioWaveform || audioWaveform.length !== analyser.fftSize)
            audioWaveform = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(audioWaveform);

        let bass = 0;
        for (let i = 0; i < 10; i++) bass += audioFreqData[i];
        audioBass = bass / (10 * 255);

        let sub = 0;
        for (let i = 0; i < 4; i++) sub += audioFreqData[i];
        audioSubBass = sub / (4 * 255);
        audioEnergy = audioBass;

        let rmsSum = 0;
        for (let i = 0; i < audioWaveform.length; i++) {
            const s = (audioWaveform[i] - 128) / 128;
            rmsSum += s * s;
        }
        audioRms = Math.sqrt(rmsSum / audioWaveform.length);

        const kickSens = fxParam('audio-kick-sens', 0.82);
        const bassDrive = fx === 'soundwave'
            ? fxParam('wave-bass-drive', 0.9) * (0.4 + kickSens * 0.6)
            : fx === 'beatstrike' ? kickSens : 0;
        const beatSignal = audioSubBass * (0.45 + bassDrive * 0.95)
            + audioBass * Math.max(0.15, 1 - bassDrive * 0.55);

        if (!audioBeatHistory) audioBeatHistory = new Float32Array(44);
        audioBeatHistory[audioBeatIdx] = beatSignal;
        audioBeatIdx = (audioBeatIdx + 1) % audioBeatHistory.length;
        let histAvg = 0;
        for (let i = 0; i < audioBeatHistory.length; i++) histAvg += audioBeatHistory[i];
        histAvg /= audioBeatHistory.length;
        const burstParam = fx === 'soundwave' ? fxParam('wave-burst', 1.0) : 0;
        const beatGap = fx === 'beatstrike'
            ? 170 - bassDrive * 85
            : 220 - burstParam * 100 - bassDrive * 40;
        const beatThresh = fx === 'beatstrike'
            ? 0.06 - bassDrive * 0.035
            : 0.1 - burstParam * 0.04 - bassDrive * 0.05;
        const beatRatio = fx === 'beatstrike'
            ? 1.18 - bassDrive * 0.28
            : 1.28 - burstParam * 0.18 - bassDrive * 0.22;
        audioBeat = beatSignal > histAvg * beatRatio
            && beatSignal > beatThresh
            && (now - lastBeatAt) > beatGap;
        if (audioBeat) lastBeatAt = now;

        if (fx === 'soundwave') {
            const bounce = fxParam('wave-bounce', 0.12);
            if (audioBeat) {
                const hit = 0.5 + audioSubBass * (0.35 + bassDrive * 0.4);
                waveBurstEnv = Math.min(1, hit);
            }
            const decay = bounce < 0.35
                ? 0.38 + bounce * 0.42
                : 0.72 + bounce * 0.22 - burstParam * 0.08;
            waveBurstEnv *= decay;
        } else {
            waveBurstEnv = 0;
        }
    } else {
        audioEnergy = 0;
        audioRms = 0;
        audioBass = 0;
        audioSubBass = 0;
        audioBeat = false;
        waveBurstEnv = 0;
    }

    updateWaveformVis();

    if (!playing || !analyser || !AUDIO_REACTIVE_FX.has(fx)) {
        container.classList.remove('fx-beat');
        return;
    }

    triglyphOffset = 2 + Math.floor(audioBass * 4 * fxParam('resonate-drive', 1.0));
    container.classList.toggle('fx-beat', audioBass > 0.55 && fx !== 'soundwave');

    if (fx === 'resonate' && audioBass > 0.65 * (1 / fxParam('resonate-drive', 1.0)) && now >= nextCorruptAt) {
        spawnCorruptZone();
        nextCorruptAt = now + 200;
    }
}

function spawnCorruptZone() {
    if (gridCols < 4 || gridRows < 4) return;
    const sz = fxParam('corrupt-size', 1.0);
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
    const maxZones = Math.round(10 + fxParam('corrupt-intensity', 1.0) * 4);
    corruptZones.push({ row0, row1: row0 + h - 1, col0, col1: col0 + w - 1, decay: 4, chars });
    if (corruptZones.length > maxZones) corruptZones.shift();
}

function updateCorrupt(now) {
    const fx = effectiveFx();
    if (fx !== 'corrupt' && fx !== 'broadcast' && fx !== 'resonate') return;

    if (fx === 'corrupt' && now >= nextCorruptAt) {
        spawnCorruptZone();
        const intensity = fxParam('corrupt-intensity', 1.0);
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
    if (!fxUsesRippleEngine(fx)) return charCode;
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
        const chaos = fxParam('ghost-chaos', 1.0);
        autoRippleNextAt = now + baseGap / chaos;
    }
}

function tickBeatstrike(now) {
    const fx = effectiveFx();
    if (fx !== 'beatstrike' || state !== 'PLAYING' || pixelMode) return;
    if (!audioBeat || gridCols === 0 || gridRows === 0) return;

    const power = fxParam('beat-power', 1.2);
    const durationScale = 1;
    const rC = () => 1 + Math.floor(Math.random() * (gridCols - 2));
    const rR = () => 1 + Math.floor(Math.random() * (gridRows - 2));
    const rCs = () => AUTO_RIPPLE_CHAR_SETS[Math.floor(Math.random() * AUTO_RIPPLE_CHAR_SETS.length)];

    if (audioBass > 0.72) {
        const oc = rC(), or_ = rR();
        for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * Math.PI * 2;
            fireRippleAt(
                oc + Math.cos(ang) * 10, or_ + Math.sin(ang) * 5, now,
                { speed: (0.12 + audioBass * 0.20) * power, duration: 750 * power * durationScale,
                  width: (3.5 + audioBass * 3.0) * power, charSet: '\u2588\u2593\u2592\u2591' }
            );
        }
    } else if (audioBass > 0.44) {
        const c = rC(), r = rR();
        fireRippleAt(c, r, now,
            { speed: (0.10 + audioBass * 0.12) * power, duration: 650 * power * durationScale, width: (2.5 + audioBass * 2) * power, charSet: '#@!$%' });
        fireRippleAt(c, r, now + 110,
            { speed: (0.24 + audioBass * 0.08) * power, duration: 420 * power * durationScale, width: 1.8 * power, charSet: '~\\/-|' });
    } else {
        fireRippleAt(rC(), rR(), now, {
            speed: (0.08 + audioBass * 0.12) * power,
            duration: (380 + audioBass * 300) * power * durationScale,
            width: (1.2 + audioBass * 2.5) * power,
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

function pickFillRgb(r, g, b, gray) {
    const fx = effectiveFx();
    if (fx === 'thermal') {
        const idx = paletteIndex(gray);
        const t = idx / (PALETTE_LEN - 1);
        const ci = Math.min(THERMAL_COLORS.length - 1, Math.floor(t * THERMAL_COLORS.length));
        return hexToRgb(THERMAL_COLORS[ci]);
    }
    if (fx === 'broadcast') {
        const idx = paletteIndex(gray);
        if (idx > PALETTE_LEN * 0.65) return { r: 57, g: 255, b: 20 };
        const t = idx / (PALETTE_LEN - 1);
        const ci = Math.min(THERMAL_COLORS.length - 1, Math.floor(t * THERMAL_COLORS.length));
        return hexToRgb(THERMAL_COLORS[ci]);
    }
    if (fx === 'duotone') {
        if (gray > 128) return { r, g, b };
        return {
            r: Math.round(r * 0.25),
            g: Math.round(g * 0.25),
            b: Math.round(b * 0.25),
        };
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
    return { r: rr, g: gg, b: bb };
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function prismColorRgb(row, now) {
    const t = now * 0.0003;
    const gradY0 = canvas.height * (-0.3 + Math.sin(t) * 0.4);
    const gradY1 = canvas.height * (1.3 + Math.cos(t * 0.7) * 0.4);
    const py = yPos[row] + charHeight * 0.5;
    const span = gradY1 - gradY0;
    const frac = span === 0 ? 0 : Math.max(0, Math.min(1, (py - gradY0) / span));
    const stops = [
        { f: 0, rgb: [255, 0, 64] },
        { f: 0.2, rgb: [255, 140, 0] },
        { f: 0.45, rgb: [0, 243, 255] },
        { f: 0.7, rgb: [57, 255, 20] },
        { f: 1, rgb: [196, 0, 255] },
    ];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        if (frac >= a.f && frac <= b.f) {
            const t2 = (frac - a.f) / (b.f - a.f);
            return {
                r: Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t2),
                g: Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t2),
                b: Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t2),
            };
        }
    }
    const last = stops[stops.length - 1].rgb;
    return { r: last[0], g: last[1], b: last[2] };
}

function cellColorBytes(cell, row, _col, now) {
    if (effectiveFx() === 'prism') return prismColorRgb(row, now);
    const fx = effectiveFx();
    if (fx === 'hole' || fx === 'rend') return { r: cell.r, g: cell.g, b: cell.b };
    return pickFillRgb(cell.r, cell.g, cell.b, cell.gray);
}

function pickFillColor(r, g, b, gray) {
    const { r: rr, g: gg, b: bb } = pickFillRgb(r, g, b, gray);
    if (effectiveFx() === 'duotone' && gray <= 128) {
        return `rgba(${r},${g},${b},0.25)`;
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

    if (effectiveFx() === 'decay' && decayBuffer) {
        decayBuffer[cellIdx] = Math.max(gray, decayBuffer[cellIdx]);
        const effectiveGray = decayBuffer[cellIdx];
        decayBuffer[cellIdx] = Math.max(0, decayBuffer[cellIdx] - 1.5);
        return {
            charCode: pickCharFromGray(effectiveGray),
            r, g, b, gray,
        };
    }

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

    const trailBase = fxParam('phosphor-trail', 0.78);
    const drive = fx === 'resonate' ? fxParam('resonate-drive', 1.0) : 1;
    trailCtx.globalAlpha = fx === 'resonate' ? Math.min(0.97, trailBase + audioEnergy * 0.12 * drive) : trailBase;
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

const BAYER_4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function renderPixelFold() {
    ctx.save();
    ctx.translate(gridCols / 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, -gridCols / 2, 0, gridCols / 2, gridRows);
    ctx.restore();
    ctx.drawImage(video, 0, 0, gridCols / 2, gridRows);
}

function renderPixelEdge() {
    offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    const src = offCtx.getImageData(0, 0, gridCols, gridRows).data;
    const out = ctx.createImageData(gridCols, gridRows);
    const od = out.data;
    const gxK = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const gyK = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    for (let y = 1; y < gridRows - 1; y++) {
        for (let x = 1; x < gridCols - 1; x++) {
            let gx = 0;
            let gy = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const si = ((y + ky) * gridCols + (x + kx)) * 4;
                    const v = src[si] * 0.299 + src[si + 1] * 0.587 + src[si + 2] * 0.114;
                    gx += v * gxK[ky + 1][kx + 1];
                    gy += v * gyK[ky + 1][kx + 1];
                }
            }
            const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
            const oi = (y * gridCols + x) * 4;
            const ci = (y * gridCols + x) * 4;
            od[oi] = src[ci] * mag / 255;
            od[oi + 1] = src[ci + 1] * mag / 255;
            od[oi + 2] = src[ci + 2] * mag / 255;
            od[oi + 3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);
}

function renderPixelRelief() {
    offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    const src = offCtx.getImageData(0, 0, gridCols, gridRows).data;
    const out = ctx.createImageData(gridCols, gridRows);
    const od = out.data;
    const K = [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]];
    for (let y = 1; y < gridRows - 1; y++) {
        for (let x = 1; x < gridCols - 1; x++) {
            let sum = 128;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const si = ((y + ky) * gridCols + (x + kx)) * 4;
                    const v = src[si] * 0.299 + src[si + 1] * 0.587 + src[si + 2] * 0.114;
                    sum += v * K[ky + 1][kx + 1];
                }
            }
            const v = Math.max(0, Math.min(255, sum));
            const oi = (y * gridCols + x) * 4;
            od[oi] = od[oi + 1] = od[oi + 2] = v;
            od[oi + 3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);
}

function renderPixelCrisp() {
    offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    const src = offCtx.getImageData(0, 0, gridCols, gridRows).data;
    const out = ctx.createImageData(gridCols, gridRows);
    const od = out.data;
    const K = [[0, -1, 0], [-1, 5, -1], [0, -1, 0]];
    for (let y = 1; y < gridRows - 1; y++) {
        for (let x = 1; x < gridCols - 1; x++) {
            for (let ch = 0; ch < 3; ch++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const si = ((y + ky) * gridCols + (x + kx)) * 4 + ch;
                        sum += src[si] * K[ky + 1][kx + 1];
                    }
                }
                const oi = (y * gridCols + x) * 4 + ch;
                od[oi] = Math.max(0, Math.min(255, sum));
            }
            od[(y * gridCols + x) * 4 + 3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);
}

function renderPixelRetro() {
    offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    const { data } = offCtx.getImageData(0, 0, gridCols, gridRows);
    const out = ctx.createImageData(gridCols, gridRows);
    const od = out.data;
    const nLevels = 4;
    for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
            const i = (y * gridCols + x) * 4;
            const threshold = BAYER_4[y % 4][x % 4] / 16;
            const dither = (v) => {
                const norm = v / 255;
                return Math.min(255, Math.round(Math.floor(norm * nLevels + threshold) / nLevels * 255));
            };
            od[i] = dither(data[i]);
            od[i + 1] = dither(data[i + 1]);
            od[i + 2] = dither(data[i + 2]);
            od[i + 3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);
}

function renderPixelDots() {
    offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    const { data } = offCtx.getImageData(0, 0, gridCols, gridRows);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, gridCols, gridRows);
    for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
            const i = (y * gridCols + x) * 4;
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            const radius = (gray / 255) * 0.52;
            if (radius < 0.02) continue;
            ctx.beginPath();
            ctx.arc(x + 0.5, y + 0.5, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
            ctx.fill();
        }
    }
}

function renderPixelEcho() {
    const t = performance.now() * 0.0004;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, gridCols, gridRows);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65;
    ctx.drawImage(video, 0, 0, gridCols, gridRows);
    const zoom = 1.06 + Math.sin(t) * 0.03;
    const zw = gridCols * zoom;
    const zh = gridRows * zoom;
    const zx = (gridCols - zw) / 2;
    const zy = (gridRows - zh) / 2;
    ctx.globalAlpha = 0.38;
    ctx.filter = 'saturate(0.4) brightness(1.1)';
    ctx.drawImage(video, zx, zy, zw, zh);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

function renderPixelFilm() {
    ctx.drawImage(video, 0, 0, gridCols, gridRows);
    const imgData = ctx.getImageData(0, 0, gridCols, gridRows);
    const d = imgData.data;
    const amount = 28;
    for (let i = 0; i < d.length; i += 4) {
        const noise = (Math.random() - 0.5) * amount * 2;
        d[i] = Math.max(0, Math.min(255, d[i] + noise));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);
}

function renderPixelRoll() {
    const t = performance.now() * 0.00055;
    const angle = Math.sin(t) * 0.13;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, gridCols, gridRows);
    ctx.save();
    ctx.translate(gridCols / 2, gridRows / 2);
    ctx.rotate(angle);
    ctx.drawImage(video, -gridCols * 0.55, -gridRows * 0.55, gridCols * 1.1, gridRows * 1.1);
    ctx.restore();
}

function renderPixel(now) {
    const fx = effectiveFx();

    if (fx === 'triglyph' || (fx === 'resonate' && audioEnergy > RESONATE_TRIGLYPH_THRESHOLD)) {
        renderPixelTriglyph();
    } else if (fx === 'thermal') {
        renderPixelThermal();
    } else if (fx === 'interlace' || fx === 'broadcast') {
        if (fx === 'broadcast') renderPixelBroadcast();
        else renderPixelInterlace();
    } else if (fx === 'fold') {
        renderPixelFold();
    } else if (fx === 'edge') {
        renderPixelEdge();
    } else if (fx === 'relief') {
        renderPixelRelief();
    } else if (fx === 'crisp') {
        renderPixelCrisp();
    } else if (fx === 'retro') {
        renderPixelRetro();
    } else if (fx === 'dots') {
        renderPixelDots();
    } else if (fx === 'echo') {
        renderPixelEcho();
    } else if (fx === 'film') {
        renderPixelFilm();
    } else if (fx === 'roll') {
        renderPixelRoll();
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
    video.loop = true;
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
    if (!entry) {
        return preferPixel
            ? { mode: 5, cols: DEFAULT_PIXEL_COLS }
            : { mode: 3, cols: DEFAULT_ASCII_COLS };
    }
    return preferPixel
        ? (entry.pixel || { mode: 5, cols: DEFAULT_PIXEL_COLS })
        : (entry.ascii || { mode: 3, cols: DEFAULT_ASCII_COLS });
}

function calcAutoRows(cols, vidW, vidH, isPixel) {
    if (!vidW || !vidH) return Math.max(1, Math.round(cols * 9 / 16));
    const ratio = vidW / Math.max(vidH, 1);
    if (isPixel) return Math.max(1, Math.round(cols / ratio));
    // Match use_cases/video_geometry.py — ASCII chars ~2× taller than wide.
    return Math.max(1, Math.round(cols / ratio / 2));
}

function fitBoxAspect(boxW, boxH, contentAspectWOverH) {
    if (boxW <= 0 || boxH <= 0) return { w: 0, h: 0 };
    let w = boxW;
    let h = w / contentAspectWOverH;
    if (h > boxH) {
        h = boxH;
        w = h * contentAspectWOverH;
    }
    return { w, h };
}

function layoutPlayerContainer() {
    const deck = container?.parentElement;
    if (!deck) return;
    const vidW = video.videoWidth;
    const vidH = video.videoHeight;
    const ar = vidW > 0 && vidH > 0 ? vidW / vidH : 16 / 9;
    const { w, h } = fitBoxAspect(deck.clientWidth, deck.clientHeight, ar);
    container.style.width = `${Math.max(1, Math.floor(w))}px`;
    container.style.height = `${Math.max(1, Math.floor(h))}px`;
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

function buildAtlasGlyphList() {
    const seen = new Set();
    const out = [];
    const add = (ch) => {
        if (!ch || seen.has(ch)) return;
        seen.add(ch);
        out.push(ch);
    };
    add(' ');
    for (const ch of PALETTE) add(ch);
    for (const ch of BRAILLE_LUT) add(ch);
    add(String.fromCharCode(BLOCK_CHAR));
    add(String.fromCharCode(DOT_CHAR));
    for (const ch of CORRUPT_CHARS) add(ch);
    for (const ch of WAVE_CHARS) add(ch);
    for (const set of AUTO_RIPPLE_CHAR_SETS) {
        for (const ch of set) add(ch);
    }
    return out;
}

function usesTriglyphPath(fx, now) {
    void now;
    return fx === 'triglyph'
        || (fx === 'resonate' && audioEnergy > RESONATE_TRIGLYPH_THRESHOLD);
}

function usesRotatedAsciiPath(fx) {
    return fx === 'rotwave' || fx === 'orbit';
}

function atlasPayload(atlas) {
    const payload = {
        pixels: atlas.pixels,
        width: atlas.width,
        height: atlas.height,
        cellW: atlas.cellW,
        cellH: atlas.cellH,
        atlasCols: atlas.atlasCols,
        glyphCount: atlas.glyphCount,
        charCodeToAtlasIndex: atlas.charCodeToAtlasIndex,
    };
    if (atlas.binW != null) {
        payload.binW = atlas.binW;
        payload.binH = atlas.binH;
        payload.rotationBins = atlas.rotationBins;
    }
    return payload;
}

function rebuildGlyphAtlas() {
    const font = getActiveFont();
    const glyphs = buildAtlasGlyphList();
    glyphAtlas = buildGlyphAtlas(charWidth, charHeight, font.css, glyphs);
    rotationAtlas = buildRotationAtlas(charWidth, charHeight, font.css, glyphs);
    colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    const cellCount = gridCols * gridRows;
    cellViewBuffer = new Uint8Array(cellCount * 4);
    cellAngleBuffer = new Float32Array(cellCount);
    syncWorkerInit();
}

function syncSelectionTransform() {
    if (pixelMode || !canvas.width || !canvas.height) return;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const fitScaleX = containerW / canvas.width;
    const fitScaleY = containerH / canvas.height;
    const fitScale = Math.min(fitScaleX, fitScaleY);
    const renderedW = canvas.width * fitScale;
    const renderedH = canvas.height * fitScale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;
    player.style.transformOrigin = 'top left';
    player.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${fitScale})`;
}

function updateSelectionLayer() {
    player.style.display = 'block';
    player.style.color = 'transparent';
    player.textContent = textDecoder.decode(selectionBuffer);
    lastFrameText = player.textContent;
}

function initRenderWorker() {
    if (!useRenderWorker || pixelMode || renderMode === 1) return;
    if (renderWorker) {
        renderWorker.terminate();
        renderWorker = null;
        workerBusy = false;
        workerPendingFrame = null;
    }
    try {
        renderWorker = new Worker('client/render_worker.js');
    } catch {
        useRenderWorker = false;
        renderWorker = null;
        return;
    }
    renderWorker.onmessage = (event) => {
        if (event.data.type !== 'frame') return;
        applyWorkerFrame(event.data);
        workerBusy = false;
        if (workerPendingFrame) {
            const pending = workerPendingFrame;
            workerPendingFrame = null;
            postFrameToWorker(pending.view, pending.mode, pending.angles);
        }
    };
    renderWorker.onerror = () => {
        renderWorker.terminate();
        renderWorker = null;
        useRenderWorker = false;
        workerBusy = false;
        if (workerPendingFrame) {
            const pending = workerPendingFrame;
            workerPendingFrame = null;
            dispatchAsciiFrame(pending.view, pending.mode);
        }
    };
    syncWorkerInit();
}

function syncWorkerInit() {
    if (!renderWorker || !glyphAtlas) return;
    renderWorker.postMessage({
        type: 'init',
        atlas: atlasPayload(glyphAtlas),
        rotationAtlas: rotationAtlas ? atlasPayload(rotationAtlas) : null,
        width: canvas.width,
        height: canvas.height,
        xPos,
        yPos,
    });
}

function applyWorkerFrame(payload) {
    const { imageData, selectionBuffer: workerSelection, width, height } = payload;
    const pixels = new Uint8ClampedArray(imageData);
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    selectionBuffer.set(new Uint8Array(workerSelection));
    updateSelectionLayer();
}

function postFrameToWorker(view, mode, angles) {
    if (!renderWorker || !glyphAtlas) {
        dispatchAsciiFrame(view, mode);
        return;
    }
    if (workerBusy) {
        workerPendingFrame = { view, mode, angles };
        return;
    }
    workerBusy = true;
    workerBusySince = performance.now();
    const viewCopy = new Uint8Array(view);
    const msg = {
        type: 'frame',
        view: viewCopy,
        mode,
        gridCols,
        gridRows,
        width: canvas.width,
        height: canvas.height,
        charWidth,
        charHeight,
        selectionRowStride,
        triglyphOffset,
    };
    if (mode === 'rotated' && angles) {
        msg.angles = angles instanceof Float32Array ? angles.slice() : angles;
    }
    renderWorker.postMessage(msg, [viewCopy.buffer]);
}

function renderColorAsciiFrame(view) {
    if (
        !colorFrameImageData
        || colorFrameImageData.width !== canvas.width
        || colorFrameImageData.height !== canvas.height
    ) {
        colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    }
    compositeColorAsciiFrame({
        view,
        gridCols,
        gridRows,
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

function renderTriglyphFrame(view) {
    if (
        !colorFrameImageData
        || colorFrameImageData.width !== canvas.width
        || colorFrameImageData.height !== canvas.height
    ) {
        colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    }
    compositeTriglyphFrame({
        view,
        gridCols,
        gridRows,
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
        offset: triglyphOffset,
    });
    ctx.putImageData(colorFrameImageData, 0, 0);
    updateSelectionLayer();
}

function renderRotatedAsciiFrame(view) {
    if (
        !colorFrameImageData
        || colorFrameImageData.width !== canvas.width
        || colorFrameImageData.height !== canvas.height
    ) {
        colorFrameImageData = ctx.createImageData(canvas.width, canvas.height);
    }
    compositeRotatedAsciiFrame({
        view,
        angles: cellAngleBuffer,
        gridCols,
        gridRows,
        width: canvas.width,
        height: canvas.height,
        charWidth,
        charHeight,
        rotationAtlas,
        destData: colorFrameImageData.data,
        selectionBuffer,
        selectionRowStride,
        xPos,
        yPos,
    });
    ctx.putImageData(colorFrameImageData, 0, 0);
    updateSelectionLayer();
}

function dispatchAsciiFrame(view, mode) {
    if (mode === 'triglyph') renderTriglyphFrame(view);
    else if (mode === 'rotated') renderRotatedAsciiFrame(view);
    else renderColorAsciiFrame(view);
}

function buildCellView(data, now, withAngles = false) {
    const cellCount = gridCols * gridRows;
    if (!cellViewBuffer || cellViewBuffer.length !== cellCount * 4) {
        cellViewBuffer = new Uint8Array(cellCount * 4);
    }
    if (withAngles && (!cellAngleBuffer || cellAngleBuffer.length !== cellCount)) {
        cellAngleBuffer = new Float32Array(cellCount);
    }
    let idx = 0;
    let cellIdx = 0;
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const cell = resolveCell(data, row, col, now);
            const { r, g, b } = cellColorBytes(cell, row, col, now);
            cellViewBuffer[idx++] = cell.charCode < 256 ? cell.charCode : 32;
            cellViewBuffer[idx++] = r;
            cellViewBuffer[idx++] = g;
            cellViewBuffer[idx++] = b;
            if (withAngles) {
                cellAngleBuffer[cellIdx] = computeCharAngle(col, row, now);
            }
            cellIdx++;
        }
    }
    return cellViewBuffer;
}

function queueAsciiFrame(view, mode) {
    if (useRenderWorker && renderWorker) {
        const angles = mode === 'rotated' ? cellAngleBuffer : null;
        postFrameToWorker(view, mode, angles);
    } else {
        dispatchAsciiFrame(view, mode);
    }
}

function checkWorkerStall(now) {
    if (!useRenderWorker || !workerBusy) return;
    if (now - workerBusySince <= 500) return;
    useRenderWorker = false;
    workerBusy = false;
    if (renderWorker) {
        renderWorker.terminate();
        renderWorker = null;
    }
    if (workerPendingFrame) {
        const pending = workerPendingFrame;
        workerPendingFrame = null;
        dispatchAsciiFrame(pending.view, pending.mode);
    }
}

// ── CANVAS SETUP ──────────────────────────────────────────

function buildCanvas(cols, rows) {
    gridCols = cols;
    gridRows = rows;

    layoutPlayerContainer();

    const syncSize = (el) => {
        el.style.width = `${container.clientWidth}px`;
        el.style.height = `${container.clientHeight}px`;
        el.style.objectFit = 'contain';
        el.style.objectPosition = 'center center';
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
        glyphAtlas = null;
        rotationAtlas = null;
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

        selectionRowStride = cols + 1;
        selectionBuffer = new Uint8Array(selectionRowStride * rows);
        for (let r = 0; r < rows; r++) selectionBuffer[r * selectionRowStride + cols] = 10;

        syncSize(canvas);

        player.style.width = `${canvas.width}px`;
        player.style.height = `${canvas.height}px`;
        player.style.position = 'absolute';
        player.style.top = '0';
        player.style.left = '0';
        player.style.fontFamily = font.family;
        player.style.fontSize = `${font.size}px`;
        player.style.lineHeight = `${font.size}px`;
        syncSelectionTransform();

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

        if (renderMode !== 1) {
            rebuildGlyphAtlas();
            initRenderWorker();
        } else {
            glyphAtlas = null;
            rotationAtlas = null;
        }

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
    syncGridColsSlider();
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
    refreshVideoFrameRateEstimate();
    const cap = Math.min(MAX_RENDER_FPS, videoFrameRate);
    statusEl.textContent = `FPS: ${frameCount}/${cap} | ${statusLabel()}`;
    frameCount = 0;
    lastFpsUpdate = now;
}

function refreshVideoFrameRateEstimate() {
    if (typeof video.getVideoPlaybackQuality !== 'function') return;
    if (video.currentTime < 0.25) return;
    const q = video.getVideoPlaybackQuality();
    if (q.totalVideoFrames < 3) return;
    const measured = q.totalVideoFrames / video.currentTime;
    if (measured < 10 || measured > 120) return;
    videoFrameRate = Math.min(MAX_RENDER_FPS, Math.round(measured));
}

function noteFrameRateFromMediaTime(mediaTime) {
    if (lastFpsMediaSample < 0) {
        lastFpsMediaSample = mediaTime;
        return;
    }
    const dt = mediaTime - lastFpsMediaSample;
    lastFpsMediaSample = mediaTime;
    if (dt <= 0.0005 || dt > 0.5) return;
    const instant = 1 / dt;
    if (instant < 10 || instant > 120) return;
    const rounded = Math.min(MAX_RENDER_FPS, Math.round(instant));
    videoFrameRate = videoFrameRate
        ? Math.round(videoFrameRate * 0.85 + rounded * 0.15)
        : rounded;
}

// ── RENDER PATHS ──────────────────────────────────────────

function renderTriglyph(data, now) {
    queueAsciiFrame(buildCellView(data, now), 'triglyph');
}

function computeCharAngle(col, row, now) {
    const fx = effectiveFx();
    const t = now * 0.001;
    if (fx === 'rotwave') {
        return Math.sin(col * 0.22 + t * 1.5) * 0.55
             + Math.sin(row * 0.28 + t * 1.0) * 0.2;
    }
    if (fx === 'orbit') {
        const dx = col - gridCols / 2;
        const dy = row - gridRows / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return t * 0.9 + dist * 0.07;
    }
    return 0;
}

function renderColorAscii(data, now) {
    if (usesTriglyphPath(effectiveFx(), now)) {
        queueAsciiFrame(buildCellView(data, now), 'triglyph');
    } else if (usesRotatedAsciiPath(effectiveFx())) {
        queueAsciiFrame(buildCellView(data, now, true), 'rotated');
    } else {
        queueAsciiFrame(buildCellView(data, now), 'color');
    }
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

function onTilt3dMove(e) {
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    container.style.transform =
        `perspective(700px) rotateY(${(x * 14).toFixed(2)}deg) rotateX(${(-y * 10).toFixed(2)}deg)`;
}

function onTilt3dLeave() {
    container.style.transform = 'perspective(700px) rotateY(0deg) rotateX(0deg)';
    setTimeout(() => { container.style.transform = ''; }, 350);
}

function initTilt3d() {
    container.addEventListener('mousemove', onTilt3dMove);
    container.addEventListener('mouseleave', onTilt3dLeave);
}

function removeTilt3d() {
    container.removeEventListener('mousemove', onTilt3dMove);
    container.removeEventListener('mouseleave', onTilt3dLeave);
    if (effectiveFx() !== 'tilt3d') container.style.transform = '';
}

// Returns { srcCol, srcRow, override } — override is non-null to short-circuit resolveCell
function distortCell(col, row) {
    const fx = effectiveFx();

    if (fx === 'hole') {
        const dx = col - holeX;
        const dy = (row - holeY) * 1.8;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const gravMul = fxParam('hole-gravity', 1.0);
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
        const drift = meltColSpeeds[col] * elapsed * fxParam('melt-speed', 1.0) + meltColPhase[col];
        const driftRow = Math.floor(drift);
        const wobble = Math.sin((row * 0.28 + drift * 0.08) * Math.PI) * 1.8;
        const srcRow = ((row - driftRow) % gridRows + gridRows) % gridRows;
        const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(col + wobble)));
        return { srcCol, srcRow, override: null };
    }

    if (fx === 'lens' && gridCols > 1 && gridRows > 1) {
        const nx = (col / (gridCols - 1)) * 2 - 1;
        const ny = (row / (gridRows - 1)) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        const k = fxParam('lens-strength', 0.45);
        const d = 1 + k * r2;
        const sx = (nx / d + 1) * (gridCols - 1) / 2;
        const sy = (ny / d + 1) * (gridRows - 1) / 2;
        return {
            srcCol: Math.max(0, Math.min(gridCols - 1, Math.round(sx))),
            srcRow: Math.max(0, Math.min(gridRows - 1, Math.round(sy))),
            override: null,
        };
    }

    if (fx === 'swirl') {
        const cx = gridCols / 2;
        const cy = gridRows / 2;
        const dx = col - cx;
        const dy = row - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = performance.now() * 0.0003;
        const twistMul = fxParam('swirl-twist', 1.0);
        const theta = dist * 0.12 * twistMul + t;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const srcCol = Math.max(0, Math.min(gridCols - 1, Math.round(cx + dx * cos - dy * sin)));
        const srcRow = Math.max(0, Math.min(gridRows - 1, Math.round(cy + dx * sin + dy * cos)));
        return { srcCol, srcRow, override: null };
    }

    if (fx === 'fold') {
        const hc = Math.floor(gridCols / 2);
        const hr = Math.floor(gridRows / 2);
        const foldCol = col < hc ? col : gridCols - 1 - col;
        const foldRow = row < hr ? row : gridRows - 1 - row;
        return {
            srcCol: Math.max(0, Math.min(gridCols - 1, foldCol * 2)),
            srcRow: Math.max(0, Math.min(gridRows - 1, foldRow * 2)),
            override: null,
        };
    }

    if (fx === 'radar' && gridCols > 1 && gridRows > 1) {
        const theta = (col / (gridCols - 1)) * Math.PI * 2;
        const radius = (row / (gridRows - 1)) * 0.48;
        const srcCol = Math.max(0, Math.min(gridCols - 1,
            Math.round((0.5 + radius * Math.cos(theta)) * (gridCols - 1))));
        const srcRow = Math.max(0, Math.min(gridRows - 1,
            Math.round((0.5 + radius * Math.sin(theta)) * (gridRows - 1))));
        return { srcCol, srcRow, override: null };
    }

    // SOUNDWAVE — centered bass bump (burst) or smooth column warp
    if (fx === 'soundwave' && audioWaveform && audioWaveform.length >= 2) {
        const ampMul = fxParam('wave-amplitude', 3.5);
        const shimmerMul = fxParam('wave-shimmer', 0.0);
        const burst = fxParam('wave-burst', 1.0);
        const smooth = 1 - burst;
        const punch = burst * waveBurstEnv;
        const bassDrive = fxParam('wave-bass-drive', 0.9);
        const bumpMode = burst > 0.85;

        const span = bumpMode
            ? Math.max(8, Math.floor(audioWaveform.length * 0.35))
            : Math.max(12, Math.floor(audioWaveform.length * (1 - burst * 0.8)));
        const t = (col / Math.max(1, gridCols - 1)) * (span - 1);
        const i0 = Math.floor(t) % audioWaveform.length;
        const i1 = (i0 + 1) % audioWaveform.length;
        const frac = t - Math.floor(t);
        const wSample = audioWaveform[i0] * (1 - frac) + audioWaveform[i1] * frac;
        let wave = (wSample - 128) / 128;

        if (punch > 0.05) {
            const sharp = 0.55 + burst * 0.55;
            wave = Math.sign(wave) * Math.pow(Math.abs(wave), sharp);
        }

        const focal = bumpMode ? 0.2 + (1 - bassDrive) * 0.12 : 0.45 + (1 - burst) * 0.3;
        const ndx = (col - gridCols * 0.5) / Math.max(1, gridCols * focal);
        const ndy = (row - gridRows * 0.5) / Math.max(1, gridRows * focal);
        const locality = Math.exp(-(ndx * ndx + ndy * ndy) * (bumpMode ? 3.6 : 1.4));

        const gate = (smooth * (0.08 + audioRms * 0.35) + punch * (0.95 + audioSubBass * 0.45)) * locality;
        const warpDrive = bumpMode ? ampMul * 1.05 : ampMul * (0.55 + ampMul * 0.45);
        const baseAmp = bumpMode ? (5 + audioRms * 28) : (10 + audioRms * 110);
        const amplitude = baseAmp * warpDrive * gate;
        const srcRow = Math.max(0, Math.min(gridRows - 1, Math.round(row + wave * amplitude)));
        const deriv = (audioWaveform[i1] - audioWaveform[i0]) / 256;
        const shimmerGate = (smooth * 0.35 + punch * 0.4) * locality;
        const srcCol = Math.max(0, Math.min(gridCols - 1,
            Math.round(col + deriv * audioRms * 14 * shimmerMul * shimmerGate)));
        return { srcCol, srcRow, override: null };
    }
    if (fx === 'beatstrike') {
        return { srcCol: col, srcRow: row, override: null };
    }

    // SPECTRA — each horizontal band maps to a frequency; high amplitude → sideways shift
    if (fx === 'spectra') {
        if (audioFreqData && audioFreqData.length > 0) {
            // Map rows to frequency bins: bottom rows → bass, top rows → mids
            const binIdx = Math.floor((1 - row / Math.max(1, gridRows - 1)) * Math.min(audioFreqData.length - 1, 80));
            const amp = audioFreqData[binIdx] / 255;
            const dir = Math.sin(row * 0.8) >= 0 ? 1 : -1;
            const tearMul = fxParam('spectra-tear', 1.3);
            const maxShift = (4 + amp * 20 + audioRms * 14) * tearMul;
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

    const fxNow = effectiveFx();
    if (fxNow === 'plasma') {
        const turbEl = document.getElementById('plasma-turb');
        if (turbEl) {
            const t = performance.now() * 0.00010;
            const bf1 = 0.012 + Math.sin(t) * 0.005;
            const bf2 = 0.009 + Math.cos(t * 0.73) * 0.004;
            turbEl.setAttribute('baseFrequency', `${bf1.toFixed(5)} ${bf2.toFixed(5)}`);
            turbEl.setAttribute('seed', (Math.floor(t * 5) % 999).toString());
        }
    }
    if (fxNow === 'pulse-clip') {
        const base = 42;
        const breathMul = fxParam('pulse-breath', 1.3);
        const pct = base + (audioRms * 50 + audioBass * 18) * breathMul;
        container.style.clipPath =
            `ellipse(${Math.min(pct, 92).toFixed(1)}% ${Math.min(pct * 0.72, 68).toFixed(1)}% at 50% 50%)`;
    } else if (container.style.clipPath && fxNow !== 'pulse-clip' && fxNow !== 'shred') {
        container.style.clipPath = '';
    }

    if (pixelMode) {
        renderPixelFrame(now);
    } else {
        offCtx.drawImage(video, 0, 0, gridCols, gridRows);
        const { data } = offCtx.getImageData(0, 0, gridCols, gridRows);
        if (renderMode === 1) {
            renderBwAscii(data, now);
        } else {
            checkWorkerStall(now);
            const fx = effectiveFx();
            if (usesTriglyphPath(fx, now)) {
                queueAsciiFrame(buildCellView(data, now), 'triglyph');
            } else if (usesRotatedAsciiPath(fx)) {
                queueAsciiFrame(buildCellView(data, now, true), 'rotated');
            } else {
                queueAsciiFrame(buildCellView(data, now), 'color');
            }
        }
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

/** Hard ceiling — never render faster than this; source fps may be lower. */
const MAX_RENDER_FPS = 60;

function minRenderIntervalMs() {
    return 1000 / MAX_RENDER_FPS;
}

function onVideoFrame(now, metadata) {
    if (state !== 'PLAYING') return;

    const mediaTime = metadata?.mediaTime ?? video.currentTime;
    if (mediaTime === lastMediaTime) {
        scheduleVideoFrame();
        return;
    }

    if (metadata?.mediaTime != null) {
        noteFrameRateFromMediaTime(metadata.mediaTime);
    }

    if (now - lastRenderTs < minRenderIntervalMs()) {
        scheduleVideoFrame();
        return;
    }

    lastMediaTime = mediaTime;
    lastRenderTs = now;
    processFrame(now);
    scheduleVideoFrame();
}

function onRafFrame(now) {
    if (state !== 'PLAYING') return;
    rafHandle = requestAnimationFrame(onRafFrame);

    const mediaTime = video.currentTime;
    if (mediaTime === lastMediaTime) return;
    if (now - lastRenderTs < minRenderIntervalMs()) return;

    lastMediaTime = mediaTime;
    lastRenderTs = now;
    noteFrameRateFromMediaTime(mediaTime);
    processFrame(now);
}

function scheduleVideoFrame() {
    if (state !== 'PLAYING') return;
    if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(onVideoFrame);
    }
}

function cancelFrameLoop() {
    if (rafHandle) {
        cancelAnimationFrame(rafHandle);
        rafHandle = 0;
    }
}

function startFrameLoop() {
    lastMediaTime = -1;
    lastFpsMediaSample = -1;
    lastRenderTs = 0;
    frameCount = 0;
    lastFpsUpdate = performance.now();
    cancelFrameLoop();

    if (typeof video.requestVideoFrameCallback === 'function') {
        scheduleVideoFrame();
    } else {
        rafHandle = requestAnimationFrame(onRafFrame);
    }
}

function stopFrameLoop() {
    cancelFrameLoop();
    state = 'IDLE';
    lastMediaTime = -1;
    lastFpsMediaSample = -1;
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

    if (!pixelMode && FX_PRESETS[activeFx]?.pixelOnly) {
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

    const cols = resolvePlaybackCols(prefs.cols);
    const rows = calcAutoRows(cols, video.videoWidth, video.videoHeight, pixelMode);
    layoutPlayerContainer();
    buildCanvas(cols, rows);
    syncGridColsSlider();
    updateGridColsBarLabel(cols, rows);
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
        initAudioAnalyser();
        if (effectiveFx() === 'tilt3d') initTilt3d();
        if (effectiveFx() === 'hole') initHole();
        if (effectiveFx() === 'rend') initRend();
        if (effectiveFx() === 'melt') initMelt();
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        startFrameLoop();
        updateTransportUI();
    } catch (err) {
        statusEl.textContent = 'Playback error: ' + err.message;
        statusEl.style.color = '#ff0000';
        overlay.classList.remove('hidden');
        state = 'IDLE';
        updateTransportUI();
    }
}

function finishStream() {
    stopFrameLoop();
    if (renderWorker) {
        renderWorker.terminate();
        renderWorker = null;
    }
    workerBusy = false;
    workerPendingFrame = null;
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
    updateTransportUI();
    updateWaveformVis();
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
            initAudioAnalyser();
            if (effectiveFx() === 'tilt3d') initTilt3d();
            else removeTilt3d();
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
    stopDemoMode();
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

function advanceFxPreset(delta) {
    const ids = getVisiblePresetIds();
    if (!ids.length) return;
    const idx = ids.indexOf(activeFx);
    const next = idx < 0 ? ids[0] : ids[(idx + delta + ids.length) % ids.length];
    applyFx(next);
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
    const sizeMul  = fxParam('ripple-size', 1.0);
    const speedMul = fxParam('ripple-speed', 1.0);
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
        if (parseFloat(volumeSlider.value) > 0) {
            lastVolume = parseFloat(volumeSlider.value);
        }
    });
}

if (volLabel && volumeSlider) {
    volLabel.style.cursor = 'pointer';
    volLabel.title = 'Click to mute/unmute';
    volLabel.addEventListener('click', () => {
        const v = parseFloat(volumeSlider.value);
        if (v > 0) {
            lastVolume = v;
            volumeSlider.value = '0';
        } else {
            volumeSlider.value = String(lastVolume);
        }
        video.volume = parseFloat(volumeSlider.value);
    });
}

if (transportPlayBtn) {
    transportPlayBtn.addEventListener('click', () => togglePlayback());
}

if (seekSlider) {
    seekSlider.addEventListener('pointerdown', () => { seekDragging = true; });
    seekSlider.addEventListener('pointerup', () => { seekDragging = false; });
    seekSlider.addEventListener('input', () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        video.currentTime = (parseInt(seekSlider.value, 10) / 1000) * video.duration;
        updateTransportUI();
    });
}

video.addEventListener('timeupdate', () => {
    if (!seekDragging) updateTransportUI();
});
video.addEventListener('loadedmetadata', updateTransportUI);
video.addEventListener('durationchange', updateTransportUI);

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        const pane = document.querySelector('.studio-canvas-pane');
        if (!document.fullscreenElement) {
            pane?.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    });
}

if (demoToggleBtn) {
    demoToggleBtn.addEventListener('click', () => {
        if (demoEnabled) stopDemoMode();
        else startDemoMode();
    });
}

if (catFilterEl) {
    catFilterEl.addEventListener('click', (e) => {
        const pill = e.target.closest('.fx-cat-pill');
        if (!pill) return;
        const cat = pill.dataset.cat;
        if (cat === 'all' || cat === 'none' || ALL_CATEGORY_IDS.includes(cat)) {
            categoryFilterMode = cat;
        }
        saveCategoryFilter();
        updateCategoryFilterUI();
        if (demoEnabled) {
            stopDemoMode();
            startDemoMode();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.target.closest('#about-panel') && !aboutPanel?.hidden) return;
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (tag === 'INPUT' && e.target.type !== 'range') return;

    if (e.key === ' ' && !e.target.closest('button')) {
        e.preventDefault();
        togglePlayback();
    } else if (e.key === 'ArrowLeft' && !e.target.closest('#fx-picker')) {
        e.preventDefault();
        jumpToTrack(-1);
    } else if (e.key === 'ArrowRight' && !e.target.closest('#fx-picker')) {
        e.preventDefault();
        jumpToTrack(1);
    } else if (e.key === '[') {
        e.preventDefault();
        advanceFxPreset(-1);
    } else if (e.key === ']') {
        e.preventDefault();
        advanceFxPreset(1);
    }
});

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
    video.loop = true;
    updateTrackLabel();
    stopDemoMode();
    if (state === 'PLAYING' || state === 'PAUSED') {
        finishStream();
        await startStream();
    }
}

if (trackPrevBtn) trackPrevBtn.addEventListener('click', () => jumpToTrack(-1));
if (trackNextBtn) trackNextBtn.addEventListener('click', () => jumpToTrack(1));

video.addEventListener('ended', async () => {
    if (video.loop) return;
    if (state !== 'PLAYING') return;
    if (siteConfig?.loop) {
        video.currentTime = 0;
        video.play().catch(() => {});
    } else {
        finishStream();
    }
});

window.addEventListener('resize', () => {
    updateWaveformVis();
    layoutPlayerContainer();
    syncSelectionTransform();
    if (gridCols > 0 && gridRows > 0 && !pixelMode && renderMode !== 1) {
        if (glyphAtlas) {
            updateGridColsBarLabel(gridCols, gridRows);
        } else {
            buildCanvas(gridCols, gridRows);
            updateGridColsBarLabel(gridCols, gridRows);
        }
    }
});

video.addEventListener('loadedmetadata', () => {
    layoutPlayerContainer();
    syncGridColsSlider();
});

// ── BOOT ──────────────────────────────────────────────────

buildFxPicker();
buildGridColsBar();
buildGlobalAudioBar();
container.className = FX_PRESETS[activeFx]?.css || 'fx-clean';

function fxGridCols() {
    const grid = fxPicker?.querySelector('.fx-category-grid');
    if (!grid) return 3;
    const cols = getComputedStyle(grid).gridTemplateColumns;
    return cols ? cols.split(' ').length : 3;
}

if (fxResetBtn) {
    fxResetBtn.addEventListener('click', () => applyFx('clean'));
}

if (fxPicker) {
    fxPicker.addEventListener('keydown', (e) => {
        const chips = [...fxPicker.querySelectorAll('.fx-chip')];
        const idx = chips.findIndex((c) => c.dataset.fx === activeFx);
        const cols = fxGridCols();
        if (e.key === 'ArrowRight' && idx < chips.length - 1) {
            e.preventDefault();
            chips[idx + 1].focus();
            applyFx(chips[idx + 1].dataset.fx);
        } else if (e.key === 'ArrowLeft' && idx > 0) {
            e.preventDefault();
            chips[idx - 1].focus();
            applyFx(chips[idx - 1].dataset.fx);
        } else if (e.key === 'ArrowDown' && idx + cols < chips.length) {
            e.preventDefault();
            chips[idx + cols].focus();
            applyFx(chips[idx + cols].dataset.fx);
        } else if (e.key === 'ArrowUp' && idx - cols >= 0) {
            e.preventDefault();
            chips[idx - cols].focus();
            applyFx(chips[idx - cols].dataset.fx);
        }
    });
}

const aboutToggle = document.getElementById('about-toggle');
const aboutPanel = document.getElementById('about-panel');
const aboutClose = document.getElementById('about-close');

function setAboutOpen(open) {
    if (!aboutPanel || !aboutToggle) return;
    aboutPanel.hidden = !open;
    aboutToggle.setAttribute('aria-expanded', String(open));
}

if (aboutToggle && aboutPanel) {
    aboutToggle.addEventListener('click', () => setAboutOpen(aboutPanel.hidden));
}
if (aboutClose) {
    aboutClose.addEventListener('click', () => setAboutOpen(false));
}
if (aboutPanel) {
    aboutPanel.addEventListener('click', (e) => {
        if (e.target === aboutPanel) setAboutOpen(false);
    });
}

loadConfig()
    .then(() => {
        updateModeToggleUI();
        updateCopyFrameButton();
        updateCategoryFilterUI();
        updateFxPickerUI();
        updateTransportUI();
        updateWaveformVis();
    })
    .catch((err) => {
        statusEl.textContent = err.message;
        statusEl.style.color = '#ff0000';
    });

const playerObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            if (state === 'PAUSED' && video.paused) resumePlayback();
        } else if (!entry.isIntersecting) {
            if (state === 'PLAYING' && !video.paused) pausePlayback();
        }
    }
}, { threshold: [0, 0.4] });
playerObserver.observe(container);
