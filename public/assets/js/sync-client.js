window.WebDocSachSync = (() => {
  const API_URL = 'https://webdocsach-data-api.huydd12401.workers.dev/sync';
  const SYNC_KEY_STORAGE = 'webdocsachSyncKey';
  const LAST_SYNC_STORAGE = 'webdocsachLastSyncAt';
  const DATA_KEYS = [
    'readingProgress',
    'favoriteBooks',
    'rememberReadingPosition',
    'webdocsachSiteTheme',
    'theme',
    'fontsize',
    'fontFamily',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'readerWidth',
    'readerMode',
    'readerWakeLockEnabled',
    'readerPageSoundEnabled',
    'readerSpreadEnabled',
    'readerBrightness',
    'readerAutoScrollSpeed',
    'readerHighContrast',
    'readerReduceMotion',
    'readerGestureEnabled',
    'readerHapticsEnabled',
    'readerAnnotationsV1',
    'readerHistoryV1'
  ];

  function readLocalValue(key) {
    const value = localStorage.getItem(key);
    if (value === null) return undefined;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  function writeLocalValue(key, value) {
    if (value === undefined || value === null) return;
    localStorage.setItem(
      key,
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  }

  function collectData() {
    const data = {};
    DATA_KEYS.forEach(key => {
      const value = readLocalValue(key);
      if (value !== undefined) data[key] = value;
    });

    return {
      app: 'WebDocSach',
      version: 2,
      exportedAt: new Date().toISOString(),
      data
    };
  }

  function mergeProgress(localValue, remoteValue) {
    const local = localValue && typeof localValue === 'object' ? localValue : {};
    const remote = remoteValue && typeof remoteValue === 'object' ? remoteValue : {};
    const merged = { ...local };

    Object.entries(remote).forEach(([bookId, remoteProgress]) => {
      const localProgress = merged[bookId];
      const remoteUpdated = Number(remoteProgress?.updated || 0);
      const localUpdated = Number(localProgress?.updated || 0);
      if (!localProgress || remoteUpdated >= localUpdated) merged[bookId] = remoteProgress;
    });

    return merged;
  }

  function mergeUniqueList(localValue, remoteValue, getId) {
    const map = new Map();
    [...(Array.isArray(localValue) ? localValue : []), ...(Array.isArray(remoteValue) ? remoteValue : [])]
      .forEach((item, index) => {
        const id = getId(item, index);
        if (id) map.set(id, item);
      });
    return Array.from(map.values());
  }

  function mergeHistory(localValue, remoteValue) {
    const local = localValue && typeof localValue === 'object' ? localValue : {};
    const remote = remoteValue && typeof remoteValue === 'object' ? remoteValue : {};
    const merged = { ...local };

    Object.entries(remote).forEach(([bookId, remoteBookHistory]) => {
      merged[bookId] = {
        ...(merged[bookId] || {}),
        ...(remoteBookHistory || {})
      };
    });
    return merged;
  }

  function mergeData(remotePayload, { preferLocalSettings = false } = {}) {
    const remoteData = remotePayload?.data;
    if (!remoteData || typeof remoteData !== 'object') {
      throw new Error('Dữ liệu trên đám mây không hợp lệ.');
    }

    DATA_KEYS.forEach(key => {
      const remoteValue = remoteData[key];
      if (remoteValue === undefined) return;

      const localValue = readLocalValue(key);
      let nextValue = remoteValue;

      if (key === 'readingProgress') {
        nextValue = mergeProgress(localValue, remoteValue);
      } else if (key === 'favoriteBooks') {
        nextValue = mergeUniqueList(localValue, remoteValue, item => String(item || ''));
      } else if (key === 'readerAnnotationsV1') {
        nextValue = mergeUniqueList(localValue, remoteValue, item => String(item?.id || ''));
      } else if (key === 'readerHistoryV1') {
        nextValue = mergeHistory(localValue, remoteValue);
      } else if (preferLocalSettings && localValue !== undefined) {
        nextValue = localValue;
      }

      writeLocalValue(key, nextValue);
    });

    const syncedAt = remotePayload.syncedAt || remotePayload.exportedAt || new Date().toISOString();
    localStorage.setItem(LAST_SYNC_STORAGE, syncedAt);
    document.dispatchEvent(new CustomEvent('webdocsach:sync-applied', {
      detail: { syncedAt }
    }));
    return syncedAt;
  }

  function validateCode(value) {
    const code = String(value || '').trim();
    if (code.length < 12) throw new Error('Mã đồng bộ cần có ít nhất 12 ký tự.');
    if (code.length > 128) throw new Error('Mã đồng bộ không được dài quá 128 ký tự.');
    return code;
  }

  async function request(method, code, body) {
    const response = await fetch(API_URL, {
      method,
      headers: {
        Authorization: `Bearer ${validateCode(code)}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'Không thể kết nối dữ liệu đồng bộ.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function pull(code = getCode()) {
    const payload = await request('GET', code);
    mergeData(payload);
    return payload;
  }

  async function push(code = getCode()) {
    const validatedCode = validateCode(code);

    try {
      const remote = await request('GET', validatedCode);
      mergeData(remote, { preferLocalSettings: true });
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    const payload = collectData();
    await request('PUT', validatedCode, payload);
    localStorage.setItem(LAST_SYNC_STORAGE, new Date().toISOString());
    return payload;
  }

  function generateCode() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function saveCode(code) {
    const validatedCode = validateCode(code);
    localStorage.setItem(SYNC_KEY_STORAGE, validatedCode);
    return validatedCode;
  }

  function getCode() {
    return localStorage.getItem(SYNC_KEY_STORAGE) || '';
  }

  function clearCode() {
    localStorage.removeItem(SYNC_KEY_STORAGE);
  }

  return Object.freeze({
    DATA_KEYS: [...DATA_KEYS],
    collectData,
    mergeData,
    pull,
    push,
    generateCode,
    saveCode,
    getCode,
    clearCode,
    getLastSync: () => localStorage.getItem(LAST_SYNC_STORAGE) || ''
  });
})();
