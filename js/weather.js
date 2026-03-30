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
    const s = typeof severity === 'string' ? severity.toLowerCase() : '';
    if (s === 'extreme') return '#9333ea';
    if (s === 'severe')  return '#ef4444';
    if (s === 'moderate') return '#f97316';
    if (s === 'minor')   return '#eab308';
    return '#eab308';
}

function getDwdEventIconSvg(eventDe, eventEn, color) {
    const ed = typeof eventDe === 'string' ? eventDe.toLowerCase() : '';
    const ee = typeof eventEn === 'string' ? eventEn.toLowerCase() : '';

    const isThunder = ed.includes('gewitter') || ee.includes('thunder') || ee.includes('lightning');
    const isWind    = !isThunder && (ed.includes('wind') || ed.includes('böen') || ed.includes('boen') || ed.includes('sturm') || ed.includes('orkan')
                        || ee.includes('wind') || ee.includes('gust') || ee.includes('squall') || ee.includes('storm'));
    const isFog     = ed.includes('nebel') || ee.includes('fog') || ee.includes('mist');
    const isSnow    = ed.includes('schnee') || ed.includes('graupel') || ee.includes('snow') || ee.includes('sleet') || ee.includes('hail');
    const isFrost   = ed.includes('frost') || ed.includes('glatt') || ed.includes('eis') || ee.includes('frost') || ee.includes('ice') || ee.includes('glaze');
    const isRain    = !isThunder && !isSnow && (ed.includes('regen') || ed.includes('niederschlag') || ee.includes('rain') || ee.includes('shower') || ee.includes('drizzle'));
    const isHeat    = ed.includes('hitze') || ed.includes('wärme') || ee.includes('heat');

    const style = `style="color:${color}"`;
    const cls   = `class="w-4 h-4 inline-block shrink-0"`;
    const base  = `<svg ${cls} ${style} fill="none" stroke="currentColor" viewBox="0 0 24 24">`;

    if (isThunder) {
        // Lightning bolt
        return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`;
    }
    if (isWind) {
        // Wind / storm gusts — flag-like lines
        return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h14a2 2 0 010 4H4m0 0V4m0 6v4m0-4h10a2 2 0 010 4H4"/></svg>`;
    }
    if (isFog) {
        // Horizontal fog lines
        return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 12h12M4 16h8"/></svg>`;
    }
    if (isSnow) {
        // Snowflake (cross + diagonals)
        return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20M2 12h20M5.636 5.636l12.728 12.728M18.364 5.636L5.636 18.364"/></svg>`;
    }
    if (isRain) {
        // Cloud + rain drops
        return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14v2m-4-2v2m8-2v2M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>`;
    }
    if (isFrost) {
        // Ice / thermometer cold
        return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20M7 7l5 5 5-5M7 17l5-5 5 5"/></svg>`;
    }
    if (isHeat) {
        // Sun / heat
        return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`;
    }
    // Default: warning triangle
    return `${base}<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
}

function getDwdLevelBox(severity, eventDe, eventEn) {
    const color = getDwdSeverityColor(severity);
    const svg   = getDwdEventIconSvg(eventDe, eventEn, color);
    const label = (eventDe || eventEn || severity || 'Warnung').replace(/"/g, '&quot;');
    return `<span class="inline-flex items-center" title="${label}">${svg}</span>`;
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

    box.classList.remove("hidden");
    box.className = "p-3 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900";
    title.innerText = "Prüfe DWD...";
    text.innerText = "";
    title.className = "text-sm font-semibold text-slate-500";

    const alerts = await fetchDWD(lat, lon);
    const mainAlert = getHighestDwdAlert(alerts);

    if (!mainAlert) {
        title.innerText = "Keine amtlichen Warnungen";
        title.className = "text-sm font-semibold text-green-600 dark:text-green-500";
    } else {
        const isSevere = getDwdSeverityRank(mainAlert.severity) >= 3;
        box.className = `p-3 border-t ${isSevere ? 'bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50' : 'bg-orange-50/50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/50'}`;
        title.innerText = mainAlert.headline_de || "Wetterwarnung";
        title.className = `text-sm font-bold ${isSevere ? 'text-red-700 dark:text-red-400' : 'text-orange-700 dark:text-orange-400'}`;
        text.innerText = mainAlert.description_de || "";
        text.className = `text-xs mt-1 ${isSevere ? 'text-red-600 dark:text-red-300' : 'text-orange-600 dark:text-orange-300'}`;
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
