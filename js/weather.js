// ─── DWD Warnings & Weather ────────────────────────────────────────────────────────────

async function fetchDWD(lat, lon) {
    const cacheKey = `${lat.toFixed(1)}_${lon.toFixed(1)}`;
    if (warningsCache[cacheKey] !== undefined) return warningsCache[cacheKey];

    try {
        const res = await fetch(`${BRIGHTSKY_BASE_URL}/alerts?lat=${lat}&lon=${lon}`);
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
    const severityColor = getDwdSeverityColor(severity);
    const level = getDwdSeverityRank(severity);
    const label = (eventDe || eventEn || severity || 'Warnung').replace(/"/g, '&quot;');
    const sizeClass = iconPath.includes('slippery') ? 'w-7 h-7' : 'w-5 h-5';
    const levelLabel = level > 0 ? `Stufe ${level}` : (severity || '');
    const eventLabel = (eventDe || eventEn || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const hoverText = eventLabel ? `${levelLabel} &middot; ${eventLabel}` : levelLabel;
    const bgColor = hexToRgba(severityColor, 0.13);
    return `
        <span class="inline-flex items-center gap-1" title="${label}">
            <img src="${iconPath}" alt="DWD Warnsymbol" class="${sizeClass} shrink-0" style="filter:${iconFilter};" />
            <span class="dwd-warn-label" style="--dwl-color:${severityColor};--dwl-bg:${bgColor};">${hoverText}</span>
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
    title.textContent = "Prüfe DWD...";
    text.textContent = "";
    title.className = "text-sm font-semibold";
    title.style.color = '';
    text.style.color = '';
    if (icon) icon.style.color = '';

    const alerts = await fetchDWD(lat, lon);
    const mainAlert = getHighestDwdAlert(alerts);

    if (!mainAlert) {
        title.textContent = "Keine amtlichen Warnungen";
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

        title.textContent = mainAlert.headline_de || "Wetterwarnung";
        title.className = "text-sm font-bold";
        title.style.color = severityColor;

        text.textContent = mainAlert.description_de || "";
        text.className = "text-xs mt-1";
        text.style.color = severityColor;

        if (icon) icon.style.color = severityColor;
    }
}

// WMO weathercode → { mdiIcon, label, color }
function getWmoMeta(code) {
    if (code === 0)                    return { icon: 'mdi-weather-sunny',            label: 'Klar',         color: '#f59e0b' };
    if (code <= 2)                     return { icon: 'mdi-weather-partly-cloudy',    label: 'Teilw. bew.', color: '#94a3b8' };
    if (code === 3)                    return { icon: 'mdi-weather-cloudy',            label: 'Bedeckt',     color: '#64748b' };
    if (code <= 49)                    return { icon: 'mdi-weather-fog',               label: 'Nebel',        color: '#94a3b8' };
    if (code <= 57)                    return { icon: 'mdi-weather-rainy',             label: 'Nieselregen', color: '#60a5fa' };
    if (code <= 65)                    return { icon: 'mdi-weather-pouring',           label: 'Regen',        color: '#3b82f6' };
    if (code <= 67)                    return { icon: 'mdi-weather-snowy-rainy',       label: 'Eisregen',     color: '#818cf8' };
    if (code <= 77)                    return { icon: 'mdi-weather-snowy',             label: 'Schnee',       color: '#bae6fd' };
    if (code <= 82)                    return { icon: 'mdi-weather-partly-rainy',      label: 'Schauer',      color: '#60a5fa' };
    if (code <= 86)                    return { icon: 'mdi-weather-snowy-rainy',       label: 'Schneesch.',  color: '#818cf8' };
    if (code <= 94)                    return { icon: 'mdi-snowflake-alert',           label: 'Graupel',      color: '#a5f3fc' };
    return                                    { icon: 'mdi-weather-lightning-rainy',   label: 'Gewitter',     color: '#818cf8' };
}

function renderForecastStrip(hourly) {
    const strip = document.getElementById('forecastStrip');
    if (!strip || !hourly?.time) return;

    // API may return either 'weathercode' (old) or 'weather_code' (new) key
    const wcArr = hourly.weathercode ?? hourly.weather_code ?? [];

    const now   = new Date();
    const cards = [];
    for (let i = 0; i < hourly.time.length && cards.length < 12; i++) {
        const t = new Date(hourly.time[i]);
        if (t < now) continue;
        const meta    = getWmoMeta(wcArr[i] ?? 0);
        const temp    = hourly.temperature_2m?.[i] ?? '--';
        const wind    = hourly.windspeed_10m?.[i] ?? '--';
        const precip  = (hourly.precipitation?.[i] ?? 0).toFixed(1);
        const timeStr = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        cards.push(`
            <div class="flex flex-col items-center gap-0.5 px-3 py-2 rounded-md bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shrink-0 text-center min-w-[64px]">
                <span class="text-xs text-slate-500 dark:text-zinc-400 font-medium">${timeStr}</span>
                <i class="mdi ${meta.icon} text-xl my-0.5" style="color:${meta.color}"></i>
                <span class="text-sm font-bold text-slate-800 dark:text-zinc-200">${temp}°</span>
                <span class="text-[10px] text-blue-500 dark:text-blue-400 flex items-center gap-0.5"><i class="mdi mdi-weather-windy text-xs"></i>${wind}</span>
                ${parseFloat(precip) > 0 ? `<span class="text-[10px] text-blue-400 flex items-center gap-0.5"><i class="mdi mdi-water text-xs"></i>${precip}mm</span>` : ''}
            </div>
        `);
    }
    strip.innerHTML = cards.join('');
}

async function fetchWeather(lat, lon) {
    const tempEl = document.getElementById("weatherTemp");
    const iconEl = document.getElementById("weatherIcon");
    const descEl = document.getElementById("weatherDesc");
    const windEl = document.getElementById("weatherWind");

    if (tempEl) tempEl.textContent = "-- °C";
    if (descEl) descEl.textContent = "";
    if (windEl) windEl.textContent = "-- km/h";

    try {
        const res = await fetch(
            `${OPEN_METEO_BASE_URL}?latitude=${lat}&longitude=${lon}` +
            `&current_weather=true` +
            `&hourly=temperature_2m,weathercode,windspeed_10m,precipitation` +
            `&forecast_days=2&timezone=auto`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const cw = data.current_weather ?? {};
        const code = cw.weathercode ?? cw.weather_code ?? 0;
        const meta = getWmoMeta(code);

        if (tempEl) tempEl.textContent = `${cw.temperature ?? '--'} °C`;
        if (iconEl) iconEl.innerHTML = `<i class="mdi ${meta.icon}" style="font-size:2rem;color:${meta.color};line-height:1"></i>`;
        if (descEl) descEl.textContent = meta.label;
        if (windEl) windEl.textContent = `${cw.windspeed ?? '--'} km/h`;

        renderForecastStrip(data.hourly);
    } catch (e) {
        if (iconEl) iconEl.innerHTML = `<svg class="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
    }
}
