// ─── List View ───────────────────────────────────────────────────────────────────────

function filterStandorte() {
    const searchInput = document.getElementById("searchInput");
    const clearBtn = document.getElementById("clearSearchBtn");
    const query = searchInput.value.toLowerCase();

    if (query.length > 0) {
        clearBtn.classList.remove('opacity-0', 'pointer-events-none');
    } else {
        clearBtn.classList.add('opacity-0', 'pointer-events-none');
    }

    // Pre-compute distances so sorting by distance works correctly
    if (userLat && userLon) {
        standorte.forEach(s => {
            if (s.lat && s.lon) {
                s.distance = calcDistance(userLat, userLon, s.lat, s.lon);
            }
        });
    }

    const filtered = getFilteredStandorte();
    updateLocationStatus(filtered.length);
    renderList(filtered);
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    const clearBtn = document.getElementById("clearSearchBtn");
    clearBtn.classList.add('opacity-0', 'pointer-events-none');
    filterStandorte();
}

function renderList(liste) {
    const container = document.getElementById("resultList");
    container.innerHTML = "";

    if (liste.length === 0 && standorte.length > 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-500">Keine Ergebnisse.</div>`;
        updateMapMarkers([]);
        return;
    }

    const displayList = liste.slice(0, 100);

    // 1. create list items
    displayList.forEach((s, index) => {
        const item = document.createElement("div");
        item.className = "group p-3 hover:bg-slate-50 dark:hover:bg-zinc-900 cursor-pointer flex justify-between items-center transition-colors border-b border-transparent";

        let distHtml = "";
        const safeNum = String(s.nummer).replace(/[^a-zA-Z0-9]/g, '');
        const warningBoxId = `warn-box-${safeNum}`;

        if (userLat && userLon) {
            s.distance = calcDistance(userLat, userLon, s.lat, s.lon);
            const calcTime = calcDriveTimeFallback(s.distance);
            distHtml = `
                <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    <span class="font-medium">${s.distance.toFixed(1)} km</span>
                    <span class="flex items-center gap-1 font-medium text-slate-400 dark:text-zinc-500">
                        <i class="mdi mdi-clock-outline text-sm"></i>
                        ${calcTime}
                    </span>
                </div>
            `;
        }

        const listItemId = `list-item-${safeNum}`;
        item.id = listItemId;



        item.innerHTML = `
            <div class="flex items-center gap-3 flex-1" onclick="handleListItemClick(event, '${s.nummer}')">
                <div class="flex-1">
                    <h3 class="text-slate-900 dark:text-zinc-100 text-sm md:text-base flex items-center gap-2 flex-wrap">
                        <span class="font-bold">${s.nummer}</span> 
                        <span class="font-normal text-slate-600 dark:text-zinc-300">${s.name}</span>
                        <button type="button" onclick="toggleFavorite('${s.nummer}', event)" title="Favorit umschalten" class="transition-colors ${isFavorite(s.nummer) ? 'text-amber-500 opacity-100' : 'text-slate-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:opacity-100'}"><i class="mdi mdi-star"></i></button>
                        <span id="${warningBoxId}" class="ml-1 inline-flex empty:hidden"></span>
                    </h3>
                    ${distHtml || `<div class="text-slate-400 text-xs font-mono mt-0.5">${s.lat}, ${s.lon}</div>`}
                </div>
            </div>
            <div class="flex items-center gap-0.5">
                <button type="button"
                    data-planner-btn="${s.nummer}"
                    onclick="togglePlannerFromList('${s.nummer}'); event.stopPropagation();"
                    class="planner-add-btn p-2 shrink-0 transition-all rounded-md"
                    title="Zur Tour hinzufügen / entfernen">
                    <i class="mdi mdi-map-marker-plus planner-add-icon text-xl"></i>
                </button>
                <span class="nav-share-wrap">
                    <button type="button"
                        onclick="shareStandort('${s.nummer}', event)"
                        class="nav-share-btn"
                        title="Standort-Link teilen">
                        <i class="mdi mdi-share-variant"></i>
                    </button>
                </span>
                <a href="${getNavLink(s.lat, s.lon)}" target="_blank"
                   class="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-500 transition-colors"
                   title="Navigation starten" onclick="event.stopPropagation();">
                    <span class="nav-icon-wrap text-xl">
                        <i class="mdi mdi-navigation-variant-outline nav-outline"></i>
                        <i class="mdi mdi-navigation-variant nav-filled"></i>
                    </span>
                </a>
            </div>
        `;
        container.appendChild(item);

        setTimeout(() => checkDWDWarningForList(s.lat, s.lon, warningBoxId), index * 150);
    });

    if (liste.length > 100) {
        const more = document.createElement("div");
        more.className = "p-3 text-center text-xs text-slate-400";
        more.innerText = `...und ${liste.length - 100} weitere (Bitte Suche nutzen)`;
        container.appendChild(more);
    }

    // 2. Map-Marker update after list
    updateMapMarkers(liste);

    if (typeof onOverlayListOrMapChanged === 'function') {
        onOverlayListOrMapChanged();
    }
}

// ─── List & Map Synchronization ────────────────────────────────────────────────────────

function openRouteNavigation(nummer) {
    const standort = standorte.find(s => String(s.nummer) === String(nummer));
    if (standort) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${standort.lat},${standort.lon}`, '_blank');
    }
}

function openTagebuch(nummer) {
    const standort = standorte.find(s => String(s.nummer) === String(nummer));
    if (standort && standort.link) {
        window.open(getTagebuchLink(standort), '_blank');
    }
}

function handleListItemClick(event, nummer) {
    if (event.altKey) {
        openTagebuch(nummer);
    } else if (event.ctrlKey || event.metaKey) {
        openRouteNavigation(nummer);
    } else {
        selectFromList(nummer);
    }
}

function selectFromList(nummer) {
    highlightListItem(nummer);
    focusMapOnStandort(nummer);
    openDashboard(nummer);
}

function highlightListItem(nummer) {
    if (selectedListItemId) {
        const prevItem = document.getElementById(selectedListItemId);
        if (prevItem) prevItem.classList.remove('list-item-selected');
    }

    const safeNum = String(nummer).replace(/[^a-zA-Z0-9]/g, '');
    const listItemId = `list-item-${safeNum}`;
    let listItem = document.getElementById(listItemId);

    if (!listItem) {
        document.getElementById('searchInput').value = String(nummer);
        filterStandorte();
        listItem = document.getElementById(listItemId);
    }

    if (listItem) {
        listItem.classList.add('list-item-selected');
        selectedListItemId = listItemId;

        setTimeout(() => {
            listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }
}