// ==========================================
// DWD Warnings & Weather
// ==========================================

async function fetchDWD(lat, lon) {
    const cacheKey = `${lat.toFixed(1)}_${lon.toFixed(1)}`;
    if (warningsCache[cacheKey] !== undefined) return warningsCache[cacheKey];

    try {
        const res = await fetch(`https://api.brightsky.dev/alerts?lat=${lat}&lon=${lon}`);
        if (!res.ok) throw new Error("DWD Limit");
        const data = await res.json();
        const activeAlerts = data.alerts || [];
        warningsCache[cacheKey] = activeAlerts;
        return activeAlerts;
    } catch (e) {
        warningsCache[cacheKey] = [];
        return [];
    }
}

function getDwdSeverityColor(severity) {
    const level = getDwdSeverityRank(severity);
    if (level === 4) return getCssVariableValue('--dwd-level-4', '#9333ea');
    if (level === 3) return getCssVariableValue('--dwd-level-3', '#ef4444');
    if (level === 2) return getCssVariableValue('--dwd-level-2', '#f97316');
    if (level === 1) return getCssVariableValue('--dwd-level-1', '#eab308');
    return getCssVariableValue('--dwd-level-1', '#eab308');
}

function getDwdSeverityFilter(severity) {
    const level = getDwdSeverityRank(severity);
    if (level === 4) return getCssVariableValue('--dwd-level-4-filter', 'brightness(0) saturate(100%) invert(28%) sepia(76%) saturate(2050%) hue-rotate(252deg) brightness(94%) contrast(96%)');
    if (level === 3) return getCssVariableValue('--dwd-level-3-filter', 'brightness(0) saturate(100%) invert(46%) sepia(96%) saturate(2553%) hue-rotate(336deg) brightness(99%) contrast(89%)');
    if (level === 2) return getCssVariableValue('--dwd-level-2-filter', 'brightness(0) saturate(100%) invert(61%) sepia(70%) saturate(4063%) hue-rotate(357deg) brightness(101%) contrast(96%)');
    if (level === 1) return getCssVariableValue('--dwd-level-1-filter', 'brightness(0) saturate(100%) invert(67%) sepia(77%) saturate(803%) hue-rotate(1deg) brightness(101%) contrast(90%)');
    return 'brightness(0) saturate(100%)';
}

function getCssVariableValue(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function hexToRgba(hexColor, alpha) {
    if (typeof hexColor !== 'string') return `rgba(234,179,8,${alpha})`;
    let hex = hexColor.trim().replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length !== 6) return `rgba(234,179,8,${alpha})`;

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDwdEventIconPath(eventDe, eventEn) {
    const ed = typeof eventDe === 'string' ? eventDe.toLowerCase() : '';
    const ee = typeof eventEn === 'string' ? eventEn.toLowerCase() : '';

    const isThunder = ed.includes('gewitter') || ee.includes('thunder') || ee.includes('lightning');
    const isWind    = !isThunder && (ed.includes('wind') || ed.includes('böen') || ed.includes('boen') || ed.includes('sturm') || ed.includes('orkan')
                        || ee.includes('wind') || ee.includes('gust') || ee.includes('squall') || ee.includes('storm'));
    const isFog     = ed.includes('nebel') || ee.includes('fog') || ee.includes('mist');
    const isFlood   = ed.includes('hochwasser') || ed.includes('überflutung') || ed.includes('ueberflutung')
                    || ee.includes('flood') || ee.includes('inundation');
    const isSnow    = ed.includes('schnee') || ed.includes('graupel') || ee.includes('snow') || ee.includes('sleet') || ee.includes('hail');
    const isLowTemp = ed.includes('kälte') || ed.includes('kaelte') || ed.includes('kalt') || ee.includes('cold') || ee.includes('low temperature');
    const isSlippery = ed.includes('glätte') || ed.includes('glaette') || ed.includes('glatt') || ed.includes('eis') || ee.includes('slippery') || ee.includes('black ice');
    const isFrost   = ed.includes('frost') || ed.includes('glatt') || ed.includes('eis') || ee.includes('frost') || ee.includes('ice') || ee.includes('glaze');
    const isRain    = !isThunder && !isSnow && (ed.includes('regen') || ed.includes('niederschlag') || ee.includes('rain') || ee.includes('shower') || ee.includes('drizzle'));
    const isHeat    = ed.includes('hitze') || ed.includes('wärme') || ee.includes('heat');

    if (isThunder) return 'res/icons/mdi_thunder.svg';
    if (isWind) return 'res/icons/mdi_wind.svg';
    if (isFog) return 'res/icons/mdi_fog.svg';
    if (isFlood || isRain) return 'res/icons/mdi_flood.svg';
    if (isSnow) return 'res/icons/mdi_snow.svg';
    if (isHeat) return 'res/icons/mdi_heat.svg';
    if (isLowTemp) return 'res/icons/mdi_lowtemp.svg';
    if (isSlippery) return 'res/icons/mdi_slippery.svg';
    if (isFrost) return 'res/icons/mdi_frost.svg';
    return 'res/icons/mdi_thunder.svg';
}

function getDwdLevelBox(severity, eventDe, eventEn) {
    const iconPath = getDwdEventIconPath(eventDe, eventEn);
    const iconFilter = getDwdSeverityFilter(severity);
    const label = (eventDe || eventEn || severity || 'Warnung').replace(/"/g, '&quot;');
    const sizeClass = iconPath.includes('slippery') ? 'w-7 h-7' : 'w-5 h-5';
    return `
        <span class="inline-flex items-center" title="${label}">
            <img src="${iconPath}" alt="DWD Warnsymbol" class="${sizeClass} shrink-0" style="filter:${iconFilter};" />
        </span>
    `;
}


function getDwdSeverityRank(severity) {
    const normalizedSeverity = typeof severity === 'string' ? severity.toLowerCase() : '';

    if (normalizedSeverity === 'extreme') return 4;
    if (normalizedSeverity === 'severe') return 3;
    if (normalizedSeverity === 'moderate') return 2;
    if (normalizedSeverity === 'minor') return 1;
    return 0;
}

function getHighestDwdAlert(alerts) {
    return alerts.reduce((highest, alert) => {
        if (getDwdSeverityRank(alert?.severity) < 1) return highest;
        if (!highest) return alert;
        return getDwdSeverityRank(alert.severity) > getDwdSeverityRank(highest.severity) ? alert : highest;
    }, null);
}

async function checkDWDWarningForList(lat, lon, boxId) {
    try {
        const alerts = await fetchDWD(lat, lon);
        const box = document.getElementById(boxId);
        const highestAlert = getHighestDwdAlert(alerts);

        if (box) {
            box.innerHTML = highestAlert
                ? getDwdLevelBox(highestAlert.severity, highestAlert.event_de, highestAlert.event_en)
                : '';
        }
    } catch (e) {}
}

async function updateDWDDetailBox(lat, lon) {
    const box = document.getElementById("dwdAlertBox");
    const title = document.getElementById("dwdAlertTitle");
    const text = document.getElementById("dwdAlertText");
    const icon = document.getElementById("dwdAlertIcon");

    box.classList.remove("hidden");
    box.className = "p-3 border-t";
    box.style.backgroundColor = '';
    box.style.borderColor = '';
    title.innerText = "Prüfe DWD...";
    text.innerText = "";
    title.className = "text-sm font-semibold";
    title.style.color = '';
    text.style.color = '';
    if (icon) icon.style.color = '';

    const alerts = await fetchDWD(lat, lon);
    const mainAlert = getHighestDwdAlert(alerts);

    if (!mainAlert) {
        title.innerText = "Keine amtlichen Warnungen";
        title.className = "text-sm font-semibold";
        title.style.color = '';
        box.style.backgroundColor = '';
        box.style.borderColor = '';
        if (icon) icon.style.color = '';
    } else {
        const severityColor = getDwdSeverityColor(mainAlert.severity);
        const level = getDwdSeverityRank(mainAlert.severity);
        const bgAlpha = level >= 3 ? 0.16 : 0.12;
        const borderAlpha = level >= 3 ? 0.45 : 0.35;

        box.className = "p-3 border-t";
        box.style.backgroundColor = hexToRgba(severityColor, bgAlpha);
        box.style.borderColor = hexToRgba(severityColor, borderAlpha);

        title.innerText = mainAlert.headline_de || "Wetterwarnung";
        title.className = "text-sm font-bold";
        title.style.color = severityColor;

        text.innerText = mainAlert.description_de || "";
        text.className = "text-xs mt-1";
        text.style.color = severityColor;

        if (icon) icon.style.color = severityColor;
    }
}

async function fetchWeather(lat, lon) {
    document.getElementById("weatherTemp").innerText = "-- °C";
    document.getElementById("weatherDesc").innerText = "";
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await res.json();
        const code = data.current_weather.weathercode;
        document.getElementById("weatherTemp").innerText = `${data.current_weather.temperature} °C`;

        let wSvg = `<svg class="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
        let wText = "Klar";

        if (code > 0) {
            wSvg = `<svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>`;
            wText = "Bewölkt";
        }
        if (code >= 51 && code <= 67) {
            wSvg = `<svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14v2m-4-2v2m8-2v2M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>`;
            wText = "Regen";
        }
        if (code >= 95) {
            wSvg = `<svg class="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`;
            wText = "Gewitter";
        }

        document.getElementById("weatherIcon").innerHTML = wSvg;
        document.getElementById("weatherDesc").innerText = wText;
    } catch (e) {}
}
