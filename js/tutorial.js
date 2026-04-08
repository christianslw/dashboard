// ─── Tutorial Modal ───────────────────────────────────────────────────────────────────

const TUTORIAL_TOTAL_STEPS = 9;
let tutorialCurrentStep = 0; // 0 = home screen

const TUTORIAL_STEP_TITLES = [
    'Hilfe – Themenübersicht',
    'Start & Entfernungen',
    'Suchen, Filtern & Sortieren',
    'Schnellaktionen',
    'Favoriten & Dashboard',
    'Tourenplaner',
    'Karte & Regenradar',
    'Overlay-Editor',
    'Einstellungen & Design',
    'Tastenkürzel',
];

function openTutorial() {
    tutorialGoHome();
    // Move modal to <body> to escape any ancestor stacking context (same as overlay sidebar)
    const modal = document.getElementById('tutorialModal');
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    localStorage.setItem('tutorialShown', 'true');
    removeHelpButtonHighlight();
}

function closeTutorial() {
    document.getElementById('tutorialModal').classList.add('hidden');
    removeHelpButtonHighlight();
}

function tutorialGoHome() {
    tutorialCurrentStep = 0;

    // Show home, hide all steps
    document.getElementById('tutorialHome').classList.remove('hidden');
    document.querySelectorAll('.tutorial-step').forEach(el => el.classList.add('hidden'));

    // Header
    document.getElementById('tutorialBackBtn').classList.add('hidden');
    document.getElementById('tutorialTitle').textContent = TUTORIAL_STEP_TITLES[0];

    // Footer
    document.getElementById('tutorialFooter').classList.add('hidden');
}

function tutorialGoToStep(n) {
    tutorialCurrentStep = n;

    // Hide home, hide all steps, show current
    document.getElementById('tutorialHome').classList.add('hidden');
    document.querySelectorAll('.tutorial-step').forEach(el => el.classList.add('hidden'));
    const stepEl = document.querySelector(`.tutorial-step[data-step="${n}"]`);
    if (stepEl) stepEl.classList.remove('hidden');

    // Header
    document.getElementById('tutorialBackBtn').classList.remove('hidden');
    document.getElementById('tutorialTitle').textContent = TUTORIAL_STEP_TITLES[n] || '';

    // Footer
    const footer = document.getElementById('tutorialFooter');
    footer.classList.remove('hidden');

    // Counter
    document.getElementById('tutorialCounter').textContent = `${n} / ${TUTORIAL_TOTAL_STEPS}`;

    // Prev button – hidden on first step
    const prevBtn = document.getElementById('tutorialPrevBtn');
    prevBtn.classList.toggle('invisible', n === 1);

    // Next button – last step closes
    const nextBtn = document.getElementById('tutorialNextBtn');
    if (n === TUTORIAL_TOTAL_STEPS) {
        nextBtn.innerHTML = 'Schließen <i class="mdi mdi-check text-sm"></i>';
    } else {
        nextBtn.innerHTML = 'Weiter <i class="mdi mdi-arrow-right text-sm"></i>';
    }
}

function tutorialNextStep() {
    if (tutorialCurrentStep >= TUTORIAL_TOTAL_STEPS) {
        closeTutorial();
    } else {
        tutorialGoToStep(tutorialCurrentStep + 1);
    }
}

function tutorialPrevStep() {
    if (tutorialCurrentStep > 1) {
        tutorialGoToStep(tutorialCurrentStep - 1);
    }
}

function removeHelpButtonHighlight() {
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) helpBtn.classList.remove('help-btn-highlight');
}

function initTutorialHighlight() {
    if (!localStorage.getItem('tutorialShown')) {
        const helpBtn = document.getElementById('helpBtn');
        if (helpBtn) {
            helpBtn.classList.add('help-btn-highlight');
            document.addEventListener('click', function (e) {
                if (e.target !== helpBtn && !helpBtn.contains(e.target)) {
                    removeHelpButtonHighlight();
                    localStorage.setItem('tutorialShown', 'true');
                }
            }, { once: true });
        }
    }
}

