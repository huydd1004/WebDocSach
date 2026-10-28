(() => {
  const page = document.body;
  if (!page.classList.contains('home-v2')) return;

  const quickDialog = document.getElementById('quickBookDialog');
  let chapterCountsHydrated = false;

  function getBooks() {
    return Array.isArray(window.booksData) ? window.booksData : booksData;
  }

  function getBook(bookId) {
    return getBooks().find(book => book.id === bookId) || null;
  }

  function getChapterCount(book) {
    return typeof getBookChapterCount === 'function' ? getBookChapterCount(book) : 0;
  }

  function bookIsComplete(book) {
    return typeof isCompletedBook === 'function'
      ? isCompletedBook(book)
      : /hoàn|completed|full/i.test(book?.status || '');
  }

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    page.classList.add('home-dialog-open');
  }

  function closeDialog(dialog) {
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    page.classList.remove('home-dialog-open');
  }

  function createShelfBook(book) {
    const link = document.createElement('button');
    const cover = document.createElement('img');
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    const meta = document.createElement('small');

    link.type = 'button';
    link.className = 'smart-shelf-book';
    link.dataset.bookId = book.id;
    link.setAttribute('aria-label', `Xem nhanh ${book.title}`);
    cover.src = book.cover || 'assets/images/Logo.png';
    cover.alt = '';
    cover.loading = 'lazy';
    cover.addEventListener('error', () => {
      cover.src = 'assets/images/Logo.png';
    }, { once: true });
    title.textContent = book.title || book.id;
    meta.textContent = book.author || book.status || 'Đang cập nhật';
    copy.append(title, meta);
    link.append(cover, copy);
    link.addEventListener('click', () => openQuickBook(book));
    return link;
  }

  function preferredGenres() {
    const favoriteIds = new Set(getFavoriteBookIds());
    const progress = loadProgressMap();
    const scores = new Map();

    getBooks().forEach(book => {
      const weight = (favoriteIds.has(book.id) ? 3 : 0) + (progress[book.id] ? 2 : 0);
      if (!weight) return;
      getBookGenres(book).forEach(genre => {
        scores.set(genre, (scores.get(genre) || 0) + weight);
      });
    });

    return new Set(
      Array.from(scores.entries())
        .sort((first, second) => second[1] - first[1])
        .slice(0, 4)
        .map(item => item[0])
    );
  }

  function renderShelf(containerId, books) {
    const container = document.getElementById(containerId);
    if (!container) return 0;
    container.replaceChildren();
    books.slice(0, 4).forEach(book => container.appendChild(createShelfBook(book)));

    if (!container.children.length) {
      const empty = document.createElement('p');
      empty.className = 'smart-shelf-empty';
      empty.textContent = 'Kệ này sẽ xuất hiện khi thư viện có dữ liệu phù hợp.';
      container.appendChild(empty);
      return 0;
    }
    return container.children.length;
  }

  function renderSmartShelves() {
    const books = getBooks();
    const section = document.getElementById('smartShelvesSection');
    if (!section || !books.length) return;

    const genres = preferredGenres();
    const progress = loadProgressMap();
    const favorites = new Set(getFavoriteBookIds());
    const unread = books.filter(book => !progress[book.id]);
    const recommended = [...unread]
      .sort((first, second) => {
        const score = book => getBookGenres(book).reduce(
          (total, genre) => total + (genres.has(genre) ? 4 : 0),
          book.featured ? 2 : 0
        );
        return score(second) - score(first);
      });

    const trending = [...books].sort((first, second) => {
      const score = book =>
        (favorites.has(book.id) ? 6 : 0) +
        (progress[book.id] ? 4 : 0) +
        (book.featured ? 3 : 0) +
        Number(book.popularity || book.views || 0) / 1000;
      return score(second) - score(first);
    });

    const completed = books.filter(bookIsComplete);
    renderShelf('recommendationShelf', recommended.length ? recommended : books);
    renderShelf('trendingShelf', trending);
    renderShelf('completedShelf', completed);
    section.hidden = false;
  }

  async function hydrateChapterCounts() {
    if (chapterCountsHydrated) return;
    chapterCountsHydrated = true;

    let savedCounts = {};
    try {
      savedCounts = JSON.parse(localStorage.getItem('webdocsachChapterCounts') || '{}');
    } catch {
      savedCounts = {};
    }

    const books = getBooks();
    books.forEach(book => {
      if (!getChapterCount(book) && Number(savedCounts[book.id]) > 0) {
        book.chapterCount = Number(savedCounts[book.id]);
      }
    });

    const missing = books.filter(book => !getChapterCount(book));
    for (let index = 0; index < missing.length; index += 4) {
      const batch = missing.slice(index, index + 4);
      await Promise.all(batch.map(async book => {
        try {
          const response = await fetch(createBookDataUrl(book.id, 'chapters.json'));
          if (!response.ok) return;
          const chapters = await response.json();
          if (Array.isArray(chapters) && chapters.length > 0) {
            book.chapterCount = chapters.length;
            savedCounts[book.id] = chapters.length;
          }
        } catch {
          // Giữ bộ lọc hoạt động với dữ liệu đã biết nếu một truyện chưa có mục lục.
        }
      }));
    }

    localStorage.setItem('webdocsachChapterCounts', JSON.stringify(savedCounts));
    renderSmartShelves();
    applyBookFilters();
  }

  function openQuickBook(book) {
    if (!book || !quickDialog) return;
    const saved = getProgress(book.id);
    const chapter = Math.max(Number(saved?.chapter) || 1, 1);
    const chapterCount = getChapterCount(book);
    const cover = document.getElementById('quickBookCover');

    cover.src = book.cover || 'assets/images/Logo.png';
    cover.alt = `Bìa truyện ${book.title}`;
    cover.addEventListener('error', () => {
      cover.src = 'assets/images/Logo.png';
    }, { once: true });
    document.getElementById('quickBookTitle').textContent = book.title || book.id;
    document.getElementById('quickBookStatus').textContent = [
      book.status || 'Đang cập nhật',
      chapterCount ? `${chapterCount} chương` : ''
    ].filter(Boolean).join(' • ');
    document.getElementById('quickBookAuthor').textContent = `Tác giả: ${book.author || 'Chưa cập nhật'}`;
    document.getElementById('quickBookDescription').textContent =
      book.description || 'Nội dung giới thiệu đang được cập nhật.';

    const genres = document.getElementById('quickBookGenres');
    genres.replaceChildren();
    getBookGenres(book).slice(0, 6).forEach(genre => {
      const chip = document.createElement('span');
      chip.textContent = genre;
      genres.appendChild(chip);
    });

    const read = document.getElementById('quickBookRead');
    read.href = `reader.html?book=${encodeURIComponent(book.id)}&chap=${chapter}`;
    read.textContent = saved?.chapter ? `Đọc tiếp chương ${chapter}` : 'Đọc ngay';
    document.getElementById('quickBookDetail').href = `book.html?id=${encodeURIComponent(book.id)}`;
    openDialog(quickDialog);
  }

  function enhanceLibraryCards() {
    document.querySelectorAll('.book[data-book-id]').forEach(card => {
      if (card.dataset.quickViewReady === '1') return;
      const book = getBook(card.dataset.bookId);
      const coverArea = card.querySelector('.book-cover-area');
      if (!book || !coverArea) return;

      card.dataset.quickViewReady = '1';
      const hover = document.createElement('div');
      const hoverText = document.createElement('p');
      const hoverMeta = document.createElement('small');
      const button = document.createElement('button');

      hover.className = 'book-hover-summary';
      hoverText.textContent = book.description || 'Mở xem nhanh để biết thêm về câu chuyện này.';
      hoverMeta.textContent = [
        book.author,
        getChapterCount(book) ? `${getChapterCount(book)} chương` : ''
      ].filter(Boolean).join(' • ');
      button.type = 'button';
      button.className = 'book-quick-view-button';
      button.textContent = 'Xem nhanh';
      button.addEventListener('click', event => {
        event.stopPropagation();
        openQuickBook(book);
      });
      hover.append(hoverText, hoverMeta, button);
      coverArea.appendChild(hover);
    });
  }

  function openRandomBook() {
    const source = getBooks();
    if (!source.length) return;
    const previousId = sessionStorage.getItem('webdocsachRandomBook');
    const candidates = source.length > 1 ? source.filter(book => book.id !== previousId) : source;
    const book = candidates[Math.floor(Math.random() * candidates.length)];
    sessionStorage.setItem('webdocsachRandomBook', book.id);
    openQuickBook(book);
  }

  function setupQuickView() {
    document.getElementById('closeQuickBookDialog')?.addEventListener('click', () => closeDialog(quickDialog));
    quickDialog?.addEventListener('click', event => {
      if (event.target === quickDialog) closeDialog(quickDialog);
    });
    document.getElementById('randomBookButton')?.addEventListener('click', openRandomBook);
    document.getElementById('libraryRandomButton')?.addEventListener('click', openRandomBook);
  }

  function setupCloudSync() {
    const sync = window.WebDocSachSync;
    const input = document.getElementById('syncSecretInput');
    const state = document.getElementById('cloudSyncState');
    const lastTime = document.getElementById('cloudSyncLastTime');
    const status = document.getElementById('backupStatus');
    if (!sync || !input) return;

    const showStatus = (message, error = false) => {
      if (status) {
        status.textContent = message;
        status.className = `backup-status ${error ? 'is-error' : 'is-success'}`;
      }
      window.WebDocSachHome?.showToast(message, error ? 'error' : 'success');
    };

    const refreshState = () => {
      const code = sync.getCode();
      input.value = code;
      state.textContent = code ? 'Đã lưu mã' : 'Chưa kết nối';
      state.classList.toggle('is-connected', Boolean(code));
      const savedTime = sync.getLastSync();
      lastTime.textContent = savedTime
        ? `Lần đồng bộ gần nhất: ${new Date(savedTime).toLocaleString('vi-VN')}`
        : 'Chưa có lần đồng bộ nào.';
    };

    const run = async (button, task, successMessage, reload = false) => {
      button.disabled = true;
      button.classList.add('is-loading');
      try {
        const code = sync.saveCode(input.value);
        await task(code);
        refreshState();
        showStatus(successMessage);
        if (reload) window.setTimeout(() => window.location.reload(), 800);
      } catch (error) {
        showStatus(error.message || 'Không thể đồng bộ dữ liệu.', true);
      } finally {
        button.disabled = false;
        button.classList.remove('is-loading');
      }
    };

    document.getElementById('generateSyncCode')?.addEventListener('click', () => {
      input.value = sync.generateCode();
      input.type = 'text';
      input.select();
      showStatus('Đã tạo mã mới. Hãy lưu mã này ở nơi an toàn.');
    });

    document.getElementById('saveSyncCode')?.addEventListener('click', () => {
      try {
        sync.saveCode(input.value);
        refreshState();
        showStatus('Đã lưu mã đồng bộ trên thiết bị này.');
      } catch (error) {
        showStatus(error.message, true);
      }
    });

    const pullButton = document.getElementById('pullCloudData');
    pullButton?.addEventListener('click', () => run(
      pullButton,
      code => sync.pull(code),
      'Đã tải và hợp nhất dữ liệu từ cloud.',
      true
    ));

    const pushButton = document.getElementById('pushCloudData');
    pushButton?.addEventListener('click', () => run(
      pushButton,
      code => sync.push(code),
      'Đã đồng bộ dữ liệu mới nhất lên cloud.'
    ));

    refreshState();
  }

  function initialize() {
    renderSmartShelves();
    enhanceLibraryCards();
    hydrateChapterCounts();
  }

  setupQuickView();
  setupCloudSync();
  document.addEventListener('webdocsach:books-ready', initialize);
  document.addEventListener('webdocsach:library-updated', enhanceLibraryCards);
  document.addEventListener('webdocsach:favorite-changed', renderSmartShelves);
  window.addEventListener('pageshow', () => {
    if (getBooks().length) initialize();
  });

  if (getBooks().length) initialize();
})();
