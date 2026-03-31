const PROGRESS_KEY = 'readingProgress';
const REMEMBER_PROGRESS_KEY = 'rememberReadingPosition';
const CHAPTERS_PER_PART = 200;
const GENRES = ['kinh dị', 'trinh thám', 'huyền huyễn', 'linh dị', 'bói toán', 'tiên hiệp', 'xuyên không'];
const THEMES = [
  { bg: '#0f172a', text: '#e2e8f0' },
  { bg: '#fdf6e3', text: '#222222' },
  { bg: '#fff8dc', text: '#5b4636' }
];

let booksData = [];
let currentBook = '';
let currentChapter = 1;
let totalChapters = 1;

async function apiFetch(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

async function fetchBooksData() {
  try {
    return await apiFetch('/api/books');
  } catch (error) {
    const res = await fetch('data/books.json');
    return res.json();
  }
}

function formatBookIdAsTitle(bookId) {
  return String(bookId || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function updateReaderBookTitle(bookId) {
  const titleEl = document.getElementById('readerBookTitle');
  if (!titleEl || !bookId) return;

  let nextTitle = formatBookIdAsTitle(bookId) || 'Đọc truyện';

  try {
    const list = await fetchBooksData();
    const matchedBook = Array.isArray(list)
      ? list.find(book => book && book.id === bookId)
      : null;

    if (matchedBook && matchedBook.title) {
      nextTitle = matchedBook.title;
    }
  } catch (error) {
    // Keep fallback title.
  }

  titleEl.textContent = nextTitle;
  titleEl.title = nextTitle;
  document.title = `${nextTitle} | Đọc truyện`;
}

function loadProgressMap() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function shouldRememberProgress() {
  return localStorage.getItem(REMEMBER_PROGRESS_KEY) !== '0';
}

function saveProgressMap(map) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch (error) {
    // Ignore storage errors.
  }
}

function getProgress(bookId) {
  if (!shouldRememberProgress()) return null;
  const map = loadProgressMap();
  return map[bookId] || null;
}

function saveProgress(bookId, chapter) {
  if (!bookId || !shouldRememberProgress()) return;
  const map = loadProgressMap();
  map[bookId] = { chapter: Number(chapter), updated: Date.now() };
  saveProgressMap(map);
}

function renderBookList(list) {
  const container = document.getElementById('book-list');
  if (!container) return;

  container.innerHTML = '';

  list.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book';

    const saved = getProgress(book.id);
    const chapToOpen = saved && saved.chapter ? saved.chapter : 1;

    card.innerHTML = `
      <img src="${book.cover}" alt="${book.title}">
      <div class="book-info">
        <h3>${book.title}</h3>
        <p>${book.author || ''}</p>
        <p>${book.status || ''}</p>
        <p>${book.date || ''}</p>
      </div>
    `;

    if (saved && saved.chapter) {
      const info = card.querySelector('.book-info');
      const badge = document.createElement('div');
      badge.className = 'continue-badge';
      badge.innerText = `Tiếp tục: Chương ${saved.chapter}`;
      badge.style.marginTop = '6px';
      badge.style.fontSize = '13px';
      badge.style.opacity = '0.9';
      info.appendChild(badge);
    }

    card.addEventListener('click', () => {
      window.location.href = `reader.html?book=${book.id}&chap=${chapToOpen}`;
    });

    container.appendChild(card);
  });
}

function buildGenreFilters() {
  const container = document.getElementById('genreFilters');
  if (!container) return;

  container.innerHTML = '';
  GENRES.forEach(genre => {
    const id = `genre-${genre.replace(/\s+/g, '-')}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `<input type="checkbox" id="${id}" value="${genre}"> ${genre}`;
    container.appendChild(label);
  });
}

function applyBookFilters() {
  const query = (document.getElementById('bookSearch')?.value || '').trim().toLowerCase();
  const checkedGenres = Array.from(
    document.querySelectorAll('#genreFilters input[type="checkbox"]:checked')
  ).map(input => input.value.toLowerCase());

  const filtered = booksData.filter(book => {
    const titleMatch = !query || (book.title && book.title.toLowerCase().includes(query));
    if (!checkedGenres.length) return titleMatch;

    const bookGenres = [];
    if (book.genre) {
      if (Array.isArray(book.genre)) {
        bookGenres.push(...book.genre.map(item => String(item).toLowerCase()));
      } else {
        bookGenres.push(String(book.genre).toLowerCase());
      }
    }

    const genreMatch = checkedGenres.some(genre => bookGenres.includes(genre));
    return titleMatch && genreMatch;
  });

  renderBookList(filtered);
}

async function loadBooks() {
  if (!document.getElementById('book-list')) return;

  booksData = await fetchBooksData();
  buildGenreFilters();
  renderBookList(booksData);

  document.getElementById('bookSearch')?.addEventListener('input', applyBookFilters);
  document.getElementById('genreFilters')?.addEventListener('change', applyBookFilters);
}

function chapterToPart(chap) {
  return Math.floor((chap - 1) / CHAPTERS_PER_PART) + 1;
}

function partRange(part) {
  const start = (part - 1) * CHAPTERS_PER_PART + 1;
  const end = Math.min(part * CHAPTERS_PER_PART, totalChapters);
  return { start, end };
}

function getChapterPath(chap) {
  const part = chapterToPart(chap);
  return `data/${currentBook}/phần ${part}/${chap}.txt`;
}

function renderChapterContent(contentEl, text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const titleIndex = lines.findIndex(line => line.trim());

  contentEl.innerHTML = '';

  if (titleIndex === -1) {
    contentEl.innerText = normalized;
    return;
  }

  const title = lines[titleIndex].trim();
  const body = lines.slice(titleIndex + 1).join('\n').trim();
  const hasChapterTitle =
    title.length <= 160 &&
    (body.length > 0 || /^ch/i.test(title) || title.includes(':'));

  if (!hasChapterTitle) {
    contentEl.innerText = normalized;
    return;
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'chapter-title';
  titleEl.textContent = title;
  contentEl.appendChild(titleEl);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'chapter-body';
  bodyEl.textContent = body;
  contentEl.appendChild(bodyEl);
}

function loadChapter() {
  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  const partPath = getChapterPath(currentChapter);
  const fallbackPath = `data/${currentBook}/${currentChapter}.txt`;

  const tryFetch = (url) => (
    fetch(encodeURI(url)).then(res => {
      if (!res.ok) throw res;
      return res.text();
    })
  );

  tryFetch(partPath)
    .catch(() => tryFetch(fallbackPath))
    .then(text => {
      renderChapterContent(contentEl, text);
      saveProgress(currentBook, currentChapter);
    })
    .catch(err => {
      const msg = err && err.status
        ? `Không thể tải chương ${currentChapter} (HTTP ${err.status})`
        : (err && err.message) ? err.message : String(err);
      contentEl.innerText = `Lỗi tải chương: ${msg}`;
    });
}

function loadSelects() {
  const partTop = document.getElementById('partSelect');
  const selectTop = document.getElementById('chapterSelect');
  const selectBottom = document.getElementById('chapterSelectBottom');
  if (!partTop || !selectTop || !selectBottom) return;

  [partTop, selectTop, selectBottom].forEach(el => { el.innerHTML = ''; });

  const totalParts = Math.max(1, Math.ceil(totalChapters / CHAPTERS_PER_PART));
  const currentPart = chapterToPart(currentChapter);

  for (let part = 1; part <= totalParts; part += 1) {
    const opt = document.createElement('option');
    opt.value = part;
    opt.innerText = `Phần ${part}`;
    if (part === currentPart) opt.selected = true;
    partTop.appendChild(opt);
  }

  // Lấy tiêu đề chương cho dropdown
  const range = partRange(currentPart);
  const chapterTitlePromises = [];
  for (let chap = range.start; chap <= range.end; chap += 1) {
    const chapterPath = getChapterPath(chap);
    chapterTitlePromises.push(
      fetch(encodeURI(chapterPath))
        .then(res => res.ok ? res.text() : '')
        .then(text => {
          let title = `Chương ${chap}`;
          if (text) {
            const firstLine = text.split('\n').find(line => line.trim());
            if (firstLine) {
              // Loại bỏ dấu ** nếu có
              title = firstLine.replace(/^\*+|\*+$/g, '').trim();
            }
          }
          return { chap, title };
        })
        .catch(() => ({ chap, title: `Chương ${chap}` }))
    );
  }

  Promise.all(chapterTitlePromises).then(chapterTitles => {
    chapterTitles.forEach(({ chap, title }) => {
      const topOption = document.createElement('option');
      topOption.value = chap;
      topOption.innerText = title;
      if (chap === currentChapter) topOption.selected = true;
      selectTop.appendChild(topOption);

      const bottomOption = document.createElement('option');
      bottomOption.value = chap;
      bottomOption.innerText = title;
      if (chap === currentChapter) bottomOption.selected = true;
      selectBottom.appendChild(bottomOption);
    });
  });
}

function nextChapter() {
  if (currentChapter < totalChapters) {
    currentChapter += 1;
    saveProgress(currentBook, currentChapter);
    updateURL();
  }
}

function prevChapter() {
  if (currentChapter > 1) {
    currentChapter -= 1;
    saveProgress(currentBook, currentChapter);
    updateURL();
  }
}

function goHome() {
  window.location.href = 'index.html';
}

function toggleSettings() {
  const settings = document.getElementById('settings');
  if (!settings) return;

  const willOpen = settings.classList.contains('hidden');
  settings.classList.toggle('hidden', !willOpen);
  settings.setAttribute('aria-hidden', willOpen ? 'false' : 'true');

  if (willOpen) syncSettingsUI();
}

function getReaderContent() {
  return document.getElementById('content');
}

function getDefaultLineHeight(px) {
  if (px <= 16) return '1.6';
  if (px <= 18) return '1.8';
  return '2';
}

function getCurrentFontSize() {
  const content = getReaderContent();
  if (!content) return 20;

  const saved = parseInt(localStorage.getItem('fontsize') || '', 10);
  if (!Number.isNaN(saved)) return saved;

  const computed = parseFloat(window.getComputedStyle(content).fontSize);
  return Number.isFinite(computed) ? Math.round(computed) : 20;
}

function syncSettingsUI() {
  const fontLabel = document.getElementById('fontSizeLabel');
  if (fontLabel) {
    fontLabel.textContent = String(getCurrentFontSize());
  }

  const activeTheme = localStorage.getItem('theme') ?? '0';
  document.querySelectorAll('[data-theme]').forEach(button => {
    const isActive = button.dataset.theme === activeTheme;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const activeFont = localStorage.getItem('fontFamily') || 'Noto Sans';
  document.querySelectorAll('[data-font]').forEach(button => {
    const isActive = button.dataset.font === activeFont;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const activeLineHeight = localStorage.getItem('lineHeight') || getDefaultLineHeight(getCurrentFontSize());
  document.querySelectorAll('[data-lineheight]').forEach(button => {
    const isActive = button.dataset.lineheight === activeLineHeight;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const activeLetterSpacing = localStorage.getItem('letterSpacing') || 'normal';
  document.querySelectorAll('[data-letterspacing]').forEach(button => {
    const isActive = button.dataset.letterspacing === activeLetterSpacing;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const activeTextAlign = localStorage.getItem('textAlign') || 'left';
  document.querySelectorAll('[data-align]').forEach(button => {
    const isActive = button.dataset.align === activeTextAlign;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const rememberToggle = document.getElementById('rememberProgressToggle');
  if (rememberToggle) {
    const enabled = shouldRememberProgress();
    rememberToggle.classList.toggle('is-active', enabled);
    rememberToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
  }
}

function applyTheme(index, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const theme = THEMES[index];
  if (!theme) return;

  document.body.style.background = theme.bg;
  document.body.style.color = theme.text;
  content.style.background = index === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  localStorage.setItem('theme', index);
  syncSettingsUI();

  if (close) toggleSettings();
}

function applyFontSize(size, close = false) {
  const content = getReaderContent();
  if (!content) return;

  let px;
  if (size === 'small') px = 16;
  else if (size === 'medium') px = 20;
  else if (size === 'large') px = 24;
  else px = parseFloat(size);

  if (Number.isNaN(px)) px = 20;

  content.style.fontSize = `${px}px`;
  if (!localStorage.getItem('lineHeight')) {
    content.style.setProperty('--line-height', getDefaultLineHeight(px));
  }

  localStorage.setItem('fontsize', String(px));
  syncSettingsUI();

  if (close) toggleSettings();
}

function adjustFontSize(delta) {
  const currentSize = getCurrentFontSize();
  const nextSize = Math.min(30, Math.max(14, currentSize + delta));
  applyFontSize(nextSize, false);
}

function setFont(fontName, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const fontMap = {
    'Noto Sans': "'Noto Sans', 'Segoe UI', 'Verdana', sans-serif",
    Merriweather: "'Merriweather', 'Times New Roman', serif",
    Verdana: "'Verdana', 'Geneva', sans-serif"
  };

  const nextFont = fontMap[fontName] ? fontName : 'Noto Sans';
  content.style.setProperty('--font-family', fontMap[nextFont]);
  localStorage.setItem('fontFamily', nextFont);
  syncSettingsUI();

  if (close) toggleSettings();
}

function setLineHeight(value, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const numeric = parseFloat(value);
  const nextValue = Number.isFinite(numeric)
    ? String(numeric)
    : getDefaultLineHeight(parseFloat(content.style.fontSize) || 20);

  content.style.setProperty('--line-height', nextValue);
  localStorage.setItem('lineHeight', nextValue);
  syncSettingsUI();

  if (close) toggleSettings();
}

function setLetterSpacing(value, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const allowed = new Set(['normal', '0.06em', '0.12em']);
  const nextValue = allowed.has(value) ? value : 'normal';

  content.style.setProperty('--letter-spacing', nextValue);
  localStorage.setItem('letterSpacing', nextValue);
  syncSettingsUI();

  if (close) toggleSettings();
}

function setTextAlign(value, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const nextValue = value === 'justify' ? 'justify' : 'left';
  content.style.setProperty('--chapter-text-align', nextValue);
  localStorage.setItem('textAlign', nextValue);
  syncSettingsUI();

  if (close) toggleSettings();
}

function setRememberProgress(enabled) {
  localStorage.setItem(REMEMBER_PROGRESS_KEY, enabled ? '1' : '0');
  syncSettingsUI();
}

function toggleRememberProgress() {
  setRememberProgress(!shouldRememberProgress());
}

function changePart() {
  const partSel = document.getElementById('partSelect');
  if (!partSel) return;

  const selectedPart = parseInt(partSel.value, 10);
  const { start } = partRange(selectedPart);
  currentChapter = start;
  updateURL();
}

function changeChapter() {
  const select = document.getElementById('chapterSelect');
  if (!select) return;

  currentChapter = parseInt(select.value, 10);
  saveProgress(currentBook, currentChapter);
  updateURL();
}

function changeChapterBottom() {
  const select = document.getElementById('chapterSelectBottom');
  if (!select) return;

  currentChapter = parseInt(select.value, 10);
  closeChapterPicker();
  saveProgress(currentBook, currentChapter);
  updateURL();
}

function closeChapterPicker() {
  const menu = document.getElementById('bottomChapterMenu');
  const trigger = document.getElementById('chapterPickerTrigger');
  if (menu) {
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
  }
}

function toggleChapterPicker() {
  const menu = document.getElementById('bottomChapterMenu');
  const trigger = document.getElementById('chapterPickerTrigger');
  const select = document.getElementById('chapterSelectBottom');
  if (!menu || !trigger || !select) return;

  const isOpening = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !isOpening);
  menu.setAttribute('aria-hidden', isOpening ? 'false' : 'true');
  trigger.setAttribute('aria-expanded', isOpening ? 'true' : 'false');

  if (isOpening) {
    window.requestAnimationFrame(() => {
      select.focus({ preventScroll: true });
    });
  }
}

function updateURL() {
  window.location.href = `reader.html?book=${currentBook}&chap=${currentChapter}`;
}

if (document.getElementById('book-list')) {
  loadBooks().catch(() => {
    booksData = [];
    renderBookList([]);
  });
}

if (document.getElementById('content')) {
  const url = new URLSearchParams(window.location.search);
  currentBook = url.get('book') || '';
  currentChapter = parseInt(url.get('chap'), 10) || 1;
  updateReaderBookTitle(currentBook);

  fetch(encodeURI(`data/${currentBook}/index.json`))
    .then(res => {
      if (!res.ok) throw res;
      return res.json();
    })
    .then(data => {
      totalChapters = data.total || currentChapter;
      loadChapter();
      loadSelects();
    })
    .catch(() => {
      totalChapters = currentChapter;
      loadChapter();
      loadSelects();
    });
}

window.addEventListener('load', () => {
  const content = getReaderContent();
  if (!content) return;

  const savedTheme = localStorage.getItem('theme');
  const savedFont = localStorage.getItem('fontsize');
  const savedFontFamily = localStorage.getItem('fontFamily');
  const savedLineHeight = localStorage.getItem('lineHeight');
  const savedLetterSpacing = localStorage.getItem('letterSpacing');
  const savedTextAlign = localStorage.getItem('textAlign');

  if (savedTheme !== null) applyTheme(parseInt(savedTheme, 10), false);
  if (savedFont !== null) applyFontSize(savedFont, false);
  if (savedFontFamily !== null) setFont(savedFontFamily, false);
  if (savedLineHeight !== null) setLineHeight(savedLineHeight, false);
  if (savedLetterSpacing !== null) setLetterSpacing(savedLetterSpacing, false);
  if (savedTextAlign !== null) setTextAlign(savedTextAlign, false);

  const settings = document.getElementById('settings');
  if (settings) settings.setAttribute('aria-hidden', settings.classList.contains('hidden') ? 'true' : 'false');
  syncSettingsUI();
});

(function setupReaderTopChrome() {
  const chrome = document.getElementById('readerTopChrome');
  const readerPage = document.body;
  if (!chrome || !readerPage || !readerPage.classList.contains('reader-page')) return;

  let lastY = window.scrollY;
  let ticking = false;

  function syncOffset() {
    readerPage.style.setProperty('--reader-top-offset', `${chrome.offsetHeight + 14}px`);
  }

  function updateChrome() {
    const currentY = window.scrollY;
    const delta = currentY - lastY;

    if (currentY <= 32) {
      chrome.classList.remove('is-hidden');
    } else if (delta > 8) {
      chrome.classList.add('is-hidden');
    } else if (delta < -8) {
      chrome.classList.remove('is-hidden');
    }

    lastY = currentY;
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateChrome);
  }

  syncOffset();
  updateChrome();

  window.addEventListener('resize', syncOffset);
  window.addEventListener('scroll', onScroll, { passive: true });
})();

(function setupBottomChapterMenu() {
  const menu = document.getElementById('bottomChapterMenu');
  const trigger = document.getElementById('chapterPickerTrigger');
  if (!menu || !trigger) return;

  document.addEventListener('click', (event) => {
    if (menu.classList.contains('hidden')) return;
    if (menu.contains(event.target) || trigger.contains(event.target)) return;
    closeChapterPicker();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeChapterPicker();
    }
  });
})();

(function setupScrollTop() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  const SHOW_AFTER = 200;

  function onScroll() {
    if (window.scrollY > SHOW_AFTER) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  }

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

(function setupSettingsPanel() {
  const settings = document.getElementById('settings');
  const settingsTrigger = document.querySelector('.top-nav button[onclick="toggleSettings()"]');
  if (!settings) return;

  document.addEventListener('click', (event) => {
    if (settings.classList.contains('hidden')) return;
    if (settings.contains(event.target)) return;
    if (settingsTrigger && settingsTrigger.contains(event.target)) return;
    toggleSettings();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !settings.classList.contains('hidden')) {
      toggleSettings();
    }
  });
})();

(function setupTTS() {
  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  const voiceSelect = document.getElementById('voiceSelect');
  if (!voiceSelect) return;
  const rateInput = document.getElementById('ttsRate');
  const rateVal = document.getElementById('ttsRateVal');
  const playBtn = document.getElementById('ttsPlayBtn');
  const pauseBtn = document.getElementById('ttsPauseBtn');
  const stopBtn = document.getElementById('ttsStopBtn');

  const synth = window.speechSynthesis;
  let voices = [];
  let utter = null;

  function populateVoices() {
    voices = synth.getVoices().filter(voice => voice.lang && voice.name);
    if (!voiceSelect) return;

    const viCandidates = voices.filter(voice => {
      const lang = (voice.lang || '').toLowerCase();
      const name = (voice.name || '').toLowerCase();
      return lang.startsWith('vi') || /vietnamese/.test(name) || /vi[-_]/.test(lang) || lang === 'vi';
    });

    voiceSelect.innerHTML = '';

    if (viCandidates.length) {
      viCandidates.forEach(voice => {
        const opt = document.createElement('option');
        opt.value = voice.name;
        opt.innerText = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(opt);
      });
    } else {
      const note = document.createElement('option');
      note.disabled = true;
      note.selected = true;
      note.innerText = 'Không tìm thấy giọng Tiếng Việt trên trình duyệt này';
      voiceSelect.appendChild(note);
    }
  }

  function stopTTS() {
    synth.cancel();
    utter = null;
  }

  function pauseTTS() {
    if (synth.speaking && !synth.paused) synth.pause();
  }

  function resumeTTS() {
    if (synth.paused) synth.resume();
  }

  function playTTS() {
    if (synth.paused) {
      resumeTTS();
      return;
    }

    stopTTS();

    const text = contentEl.innerText || contentEl.textContent;
    if (!text || !text.trim()) return;

    utter = new SpeechSynthesisUtterance(text);
    if (voiceSelect && voiceSelect.value) {
      const voice = voices.find(item => item.name === voiceSelect.value);
      if (voice) utter.voice = voice;
    }

    if (rateInput) utter.rate = parseFloat(rateInput.value) || 1;
    if (!utter.lang) utter.lang = 'vi-VN';
    synth.speak(utter);
  }

  populateVoices();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
  }

  if (rateInput && rateVal) {
    rateInput.addEventListener('input', (event) => {
      rateVal.innerText = `${parseFloat(event.target.value).toFixed(1)}x`;
    });
  }

  playBtn?.addEventListener('click', playTTS);
  pauseBtn?.addEventListener('click', pauseTTS);
  stopBtn?.addEventListener('click', stopTTS);
})();
