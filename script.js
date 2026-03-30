// ======================
// Admin Chapter Management
// ======================
document.addEventListener('DOMContentLoaded', () => {
  // Hồ sơ người dùng
  const profileBtn = document.getElementById('profileBtn');
  const profileModal = document.getElementById('profileModal');
  const closeProfileBtn = document.getElementById('closeProfileBtn');
  const profileInfo = document.getElementById('profileInfo');

  function openProfileModal() {
    if (!profileModal) return;
    // Lấy thông tin user từ session/localStorage
    const s = getSession();
    let html = '';
    if (s && s.user) {
      html += `<div><b>Tên đăng nhập:</b> ${s.user}</div>`;
      html += `<div><b>Vai trò:</b> ${s.role || 'user'}</div>`;
      if (s.provider) html += `<div><b>Đăng nhập qua:</b> ${s.provider}</div>`;
    } else {
      html = '<div>Không có thông tin người dùng.</div>';
    }
    if (profileInfo) profileInfo.innerHTML = html;
    profileModal.classList.remove('hidden');
    profileModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
  function closeProfileModal() {
    if (!profileModal) return;
    profileModal.classList.add('hidden');
    profileModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }
  if (profileBtn) profileBtn.addEventListener('click', openProfileModal);
  if (closeProfileBtn) closeProfileBtn.addEventListener('click', closeProfileModal);
  if (profileModal) profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeProfileModal(); });
  // Nút về trang chính trong admin panel
  const adminHomeBtn = document.getElementById('adminHomeBtn');
  if (adminHomeBtn) {
    adminHomeBtn.addEventListener('click', () => {
      document.getElementById('adminPanel').classList.add('hidden');
    });
  }
  const chapterBtn = document.getElementById('adminChapterBtn');
  const chapterModal = document.getElementById('chapterModal');
  const closeChapterModalBtn = document.getElementById('closeChapterModalBtn');
  const chapterBookSelect = document.getElementById('chapterBookSelect');
  const chapterList = document.getElementById('chapterList');
  const addChapterBtn = document.getElementById('addChapterBtn');
  const chapterEditArea = document.getElementById('chapterEditArea');
  const chapterEditTitle = document.getElementById('chapterEditTitle');
  const chapterContent = document.getElementById('chapterContent');
  const saveChapterBtn = document.getElementById('saveChapterBtn');
  const deleteChapterBtn = document.getElementById('deleteChapterBtn');
  const cancelChapterBtn = document.getElementById('cancelChapterBtn');
  let editingBook = null;
  let editingChapter = null;

  function openChapterModal() {
    if (!isAdminUser()) return alert('Chỉ admin mới truy cập được.');
    chapterModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    // fill book select
    chapterBookSelect.innerHTML = '';
    booksData.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.innerText = b.title;
      chapterBookSelect.appendChild(opt);
    });
    if (booksData.length) {
      editingBook = booksData[0].id;
      loadChapterList(editingBook);
    }
    chapterEditArea.classList.add('hidden');
  }

  function closeChapterModal() {
    chapterModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    chapterEditArea.classList.add('hidden');
    chapterList.innerHTML = '';
    editingBook = null; editingChapter = null;
  }

  async function loadChapterList(bookId) {
    editingBook = bookId;
    chapterList.innerHTML = '<li>Đang tải...</li>';
    try {
      const data = await apiFetch(`/api/chapters/${encodeURIComponent(bookId)}`);
      chapterList.innerHTML = '';
      data.chapters.forEach(chap => {
        const li = document.createElement('li');
        li.innerText = 'Chương ' + chap;
        li.onclick = () => editChapter(chap);
        chapterList.appendChild(li);
      });
    } catch(e) {
      chapterList.innerHTML = '<li>Lỗi tải danh sách chương.</li>';
    }
  }

  async function editChapter(chap) {
    editingChapter = chap;
    chapterEditTitle.innerText = `Chỉnh sửa chương ${chap}`;
    chapterEditArea.classList.remove('hidden');
    chapterContent.value = 'Đang tải...';
    try {
      const text = await fetch(`/api/chapter/${encodeURIComponent(editingBook)}/${chap}`, {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
      }).then(r => r.ok ? r.text() : '');
      chapterContent.value = text;
    } catch {
      chapterContent.value = '';
    }
  }

  if (chapterBookSelect) chapterBookSelect.addEventListener('change', e => loadChapterList(e.target.value));
  if (chapterBtn) chapterBtn.addEventListener('click', openChapterModal);
  if (closeChapterModalBtn) closeChapterModalBtn.addEventListener('click', closeChapterModal);
  if (cancelChapterBtn) cancelChapterBtn.addEventListener('click', () => { chapterEditArea.classList.add('hidden'); });

  if (addChapterBtn) addChapterBtn.addEventListener('click', () => {
    const chap = prompt('Nhập số chương mới:');
    if (!chap || isNaN(Number(chap))) return;
    editingChapter = Number(chap);
    chapterEditTitle.innerText = `Thêm chương ${editingChapter}`;
    chapterContent.value = '';
    chapterEditArea.classList.remove('hidden');
  });

  if (saveChapterBtn) saveChapterBtn.addEventListener('click', async () => {
    if (!editingBook || !editingChapter) return;
    try {
      await apiFetch(`/api/chapter/${encodeURIComponent(editingBook)}/${editingChapter}`, {
        method: 'POST',
        body: JSON.stringify({ content: chapterContent.value })
      });
      alert('Đã lưu chương!');
      chapterEditArea.classList.add('hidden');
      loadChapterList(editingBook);
    } catch(e) {
      alert(e.error || 'Lỗi lưu chương.');
    }
  });

  if (deleteChapterBtn) deleteChapterBtn.addEventListener('click', async () => {
    if (!editingBook || !editingChapter) return;
    if (!confirm('Xóa chương này?')) return;
    try {
      await apiFetch(`/api/chapter/${encodeURIComponent(editingBook)}/${editingChapter}`, {
        method: 'DELETE'
      });
      alert('Đã xóa chương!');
      chapterEditArea.classList.add('hidden');
      loadChapterList(editingBook);
    } catch(e) {
      alert(e.error || 'Lỗi xóa chương.');
    }
  });
});
let currentBook = "";
let currentChapter = 1;
let totalChapters = 1;
const CHAPTERS_PER_PART = 200; // số chương trong 1 phần

// ======================
// API helper
// ======================
const SESSION_KEY = 'webdoc_session';
let authToken = null;

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
}

function getAuthToken() {
  const s = getSession();
  return s ? s.token : null;
}

async function apiFetch(url, opts = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function isAdminUser() {
  const s = getSession();
  return s && s.role === 'admin';
}

// ======================
// Reading progress (localStorage + server sync)
// ======================
const PROGRESS_KEY = 'readingProgress';
let serverProgressMap = {};

function loadProgressMap() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch(e) { return {}; }
}

function saveProgressMap(map) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(map)); } catch(e) {}
}

function getProgress(bookId) {
  // Prefer server progress if available
  if (serverProgressMap[bookId]) return serverProgressMap[bookId];
  const map = loadProgressMap();
  return map[bookId] || null;
}

function saveProgress(bookId, chapter) {
  if (!bookId) return;
  const map = loadProgressMap();
  map[bookId] = { chapter: Number(chapter), updated: Date.now() };
  saveProgressMap(map);
  // Sync to server if logged in
  if (getAuthToken()) {
    apiFetch(`/api/progress/${encodeURIComponent(bookId)}`, {
      method: 'POST', body: JSON.stringify({ chapter: Number(chapter) })
    }).catch(() => {});
  }
}

async function fetchServerProgress() {
  if (!getAuthToken()) { serverProgressMap = {}; return; }
  try {
    serverProgressMap = await apiFetch('/api/progress');
  } catch(e) { serverProgressMap = {}; }
}

// ======================
// Book list
// ======================
let booksData = [];
function renderBookList(list) {
  const container = document.getElementById("book-list");
  if (!container) return;
  container.innerHTML = "";

  list.forEach(book => {
    const div = document.createElement("div");
    div.className = "book";

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

if (document.getElementById("book-list")) {
  // Fetch from API first, fallback to static file
  const loadBooks = async () => {
    try {
      booksData = await apiFetch('/api/books');
    } catch(e) {
      // Fallback to static JSON
      try {
        const res = await fetch('data/books.json');
        booksData = await res.json();
      } catch(e2) { booksData = []; }
    }

    // Fetch server reading progress before rendering
    await fetchServerProgress();

    // render genre filters
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

    function applyFilters() {
      const qEl = document.getElementById('bookSearch');
      const q = qEl && qEl.value ? qEl.value.trim().toLowerCase() : '';
      const checked = Array.from(document.querySelectorAll('#genreFilters input[type=checkbox]:checked')).map(i => i.value);

      const filtered = booksData.filter(b => {
        const titleMatch = !q || (b.title && b.title.toLowerCase().includes(q));
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
    document.getElementById('genreFilters')?.addEventListener('change', applyFilters);
  };
  loadBooks();
}

// ======================
// Admin (API-backed CRUD)
// ======================

// ======================
// Auth — uses backend API with JWT
// ======================

function isAdminUser() {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY)); return s && s.role === 'admin'; } catch(e){return false}
}

// auth UI bindings
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const forgotModal = document.getElementById('forgotModal');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotForm = document.getElementById('forgotForm');
  const adminToggle = document.getElementById('adminToggleBtn');
  const switchToRegister = document.getElementById('switchToRegister');
  const switchToLogin = document.getElementById('switchToLogin');
  const switchToForgot = document.getElementById('switchToForgot');
  const switchForgotToLogin = document.getElementById('switchForgotToLogin');
  const allModals = [loginModal, registerModal, forgotModal].filter(Boolean);

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function hideMessages() {
    ['loginError','registerError','registerSuccess','forgotError','forgotSuccess'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ''; el.classList.add('hidden'); }
    });
  }

  function openModal(modal) {
    hideMessages();
    allModals.forEach(m => { m.classList.add('hidden'); m.setAttribute('aria-hidden', 'true'); });
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const firstInput = modal.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function closeModals() {
    hideMessages();
    allModals.forEach(m => { m.classList.add('hidden'); m.setAttribute('aria-hidden', 'true'); });
    document.body.classList.remove('modal-open');
  }

  function refreshUserUI() {
    const root = document.body;
    const greet = document.getElementById('userGreeting');
    const s = getSession();
    const profileBtn = document.getElementById('profileBtn');
    if (s && s.user) {
      greet.innerText = '👋 Xin chào, ' + s.user;
      root.classList.add('user-logged');
      if (profileBtn) profileBtn.classList.remove('hidden');
    } else {
      greet.innerText = '';
      root.classList.remove('user-logged');
      if (profileBtn) profileBtn.classList.add('hidden');
    }
    if (adminToggle) adminToggle.style.display = (s && s.role==='admin') ? 'inline-block' : 'none';
    if (!isAdminUser()) {
      const panel = document.getElementById('adminPanel');
      if (panel) panel.classList.add('hidden');
    }
  }

  refreshUserUI();

  if (loginBtn) loginBtn.addEventListener('click', () => openModal(loginModal));
  if (switchToRegister) switchToRegister.addEventListener('click', (e) => { e.preventDefault(); openModal(registerModal); });
  if (switchToLogin) switchToLogin.addEventListener('click', (e) => { e.preventDefault(); openModal(loginModal); });
  if (switchToForgot) switchToForgot.addEventListener('click', (e) => { e.preventDefault(); openModal(forgotModal); });
  if (switchForgotToLogin) switchForgotToLogin.addEventListener('click', (e) => { e.preventDefault(); openModal(loginModal); });
  document.querySelectorAll('.authCloseBtn').forEach(b => b.addEventListener('click', closeModals));
  allModals.forEach(modal => { modal.addEventListener('click', (e) => { if (e.target === modal) closeModals(); }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

  // LOGIN — calls /api/auth/login
  if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value || '';
    if (!user || !pass) { showError('loginError', 'Vui lòng nhập đầy đủ thông tin.'); return; }
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ username: user, password: pass })
      });
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: data.user.username, role: data.user.role, token: data.token }));
      closeModals();
      loginForm.reset();
      refreshUserUI();
      // Refresh progress & book list
      await fetchServerProgress();
      if (booksData.length) renderBookList(booksData);
    } catch(err) {
      showError('loginError', err.error || 'Đăng nhập thất bại.');
    }
  });

  // REGISTER — calls /api/auth/register
  if (registerForm) registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    const user = document.getElementById('regUser').value.trim();
    const pass = document.getElementById('regPass').value || '';
    const passConfirm = document.getElementById('regPassConfirm').value || '';
    if (!user || !pass) { showError('registerError', 'Vui lòng nhập đầy đủ thông tin.'); return; }
    if (pass !== passConfirm) { showError('registerError', 'Mật khẩu nhập lại không khớp.'); return; }
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST', body: JSON.stringify({ username: user, password: pass })
      });
      registerForm.reset();
      const successEl = document.getElementById('registerSuccess');
      if (successEl) { successEl.textContent = 'Đăng ký thành công! Đang chuyển sang đăng nhập...'; successEl.classList.remove('hidden'); }
      setTimeout(() => {
        openModal(loginModal);
        const loginUserInput = document.getElementById('loginUser');
        if (loginUserInput) { loginUserInput.value = user; document.getElementById('loginPass').focus(); }
      }, 1200);
    } catch(err) {
      showError('registerError', err.error || 'Đăng ký thất bại.');
    }
  });

  // FORGOT PASSWORD — calls /api/auth/forgot-password
  if (forgotForm) forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    const user = document.getElementById('forgotUser').value.trim();
    const newPass = document.getElementById('forgotNewPass').value || '';
    const newPassConfirm = document.getElementById('forgotNewPassConfirm').value || '';
    if (!user) { showError('forgotError', 'Vui lòng nhập tên đăng nhập.'); return; }
    if (newPass.length < 4) { showError('forgotError', 'Mật khẩu mới phải có ít nhất 4 ký tự.'); return; }
    if (newPass !== newPassConfirm) { showError('forgotError', 'Mật khẩu nhập lại không khớp.'); return; }
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST', body: JSON.stringify({ username: user, newPassword: newPass })
      });
      forgotForm.reset();
      const successEl = document.getElementById('forgotSuccess');
      if (successEl) { successEl.textContent = 'Đặt lại mật khẩu thành công! Đang chuyển sang đăng nhập...'; successEl.classList.remove('hidden'); }
      setTimeout(() => {
        openModal(loginModal);
        const loginUserInput = document.getElementById('loginUser');
        if (loginUserInput) { loginUserInput.value = user; document.getElementById('loginPass').focus(); }
      }, 1200);
    } catch(err) {
      showError('forgotError', err.error || 'Đặt lại mật khẩu thất bại.');
    }
  });

  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    serverProgressMap = {};
    refreshUserUI();
    if (booksData.length) renderBookList(booksData);
  });

  const adminToggleBtn = document.getElementById('adminToggleBtn');
  if (adminToggleBtn) adminToggleBtn.addEventListener('click', () => {
    if (!isAdminUser()) return alert('Chỉ admin mới truy cập được.');
    const panel = document.getElementById('adminPanel'); panel.classList.toggle('hidden'); renderAdminList();
  });
});

function loadAdminBooks() {
  return booksData.slice();
}

function openAdminPanel() {
  document.getElementById('adminPanel').classList.remove('hidden');
  renderAdminList();
}

function closeAdminPanel() {
  document.getElementById('adminPanel').classList.add('hidden');
}

function renderAdminList() {
  const list = booksData;
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
  const book = booksData.find(b => b.id === id);
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

async function adminDelete(id) {
  if (!confirm('Xóa truyện này?')) return;
  try {
    await apiFetch(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
    booksData = booksData.filter(b => b.id !== id);
    renderAdminList();
    renderBookList(booksData);
  } catch(err) {
    alert(err.error || 'Xóa thất bại.');
  }
}

function adminExport() {
  const blob = new Blob([JSON.stringify(booksData, null, 2)], {type:'application/json'});
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
    form.addEventListener('submit', async (e) => {
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
      try {
        await apiFetch('/api/books', { method: 'POST', body: JSON.stringify(data) });
        // Update local data
        const idx = booksData.findIndex(b => b.id === data.id);
        if (idx >= 0) booksData[idx] = data;
        else booksData.push(data);
        renderAdminList();
        renderBookList(booksData);
        form.reset(); form.dataset.editing = '';
      } catch(err) {
        alert(err.error || 'Lưu thất bại.');
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
      renderChapterContent(contentEl, text);
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

function getReaderContent() {
  return document.getElementById("content");
}

function getDefaultLineHeight(px) {
  if (px <= 16) return "1.6";
  if (px <= 20) return "2";
  return "2.2";
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
  const content = getReaderContent();
  if(!content) return; // Nếu không có content, thoát, không áp dụng gì

  const savedTheme = localStorage.getItem("theme");
  const savedFont = localStorage.getItem("fontsize");
  const savedFontFamily = localStorage.getItem("fontFamily");
  const savedLineHeight = localStorage.getItem("lineHeight");
  const savedLetterSpacing = localStorage.getItem("letterSpacing");

  if(savedTheme !== null) applyTheme(parseInt(savedTheme), false);
  if(savedFont !== null) applyFontSize(savedFont, false);
  if(savedFontFamily !== null) setFont(savedFontFamily, false);
  if(savedLineHeight !== null) setLineHeight(savedLineHeight, false);
  if(savedLetterSpacing !== null) setLetterSpacing(savedLetterSpacing, false);

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
function applyTheme(index, close = true) {
  const content = getReaderContent();
  if(!content) return; // Chỉ áp dụng nếu đang đọc truyện

  const theme = themes[index];
  if (!theme) return;
  document.body.style.background = theme.bg;
  document.body.style.color = theme.text;

  content.style.background = index === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  if (!close) {
    localStorage.setItem("theme", index);
    return;
  }

  localStorage.setItem("theme", index); // lưu theme

  toggleSettings(); // tự đóng bảng setting
}

// Áp dụng font size và lưu
// Áp dụng font size; `size` can be 'small'|'medium'|'large' or numeric px value.
function applyFontSize(size, close = true) {
  const content = getReaderContent();
  if(!content) return; // Chỉ áp dụng nếu đang đọc truyện

  let px;
  if (size === 'small') px = 16;
  else if (size === 'medium') px = 20;
  else if (size === 'large') px = 24;
  else px = parseFloat(size);

  if (isNaN(px)) px = 20;

  content.style.fontSize = px + 'px';
  if (!localStorage.getItem('lineHeight')) {
    content.style.setProperty('--line-height', getDefaultLineHeight(px));
  }

  localStorage.setItem('fontsize', String(px)); // lưu cỡ chữ (px)

  if (close) toggleSettings(); // only close settings when requested
}

function setFont(fontName, close = true) {
  const content = getReaderContent();
  if (!content) return;

  const fontMap = {
    'Noto Sans': "'Noto Sans', 'Segoe UI', 'Verdana', sans-serif",
    'Merriweather': "'Merriweather', 'Times New Roman', serif"
  };

  const nextFont = fontMap[fontName] ? fontName : 'Noto Sans';
  content.style.setProperty('--font-family', fontMap[nextFont]);
  localStorage.setItem('fontFamily', nextFont);

  if (close) toggleSettings();
}

function setLineHeight(value, close = true) {
  const content = getReaderContent();
  if (!content) return;

  const numeric = parseFloat(value);
  const nextValue = Number.isFinite(numeric)
    ? String(numeric)
    : getDefaultLineHeight(parseFloat(content.style.fontSize) || 20);

  content.style.setProperty('--line-height', nextValue);
  localStorage.setItem('lineHeight', nextValue);

  if (close) toggleSettings();
}

function setLetterSpacing(value, close = true) {
  const content = getReaderContent();
  if (!content) return;

  const allowed = new Set(['normal', '0.06em', '0.12em']);
  const nextValue = allowed.has(value) ? value : 'normal';

  content.style.setProperty('--letter-spacing', nextValue);
  localStorage.setItem('letterSpacing', nextValue);

  if (close) toggleSettings();
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
