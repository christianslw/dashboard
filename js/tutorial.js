// ─── Tutorial Modal ───────────────────────────────────────────────────────────────────

function openTutorial() {
    document.getElementById('tutorialModal').classList.remove('hidden');
    localStorage.setItem('tutorialShown', 'true');
    removeHelpButtonHighlight();
}

function closeTutorial() {
    document.getElementById('tutorialModal').classList.add('hidden');
    removeHelpButtonHighlight();
}

function removeHelpButtonHighlight() {
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
        helpBtn.classList.remove('help-btn-highlight');
    }
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
