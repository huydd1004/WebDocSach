let currentBook = "";
let currentChapter = 1;
let totalChapters = 1;
const CHAPTERS_PER_PART = 200; // số chương trong 1 phần

// LOAD DANH SÁCH TRUYỆN với tính năng tìm kiếm
let booksData = [];
function renderBookList(list) {
  const container = document.getElementById("book-list");
  if (!container) return;
  container.innerHTML = "";

  list.forEach(book => {
    const div = document.createElement("div");
    div.className = "book";

    // check saved progress for this book
    const saved = getProgress(book.id);
    const chapToOpen = saved && saved.chapter ? saved.chapter : 1;

    div.innerHTML = `
      <img src="${book.cover}">
      <div class="book-info">
        <h3>${book.title}</h3>
        <p>${book.author}</p>
        <p>${book.status}</p>
        <p>${book.date}</p>
      </div>
    `;

    // if there's saved progress, show a small badge
    if (saved && saved.chapter) {
      const info = div.querySelector('.book-info');
      const badge = document.createElement('div');
      badge.className = 'continue-badge';
      badge.innerText = `Tiếp tục: Chương ${saved.chapter}`;
      badge.style.marginTop = '6px';
      badge.style.fontSize = '13px';
      badge.style.opacity = '0.9';
      info.appendChild(badge);
    }

    div.onclick = () => {
      window.location.href = `reader.html?book=${book.id}&chap=${chapToOpen}`;
    };

    container.appendChild(div);
  });
}

// ======================
// Reading progress (localStorage)
// ======================
const PROGRESS_KEY = 'readingProgress';

function loadProgressMap() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveProgressMap(map) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch (e) {
    // ignore
  }
}

function getProgress(bookId) {
  const map = loadProgressMap();
  return map[bookId] || null;
}

function saveProgress(bookId, chapter) {
  if (!bookId) return;
  const map = loadProgressMap();
  map[bookId] = { chapter: Number(chapter), updated: Date.now() };
  saveProgressMap(map);
}

if (document.getElementById("book-list")) {
  fetch("data/books.json")
    .then(res => res.json())
    .then(data => {
      booksData = data;
      renderBookList(booksData);

      const search = document.getElementById('bookSearch');
      if (search) {
        search.addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();
          if (!q) return renderBookList(booksData);
          const filtered = booksData.filter(b => b.title.toLowerCase().includes(q));
          renderBookList(filtered);
        });
      }
    });
}

// LOAD TRUYỆN
if (document.getElementById("content")) {
  const url = new URLSearchParams(window.location.search);
  currentBook = url.get("book");
  currentChapter = parseInt(url.get("chap"));

  fetch(`data/${currentBook}/index.json`)
    .then(res => res.json())
    .then(data => {
      totalChapters = data.total;
      loadChapter();
      loadSelects();
    });
}

function getChapterPath(chap) {
  const part = chapterToPart(chap);
  return `data/${currentBook}/phần ${part}/${chap}.txt`;
}

function loadChapter() {
  const contentEl = document.getElementById("content");
  if (!contentEl) return;

  const partPath = getChapterPath(currentChapter);
  const fallbackPath = `data/${currentBook}/${currentChapter}.txt`;

  const tryFetch = (url) => {
    return fetch(encodeURI(url)).then(res => {
      if (!res.ok) throw res;
      return res.text();
    });
  };

  tryFetch(partPath)
    .catch(() => tryFetch(fallbackPath))
    .then(text => {
      contentEl.innerText = text;
        // save that user opened this chapter
        saveProgress(currentBook, currentChapter);
    })
    .catch(err => {
      const msg = err && err.status
        ? `Không thể tải chương ${currentChapter} (HTTP ${err.status})`
        : (err && err.message) ? err.message : String(err);
      contentEl.innerText = `Lỗi tải chương: ${msg}`;
    });
}

// Tính phần (1-based) cho chương
function chapterToPart(chap) {
  return Math.floor((chap - 1) / CHAPTERS_PER_PART) + 1;
}

// Tính range chương của phần
function partRange(part) {
  const start = (part - 1) * CHAPTERS_PER_PART + 1;
  const end = Math.min(part * CHAPTERS_PER_PART, totalChapters);
  return { start, end };
}

// Load cả select phần và select chương (top & bottom)
function loadSelects() {
  const partTop = document.getElementById("partSelect");
  const selectTop = document.getElementById("chapterSelect");
  const selectBottom = document.getElementById("chapterSelectBottom");

  // xóa nội dung cũ nếu có
  [partTop, selectTop, selectBottom].forEach(el => { if (el) el.innerHTML = ""; });

  const totalParts = Math.max(1, Math.ceil(totalChapters / CHAPTERS_PER_PART));
  const currentPart = chapterToPart(currentChapter);

  // phần select (chỉ cần 1 select ở trên)
  for (let p = 1; p <= totalParts; p++) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.innerText = "Phần " + p;
    if (p === currentPart) opt.selected = true;
    partTop.appendChild(opt);
  }

  // fill chapters for currentPart
  const range = partRange(currentPart);
  for (let i = range.start; i <= range.end; i++) {
    const o1 = document.createElement("option");
    o1.value = i;
    o1.innerText = "Chương " + i;
    if (i === currentChapter) o1.selected = true;
    selectTop.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = i;
    o2.innerText = "Chương " + i;
    if (i === currentChapter) o2.selected = true;
    selectBottom.appendChild(o2);
  }
}

// NAVIGATION
function nextChapter() {
  if (currentChapter < totalChapters) {
    currentChapter++;
    saveProgress(currentBook, currentChapter);
    updateURL();
  }
}

function prevChapter() {
  if (currentChapter > 1) {
    currentChapter--;
    saveProgress(currentBook, currentChapter);
    updateURL();
  }
}

function firstChapter() {
  currentChapter = 1;
  saveProgress(currentBook, currentChapter);
  updateURL();
}

function lastChapter() {
  currentChapter = totalChapters;
  saveProgress(currentBook, currentChapter);
  updateURL();
}


function goHome() {
  window.location.href = "index.html";
}

// SETTINGS
function toggleSettings() {
  document.getElementById("settings").classList.toggle("hidden");
}

function applySettings() {
  const bg = document.getElementById("bgColor").value;
  const text = document.getElementById("textColor").value;

  document.body.style.background = bg;
  document.body.style.color = text;
}
// =======================
// THEME & FONT SIZE CHỈ TRONG TRANG ĐỌC
// =======================

// Theme cố định
const themes = [
  { bg: "#0f172a", text: "#e2e8f0" }, // Dark
  { bg: "#fdf6e3", text: "#222222" }, // Light
  { bg: "#fff8dc", text: "#5b4636" }  // Sepia
];

// Chỉ load theme & font nếu có div #content (trang đọc)
window.addEventListener("load", () => {
  const content = document.getElementById("content");
  if(!content) return; // Nếu không có content, thoát, không áp dụng gì

  const savedTheme = localStorage.getItem("theme");
  const savedFont = localStorage.getItem("fontsize");

  if(savedTheme !== null) applyTheme(parseInt(savedTheme));
  if(savedFont !== null) applyFontSize(savedFont);

  // initialize font slider (if present) and bind
  const fontSlider = document.getElementById('fontSlider');
  const fontLabel = document.getElementById('fontSizeLabel');
  if (fontSlider && fontLabel) {
    // determine initial px value (support old keywords)
    let initPx = 20;
    if (savedFont) {
      if (savedFont === 'small') initPx = 16;
      else if (savedFont === 'medium') initPx = 20;
      else if (savedFont === 'large') initPx = 24;
      else {
        const parsed = parseInt(savedFont);
        if (!isNaN(parsed)) initPx = parsed;
      }
    }
    fontSlider.value = initPx;
    fontLabel.innerText = initPx + 'px';

    fontSlider.addEventListener('input', (e) => {
      const px = e.target.value;
      fontLabel.innerText = px + 'px';
      applyFontSize(px, false); // don't close settings when sliding
    });
  }
});

// Áp dụng theme và lưu
function applyTheme(index) {
  const content = document.getElementById("content");
  if(!content) return; // Chỉ áp dụng nếu đang đọc truyện

  const theme = themes[index];
  document.body.style.background = theme.bg;
  document.body.style.color = theme.text;

  content.style.background = index === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  localStorage.setItem("theme", index); // lưu theme

  toggleSettings(); // tự đóng bảng setting
}

// Áp dụng font size và lưu
// Áp dụng font size; `size` can be 'small'|'medium'|'large' or numeric px value.
function applyFontSize(size, close = true) {
  const content = document.getElementById("content");
  if(!content) return; // Chỉ áp dụng nếu đang đọc truyện

  let px;
  if (size === 'small') px = 16;
  else if (size === 'medium') px = 20;
  else if (size === 'large') px = 24;
  else px = parseFloat(size);

  if (isNaN(px)) px = 20;

  content.style.fontSize = px + 'px';
  // reasonable default line-height based on size
  if (px <= 16) content.style.lineHeight = '1.6';
  else if (px <= 20) content.style.lineHeight = '2';
  else content.style.lineHeight = '2.2';

  localStorage.setItem('fontsize', String(px)); // lưu cỡ chữ (px)

  if (close) toggleSettings(); // only close settings when requested
}

// LOAD SELECT BOX
// Khi user chọn 1 phần
function changePart() {
  const partSel = document.getElementById("partSelect");
  const selectedPart = parseInt(partSel.value);
  // chuyển chương hiện tại về chương đầu của phần
  const { start } = partRange(selectedPart);
  currentChapter = start;
  updateURL();
}

// Khi chọn select ở đầu
// Khi chọn chương ở trên
function changeChapter() {
  const select = document.getElementById("chapterSelect");
  currentChapter = parseInt(select.value);
  saveProgress(currentBook, currentChapter);
  updateURL();
}

// Khi chọn select ở cuối
// Khi chọn chương ở dưới
function changeChapterBottom() {
  const select = document.getElementById("chapterSelectBottom");
  currentChapter = parseInt(select.value);
  saveProgress(currentBook, currentChapter);
  updateURL();
}

// UPDATE URL và đồng bộ select
function updateURL() {
  window.location.href = `reader.html?book=${currentBook}&chap=${currentChapter}`;
}

// Scroll-to-top button behavior (works on any page that includes script.js)
(function setupScrollTop() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  // show button after user scrolls down this many pixels
  const SHOW_AFTER = 200;

  function onScroll() {
    if (window.scrollY > SHOW_AFTER) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  }

  // smooth scroll to top
  function toTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', toTop);

  // init visibility
  onScroll();
})();

// Text-to-Speech (TTS) for reader page
(function setupTTS() {
  const contentEl = document.getElementById('content');
  if (!contentEl) return; // only in reader page

  const voiceSelect = document.getElementById('voiceSelect');
  const rateInput = document.getElementById('ttsRate');
  const rateVal = document.getElementById('ttsRateVal');
  const playBtn = document.getElementById('ttsPlayBtn');
  const pauseBtn = document.getElementById('ttsPauseBtn');
  const stopBtn = document.getElementById('ttsStopBtn');

  let synth = window.speechSynthesis;
  let voices = [];
  let utter = null;

  function populateVoices() {
    voices = synth.getVoices().filter(v => v.lang && v.name);
    if (!voiceSelect) return;
    // prefer voices that are Vietnamese (lang starts with 'vi' or name contains 'Vietnamese')
    const viCandidates = voices.filter(v => {
      const lang = (v.lang || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      return lang.startsWith('vi') || /vietnamese/.test(name) || /vi[-_]/.test(lang) || lang === 'vi';
    });

    voiceSelect.innerHTML = '';
    // Only include Vietnamese voices. If none, show a disabled notice.
    if (viCandidates.length) {
      viCandidates.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.innerText = `${v.name} (${v.lang})`;
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

  populateVoices();
  // some browsers (Chrome) load voices asynchronously
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
  }

  // rate display
  if (rateInput && rateVal) {
    rateInput.addEventListener('input', e => {
      rateVal.innerText = parseFloat(e.target.value).toFixed(1) + 'x';
    });
  }

  function stopTTS() {
    if (!synth) return;
    synth.cancel();
    utter = null;
  }

  function pauseTTS() {
    if (!synth) return;
    if (synth.speaking && !synth.paused) synth.pause();
  }

  function resumeTTS() {
    if (!synth) return;
    if (synth.paused) synth.resume();
  }

  function playTTS() {
    if (!synth) return;
    // if paused, resume
    if (synth.paused) return resumeTTS();

    stopTTS();

    const text = contentEl.innerText || contentEl.textContent;
    if (!text || !text.trim()) return;

    utter = new SpeechSynthesisUtterance(text);
    // voice
    if (voiceSelect && voiceSelect.value) {
      const v = voices.find(x => x.name === voiceSelect.value);
      if (v) utter.voice = v;
    }
    // rate
    if (rateInput) utter.rate = parseFloat(rateInput.value) || 1;

    // optional: set lang if not provided
    if (!utter.lang) utter.lang = 'vi-VN';

    synth.speak(utter);
  }

  if (playBtn) playBtn.addEventListener('click', playTTS);
  if (pauseBtn) pauseBtn.addEventListener('click', () => {
    if (synth && synth.speaking) pauseTTS();
  });
  if (stopBtn) stopBtn.addEventListener('click', () => {
    stopTTS();
  });

})();