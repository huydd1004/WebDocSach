let currentBook = "";
let currentChapter = 1;
let totalChapters = 1;
const CHAPTERS_PER_PART = 200; // số chương trong 1 phần

// LOAD DANH SÁCH TRUYỆN với tính năng tìm kiếm
let booksData = [];
let authToken = null; // bearer token when logged in

function apiFetch(path, opts = {}) {
  opts.headers = opts.headers || {};
  const sess = localStorage.getItem(SESSION_KEY);
  if (sess) {
    try {
      const s = JSON.parse(sess);
      if (s && s.token) opts.headers['Authorization'] = 'Bearer ' + s.token;
    } catch (e) {}
  }
  return fetch(path, opts);
}
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

    // if there's saved progress (local), show a small badge
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

    // if user is logged in, try to fetch server-side progress and update badge
    const sess = localStorage.getItem(SESSION_KEY);
    if (sess) {
      try {
        const s = JSON.parse(sess);
        if (s && s.token) {
          apiFetch(`/api/progress/${encodeURIComponent(book.id)}`, { method: 'GET' })
            .then(r => r.json())
            .then(j => {
              if (j && j.chapter) {
                // replace or add badge
                const info = div.querySelector('.book-info');
                let badge = info.querySelector('.continue-badge');
                if (!badge) {
                  badge = document.createElement('div'); badge.className = 'continue-badge';
                  info.appendChild(badge);
                }
                badge.innerText = `Tiếp tục: Chương ${j.chapter}`;
              }
            }).catch(()=>{});
        }
      } catch(e){}
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
  const sess = localStorage.getItem(SESSION_KEY);
  if (sess) {
    try {
      const s = JSON.parse(sess);
      if (s && s.token) {
        // send to server
        apiFetch('/api/progress', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ bookId, chapter }) })
          .then(r => r.json()).catch(()=>{});
        return;
      }
    } catch(e){}
  }
  // fallback to localStorage when not authenticated
  const map = loadProgressMap();
  map[bookId] = { chapter: Number(chapter), updated: Date.now() };
  saveProgressMap(map);
}

if (document.getElementById("book-list")) {
  // try to fetch from API, fallback to local file
  fetch('/api/books')
    .then(res => res.json())
    .then(data => {
      booksData = data;
      // render genre filters and book list
      const GENRES = ['kinh dị','trinh thám','huyền huyễn','linh dị','bói toán','tiên hiệp','xuyên không'];

      const gContainer = document.getElementById('genreFilters');
      if (gContainer) {
        GENRES.forEach(g => {
          const id = `genre-${g.replace(/\s+/g,'-')}`;
          const label = document.createElement('label');
          label.htmlFor = id;
          label.innerHTML = `<input type="checkbox" id="${id}" value="${g}"> ${g}`;
          gContainer.appendChild(label);
        });
      }

      // central filter function: combines search query and selected genres
      function applyFilters() {
        const qEl = document.getElementById('bookSearch');
        const q = qEl && qEl.value ? qEl.value.trim().toLowerCase() : '';

        const checked = Array.from(document.querySelectorAll('#genreFilters input[type=checkbox]:checked')).map(i => i.value);

        const filtered = booksData.filter(b => {
          // title match
          const titleMatch = !q || (b.title && b.title.toLowerCase().includes(q));

          // genre match: support b.genre as string or array
          if (!checked.length) return titleMatch;
          const bookGenres = [];
          if (b.genre) {
            if (Array.isArray(b.genre)) bookGenres.push(...b.genre.map(x => String(x).toLowerCase()));
            else bookGenres.push(String(b.genre).toLowerCase());
          }
          const genreMatch = checked.some(c => bookGenres.includes(c.toLowerCase()));
          return titleMatch && genreMatch;
        });

        renderBookList(filtered);
      }

  renderBookList(booksData);

      const search = document.getElementById('bookSearch');
  if (search) search.addEventListener('input', applyFilters);
      // bind genre checkbox changes
      document.getElementById('genreFilters')?.addEventListener('change', applyFilters);
    })
    .catch(err => {
      // fallback to static file
      fetch('data/books.json').then(r=>r.json()).then(d=>{ booksData = d; renderBookList(booksData); });
    });
}

// ======================
// Admin (client-side CRUD stored in localStorage)
// ======================
const ADMIN_KEY = 'booksDataAdmin';

// ======================
// Simple client-side auth (localStorage)
// WARNING: this is client-only and not secure. For demo/admin only.
const USERS_KEY = 'webdoc_users';
const SESSION_KEY = 'webdoc_session';

// Auth helpers will call server API instead of localStorage
function hashPass(p) { // left for backwards compatibility; not used by server
  let h=0; for(let i=0;i<p.length;i++){ h=(h<<5)-h + p.charCodeAt(i); h |=0 } return String(h);
}

function isAdminUser() {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY)); return s && s.role === 'admin'; } catch(e){return false}
}

// auth UI bindings
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const adminToggle = document.getElementById('adminToggleBtn');

  function refreshUserUI() {
    const root = document.body;
    const greet = document.getElementById('userGreeting');
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s) {
      greet.innerText = 'Xin chào, ' + s.user;
      root.classList.add('user-logged');
      authToken = s.token || null;
    } else {
      greet.innerText = '';
      root.classList.remove('user-logged');
      authToken = null;
    }
    // admin button visibility
    if (adminToggle) adminToggle.style.display = (s && s.role==='admin') ? 'inline-block' : 'none';
    // hide admin panel if not admin
    if (!isAdminUser()) document.getElementById('adminPanel').classList.add('hidden');
  }

  refreshUserUI();

  // open login modal
  if (loginBtn) loginBtn.addEventListener('click', () => {
    loginModal.classList.remove('hidden'); document.body.classList.add('modal-open');
  });

  // Close buttons for both modals
  document.querySelectorAll('.authCloseBtn').forEach(b => b.addEventListener('click', () => {
    loginModal.classList.add('hidden'); registerModal.classList.add('hidden'); document.body.classList.remove('modal-open');
  }));

  // open register modal via a small link in login modal (add link below forms if you want)
  // we'll also allow opening register via pressing Ctrl+R on login modal
  loginModal.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key.toLowerCase()==='r') { registerModal.classList.remove('hidden'); loginModal.classList.add('hidden'); } });

  if (loginForm) loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value || '';
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ user, pass }) })
      .then(r => r.json())
      .then(j => {
        if (j.error) return alert('Đăng nhập thất bại');
        // store token in session localStorage
        localStorage.setItem(SESSION_KEY, JSON.stringify({ user: j.user, role: j.role, token: j.token }));
        loginModal.classList.add('hidden'); document.body.classList.remove('modal-open');
        refreshUserUI();
      }).catch(err => alert('Lỗi đăng nhập'));
  });

  if (registerForm) registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('regUser').value.trim();
    const pass = document.getElementById('regPass').value || '';
    fetch('/api/register', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ user, pass }) })
      .then(r => {
        if (!r.ok) return r.json().then(j=>Promise.reject(j));
        return r.json();
      })
      .then(j => {
        alert('Đăng ký thành công. Vui lòng đăng nhập.');
        registerModal.classList.add('hidden'); loginModal.classList.remove('hidden');
      }).catch(err => {
        alert(err && err.error ? err.error : 'Lỗi đăng ký');
      });
  });

  if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem(SESSION_KEY); refreshUserUI(); });

  // Admin toggle only available when admin logged in
  const adminToggleBtn = document.getElementById('adminToggleBtn');
  if (adminToggleBtn) adminToggleBtn.addEventListener('click', () => {
    if (!isAdminUser()) return alert('Chỉ admin mới truy cập được.');
    const panel = document.getElementById('adminPanel'); panel.classList.toggle('hidden'); renderAdminList();
  });
});

function loadAdminBooks() {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveAdminBooks(list) {
  try { localStorage.setItem(ADMIN_KEY, JSON.stringify(list)); } catch (e) {}
}

function openAdminPanel() {
  document.getElementById('adminPanel').classList.remove('hidden');
  renderAdminList();
}

function closeAdminPanel() {
  document.getElementById('adminPanel').classList.add('hidden');
}

function getEffectiveBooks() {
  const admin = loadAdminBooks();
  return admin && Array.isArray(admin) ? admin : booksData.slice();
}

function renderAdminList() {
  const list = getEffectiveBooks();
  const container = document.getElementById('adminList');
  if (!container) return;
  container.innerHTML = '';
  list.forEach(b => {
    const el = document.createElement('div'); el.className = 'book';
    el.innerHTML = `<div class="book-info"><h3>${b.title}</h3><p>${b.author||''}</p></div>`;
    const edit = document.createElement('button'); edit.innerText = 'Sửa';
    edit.onclick = () => adminEdit(b.id);
    const del = document.createElement('button'); del.innerText = 'Xóa';
    del.onclick = () => adminDelete(b.id);
    el.appendChild(edit); el.appendChild(del);
    container.appendChild(el);
  });
}

function adminNew() {
  const form = document.getElementById('adminForm');
  form.reset();
  form.dataset.editing = '';
  form.scrollIntoView({behavior:'smooth'});
}

function adminEdit(id) {
  const list = getEffectiveBooks();
  const book = list.find(b => b.id === id);
  if (!book) return;
  const form = document.getElementById('adminForm');
  form.id.value = book.id;
  form.title.value = book.title;
  form.author.value = book.author || '';
  form.status.value = book.status || '';
  form.date.value = book.date || '';
  form.cover.value = book.cover || '';
  form.genre.value = Array.isArray(book.genre) ? book.genre.join(',') : (book.genre || '');
  form.dataset.editing = id;
  form.scrollIntoView({behavior:'smooth'});
}
function adminDelete(id) {
  if (!confirm('Xóa truyện này?')) return;
  if (isAdminUser()) {
    apiFetch(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(j => {
        if (j && j.ok) {
          alert('Đã xóa trên server');
          // refresh lists
          fetch('/api/books').then(r=>r.json()).then(d=>{ booksData = d; renderBookList(booksData); renderAdminList(); });
        } else alert('Lỗi xóa');
      }).catch(()=>alert('Lỗi xóa'));
    return;
  }
  const admin = loadAdminBooks() || booksData.slice();
  const updated = admin.filter(b => b.id !== id);
  saveAdminBooks(updated);
  renderAdminList();
  // refresh main list
  renderBookList(getEffectiveBooks());
}

function adminExport() {
  const list = getEffectiveBooks();
  const blob = new Blob([JSON.stringify(list, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'books-export.json'; a.click();
  URL.revokeObjectURL(url);
}

// bind admin UI
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('adminToggleBtn');
  if (toggle) toggle.addEventListener('click', () => openAdminPanel());

  const close = document.getElementById('adminCloseBtn');
  if (close) close.addEventListener('click', () => closeAdminPanel());

  const newBtn = document.getElementById('adminNewBtn');
  if (newBtn) newBtn.addEventListener('click', adminNew);

  const exportBtn = document.getElementById('adminExportBtn');
  if (exportBtn) exportBtn.addEventListener('click', adminExport);

  const form = document.getElementById('adminForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        id: form.id.value.trim(),
        title: form.title.value.trim(),
        author: form.author.value.trim(),
        status: form.status.value.trim(),
        date: form.date.value.trim(),
        cover: form.cover.value.trim(),
        genre: form.genre.value.split(',').map(s => s.trim()).filter(Boolean)
      };
      const editing = form.dataset.editing;
      // if admin logged in, try server API
      if (isAdminUser()) {
        apiFetch('/api/books', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(data) })
          .then(r => r.json())
          .then(j => {
            if (j && j.ok) {
              alert('Đã lưu lên server');
              renderAdminList();
              // refresh book list from server
              fetch('/api/books').then(r=>r.json()).then(d=>{ booksData = d; renderBookList(booksData); });
              form.reset(); form.dataset.editing = '';
            } else alert('Lỗi lưu');
          }).catch(()=>alert('Lỗi lưu'));
      } else {
        let admin = loadAdminBooks() || booksData.slice();
        // replace if exists
        const existsIdx = admin.findIndex(b => b.id === data.id);
        if (editing && editing === data.id) {
          // update
          if (existsIdx >= 0) admin[existsIdx] = data;
          else admin.push(data);
        } else {
          // new: ensure unique id
          if (existsIdx >= 0) return alert('ID đã tồn tại');
          admin.push(data);
        }
        saveAdminBooks(admin);
        renderAdminList();
        renderBookList(admin);
        form.reset(); form.dataset.editing = '';
      }
    });
  }

  const cancel = document.getElementById('adminCancelBtn');
  if (cancel) cancel.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('adminForm').reset(); });
});

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