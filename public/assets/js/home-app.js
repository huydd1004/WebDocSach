(() => {
  const page = document.body;

  if (!page.classList.contains('home-v2')) {
    return;
  }

  const root = document.documentElement;
  const searchDialog = document.getElementById('searchDialog');
  const smartSearchInput = document.getElementById('smartSearchInput');
  const smartSearchResults = document.getElementById('smartSearchResults');
  const smartSearchCount = document.getElementById('smartSearchCount');
  const headerSearch = document.getElementById('bookSearch');
  const filterDialog = document.getElementById('filterDialog');
  const progressDialog = document.getElementById('readingDashboardDialog');
  const toastRegion = document.getElementById('homeToastRegion');
  const installButton = document.getElementById('installAppButton');

  let featuredBooks = [];
  let featuredIndex = 0;
  let featuredTimer = null;
  let deferredInstallPrompt = null;
  let booksInitialized = false;
  let themeObserverReady = false;

  function getBooks() {
    return Array.isArray(booksData) ? booksData : [];
  }

  function getBookById(bookId) {
    return getBooks().find(book => book.id === bookId) || null;
  }

  function openDialog(dialog) {
    if (!dialog || dialog.open) {
      return;
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }

    page.classList.add('home-dialog-open');
  }

  function closeDialog(dialog) {
    if (!dialog?.open) {
      return;
    }

    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }

    if (!document.querySelector('dialog[open]')) {
      page.classList.remove('home-dialog-open');
    }
  }

  function setupDialog(dialog, closeButton) {
    closeButton?.addEventListener('click', () => closeDialog(dialog));

    dialog?.addEventListener('click', event => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });

    dialog?.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) {
        page.classList.remove('home-dialog-open');
      }
    });
  }

  function showToast(message, type = 'info', duration = 3200) {
    if (!toastRegion || !message) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = `home-toast is-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'home-toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'success'
      ? '✓'
      : type === 'error'
        ? '!'
        : 'i';

    const text = document.createElement('span');
    text.className = 'home-toast-text';
    text.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'home-toast-close';
    closeButton.setAttribute('aria-label', 'Đóng thông báo');
    closeButton.textContent = '×';

    const removeToast = () => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 220);
    };

    closeButton.addEventListener('click', removeToast);
    toast.append(icon, text, closeButton);
    toastRegion.appendChild(toast);

    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(removeToast, duration);
  }

  window.WebDocSachHome = Object.freeze({ showToast });

  function createSearchResult(book) {
    const saved = getProgress(book.id);
    const chapter = Math.max(Number(saved?.chapter) || 1, 1);
    const result = document.createElement('a');
    result.className = 'smart-search-result';
    result.href = `book.html?id=${encodeURIComponent(book.id)}`;

    const cover = document.createElement('img');
    cover.src = book.cover || 'assets/images/Logo.png';
    cover.alt = '';
    cover.loading = 'lazy';
    cover.decoding = 'async';
    cover.addEventListener('error', () => {
      cover.src = 'assets/images/Logo.png';
    }, { once: true });

    const copy = document.createElement('span');
    copy.className = 'smart-search-result-copy';

    const title = document.createElement('strong');
    title.textContent = book.title || book.id;

    const meta = document.createElement('small');
    const genres = getBookGenres(book).slice(0, 2).join(' • ');
    meta.textContent = [book.author || 'Chưa rõ tác giả', genres]
      .filter(Boolean)
      .join(' · ');

    const action = document.createElement('span');
    action.className = 'smart-search-result-action';
    action.textContent = saved?.chapter ? `Đọc tiếp C.${chapter}` : 'Xem truyện';

    copy.append(title, meta);
    result.append(cover, copy, action);
    return result;
  }

  function renderSmartSearch(query = '') {
    if (!smartSearchResults || !smartSearchCount) {
      return;
    }

    const normalizedQuery = normalizeSearchText(query);
    const source = getBooks();
    const matches = source.filter(book => {
      if (!normalizedQuery) {
        return true;
      }

      const searchable = normalizeSearchText([
        book.title,
        book.author,
        ...getBookGenres(book)
      ].filter(Boolean).join(' '));

      return searchable.includes(normalizedQuery);
    }).slice(0, 10);

    smartSearchResults.replaceChildren();

    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'smart-search-empty';
      empty.textContent = 'Không tìm thấy truyện phù hợp với từ khóa này.';
      smartSearchResults.appendChild(empty);
      smartSearchCount.textContent = 'Không có kết quả';
      return;
    }

    matches.forEach(book => {
      smartSearchResults.appendChild(createSearchResult(book));
    });

    smartSearchCount.textContent = normalizedQuery
      ? `${matches.length} kết quả phù hợp`
      : `${Math.min(source.length, 10)} gợi ý trong thư viện`;
  }

  function openSearchDialog(query = '') {
    if (!searchDialog) {
      return;
    }

    const nextQuery = String(query || headerSearch?.value || '');
    smartSearchInput.value = nextQuery;
    renderSmartSearch(nextQuery);
    openDialog(searchDialog);

    window.requestAnimationFrame(() => {
      smartSearchInput?.focus({ preventScroll: true });
      smartSearchInput?.select();
    });
  }

  function setupSmartSearch() {
    headerSearch?.addEventListener('click', () => {
      openSearchDialog(headerSearch.value);
    });

    document.getElementById('mobileSearchButton')?.addEventListener('click', () => {
      openSearchDialog('');
    });

    document.getElementById('closeSearchDialog')?.addEventListener('click', () => {
      closeDialog(searchDialog);
    });

    smartSearchInput?.addEventListener('input', event => {
      const query = event.target.value;
      if (headerSearch) {
        headerSearch.value = query;
        headerSearch.dispatchEvent(new Event('input', { bubbles: true }));
      }
      renderSmartSearch(query);
    });

    smartSearchInput?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') {
        return;
      }

      const firstResult = smartSearchResults?.querySelector('.smart-search-result');
      if (firstResult) {
        event.preventDefault();
        firstResult.click();
      }
    });

    document.addEventListener('keydown', event => {
      const tag = event.target?.tagName;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      if (
        event.key === '/' &&
        !isTyping &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        openSearchDialog('');
      }
    });
  }

  function setFeaturedBook(index, announce = false) {
    if (!featuredBooks.length) {
      return;
    }

    featuredIndex = (index + featuredBooks.length) % featuredBooks.length;
    const book = featuredBooks[featuredIndex];
    const hero = document.getElementById('featuredBook');

    hero?.classList.add('is-changing');
    window.setTimeout(() => {
      renderFeaturedBook(book);
      hero?.classList.remove('is-changing');

      document.querySelectorAll('[data-featured-dot]').forEach((dot, dotIndex) => {
        const isActive = dotIndex === featuredIndex;
        dot.classList.toggle('is-active', isActive);
        dot.setAttribute('aria-current', isActive ? 'true' : 'false');
      });
    }, 160);

    if (announce) {
      showToast(`Đang giới thiệu: ${book.title}`, 'info', 2200);
    }
  }

  function resetFeaturedTimer() {
    window.clearInterval(featuredTimer);

    if (featuredBooks.length < 2 || document.hidden) {
      return;
    }

    featuredTimer = window.setInterval(() => {
      setFeaturedBook(featuredIndex + 1);
    }, 8500);
  }

  function setupFeaturedCarousel() {
    const hero = document.getElementById('featuredBook');
    if (!hero) {
      return;
    }

    const flagged = getBooks().filter(book => book.featured === true);
    const primaryBook = flagged[0] || getBooks()[0];
    const candidates = flagged.length > 1 ? flagged : getBooks();
    featuredBooks = [
      primaryBook,
      ...candidates.filter(book => book.id !== primaryBook?.id)
    ].filter(Boolean).slice(0, 5);

    hero.querySelector('.featured-carousel-controls')?.remove();

    if (featuredBooks[0]) {
      featuredIndex = 0;
      renderFeaturedBook(featuredBooks[0]);
    }

    if (featuredBooks.length < 2) {
      return;
    }

    const controls = document.createElement('div');
    controls.className = 'featured-carousel-controls';

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'featured-carousel-arrow';
    previous.setAttribute('aria-label', 'Truyện nổi bật trước');
    previous.textContent = '←';

    const dots = document.createElement('div');
    dots.className = 'featured-carousel-dots';

    featuredBooks.forEach((book, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.dataset.featuredDot = String(index);
      dot.setAttribute('aria-label', `Xem ${book.title}`);
      dot.classList.toggle('is-active', index === 0);
      dot.addEventListener('click', () => {
        setFeaturedBook(index, true);
        resetFeaturedTimer();
      });
      dots.appendChild(dot);
    });

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'featured-carousel-arrow';
    next.setAttribute('aria-label', 'Truyện nổi bật tiếp theo');
    next.textContent = '→';

    previous.addEventListener('click', () => {
      setFeaturedBook(featuredIndex - 1);
      resetFeaturedTimer();
    });

    next.addEventListener('click', () => {
      setFeaturedBook(featuredIndex + 1);
      resetFeaturedTimer();
    });

    controls.append(previous, dots, next);
    hero.appendChild(controls);

    hero.addEventListener('pointerenter', () => window.clearInterval(featuredTimer));
    hero.addEventListener('pointerleave', resetFeaturedTimer);
    hero.addEventListener('focusin', () => window.clearInterval(featuredTimer));
    hero.addEventListener('focusout', resetFeaturedTimer);
    document.addEventListener('visibilitychange', resetFeaturedTimer);
    resetFeaturedTimer();
  }

  function createRecentUpdateCard(book) {
    const card = document.createElement('a');
    card.className = 'recent-update-card';
    card.href = `book.html?id=${encodeURIComponent(book.id)}`;

    const cover = document.createElement('img');
    cover.src = book.cover || 'assets/images/Logo.png';
    cover.alt = '';
    cover.loading = 'lazy';
    cover.decoding = 'async';
    cover.addEventListener('error', () => {
      cover.src = 'assets/images/Logo.png';
    }, { once: true });

    const copy = document.createElement('span');
    const label = document.createElement('small');
    label.textContent = book.date || book.status || 'Mới cập nhật';
    const title = document.createElement('strong');
    title.textContent = book.title || book.id;
    const author = document.createElement('span');
    author.textContent = book.author || 'Chưa cập nhật tác giả';

    copy.append(label, title, author);
    card.append(cover, copy);
    return card;
  }

  function renderRecentUpdates() {
    const section = document.getElementById('recentUpdatesSection');
    const container = document.getElementById('recentUpdatesList');
    if (!section || !container) {
      return;
    }

    const updates = getBooks()
      .map((book, index) => ({ book, index }))
      .sort((first, second) => {
        const dateDifference = getBookDateValue(second.book) - getBookDateValue(first.book);
        return dateDifference || second.index - first.index;
      })
      .slice(0, 6)
      .map(item => item.book);

    container.replaceChildren();
    updates.forEach(book => container.appendChild(createRecentUpdateCard(book)));
    section.hidden = updates.length === 0;
  }

  function renderReadingDashboard() {
    const banner = document.getElementById('readingDashboardBanner');
    const summary = document.getElementById('readingDashboardSummary');
    const stats = document.getElementById('readingDashboardStats');
    const list = document.getElementById('readingDashboardList');
    const entries = getHomeProgressEntries();

    if (!banner || !stats || !list) {
      return;
    }

    banner.hidden = entries.length === 0;
    list.replaceChildren();
    stats.replaceChildren();

    if (!entries.length) {
      return;
    }

    const latest = entries[0];
    summary.textContent = `Gần nhất: ${latest.book.title} — Chương ${latest.progress.chapter}`;

    [
      ['Đang đọc', entries.length],
      ['Yêu thích', getFavoriteBookIds().length],
      ['Chương gần nhất', Number(latest.progress.chapter) || 1]
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      const number = document.createElement('strong');
      const text = document.createElement('span');
      number.textContent = new Intl.NumberFormat('vi-VN').format(value);
      text.textContent = label;
      item.append(number, text);
      stats.appendChild(item);
    });

    entries.forEach(({ book, progress }) => {
      const chapter = Math.max(Number(progress.chapter) || 1, 1);
      const percent = Number.isFinite(Number(progress.scrollRatio))
        ? Math.round(Math.min(Math.max(Number(progress.scrollRatio), 0), 1) * 100)
        : 0;
      const row = document.createElement('a');
      row.className = 'reading-dashboard-row';
      row.href = `reader.html?book=${encodeURIComponent(book.id)}&chap=${chapter}`;

      const cover = document.createElement('img');
      cover.src = book.cover || 'assets/images/Logo.png';
      cover.alt = '';
      cover.loading = 'lazy';
      cover.addEventListener('error', () => {
        cover.src = 'assets/images/Logo.png';
      }, { once: true });

      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = book.title;
      const meta = document.createElement('small');
      meta.textContent = `Chương ${chapter} • ${percent}% chương hiện tại`;

      const track = document.createElement('span');
      track.className = 'reading-dashboard-track';
      const value = document.createElement('span');
      value.style.width = `${percent}%`;
      track.appendChild(value);

      copy.append(title, meta, track);
      row.append(cover, copy);
      list.appendChild(row);
    });
  }

  function openReadingDashboard() {
    renderReadingDashboard();

    if (!getHomeProgressEntries().length) {
      showToast('Bạn chưa bắt đầu đọc truyện nào.', 'info');
      return;
    }

    openDialog(progressDialog);
  }

  function setupReadingDashboard() {
    document.getElementById('openReadingDashboard')?.addEventListener('click', openReadingDashboard);
    document.getElementById('mobileProgressButton')?.addEventListener('click', openReadingDashboard);
    document.getElementById('closeReadingDashboard')?.addEventListener('click', () => closeDialog(progressDialog));
  }

  function syncMobileGenreButtons() {
    document.querySelectorAll('[data-mobile-genre]').forEach(button => {
      const source = Array.from(document.querySelectorAll('#genreFilters input[type="checkbox"]'))
        .find(input => input.value === button.dataset.mobileGenre);
      const isActive = Boolean(source?.checked);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function buildMobileFilters() {
    const container = document.getElementById('mobileGenreFilters');
    if (!container) {
      return;
    }

    const genres = [...new Set(getBooks().flatMap(book => getBookGenres(book)))]
      .sort((first, second) => first.localeCompare(second, 'vi', { sensitivity: 'base' }));

    container.replaceChildren();
    genres.forEach(genre => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mobileGenre = genre;
      button.setAttribute('aria-pressed', 'false');
      button.textContent = genre;
      button.addEventListener('click', () => {
        const source = Array.from(document.querySelectorAll('#genreFilters input[type="checkbox"]'))
          .find(input => input.value === genre);
        if (source) {
          source.checked = !source.checked;
          source.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncMobileGenreButtons();
      });
      container.appendChild(button);
    });

    syncMobileGenreButtons();
  }

  function setupMobileFilters() {
    const mobileSort = document.getElementById('mobileBookSort');
    const desktopSort = document.getElementById('bookSort');

    document.getElementById('openFilterDialog')?.addEventListener('click', () => {
      buildMobileFilters();
      if (mobileSort && desktopSort) {
        mobileSort.value = desktopSort.value;
      }
      openDialog(filterDialog);
    });

    document.getElementById('closeFilterDialog')?.addEventListener('click', () => closeDialog(filterDialog));

    mobileSort?.addEventListener('change', () => {
      if (desktopSort) {
        desktopSort.value = mobileSort.value;
        desktopSort.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    document.getElementById('clearMobileFilters')?.addEventListener('click', () => {
      clearBookFilters();
      syncMobileGenreButtons();
      showToast('Đã xóa bộ lọc.', 'info', 2200);
    });

    document.getElementById('applyMobileFilters')?.addEventListener('click', () => {
      closeDialog(filterDialog);
      document.getElementById('library')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function setupInfiniteLoading() {
    const button = document.getElementById('loadMoreBooks');
    if (!button || !('IntersectionObserver' in window)) {
      return;
    }

    const observer = new IntersectionObserver(entries => {
      const entry = entries[0];
      if (entry?.isIntersecting && !button.hidden) {
        button.click();
      }
    }, { rootMargin: '500px 0px' });

    observer.observe(button);
  }

  function updateThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      return;
    }

    meta.content = root.dataset.theme === 'dark' ? '#080e19' : '#f5f2eb';
  }

  function setupThemeAndStatusToasts() {
    const observer = new MutationObserver(() => {
      updateThemeColor();

      if (themeObserverReady) {
        showToast(
          root.dataset.theme === 'dark' ? 'Đã bật giao diện tối.' : 'Đã bật giao diện sáng.',
          'info',
          2100
        );
      }

      themeObserverReady = true;
    });

    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    updateThemeColor();
    window.setTimeout(() => {
      themeObserverReady = true;
    }, 400);

    const backupStatus = document.getElementById('backupStatus');
    if (backupStatus) {
      new MutationObserver(() => {
        const message = backupStatus.textContent.trim();
        if (!message) {
          return;
        }
        showToast(message, backupStatus.classList.contains('is-error') ? 'error' : 'success');
      }).observe(backupStatus, { childList: true, characterData: true, subtree: true });
    }
  }

  function setupAppInstallation() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (installButton) {
        installButton.hidden = false;
      }
    });

    installButton?.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        showToast('Trình duyệt chưa hỗ trợ cài đặt ở thời điểm này.', 'info');
        return;
      }

      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installButton.hidden = true;

      showToast(
        choice.outcome === 'accepted' ? 'Đang cài Thư Viện Truyện.' : 'Đã hủy cài đặt.',
        choice.outcome === 'accepted' ? 'success' : 'info'
      );
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (installButton) {
        installButton.hidden = true;
      }
      showToast('Đã cài Thư Viện Truyện thành công.', 'success');
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(() => {
          // Website vẫn hoạt động bình thường nếu không thể đăng ký PWA.
        });
      }, { once: true });
    }
  }

  function setupMobileNavigation() {
    const homeSection = document.getElementById('featuredBook');
    const librarySection = document.getElementById('library');
    const items = document.querySelectorAll('[data-mobile-nav]');

    if (!('IntersectionObserver' in window) || !homeSection || !librarySection) {
      return;
    }

    const setActive = name => {
      items.forEach(item => item.classList.toggle('is-active', item.dataset.mobileNav === name));
    };

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          return;
        }
        setActive(entry.target === librarySection ? 'library' : 'home');
      });
    }, { threshold: 0.18 });

    observer.observe(homeSection);
    observer.observe(librarySection);
  }

  function initializeBooksExperience() {
    if (!getBooks().length) {
      return;
    }

    booksInitialized = true;
    setupFeaturedCarousel();
    renderRecentUpdates();
    renderReadingDashboard();
    buildMobileFilters();
    renderSmartSearch(smartSearchInput?.value || '');
  }

  setupDialog(searchDialog, document.getElementById('closeSearchDialog'));
  setupDialog(filterDialog, document.getElementById('closeFilterDialog'));
  setupDialog(progressDialog, document.getElementById('closeReadingDashboard'));
  setupSmartSearch();
  setupReadingDashboard();
  setupMobileFilters();
  setupInfiniteLoading();
  setupThemeAndStatusToasts();
  setupAppInstallation();
  setupMobileNavigation();

  document.addEventListener('webdocsach:books-ready', initializeBooksExperience);

  document.addEventListener('webdocsach:favorite-changed', event => {
    const book = getBookById(event.detail?.bookId);
    showToast(
      event.detail?.isFavorite
        ? `Đã thêm “${book?.title || 'truyện'}” vào yêu thích.`
        : `Đã bỏ “${book?.title || 'truyện'}” khỏi yêu thích.`,
      event.detail?.isFavorite ? 'success' : 'info'
    );
    renderReadingDashboard();
  });

  document.addEventListener('webdocsach:books-expanded', event => {
    showToast(`Đang hiển thị ${event.detail?.visible || 0} truyện.`, 'info', 1900);
  });

  document.addEventListener('webdocsach:books-error', () => {
    showToast('Không thể tải thư viện. Hãy kiểm tra kết nối rồi thử lại.', 'error', 5000);
  });

  window.addEventListener('pageshow', () => {
    if (booksInitialized) {
      renderReadingDashboard();
      buildMobileFilters();
    }
  });

  if (getBooks().length) {
    initializeBooksExperience();
  }
})();
