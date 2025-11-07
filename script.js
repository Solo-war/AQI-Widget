let STATION = 'A377965';
let stationLoaded = false;

async function initStation() {
  if (stationLoaded) return STATION;
  try {
    const s = await (window.electronAPI && window.electronAPI.getEnv ? window.electronAPI.getEnv('WAQI_STATION') : null);
    if (s && typeof s === 'string' && s.trim()) {
      STATION = s.trim();
    }
  } catch {}
  stationLoaded = true;
  return STATION;
}

function getAQIIcon(aqi) {
  if (aqi <= 50) return 'icon-0-50-192.png';
  if (aqi <= 100) return 'icon-51-100-192.png';
  if (aqi <= 150) return 'icon-101-150-192.png';
  if (aqi <= 200) return 'icon-151-200-192.png';
  if (aqi <= 300) return 'icon-201-300-192.png';
  return 'icon-300plus-192.png';
}

function getAQIColor(aqi) {
  if (aqi <= 50) return '#00e400'; // Good
  if (aqi <= 100) return '#ffff00'; // Moderate
  if (aqi <= 150) return '#ff7e00'; // Unhealthy for sensitive groups
  if (aqi <= 200) return '#ff0000'; // Unhealthy
  if (aqi <= 300) return '#8f3f97'; // Very Unhealthy
  return '#7e0023'; // Hazardous
}

function getAQICategory(aqi) {
  if (aqi <= 50) return 0; // Хорошо
  if (aqi <= 100) return 1; // Умеренно
  if (aqi <= 150) return 2; // Вредно для чувствительных групп
  if (aqi <= 200) return 3; // Вредно
  if (aqi <= 300) return 4; // Очень вредно
  return 5; // Опасно
}

function getAQICategoryNameRu(cat) {
  switch (cat) {
    case 0: return 'Хорошо';
    case 1: return 'Умеренно';
    case 2: return 'Для чувствительных групп';
    case 3: return 'Вредно';
    case 4: return 'Очень вредно';
    case 5: return 'Опасно';
    default: return '';
  }
}

function getTextColor(bgHex) {
  const hex = (bgHex || '#ffffff').replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 255;
  const g = parseInt(hex.substring(2, 4), 16) || 255;
  const b = parseInt(hex.substring(4, 6), 16) || 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#000' : '#fff';
}

async function getToken() {
  try {
    const token = await window.electronAPI.getEnv('WAQI_TOKEN');
    return token || '';
  } catch {
    return '';
  }
}

function fetchWithTimeout(url, { timeout = 8000, ...options } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

let isLoading = false;
let retryTimer = null;
let retryDelayMs = 15000; // 15s initial retry
let notifyHighAQI = true;

async function loadNotifyPref() {
  try {
    const v = await (window.electronAPI && window.electronAPI.getPref ? window.electronAPI.getPref('notifyHighAQI') : undefined);
    if (typeof v === 'boolean') notifyHighAQI = v;
  } catch {}
}

async function loadAQI() {
  if (isLoading) return;
  const aqiEl = document.getElementById('aqi-value');
  const pm10El = document.getElementById('pm10');
  const pm25El = document.getElementById('pm25');
  const addressEl = document.getElementById('address');
  const iconEl = document.getElementById('aqi-icon');
  const updatedEl = document.getElementById('updated');
  isLoading = true;

  try {
    // Ensure station is initialized once
    if (!stationLoaded) await initStation();
    const token = await getToken();
    if (!token) throw new Error('missing token');

    const url = `https://api.waqi.info/feed/${encodeURIComponent(STATION)}/?token=${encodeURIComponent(token)}`;
    const res = await fetchWithTimeout(url, { timeout: 8000 });
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();

    if (data?.status !== 'ok') throw new Error('bad data');

    const aqi = data?.data?.aqi;
    const pm10 = data?.data?.iaqi?.pm10?.v;
    const pm25 = data?.data?.iaqi?.pm25?.v;
    const address = data?.data?.city?.name || '';

    const aqiNum = Number(aqi);
    if (Number.isFinite(aqiNum)) {
      aqiEl.textContent = `AQI: ${aqiNum}`;
      iconEl.src = getAQIIcon(aqiNum);
      if (window.electronAPI && typeof window.electronAPI.setAQIIcon === 'function') {
        window.electronAPI.setAQIIcon(aqiNum);
      }
      // Уведомления при высоком AQI (категория >= 3)
      try {
        const cat = getAQICategory(aqiNum);
        const prevCat = Number(localStorage.getItem('lastCategory') || '-1');
        if (notifyHighAQI && cat >= 3 && cat !== prevCat && window.electronAPI && typeof window.electronAPI.notify === 'function') {
          const catName = getAQICategoryNameRu(cat);
          const body = `AQI: ${aqiNum} — ${catName}`;
          window.electronAPI.notify('Высокий уровень загрязнения воздуха', body);
        }
        localStorage.setItem('lastCategory', String(cat));
        localStorage.setItem('lastAQI', String(aqiNum));
      } catch {}
    } else {
      aqiEl.textContent = 'AQI: —';
      iconEl.src = getAQIIcon(0);
      if (window.electronAPI && typeof window.electronAPI.setAQIIcon === 'function') {
        window.electronAPI.setAQIIcon(0);
      }
    }

    pm10El.textContent = pm10 != null ? `PM10: ${pm10}` : '';
    pm25El.textContent = pm25 != null ? `PM2.5: ${pm25}` : '';
    addressEl.textContent = `Адрес: ${address || '—'}`;
    updatedEl.textContent = `Обновлено: ${new Date().toLocaleString('ru-RU')}`;

    // Update title bar color according to AQI value
    const drag = document.querySelector('.drag-area');
    const title = document.querySelector('.title');
    const closeBtn = document.getElementById('close-btn');
    const value = Number.isFinite(aqiNum) ? aqiNum : 0;
    const bg = getAQIColor(value);
    const fg = getTextColor(bg);
    if (drag) drag.style.backgroundColor = bg;
    if (title) title.style.color = fg;
    if (closeBtn) closeBtn.style.color = fg;
  } catch (e) {
    aqiEl.textContent = 'Не удалось получить данные. Проверьте сеть или токен.';
    pm10El.textContent = '';
    pm25El.textContent = '';
    addressEl.textContent = 'Адрес: —';
    updatedEl.textContent = '';

    // Reset title bar color on error
    const drag = document.querySelector('.drag-area');
    const title = document.querySelector('.title');
    const closeBtn = document.getElementById('close-btn');
    if (drag) drag.style.backgroundColor = '#ececec';
    if (title) title.style.color = '#000';
    if (closeBtn) closeBtn.style.color = '#000';
    // Quick auto-retry with backoff
    if (!retryTimer) {
      const jitterFactor = 1 + (Math.random() * 0.3 - 0.15); // ±15%
      const delay = Math.min(Math.max(2000, Math.floor(retryDelayMs * jitterFactor)), 120000); // [2s .. 2min]
      retryTimer = setTimeout(() => {
        retryTimer = null;
        retryDelayMs = Math.min(Math.floor(delay * 2), 120000);
        loadAQI();
      }, delay);
    }
  }
  finally {
    isLoading = false;
  }
}

// Initial state
document.getElementById('aqi-value').textContent = 'Загрузка…';

// Close button
document.getElementById('close-btn').addEventListener('click', () => {
  window.electronAPI.closeApp();
});

// Refresh button
const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    try {
      refreshBtn.disabled = true;
      document.getElementById('aqi-value').textContent = 'Загрузка…';
      await loadAQI();
    } finally {
      refreshBtn.disabled = false;
    }
  });
}

// Start and schedule auto-refresh every 10 minutes
async function startPolling() {
  await loadNotifyPref();
  await initStation();
  loadAQI();
  setInterval(loadAQI, 10 * 60 * 1000);
}

if (navigator.onLine) {
  startPolling();
} else {
  // wait for network to come up after boot
  window.addEventListener('online', startPolling, { once: true });
}

// Titlebar color sync with AQI value (fallback observer)
function updateTitlebarFromAQIText() {
  const aqiEl = document.getElementById('aqi-value');
  const drag = document.querySelector('.drag-area');
  const title = document.querySelector('.title');
  const closeBtn = document.getElementById('close-btn');
  if (!aqiEl || !drag || !title || !closeBtn) return;
  const text = aqiEl.textContent || '';
  const match = text.match(/AQI:\s*(\d+)/);
  if (match) {
    const val = Number(match[1]);
    const bg = getAQIColor(val);
    const fg = getTextColor(bg);
    drag.style.backgroundColor = bg;
    title.style.color = fg;
    closeBtn.style.color = fg;
  } else {
    drag.style.backgroundColor = '#ececec';
    title.style.color = '#000';
    closeBtn.style.color = '#000';
  }
}

try {
  const aqiEl = document.getElementById('aqi-value');
  if (aqiEl) {
    const observer = new MutationObserver(() => updateTitlebarFromAQIText());
    observer.observe(aqiEl, { childList: true, characterData: true, subtree: true });
    updateTitlebarFromAQIText();
  }
  if (window.electronAPI && typeof window.electronAPI.onRefresh === 'function') {
    window.electronAPI.onRefresh(async () => {
      try {
        const el = document.getElementById('refresh-btn');
        if (el) el.disabled = true;
        document.getElementById('aqi-value').textContent = 'Загрузка…';
        await loadAQI();
      } finally {
        const el = document.getElementById('refresh-btn');
        if (el) el.disabled = false;
      }
    });
  }
  if (window.electronAPI && typeof window.electronAPI.onPrefsChanged === 'function') {
    window.electronAPI.onPrefsChanged((payload) => {
      try {
        if (payload && payload.key === 'notifyHighAQI') {
          notifyHighAQI = !!payload.value;
        }
      } catch {}
    });
  }
} catch {}
