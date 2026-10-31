(() => {
  'use strict';

  const STUDIO_API_BASE_URL = 'https://webdocsach-data-api.huydd12401.workers.dev';
  const BOOK_DRAFT_KEY = 'webdocsach:admin:book-draft:v2';
  const CHAPTER_DRAFT_KEY = 'webdocsach:admin:chapter-draft:v2';
  const METADATA_DRAFT_KEY = 'webdocsach:admin:metadata-draft:v1';
  const TOKEN_SESSION_KEY = 'webdocsach:admin:token:session';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    modeButtons: $$('[data-studio-mode]'),
    panels: $$('[data-studio-panel]'),
    chapterSidebarActions: $('#studioChapterSidebarActions'),
    token: $('#adminToken'),
    tokenToggle: $('#toggleAdminToken'),
    sessionState: $('#studioSessionState'),
    connectionPill: $('#studioConnectionPill'),
    connectionText: $('#studioConnectionText'),
    bookCount: $('#studioBookCount'),
    chapterCount: $('#studioChapterCount'),
    updatingCount: $('#studioUpdatingCount'),
    existingBookPicker: $('#existingBookPicker'),
    metadataPanel: $('#metadataStudioPanel'),
    metadataBook: $('#metadataBook'),
    metadataTitle: $('#metadataTitle'),
    metadataAuthor: $('#metadataAuthor'),
    metadataGenres: $('#metadataGenres'),
    metadataGenreTags: $('#metadataGenreTags'),
    addMetadataGenre: $('#addMetadataGenreButton'),
    metadataCurrentBook: $('#metadataCurrentBook'),
    metadataCurrentTitle: $('#metadataCurrentTitle'),
    metadataCurrentAuthor: $('#metadataCurrentAuthor'),
    metadataCurrentGenres: $('#metadataCurrentGenres'),
    metadataChangePreview: $('#metadataChangePreview'),
    metadataSave: $('#saveMetadataButton'),
    metadataReset: $('#resetMetadataButton'),
    metadataStatus: $('#metadataStatus'),
    metadataSummary: $('#metadataSummary'),
    generateBookId: $('#generateBookId'),
    bookForm: $('#bookUploadForm'),
    bookId: $('#bookId'),
    bookTitle: $('#bookTitle'),
    bookAuthor: $('#bookAuthor'),
    bookStatus: $('#bookStatus'),
    bookDate: $('#bookDate'),
    bookGenres: $('#bookGenres'),
    bookGenreTags: $('#bookGenreTags'),
    bookDescription: $('#bookDescription'),
    descriptionCount: $('#bookDescriptionCount'),
    coverFile: $('#coverFile'),
    coverPreview: $('#coverPreviewImage'),
    coverPlaceholder: $('#coverPreviewPlaceholder'),
    coverMeta: $('#coverFileMeta'),
    chapterFolder: $('#chapterFolder'),
    folderMeta: $('#chapterFolderMeta'),
    validateBook: $('#validateBookButton'),
    uploadBook: $('#uploadBookButton'),
    bookStatusMessage: $('#adminStatus'),
    chapterPanel: $('#singleChapterSection'),
    chapterBook: $('#singleChapterBook'),
    chapterNumber: $('#singleChapterNumber'),
    chapterTitle: $('#singleChapterTitle'),
    chapterContent: $('#singleChapterContent'),
    chapterImage: $('#singleChapterImage'),
    chapterPreview: $('#chapterPreviewImage'),
    chapterImageMeta: $('#chapterImageMeta'),
    chapterWordCount: $('#chapterWordCount'),
    chapterReadingTime: $('#chapterReadingTime'),
    chapterSaveIndicator: $('#chapterSaveIndicator'),
    formatChapter: $('#formatChapterText'),
    focusEditor: $('#toggleFocusEditor'),
    editorCard: $('#studioEditorCard'),
    nextChapter: $('#suggestNextChapter'),
    loadChapter: $('#loadExistingChapterButton'),
    uploadChapter: $('#uploadSingleChapterButton'),
    chapterStatusMessage: $('#singleChapterStatus'),
    draftState: $('#studioDraftState'),
    draftTime: $('#studioDraftTime'),
    clearDraft: $('#clearStudioDraft'),
    checklistProgress: $('#studioChecklistProgress'),
    checklistBar: $('#studioChecklistBar'),
    checkToken: $('#studioCheckToken'),
    checkBook: $('#studioCheckBook'),
    checkCover: $('#studioCheckCover'),
    checkReady: $('#studioCheckReady'),
    toast: $('#studioToast')
  };

  let activeMode = 'book';
  let catalog = [];
  let bookDraftTimer = 0;
  let chapterDraftTimer = 0;
  let metadataDraftTimer = 0;
  let toastTimer = 0;
  let coverPreviewUrl = '';
  let chapterPreviewUrl = '';
  const selectedMetadataGenres = new Map();

  function showToast(message) {
    if (!elements.toast) return;
    window.clearTimeout(toastTimer);
    $('p', elements.toast).textContent = message;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3200);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
  }

  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 ** 2).toFixed(2)} MB`;
  }

  function dateToInput(value) {
    const matched = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return matched ? `${matched[3]}-${matched[2]}-${matched[1]}` : String(value || '');
  }

  function createBookId(title) {
    return String(title || '')
      .replace(/[đĐ]/g, letter => letter === 'Đ' ? 'D' : 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
      .slice(0, 80);
  }

  function setMode(mode, options = {}) {
    activeMode = ['book', 'metadata', 'chapter'].includes(mode) ? mode : 'book';

    elements.modeButtons.forEach(button => {
      const isActive = button.dataset.studioMode === activeMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    elements.panels.forEach(panel => {
      panel.hidden = panel.dataset.studioPanel !== activeMode;
    });

    if (elements.chapterSidebarActions) {
      elements.chapterSidebarActions.hidden = activeMode !== 'chapter';
    }

    if (!options.silent) {
      try { sessionStorage.setItem('webdocsach:admin:mode', activeMode); } catch (_) {}
    }

    updateChecklist();
    updateDraftState();

    if (options.focus) {
      const target = activeMode === 'chapter'
        ? elements.chapterBook
        : activeMode === 'metadata'
          ? elements.metadataBook
          : elements.bookTitle;
      window.setTimeout(() => target?.focus(), 120);
    }
  }

  function updateTokenState() {
    const hasToken = Boolean(elements.token.value.trim());
    elements.sessionState.textContent = hasToken ? 'Token sẵn sàng' : 'Chưa nhập token';
    elements.sessionState.classList.toggle('is-ready', hasToken);

    try {
      if (hasToken) sessionStorage.setItem(TOKEN_SESSION_KEY, elements.token.value.trim());
      else sessionStorage.removeItem(TOKEN_SESSION_KEY);
    } catch (_) {}

    updateChecklist();
  }

  function toggleTokenVisibility() {
    const showing = elements.token.type === 'text';
    elements.token.type = showing ? 'password' : 'text';
    elements.tokenToggle.setAttribute('aria-label', showing ? 'Hiện mã quản trị' : 'Ẩn mã quản trị');
    elements.token.focus();
  }

  async function fetchCatalog() {
    try {
      const response = await fetch(`${STUDIO_API_BASE_URL}/data/books.json?time=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Danh mục không hợp lệ');
      catalog = data.filter(book => book && book.id);
      updateCatalogUi();

      elements.connectionPill.classList.remove('is-offline');
      elements.connectionPill.classList.add('is-online');
      elements.connectionText.textContent = 'R2 đang hoạt động';
    } catch (error) {
      elements.connectionPill.classList.remove('is-online');
      elements.connectionPill.classList.add('is-offline');
      elements.connectionText.textContent = 'Không thể kết nối R2';
      console.warn('Không tải được thống kê Admin Studio:', error);
    }
  }

  function updateCatalogUi() {
    const totalChapters = catalog.reduce((sum, book) => sum + (Number(book.chapterCount) || 0), 0);
    const updating = catalog.filter(book => String(book.status || '').toLowerCase().includes('đang')).length;

    elements.bookCount.textContent = formatNumber(catalog.length);
    elements.chapterCount.textContent = formatNumber(totalChapters);
    elements.updatingCount.textContent = formatNumber(updating);

    const currentValue = elements.existingBookPicker.value;
    const metadataValue = elements.metadataBook.value || elements.metadataBook.dataset.restoreValue || '';
    const options = catalog
      .slice()
      .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id), 'vi'));

    elements.existingBookPicker.replaceChildren(new Option('Chọn truyện để chỉnh sửa...', ''));
    options.forEach(book => {
      elements.existingBookPicker.add(new Option(`${book.title || book.id} · ${book.id}`, book.id));
    });
    elements.existingBookPicker.value = currentValue;

    elements.metadataBook.replaceChildren(new Option('Chọn truyện cần sửa thông tin...', ''));
    options.forEach(book => {
      elements.metadataBook.add(new Option(`${book.title || book.id} · ${book.id}`, book.id));
    });
    elements.metadataBook.disabled = options.length === 0;
    elements.metadataBook.value = metadataValue;
    delete elements.metadataBook.dataset.restoreValue;
    renderMetadataCurrentBook();
    updateMetadataPreview();
  }

  function getMetadataGenres(book) {
    const value = book?.genre ?? book?.genres ?? [];
    return (Array.isArray(value) ? value : String(value).split(/[,;]+/))
      .map(genre => String(genre).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function parseMetadataGenres(value) {
    const unique = new Map();
    String(value || '')
      .split(/[,;\n]+/)
      .map(genre => genre.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .forEach(genre => unique.set(genre.toLocaleLowerCase('vi'), genre));
    return [...unique.values()];
  }

  function getPendingMetadataGenres() {
    const unique = new Map(selectedMetadataGenres);
    parseMetadataGenres(elements.metadataGenres.value).forEach(genre => {
      unique.set(genre.toLocaleLowerCase('vi'), genre);
    });
    return [...unique.values()];
  }

  function renderMetadataGenreTags() {
    const fragment = document.createDocumentFragment();

    selectedMetadataGenres.forEach((genre, genreKey) => {
      const tag = document.createElement('button');
      const removeIcon = document.createElement('span');
      tag.type = 'button';
      tag.className = 'admin-genre-tag';
      tag.setAttribute('aria-label', `Xóa thể loại ${genre}`);
      removeIcon.textContent = '×';
      removeIcon.setAttribute('aria-hidden', 'true');
      tag.append(document.createTextNode(genre), removeIcon);
      tag.addEventListener('click', () => {
        selectedMetadataGenres.delete(genreKey);
        renderMetadataGenreTags();
        updateMetadataPreview();
        saveMetadataDraft();
      });
      fragment.appendChild(tag);
    });

    elements.metadataGenreTags.replaceChildren(fragment);
  }

  function setMetadataGenres(genres) {
    selectedMetadataGenres.clear();
    const values = Array.isArray(genres) ? genres : parseMetadataGenres(genres);
    values.map(value => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean).forEach(genre => {
      selectedMetadataGenres.set(genre.toLocaleLowerCase('vi'), genre);
    });
    elements.metadataGenres.value = '';
    renderMetadataGenreTags();
  }

  function addMetadataGenresFromInput(options = {}) {
    const genres = parseMetadataGenres(elements.metadataGenres.value);
    genres.forEach(genre => {
      selectedMetadataGenres.set(genre.toLocaleLowerCase('vi'), genre);
    });

    if (genres.length) {
      elements.metadataGenres.value = '';
      renderMetadataGenreTags();
      updateMetadataPreview();
      saveMetadataDraft();
    }

    if (options.focus !== false) elements.metadataGenres.focus();
  }

  function renderMetadataCurrentBook() {
    const book = catalog.find(item => item.id === elements.metadataBook.value);
    elements.metadataCurrentBook.hidden = !book;

    if (!book) {
      elements.metadataCurrentTitle.textContent = '—';
      elements.metadataCurrentAuthor.textContent = '—';
      elements.metadataCurrentGenres.replaceChildren();
      return;
    }

    elements.metadataCurrentTitle.textContent = book.title || book.id;
    elements.metadataCurrentAuthor.textContent = `Tác giả: ${book.author || 'Chưa cập nhật'}`;
    elements.metadataCurrentGenres.replaceChildren();

    const genres = getMetadataGenres(book);
    (genres.length ? genres : ['Chưa có thể loại']).forEach(genre => {
      const tag = document.createElement('span');
      tag.textContent = genre;
      elements.metadataCurrentGenres.appendChild(tag);
    });

    elements.metadataTitle.placeholder = `Hiện tại: ${book.title || book.id}`;
    elements.metadataAuthor.placeholder = `Hiện tại: ${book.author || 'Chưa cập nhật'}`;
  }

  function getMetadataChanges(book = catalog.find(item => item.id === elements.metadataBook.value)) {
    if (!book) return {};

    const changes = {};
    const title = elements.metadataTitle.value.replace(/\s+/g, ' ').trim();
    const author = elements.metadataAuthor.value.replace(/\s+/g, ' ').trim();
    const hasGenreInput = selectedMetadataGenres.size > 0 || elements.metadataGenres.value.trim();

    if (title && title !== String(book.title || '').trim()) changes.title = title;
    if (author && author !== String(book.author || '').trim()) changes.author = author;

    if (hasGenreInput) {
      const genres = getPendingMetadataGenres();
      const currentGenres = getMetadataGenres(book);
      const sameGenres = genres.length === currentGenres.length && genres.every((genre, index) => (
        genre.toLocaleLowerCase('vi') === currentGenres[index]?.toLocaleLowerCase('vi')
      ));
      if (genres.length && !sameGenres) changes.genre = genres;
    }

    return changes;
  }

  function updateMetadataPreview() {
    const book = catalog.find(item => item.id === elements.metadataBook.value);
    const changes = getMetadataChanges(book);
    const entries = [];

    if (changes.title) entries.push(`Tên truyện: ${book.title || book.id} → ${changes.title}`);
    if (changes.author) entries.push(`Tác giả: ${book.author || 'Chưa cập nhật'} → ${changes.author}`);
    if (changes.genre) entries.push(`Thể loại: ${changes.genre.join(', ')}`);

    elements.metadataChangePreview.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = entries.length ? `${entries.length} thay đổi sẽ được lưu` : 'Chưa có thay đổi';
    elements.metadataChangePreview.appendChild(heading);

    if (entries.length) {
      const list = document.createElement('ul');
      entries.forEach(entry => {
        const item = document.createElement('li');
        item.textContent = entry;
        list.appendChild(item);
      });
      elements.metadataChangePreview.appendChild(list);
    } else {
      const message = document.createElement('p');
      message.textContent = book
        ? 'Nhập một hoặc nhiều mục cần sửa. Các mục còn lại sẽ được giữ nguyên.'
        : 'Chọn truyện và nhập ít nhất một mục cần sửa.';
      elements.metadataChangePreview.appendChild(message);
    }

    elements.metadataSave.disabled = !book || entries.length === 0;
    updateChecklist();
  }

  function resetMetadataInputs(options = {}) {
    elements.metadataTitle.value = '';
    elements.metadataAuthor.value = '';
    setMetadataGenres([]);
    elements.metadataSummary.hidden = true;
    elements.metadataSummary.textContent = '';
    elements.metadataStatus.textContent = '';
    elements.metadataStatus.className = 'admin-status';
    if (options.removeDraft !== false) localStorage.removeItem(METADATA_DRAFT_KEY);
    updateMetadataPreview();
    updateDraftState();
  }

  function showMetadataStatus(message, type = '') {
    elements.metadataStatus.textContent = message;
    elements.metadataStatus.className = 'admin-status';
    if (type) elements.metadataStatus.classList.add(`is-${type}`);
  }

  async function saveMetadataChanges() {
    const adminToken = elements.token.value.trim();
    const bookId = elements.metadataBook.value;

    if (!adminToken) {
      showMetadataStatus('Bạn chưa nhập ADMIN_TOKEN.', 'error');
      elements.token.focus();
      return;
    }
    if (!bookId) {
      showMetadataStatus('Hãy chọn truyện cần sửa.', 'error');
      elements.metadataBook.focus();
      return;
    }

    elements.metadataSave.disabled = true;
    elements.metadataReset.disabled = true;
    showMetadataStatus('Đang đọc dữ liệu mới nhất trên R2...');

    try {
      const catalogResponse = await fetch(`${STUDIO_API_BASE_URL}/data/books.json?time=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!catalogResponse.ok) throw new Error('Không thể đọc danh mục truyện trên R2.');

      const freshCatalog = await catalogResponse.json();
      if (!Array.isArray(freshCatalog)) throw new Error('Danh mục truyện trên R2 không hợp lệ.');

      const bookIndex = freshCatalog.findIndex(book => book?.id === bookId);
      if (bookIndex < 0) throw new Error('Không tìm thấy truyện đã chọn trong danh mục.');

      const previousBook = freshCatalog[bookIndex];
      const changes = getMetadataChanges(previousBook);
      if (!Object.keys(changes).length) throw new Error('Bạn chưa nhập thông tin nào cần thay đổi.');

      const updatedBook = { ...previousBook, ...changes };
      freshCatalog[bookIndex] = updatedBook;

      showMetadataStatus('Đang lưu thay đổi lên R2...');
      const uploadResponse = await fetch(`${STUDIO_API_BASE_URL}/data/books.json`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: `${JSON.stringify(freshCatalog, null, 2)}\n`
      });

      let uploadResult = {};
      try { uploadResult = await uploadResponse.json(); } catch (_) {}
      if (!uploadResponse.ok) {
        throw new Error(uploadResult.error || 'Không thể cập nhật books.json trên R2.');
      }

      catalog = freshCatalog.filter(book => book && book.id);
      updateCatalogUi();
      elements.metadataBook.value = bookId;
      renderMetadataCurrentBook();

      const changedLabels = [];
      if (changes.title) changedLabels.push(`Tên truyện: ${changes.title}`);
      if (changes.author) changedLabels.push(`Tác giả: ${changes.author}`);
      if (changes.genre) changedLabels.push(`Thể loại: ${changes.genre.join(', ')}`);

      elements.metadataTitle.value = '';
      elements.metadataAuthor.value = '';
      setMetadataGenres([]);
      localStorage.removeItem(METADATA_DRAFT_KEY);
      updateMetadataPreview();
      updateDraftState();

      elements.metadataSummary.textContent = [
        `Truyện: ${updatedBook.title || updatedBook.id}`,
        ...changedLabels,
        '',
        'Những thông tin khác được giữ nguyên.'
      ].join('\n');
      elements.metadataSummary.hidden = false;
      showMetadataStatus('Đã cập nhật thông tin truyện thành công.', 'success');
      showToast('Thông tin truyện đã được cập nhật trên R2');

      if (typeof loadChapterBookOptions === 'function') await loadChapterBookOptions();
    } catch (error) {
      showMetadataStatus(error instanceof Error ? error.message : 'Không thể cập nhật thông tin truyện.', 'error');
    } finally {
      elements.metadataReset.disabled = false;
      updateMetadataPreview();
    }
  }

  function setGenres(genres) {
    if (typeof selectedBookGenres === 'undefined') return;
    selectedBookGenres.clear();
    const values = Array.isArray(genres) ? genres : String(genres || '').split(/[,;]+/);
    values.map(value => String(value).trim()).filter(Boolean).forEach(value => {
      selectedBookGenres.set(value.toLocaleLowerCase('vi'), value);
    });
    renderBookGenreTags();
    syncBookGenreValidity();
  }

  function previewRemoteCover(url) {
    if (!url) return;
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
      coverPreviewUrl = '';
    }
    elements.coverPreview.src = url;
    elements.coverPreview.hidden = false;
    elements.coverPlaceholder.hidden = true;
    elements.coverMeta.textContent = 'Ảnh bìa hiện tại · Hãy chọn file nếu muốn tải lại';
  }

  function loadExistingBook(bookId) {
    const book = catalog.find(item => item.id === bookId);
    if (!book) return;

    elements.bookId.value = book.id || '';
    elements.bookTitle.value = book.title || '';
    elements.bookAuthor.value = book.author || '';
    elements.bookStatus.value = book.status || 'Đang cập nhật';
    elements.bookDate.value = dateToInput(book.date) || elements.bookDate.value;
    elements.bookDescription.value = book.description || '';
    setGenres(book.genre || book.genres || []);
    previewRemoteCover(book.cover || '');
    updateDescriptionCount();
    saveBookDraft(true);
    updateChecklist();
    showToast(`Đã nạp thông tin “${book.title || book.id}”`);
  }

  function updateDescriptionCount() {
    elements.descriptionCount.textContent = `${formatNumber(elements.bookDescription.value.length)} ký tự`;
  }

  function updateCoverPreview() {
    const file = elements.coverFile.files?.[0];
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = '';

    if (!file) {
      elements.coverPreview.removeAttribute('src');
      elements.coverPreview.hidden = true;
      elements.coverPlaceholder.hidden = false;
      elements.coverMeta.textContent = 'JPG, PNG hoặc WEBP · Tối đa 20 MB';
      updateChecklist();
      return;
    }

    coverPreviewUrl = URL.createObjectURL(file);
    elements.coverPreview.src = coverPreviewUrl;
    elements.coverPreview.hidden = false;
    elements.coverPlaceholder.hidden = true;
    elements.coverMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
    updateChecklist();
  }

  function updateFolderMeta() {
    const files = [...(elements.chapterFolder.files || [])].filter(file => file.name.toLowerCase().endsWith('.txt'));
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    elements.folderMeta.textContent = files.length
      ? `${formatNumber(files.length)} file .txt · ${formatBytes(bytes)}`
      : 'Bạn có thể đăng từng chương ở mục bên cạnh.';
  }

  function updateChapterImagePreview() {
    const file = elements.chapterImage.files?.[0];
    if (chapterPreviewUrl) URL.revokeObjectURL(chapterPreviewUrl);
    chapterPreviewUrl = '';

    if (!file) {
      elements.chapterPreview.removeAttribute('src');
      elements.chapterPreview.hidden = true;
      elements.chapterImageMeta.textContent = 'Không bắt buộc · tối đa 20 MB';
      return;
    }

    chapterPreviewUrl = URL.createObjectURL(file);
    elements.chapterPreview.src = chapterPreviewUrl;
    elements.chapterPreview.hidden = false;
    elements.chapterImageMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  }

  function setupDropZone(zoneSelector, input, onChange) {
    const zone = $(zoneSelector);
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => {
      event.preventDefault();
      zone.classList.add('is-dragging');
    }));

    ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => {
      event.preventDefault();
      zone.classList.remove('is-dragging');
    }));

    zone.addEventListener('drop', event => {
      const files = [...(event.dataTransfer?.files || [])];
      if (!files.length) return;
      const transfer = new DataTransfer();
      transfer.items.add(files[0]);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      onChange?.();
    });
  }

  function getBookDraft() {
    return {
      id: elements.bookId.value,
      title: elements.bookTitle.value,
      author: elements.bookAuthor.value,
      status: elements.bookStatus.value,
      date: elements.bookDate.value,
      genres: typeof selectedBookGenres === 'undefined' ? [] : [...selectedBookGenres.values()],
      description: elements.bookDescription.value,
      savedAt: new Date().toISOString()
    };
  }

  function getChapterDraft() {
    return {
      bookId: elements.chapterBook.value,
      number: elements.chapterNumber.value,
      title: elements.chapterTitle.value,
      content: elements.chapterContent.value,
      savedAt: new Date().toISOString()
    };
  }

  function getMetadataDraft() {
    return {
      bookId: elements.metadataBook.value,
      title: elements.metadataTitle.value,
      author: elements.metadataAuthor.value,
      genres: getPendingMetadataGenres(),
      savedAt: new Date().toISOString()
    };
  }

  function hasMeaningfulBookDraft(draft) {
    return Boolean(
      draft.id?.trim() ||
      draft.title?.trim() ||
      draft.author?.trim() ||
      draft.description?.trim() ||
      draft.genres?.length
    );
  }

  function hasMeaningfulChapterDraft(draft) {
    return Boolean(
      draft.bookId ||
      draft.number ||
      draft.title?.trim() ||
      draft.content?.trim()
    );
  }

  function hasMeaningfulMetadataDraft(draft) {
    return Boolean(
      draft.bookId ||
      draft.title?.trim() ||
      draft.author?.trim() ||
      (Array.isArray(draft.genres) ? draft.genres.length : String(draft.genres || '').trim())
    );
  }

  function writeDraft(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('Không thể lưu bản nháp:', error);
      return false;
    }
  }

  function saveBookDraft(immediate = false) {
    window.clearTimeout(bookDraftTimer);
    const save = () => {
      const draft = getBookDraft();
      if (!hasMeaningfulBookDraft(draft)) {
        localStorage.removeItem(BOOK_DRAFT_KEY);
        updateDraftState();
        return;
      }
      if (writeDraft(BOOK_DRAFT_KEY, draft)) updateDraftState();
    };
    if (immediate) save();
    else bookDraftTimer = window.setTimeout(save, 450);
  }

  function saveChapterDraft(immediate = false) {
    window.clearTimeout(chapterDraftTimer);
    elements.chapterSaveIndicator.textContent = 'Đang lưu...';
    const save = () => {
      const draft = getChapterDraft();
      if (!hasMeaningfulChapterDraft(draft)) {
        localStorage.removeItem(CHAPTER_DRAFT_KEY);
        elements.chapterSaveIndicator.innerHTML = '<i aria-hidden="true"></i>Chưa có bản nháp';
        updateDraftState();
        return;
      }
      if (writeDraft(CHAPTER_DRAFT_KEY, draft)) {
        elements.chapterSaveIndicator.innerHTML = '<i aria-hidden="true"></i>Đã lưu nháp';
        updateDraftState();
      } else {
        elements.chapterSaveIndicator.textContent = 'Không thể lưu nháp';
      }
    };
    if (immediate) save();
    else chapterDraftTimer = window.setTimeout(save, 550);
  }

  function saveMetadataDraft(immediate = false) {
    window.clearTimeout(metadataDraftTimer);
    const save = () => {
      const draft = getMetadataDraft();
      if (!hasMeaningfulMetadataDraft(draft)) {
        localStorage.removeItem(METADATA_DRAFT_KEY);
        updateDraftState();
        return;
      }
      if (writeDraft(METADATA_DRAFT_KEY, draft)) updateDraftState();
    };
    if (immediate) save();
    else metadataDraftTimer = window.setTimeout(save, 450);
  }

  function readDraft(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function restoreDrafts() {
    const bookDraft = readDraft(BOOK_DRAFT_KEY);
    if (bookDraft && !elements.bookTitle.value) {
      elements.bookId.value = bookDraft.id || '';
      elements.bookTitle.value = bookDraft.title || '';
      elements.bookAuthor.value = bookDraft.author || '';
      elements.bookStatus.value = bookDraft.status || 'Đang cập nhật';
      elements.bookDate.value = bookDraft.date || elements.bookDate.value;
      elements.bookDescription.value = bookDraft.description || '';
      setGenres(bookDraft.genres || []);
      updateDescriptionCount();
    }

    const chapterDraft = readDraft(CHAPTER_DRAFT_KEY);
    if (chapterDraft) {
      elements.chapterNumber.value = chapterDraft.number || '';
      elements.chapterTitle.value = chapterDraft.title || '';
      elements.chapterContent.value = chapterDraft.content || '';
      elements.chapterBook.dataset.restoreValue = chapterDraft.bookId || '';
      restoreChapterBookSelection();
      updateChapterMetrics();
      elements.chapterSaveIndicator.innerHTML = '<i aria-hidden="true"></i>Đã khôi phục bản nháp';
    } else {
      elements.chapterSaveIndicator.innerHTML = '<i aria-hidden="true"></i>Chưa có bản nháp';
    }

    const metadataDraft = readDraft(METADATA_DRAFT_KEY);
    if (metadataDraft) {
      elements.metadataTitle.value = metadataDraft.title || '';
      elements.metadataAuthor.value = metadataDraft.author || '';
      setMetadataGenres(metadataDraft.genres || []);
      elements.metadataBook.dataset.restoreValue = metadataDraft.bookId || '';
    }

    updateDraftState();
    updateChecklist();
  }

  function restoreChapterBookSelection() {
    const value = elements.chapterBook.dataset.restoreValue;
    if (!value) return;
    const exists = [...elements.chapterBook.options].some(option => option.value === value);
    if (exists) {
      elements.chapterBook.value = value;
      delete elements.chapterBook.dataset.restoreValue;
      updateChecklist();
    }
  }

  function draftLabel(savedAt) {
    if (!savedAt) return 'Tự động lưu khi bạn nhập';
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) return 'Đã lưu trên thiết bị';
    return `Lưu lúc ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function updateDraftState() {
    const key = activeMode === 'book'
      ? BOOK_DRAFT_KEY
      : activeMode === 'metadata'
        ? METADATA_DRAFT_KEY
        : CHAPTER_DRAFT_KEY;
    const draft = readDraft(key);
    elements.draftState.textContent = draft ? 'Đã lưu an toàn' : 'Chưa có thay đổi';
    elements.draftTime.textContent = draftLabel(draft?.savedAt);
  }

  function clearActiveDraft() {
    const key = activeMode === 'book'
      ? BOOK_DRAFT_KEY
      : activeMode === 'metadata'
        ? METADATA_DRAFT_KEY
        : CHAPTER_DRAFT_KEY;
    const draft = readDraft(key);
    if (!draft) {
      showToast('Hiện không có bản nháp để xóa');
      return;
    }

    if (!window.confirm('Xóa bản nháp đang lưu trên thiết bị? Dữ liệu đã tải lên R2 không bị ảnh hưởng.')) return;
    localStorage.removeItem(key);
    updateDraftState();
    showToast('Đã xóa bản nháp trên thiết bị');
  }

  function updateChapterMetrics() {
    const words = elements.chapterContent.value.trim().match(/\S+/g)?.length || 0;
    const minutes = words ? Math.max(1, Math.ceil(words / 230)) : 0;
    elements.chapterWordCount.textContent = `${formatNumber(words)} từ`;
    elements.chapterReadingTime.textContent = `${formatNumber(minutes)} phút đọc`;
  }

  function formatChapterText() {
    const original = elements.chapterContent.value;
    const formatted = original
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map(line => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();

    if (!formatted || formatted === original) {
      showToast('Nội dung đã gọn gàng, không cần chỉnh thêm');
      return;
    }

    elements.chapterContent.value = formatted;
    elements.chapterContent.dispatchEvent(new Event('input', { bubbles: true }));
    showToast('Đã chuẩn hóa khoảng trắng và dòng trống');
  }

  function getPreviousTextBlock(text) {
    const source = String(text || '').trim();
    if (!source) return null;

    const separators = [...source.matchAll(/\n[ \t]*\n+/g)];
    const separator = separators.at(-1);
    if (separator) {
      return {
        rest: source.slice(0, separator.index).trim(),
        block: source.slice(separator.index + separator[0].length).trim()
      };
    }

    const lineBreak = source.lastIndexOf('\n');
    return lineBreak >= 0
      ? {
          rest: source.slice(0, lineBreak).trim(),
          block: source.slice(lineBreak + 1).trim()
        }
      : { rest: '', block: source };
  }

  function getNextTextBlock(text) {
    const source = String(text || '').trim();
    if (!source) return null;

    const separator = source.match(/\n[ \t]*\n+/);
    if (separator) {
      return {
        block: source.slice(0, separator.index).trim(),
        rest: source.slice(separator.index + separator[0].length).trim()
      };
    }

    const lineBreak = source.indexOf('\n');
    return lineBreak >= 0
      ? {
          block: source.slice(0, lineBreak).trim(),
          rest: source.slice(lineBreak + 1).trim()
        }
      : { block: source, rest: '' };
  }

  function getSelectedTextBlock(textarea) {
    const value = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    if (selectionStart === selectionEnd) return null;

    const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const endAnchor = selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
      ? selectionEnd - 1
      : selectionEnd;
    const followingLineBreak = value.indexOf('\n', endAnchor);
    const blockEnd = followingLineBreak < 0 ? value.length : followingLineBreak;
    const block = value.slice(blockStart, blockEnd).trim();
    if (!block) return null;

    return {
      before: value.slice(0, blockStart).trimEnd(),
      block,
      after: value.slice(blockEnd).trimStart()
    };
  }

  function composeTextBlocks(blocks) {
    let value = '';
    let selectionStart = 0;
    let selectionEnd = 0;

    blocks.forEach(item => {
      const text = String(item.text || '').trim();
      if (!text) return;
      if (value) value += '\n\n';

      if (item.selected) selectionStart = value.length;
      value += text;
      if (item.selected) selectionEnd = value.length;
    });

    return { value, selectionStart, selectionEnd };
  }

  function moveSelectedChapterBlock(direction) {
    const textarea = elements.chapterContent;
    const selection = getSelectedTextBlock(textarea);
    if (!selection) return false;

    let blocks;
    if (direction === 'up') {
      const previous = getPreviousTextBlock(selection.before);
      if (!previous?.block) return false;
      blocks = [
        { text: previous.rest },
        { text: selection.block, selected: true },
        { text: previous.block },
        { text: selection.after }
      ];
    } else {
      const next = getNextTextBlock(selection.after);
      if (!next?.block) return false;
      blocks = [
        { text: selection.before },
        { text: next.block },
        { text: selection.block, selected: true },
        { text: next.rest }
      ];
    }

    const moved = composeTextBlocks(blocks);
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;

    textarea.setRangeText(moved.value, 0, textarea.value.length, 'end');
    textarea.setSelectionRange(moved.selectionStart, moved.selectionEnd, 'forward');
    textarea.scrollTop = scrollTop;
    textarea.scrollLeft = scrollLeft;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function handleChapterBlockMove(event) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;

    const textarea = elements.chapterContent;
    if (textarea.selectionStart === textarea.selectionEnd) return;

    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    const moved = moveSelectedChapterBlock(direction);

    if (moved) {
      showToast(direction === 'up' ? 'Đã đưa đoạn lên trên' : 'Đã đưa đoạn xuống dưới');
    } else {
      showToast(direction === 'up' ? 'Đoạn đã ở vị trí đầu tiên' : 'Đoạn đã ở vị trí cuối cùng');
    }
  }

  function setupChapterSelectionScrollLock() {
    const textarea = elements.chapterContent;
    if (!textarea) return;

    let isSelecting = false;
    let lockedScrollX = 0;
    let lockedScrollY = 0;

    function keepPageInPlace() {
      if (!isSelecting) return;

      if (
        window.scrollX !== lockedScrollX ||
        window.scrollY !== lockedScrollY
      ) {
        window.scrollTo(lockedScrollX, lockedScrollY);
      }
    }

    function stopSelectionLock() {
      if (!isSelecting) return;

      isSelecting = false;
      window.removeEventListener('scroll', keepPageInPlace);
    }

    textarea.addEventListener('mousedown', event => {
      if (event.button !== 0) return;

      isSelecting = true;
      lockedScrollX = window.scrollX;
      lockedScrollY = window.scrollY;

      window.addEventListener('scroll', keepPageInPlace, {
        passive: true
      });
    });

    window.addEventListener('mouseup', stopSelectionLock);
    window.addEventListener('blur', stopSelectionLock);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSelectionLock();
    });
  }

  function toggleFocusEditor() {
    const focused = elements.chapterPanel.classList.toggle('is-focus-editor');
    elements.focusEditor.textContent = focused ? 'Thu nhỏ' : 'Toàn màn hình';
    elements.focusEditor.title = focused ? 'Thoát chế độ toàn màn hình' : 'Mở trình soạn thảo toàn màn hình';
    elements.focusEditor.setAttribute('aria-pressed', String(focused));
    if (focused) elements.chapterContent.focus();
  }

  async function suggestNextChapter() {
    const bookId = elements.chapterBook.value;
    if (!bookId) {
      showToast('Hãy chọn truyện trước');
      elements.chapterBook.focus();
      return;
    }

    elements.nextChapter.disabled = true;
    elements.nextChapter.textContent = 'Đang kiểm tra...';

    try {
      const response = await fetch(`${STUDIO_API_BASE_URL}/data/${encodeURIComponent(bookId)}/chapters.json?time=${Date.now()}`, { cache: 'no-store' });
      let chapters = [];
      if (response.ok) chapters = await response.json();
      else if (response.status !== 404) throw new Error(`HTTP ${response.status}`);

      const highest = Array.isArray(chapters)
        ? chapters.reduce((max, chapter) => Math.max(max, Number(chapter?.number) || 0), 0)
        : 0;
      elements.chapterNumber.value = String(highest + 1);
      elements.chapterTitle.focus();
      elements.chapterNumber.dispatchEvent(new Event('input', { bubbles: true }));
      showToast(`Chương tiếp theo là chương ${highest + 1}`);
    } catch (_) {
      showToast('Chưa thể đọc danh sách chương của truyện này');
    } finally {
      elements.nextChapter.disabled = false;
      elements.nextChapter.textContent = 'Chương tiếp theo';
    }
  }

  function setChecklistItem(element, done, label) {
    element.classList.toggle('is-done', Boolean(done));
    if (label) $('span', element).textContent = label;
    return Boolean(done);
  }

  function updateChecklist() {
    const tokenReady = Boolean(elements.token.value.trim());
    let states;

    if (activeMode === 'chapter') {
      const chapterSetupReady = Boolean(
        elements.chapterBook.value &&
        Number(elements.chapterNumber.value) > 0
      );
      const chapterContentReady = Boolean(
        elements.chapterTitle.value.trim() &&
        elements.chapterContent.value.trim()
      );
      states = [
        setChecklistItem(elements.checkToken, tokenReady, 'Đã nhập mã quản trị'),
        setChecklistItem(elements.checkBook, chapterSetupReady, 'Đã chọn truyện và số chương'),
        setChecklistItem(elements.checkCover, chapterContentReady, 'Đủ tên và nội dung chương'),
        setChecklistItem(elements.checkReady, tokenReady && chapterSetupReady && chapterContentReady, 'Sẵn sàng tải chương')
      ];
    } else if (activeMode === 'metadata') {
      const bookReady = Boolean(elements.metadataBook.value);
      const changesReady = Object.keys(getMetadataChanges()).length > 0;
      states = [
        setChecklistItem(elements.checkToken, tokenReady, 'Đã nhập mã quản trị'),
        setChecklistItem(elements.checkBook, bookReady, 'Đã chọn truyện cần sửa'),
        setChecklistItem(elements.checkCover, changesReady, 'Đã nhập thông tin mới'),
        setChecklistItem(elements.checkReady, tokenReady && bookReady && changesReady, 'Sẵn sàng lưu thay đổi')
      ];
    } else {
      const genresReady = typeof selectedBookGenres !== 'undefined' && selectedBookGenres.size > 0;
      const infoReady = Boolean(
        elements.bookId.value.trim() && elements.bookTitle.value.trim() &&
        elements.bookAuthor.value.trim() && elements.bookDate.value &&
        elements.bookDescription.value.trim() && genresReady
      );
      states = [
        setChecklistItem(elements.checkToken, tokenReady, 'Đã nhập mã quản trị'),
        setChecklistItem(elements.checkBook, infoReady, 'Đủ thông tin truyện'),
        setChecklistItem(elements.checkCover, Boolean(elements.coverFile.files?.length), 'Đã chọn ảnh bìa'),
        setChecklistItem(elements.checkReady, tokenReady && !elements.uploadBook.disabled, 'Dữ liệu đã kiểm tra')
      ];
    }

    const completed = states.filter(Boolean).length;
    elements.checklistProgress.textContent = `${completed}/4`;
    elements.checklistBar.style.width = `${completed * 25}%`;
  }

  function observeSelectOptions() {
    const observer = new MutationObserver(() => {
      restoreChapterBookSelection();
      updateChecklist();
    });
    observer.observe(elements.chapterBook, { childList: true });
  }

  function observeStatusMessages() {
    const bookObserver = new MutationObserver(() => {
      updateChecklist();
      const message = elements.bookStatusMessage.textContent.trim();
      if (/^Đã tải thành công truyện/i.test(message)) {
        localStorage.removeItem(BOOK_DRAFT_KEY);
        updateDraftState();
        fetchCatalog();
        showToast('Truyện đã được tải lên R2 thành công');
      }
    });
    bookObserver.observe(elements.bookStatusMessage, { childList: true, characterData: true, subtree: true, attributes: true });

    const chapterObserver = new MutationObserver(() => {
      updateChecklist();
      const message = elements.chapterStatusMessage.textContent.trim();
      if (/^Đã mở chương/i.test(message)) {
        updateChapterMetrics();
        updateChapterImagePreview();
        saveChapterDraft(true);
      }
      if (/^Đã (đăng|cập nhật) chương/i.test(message)) {
        localStorage.removeItem(CHAPTER_DRAFT_KEY);
        updateChapterMetrics();
        updateChapterImagePreview();
        elements.chapterSaveIndicator.innerHTML = '<i aria-hidden="true"></i>Chưa có bản nháp';
        updateDraftState();
        fetchCatalog();
        showToast(message);
      }
    });
    chapterObserver.observe(elements.chapterStatusMessage, { childList: true, characterData: true, subtree: true, attributes: true });
  }

  function setupEvents() {
    elements.modeButtons.forEach(button => button.addEventListener('click', () => {
      setMode(button.dataset.studioMode, { focus: true });
    }));

    elements.token.addEventListener('input', updateTokenState);
    elements.tokenToggle.addEventListener('click', toggleTokenVisibility);
    elements.existingBookPicker.addEventListener('change', () => loadExistingBook(elements.existingBookPicker.value));
    elements.metadataBook.addEventListener('change', () => {
      resetMetadataInputs();
      renderMetadataCurrentBook();
      saveMetadataDraft(true);
      updateMetadataPreview();
    });
    elements.generateBookId.addEventListener('click', () => {
      const generated = createBookId(elements.bookTitle.value);
      if (!generated) {
        showToast('Hãy nhập tên truyện trước khi tạo mã');
        elements.bookTitle.focus();
        return;
      }
      elements.bookId.value = generated;
      elements.bookId.dispatchEvent(new Event('input', { bubbles: true }));
      showToast(`Đã tạo mã truyện: ${generated}`);
    });

    elements.bookDescription.addEventListener('input', updateDescriptionCount);
    elements.coverFile.addEventListener('change', updateCoverPreview);
    elements.chapterFolder.addEventListener('change', updateFolderMeta);
    elements.chapterImage.addEventListener('change', updateChapterImagePreview);

    elements.bookForm.addEventListener('input', () => {
      saveBookDraft();
      updateChecklist();
    });
    elements.bookForm.addEventListener('change', () => {
      saveBookDraft();
      updateChecklist();
    });

    elements.bookGenreTags.addEventListener('click', () => window.setTimeout(() => {
      saveBookDraft();
      updateChecklist();
    }));

    [elements.metadataTitle, elements.metadataAuthor].forEach(input => {
      input.addEventListener('input', () => {
        updateMetadataPreview();
        saveMetadataDraft();
      });
    });

    elements.addMetadataGenre.addEventListener('click', addMetadataGenresFromInput);
    elements.metadataGenres.addEventListener('keydown', event => {
      if (!['Enter', ',', ';'].includes(event.key)) return;
      event.preventDefault();
      addMetadataGenresFromInput();
    });
    elements.metadataGenres.addEventListener('input', () => {
      updateMetadataPreview();
      saveMetadataDraft();
    });
    elements.metadataGenres.addEventListener('blur', () => addMetadataGenresFromInput({ focus: false }));

    elements.metadataReset.addEventListener('click', () => {
      resetMetadataInputs();
      showToast('Đã xóa nội dung thay đổi chưa lưu');
    });
    elements.metadataSave.addEventListener('click', saveMetadataChanges);

    [elements.chapterBook, elements.chapterNumber, elements.chapterTitle, elements.chapterContent].forEach(input => {
      input.addEventListener('input', () => {
        saveChapterDraft();
        updateChecklist();
      });
      input.addEventListener('change', () => {
        saveChapterDraft();
        updateChecklist();
      });
    });

    elements.chapterContent.addEventListener('input', updateChapterMetrics);
    elements.chapterContent.addEventListener('keydown', handleChapterBlockMove);
    setupChapterSelectionScrollLock();
    elements.formatChapter.addEventListener('click', formatChapterText);
    elements.focusEditor.addEventListener('click', toggleFocusEditor);
    elements.nextChapter.addEventListener('click', suggestNextChapter);
    elements.clearDraft.addEventListener('click', clearActiveDraft);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && elements.chapterPanel.classList.contains('is-focus-editor')) {
        toggleFocusEditor();
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (activeMode === 'book') saveBookDraft(true);
        else if (activeMode === 'metadata') saveMetadataDraft(true);
        else saveChapterDraft(true);
        showToast('Đã lưu bản nháp trên thiết bị');
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (activeMode === 'book') {
          if (elements.uploadBook.disabled) elements.validateBook.click();
          else elements.uploadBook.click();
        } else if (activeMode === 'metadata') {
          elements.metadataSave.click();
        } else {
          elements.uploadChapter.click();
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      if (activeMode === 'book') saveBookDraft(true);
      else if (activeMode === 'metadata') saveMetadataDraft(true);
      else saveChapterDraft(true);
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      if (chapterPreviewUrl) URL.revokeObjectURL(chapterPreviewUrl);
    });
  }

  function init() {
    try {
      const savedToken = sessionStorage.getItem(TOKEN_SESSION_KEY);
      if (savedToken) elements.token.value = savedToken;
    } catch (_) {}

    setupEvents();
    setupDropZone('#coverDropZone', elements.coverFile, updateCoverPreview);
    setupDropZone('#chapterImageDropZone', elements.chapterImage, updateChapterImagePreview);
    observeSelectOptions();
    observeStatusMessages();
    restoreDrafts();
    updateTokenState();
    updateDescriptionCount();
    updateChapterMetrics();

    let savedMode = 'book';
    try { savedMode = sessionStorage.getItem('webdocsach:admin:mode') || 'book'; } catch (_) {}
    setMode(savedMode, { silent: true });
    fetchCatalog();
  }

  init();
})();
