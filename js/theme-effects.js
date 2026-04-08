/* =============================================================================
   theme-effects.js — GPU-accelerated theme particle effects
   Exposes: window.ThemeEffects = { apply(themeId), destroy() }
   ============================================================================= */

(function () {
    'use strict';

    /* ─── Constants ─────────────────────────────────────────────────── */
    const PETAL_COUNT      = 38;
    const PETAL_MIN_SIZE   = 7;
    const PETAL_MAX_SIZE   = 17;
    const PETAL_MIN_SPEED  = 0.22;   /* slower for more graceful fall */
    const PETAL_MAX_SPEED  = 0.72;
    const PETAL_MIN_SWAY   = 18;
    const PETAL_MAX_SWAY   = 48;
    const PETAL_MIN_SPIN   = 0.004;  /* gentler rotation */
    const PETAL_MAX_SPIN   = 0.018;
    const CANVAS_Z         = 2;      /* z-index — above bg, below content */
    const STARTUP_DELAY    = 1800;   /* ms — let the page settle before petals start */

    /* Cursor repulsion */
    const REPEL_RADIUS     = 110;    /* px — influence zone around cursor */
    const REPEL_STRENGTH   = 2.8;    /* max impulse per frame */
    const REPEL_DAMPING    = 0.90;   /* how quickly cursor-nudge vx decays */

    /* Cherry blossom colour palette — OKLCH-inspired pinks */
    const PETAL_COLORS = [
        'rgba(255, 192, 203, 0.85)',  /* light pink */
        'rgba(255, 179, 198, 0.80)',  /* rose */
        'rgba(255, 133, 161, 0.78)',  /* deep pink */
        'rgba(255, 220, 234, 0.90)',  /* blush white */
        'rgba(255, 228, 236, 0.92)',  /* very pale pink */
        'rgba(255, 107, 158, 0.75)',  /* cherry */
        'rgba(255, 160, 185, 0.80)',  /* salmon pink */
        'rgba(255, 236, 243, 0.95)',  /* near-white petal */
    ];

    /* ─── State ──────────────────────────────────────────────────────── */
    let canvas     = null;
    let ctx        = null;
    let petals     = [];
    let rafId      = null;
    let resizeObs  = null;
    let startTimer = null;
    let running    = false;

    /* Mouse position in CSS-pixel space (body coordinates) */
    const mouse = { x: -9999, y: -9999 };
    let   mouseListener = null;

    /* ─── Petal drawing ──────────────────────────────────────────────── */

    /**
     * Draw a single cherry-blossom petal centred at (0,0) before transform.
     * Shape: two mirrored cubic Bézier curves forming a rounded teardrop.
     */
    function drawPetal(c, size, color) {
        const w = size * 0.55;
        const h = size;

        c.beginPath();
        /* Right side of petal (Bézier from tip down to base) */
        c.moveTo(0, -h * 0.5);
        c.bezierCurveTo( w * 1.4, -h * 0.25,  w * 1.6,  h * 0.30,  0, h * 0.5);
        /* Left side (mirror) */
        c.bezierCurveTo(-w * 1.6,  h * 0.30, -w * 1.4, -h * 0.25,  0, -h * 0.5);
        c.closePath();

        /* Soft inner vein (radial gradient) */
        const grad = c.createRadialGradient(0, 0, 0, 0, 0, size * 0.85);
        grad.addColorStop(0,   color.replace(/[\d.]+\)$/, '1.0)'));
        grad.addColorStop(0.6, color);
        grad.addColorStop(1,   color.replace(/[\d.]+\)$/, '0.2)'));
        c.fillStyle = grad;
        c.fill();
    }

    /* ─── Petal object factory ───────────────────────────────────────── */
    function makePetal(w, h, startBelowFold) {
        const size  = PETAL_MIN_SIZE + Math.random() * (PETAL_MAX_SIZE - PETAL_MIN_SIZE);
        const speed = PETAL_MIN_SPEED + Math.random() * (PETAL_MAX_SPEED - PETAL_MIN_SPEED);
        const sway  = PETAL_MIN_SWAY  + Math.random() * (PETAL_MAX_SWAY  - PETAL_MIN_SWAY);
        return {
            x:          Math.random() * (w + 80) - 40,
            y:          startBelowFold ? (h + size + Math.random() * h * 0.25) : (-size - Math.random() * h * 0.9),
            rot:        Math.random() * Math.PI * 2,
            rotSpeed:   (PETAL_MIN_SPIN + Math.random() * (PETAL_MAX_SPIN - PETAL_MIN_SPIN)) * (Math.random() < 0.5 ? 1 : -1),
            size,
            speed,
            swayAmp:    sway,
            /* Two independent sine phases for non-repeating Lissajous-like drift */
            swayPhase1: Math.random() * Math.PI * 2,
            swayPhase2: Math.random() * Math.PI * 2,
            /* Per-petal sway speed multiplier for variety */
            swayRate:   0.010 + Math.random() * 0.012,
            color:      PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
            opacity:    0,
            vx:         0,   /* extra horizontal velocity from cursor repulsion */
        };
    }

    function resetPetal(p, w, h) {
        p.x         = Math.random() * (w + 80) - 40;
        p.y         = -p.size - Math.random() * 80;
        p.rot       = Math.random() * Math.PI * 2;
        p.rotSpeed  = (PETAL_MIN_SPIN + Math.random() * (PETAL_MAX_SPIN - PETAL_MIN_SPIN)) * (Math.random() < 0.5 ? 1 : -1);
        p.speed     = PETAL_MIN_SPEED + Math.random() * (PETAL_MAX_SPEED - PETAL_MIN_SPEED);
        p.swayAmp   = PETAL_MIN_SWAY  + Math.random() * (PETAL_MAX_SWAY  - PETAL_MIN_SWAY);
        p.swayPhase1= Math.random() * Math.PI * 2;
        p.swayPhase2= Math.random() * Math.PI * 2;
        p.swayRate  = 0.010 + Math.random() * 0.012;
        p.color     = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
        p.opacity   = 0;
        p.vx        = 0;
    }

    /* ─── Animation loop ─────────────────────────────────────────────── */
    function tick() {
        if (!running) return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        ctx.clearRect(0, 0, w, h);

        for (const p of petals) {
            /* ── Sway: two overlapping sin waves → smooth, non-repeating drift ── */
            const sway1 = Math.sin(p.swayPhase1) * (p.swayAmp * 0.60);
            const sway2 = Math.sin(p.swayPhase2) * (p.swayAmp * 0.28);
            const swayDx = (sway1 + sway2) * 0.018; /* scale to per-frame pixels */

            /* ── Cursor repulsion ── */
            const dx   = p.x - mouse.x;
            const dy   = p.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < REPEL_RADIUS && dist > 1) {
                const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH;
                p.vx += (dx / dist) * force * 0.55;
                /* Slight upward nudge when very close */
                p.y  -= (dy / dist) * force * 0.18;
            }

            /* Update position */
            p.x          += swayDx + p.vx;
            p.y          += p.speed;
            p.rot        += p.rotSpeed;
            p.swayPhase1 += p.swayRate;
            p.swayPhase2 += p.swayRate * 0.61803; /* golden-ratio offset → aperiodic */
            p.vx         *= REPEL_DAMPING;          /* decay cursor impulse */

            /* Fade in near top, fade out near bottom */
            const progress = p.y / h;
            if (progress < 0.10) {
                p.opacity = Math.min(1, progress / 0.10);
            } else if (progress > 0.88) {
                p.opacity = Math.max(0, 1 - (progress - 0.88) / 0.12);
            } else {
                p.opacity = 1;
            }

            /* Reset when off-screen */
            if (p.y > h + p.size + 20) {
                resetPetal(p, w, h);
                continue;
            }

            /* Draw */
            ctx.save();
            ctx.globalAlpha = p.opacity * 0.82;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            drawPetal(ctx, p.size, p.color);
            ctx.restore();
        }

        rafId = requestAnimationFrame(tick);
    }

    /* ─── Canvas lifecycle ───────────────────────────────────────────── */
    function initCanvas() {
        canvas = document.createElement('canvas');
        canvas.id = 'petal-canvas';
        Object.assign(canvas.style, {
            position:      'fixed',
            inset:         '0',
            width:         '100%',
            height:        '100%',
            pointerEvents: 'none',
            zIndex:        String(CANVAS_Z),
            opacity:       '1',
        });

        /* Insert as first child of body so it renders behind everything */
        document.body.insertBefore(canvas, document.body.firstChild);
        ctx = canvas.getContext('2d');

        /* Size canvas to physical pixels */
        sizeCanvas();

        /* Observe body size changes (split-pane resize etc.) */
        resizeObs = new ResizeObserver(sizeCanvas);
        resizeObs.observe(document.body);

        /* Track mouse for cursor repulsion */
        mouseListener = function (e) { mouse.x = e.clientX; mouse.y = e.clientY; };
        window.addEventListener('mousemove', mouseListener, { passive: true });
    }

    function sizeCanvas() {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w   = window.innerWidth;
        const h   = window.innerHeight;
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        /* Re-scale context after resize — clearRect will use logical pixels */
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initPetals() {
        petals = [];
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (let i = 0; i < PETAL_COUNT; i++) {
            /* Stagger initial positions across the full viewport height */
            petals.push(makePetal(w, h, false));
            petals[i].y = -petals[i].size + Math.random() * h * 1.6 - h * 0.7;
        }
    }

    function destroyCanvas() {
        running = false;
        if (rafId)        { cancelAnimationFrame(rafId); rafId = null; }
        if (resizeObs)    { resizeObs.disconnect(); resizeObs = null; }
        if (startTimer)   { clearTimeout(startTimer); startTimer = null; }
        if (mouseListener){ window.removeEventListener('mousemove', mouseListener); mouseListener = null; }
        if (canvas && canvas.parentNode) { canvas.parentNode.removeChild(canvas); }
        canvas = null;
        ctx    = null;
        petals = [];
        mouse.x = -9999; mouse.y = -9999;
    }

    /* ─── Kirschblüte theme effects ──────────────────────────────────── */
    function startKirschbluete() {
        initCanvas();
        initPetals();

        /* Slight delay so entrance animations finish first */
        startTimer = setTimeout(function () {
            running = true;
            rafId   = requestAnimationFrame(tick);
        }, STARTUP_DELAY);
    }

    /* ─── Public API ─────────────────────────────────────────────────── */
    window.ThemeEffects = {
        apply: function (themeId) {
            /* Always clean up any previous effects first */
            destroyCanvas();

            if (themeId === 'kirschbluete') {
                startKirschbluete();
            }
            /* Dracula, dracula-laser, swr-ms, carbon, standard — CSS-only effects,
               no JS canvas required. */
        },

        destroy: function () {
            destroyCanvas();
        },
    };

}());
