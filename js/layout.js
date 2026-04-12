import { DockviewComponent } from 'https://cdn.jsdelivr.net/npm/dockview-core@2.14.0/dist/index.mjs';

export function initLayoutManager() {
    const container = document.getElementById('dockviewContainer');
    if (!container) return;

    window.dockview = new DockviewComponent(container, {
        createComponent: (options) => {
            const div = document.createElement('div');
            div.className = 'w-full h-full overflow-hidden relative flex flex-col bg-white dark:bg-zinc-950';

            switch (options.name) {
                case 'mapPanel':
                    const mapWrap = document.getElementById('mainMapWrapper');
                    if (mapWrap) {
                        div.appendChild(mapWrap);
                        mapWrap.classList.remove('hidden', 'md:flex');
                        mapWrap.style.display = 'flex';
                        mapWrap.style.flex = '1';
                        mapWrap.style.width = '100%';
                        mapWrap.style.height = '100%';
                    }
                    return {
                        init: (params) => {
                            params.onDidDimensionsChange(() => {
                                if (typeof leafletMap !== 'undefined' && leafletMap) {
                                    setTimeout(() => leafletMap.invalidateSize({ animate: false }), 50);
                                }
                            });
                        },
                        get element() { return div; }
                    };

                case 'listPanel':
                    const listWrap = document.getElementById('listWrapper');
                    if (listWrap) {
                        div.appendChild(listWrap);
                        listWrap.style.display = 'block';
                        listWrap.style.width = '100%';
                        listWrap.style.height = '100%';
                    }
                    return {
                        init: (params) => {},
                        get element() { return div; }
                    };

                case 'plannerPanel':
                    const plannerInner = document.getElementById('plannerInner');
                    if (plannerInner) {
                        // Remove resize controls because Dockview handles it
                        const rE = document.getElementById('plannerResizeE');
                        const rS = document.getElementById('plannerResizeS');
                        const rSE = document.getElementById('plannerResizeSE');
                        const rDrag = document.getElementById('plannerDragHandle');
                        if (rE) rE.remove();
                        if (rS) rS.remove();
                        if (rSE) rSE.remove();
                        if (rDrag) rDrag.remove();
                        
                        plannerInner.style.height = '100%';
                        plannerInner.style.flex = '1';
                        plannerInner.style.border = 'none';
                        div.appendChild(plannerInner);
                    }
                    return {
                        init: (params) => {},
                        get element() { return div; }
                    };
                default:
                    return {
                        init: () => {},
                        get element() { return div; }
                    };
            }
        }
    });

    // Handle theme toggle events for dockview
    const styleElem = document.createElement('style');
    styleElem.innerHTML = `
        .dockview-theme-dark {
            --dv-activegroup-visiblepanel-tab-background-color: #18181b;
            --dv-inactivegroup-visiblepanel-tab-background-color: #09090b;
            --dv-paneview-header-border-color: #27272a;
            --dv-tabs-and-actions-container-background-color: #09090b;
            --dv-separator-border: #27272a;
            --dv-group-view-background-color: #09090b;
        }
        .dockview-theme-light {
            --dv-activegroup-visiblepanel-tab-background-color: #ffffff;
            --dv-inactivegroup-visiblepanel-tab-background-color: #f8fafc;
            --dv-paneview-header-border-color: #e2e8f0;
            --dv-tabs-and-actions-container-background-color: #f1f5f9;
            --dv-separator-border: #e2e8f0;
            --dv-group-view-background-color: #ffffff;
        }
        #dockviewContainer {
            width: 100%;
            height: 100%;
        }
    `;
    document.head.appendChild(styleElem);

    updateDockviewTheme();

    const savedLayout = localStorage.getItem('dockview_layout');
    
    if (savedLayout) {
        try {
            window.dockview.fromJSON(JSON.parse(savedLayout));
        } catch (e) {
            console.error("Failed to restore layout", e);
            setupDefaultLayout();
        }
    } else {
        setupDefaultLayout();
    }

    // Save layout on change
    window.dockview.onDidLayoutChange(() => {
        const layout = window.dockview.toJSON();
        localStorage.setItem('dockview_layout', JSON.stringify(layout));
    });

    // Make functions global for settings/buttons
    window.resetLayoutManager = () => {
        window.dockview.clear();
        setupDefaultLayout();
    };

    window.openPlannerPanel = () => {
        let p = window.dockview.getPanel('planner_panel');
        if (!p) {
            window.dockview.addPanel({
                id: 'planner_panel',
                component: 'plannerPanel',
                title: 'Tourenplaner',
                position: { referencePanel: 'list_panel', direction: 'below' }
            });
            p = window.dockview.getPanel('planner_panel');
            
            p.api.onDidVisibilityChange((e) => {
                if (e.isVisible) {
                    if (typeof handlePlannerShown === 'function') handlePlannerShown();
                } else {
                    if (typeof handlePlannerHidden === 'function') handlePlannerHidden();
                }
            });
            
            p.api.onDidActiveChange((e) => {
                if (e.isActive) {
                    if (typeof handlePlannerShown === 'function') handlePlannerShown();
                }
            });
        }
        window.dockview.getPanel('planner_panel')?.focus();
    };

    window.closePlannerPanel = () => {
        const p = window.dockview.getPanel('planner_panel');
        if (p) p.close();
        if (typeof handlePlannerHidden === 'function') handlePlannerHidden();
    };
}

function setupDefaultLayout() {
    window.dockview.addPanel({
        id: 'list_panel',
        component: 'listPanel',
        title: 'Liste',
    });

    window.dockview.addPanel({
        id: 'map_panel',
        component: 'mapPanel',
        title: 'Karte',
        position: {
            referencePanel: 'list_panel',
            direction: 'right'
        }
    });

    // Adjust width ratio logic 
    requestAnimationFrame(() => {
        const panel = window.dockview.getPanel('list_panel');
        if (panel && panel.group && panel.group.api) {
            const layoutAPI = window.dockview;
            if (layoutAPI.width > 800) {
                 window.dockview.resizeTo(panel.group, 350, undefined);
            }
        }
    });
}

function updateDockviewTheme() {
    const container = document.getElementById('dockviewContainer');
    if (!container) return;
    if (document.documentElement.classList.contains('dark')) {
        container.className = 'dockview-theme-dark';
    } else {
        container.className = 'dockview-theme-light';
    }
}

// Observe html class changes to adapt dockview theme
const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
        if (m.attributeName === 'class') {
            updateDockviewTheme();
        }
    });
});
observer.observe(document.documentElement, { attributes: true });

// Assign init globally to be called from init.js
window.initLayoutManagerHook = initLayoutManager;
