const PROGRESS_KEY = 'readingProgress';
const REMEMBER_PROGRESS_KEY = 'rememberReadingPosition';
const FAVORITE_BOOKS_KEY = 'favoriteBooks';
const CHAPTERS_PER_PART = 200;

const {createDataUrl, createBookDataUrl} = window.WebDocSachData;

const THEMES = [
  { name: 'dark', color: '#0a0f1b' },
  { name: 'light', color: '#eef1f5' },
  { name: 'sepia', color: '#e9dfcb' }
];

let booksData = [];
let activeLibraryView = 'all';
let currentBook = '';
let currentChapter = 1;
let chapterIndex = [];

let loadedChapter = 0;
let readingPositionTimer = null;
let chapterNavigationLocked = false;

async function fetchBooksData() {
  const response = await fetch(createDataUrl('books.json'));

  if (!response.ok) {
    throw new Error('Không thể tải danh sách truyện');
  }

  return response.json();
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
  const previousProgress = map[bookId] || {};

  map[bookId] = {
    ...previousProgress,
    chapter: Number(chapter),
    updated: Date.now()
  };

  saveProgressMap(map);
}

function getMaximumScroll() {
  return Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    0
  );
}

function saveCurrentReadingPosition() {
  if (
    !currentBook ||
    loadedChapter <= 0 ||
    !shouldRememberProgress()
  ) {
    return;
  }

  const map = loadProgressMap();
  const previousProgress = map[currentBook] || {};
  const maximumScroll = getMaximumScroll();
  const scrollY = Math.max(Math.round(window.scrollY), 0);

  map[currentBook] = {
    ...previousProgress,

    // Giữ chương mà người dùng vừa chọn khi trang đang chuyển chương.
    chapter:
      Number(previousProgress.chapter) || loadedChapter,

    positionChapter: loadedChapter,
    scrollY,

    scrollRatio:
      maximumScroll > 0
        ? Math.min(scrollY / maximumScroll, 1)
        : 0,

    updated: Date.now()
  };

  saveProgressMap(map);
}

function restoreReadingPosition(bookId, chapter) {
  const progress = getProgress(bookId);

  const restore = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        let targetPosition = 0;

        if (
          progress &&
          Number(progress.positionChapter) === Number(chapter)
        ) {
          const maximumScroll = getMaximumScroll();
          const savedRatio = Number(progress.scrollRatio);
          const savedScrollY = Number(progress.scrollY);

          if (
            Number.isFinite(savedRatio) &&
            savedRatio >= 0 &&
            maximumScroll > 0
          ) {
            targetPosition = savedRatio * maximumScroll;
          } else if (Number.isFinite(savedScrollY)) {
            targetPosition = savedScrollY;
          }
        }

        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;

        root.style.scrollBehavior = 'auto';

        window.scrollTo({
          top: Math.min(
            Math.max(targetPosition, 0),
            getMaximumScroll()
          ),
          behavior: 'auto'
        });

        window.requestAnimationFrame(() => {
          root.style.scrollBehavior = previousScrollBehavior;
        });
      });
    });
  };

  if (document.readyState === 'complete') {
    restore();
  } else {
    window.addEventListener('load', restore, { once: true });
  }
}

function scheduleReadingPositionSave() {
  if (!loadedChapter || !shouldRememberProgress()) {
    return;
  }

  window.clearTimeout(readingPositionTimer);

  readingPositionTimer = window.setTimeout(() => {
    saveCurrentReadingPosition();
  }, 250);
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

function getBookGenres(book) {
  if (Array.isArray(book.genre)) {
    return book.genre
      .map(genre => String(genre).trim())
      .filter(Boolean);
  }

  if (typeof book.genre === 'string' && book.genre.trim()) {
    return [book.genre.trim()];
  }

  return [];
}

function getFavoriteBookIds() {
  try {
    const favourites = JSON.parse(localStorage.getItem(FAVORITE_BOOKS_KEY) || '[]');

    return Array.isArray(favourites) ? favourites : [];
  } catch (error) {
    return [];
  }
}

function renderFeaturedBook(book) {
  const section = document.getElementById('featuredBook');

  if (!section) return;

  if (!book) {
    section.hidden = true;
    return;
  }

  const title = document.getElementById('featuredTitle');
  const author = document.getElementById('featuredAuthor');
  const description = document.getElementById('featuredDescription');
  const genres = document.getElementById('featuredGenres');
  const cover = document.getElementById('featuredCover');
  const readButton = document.getElementById('featuredReadButton');
  const detailButton = document.getElementById('featuredDetailButton');

  title.textContent = book.title;
  author.textContent = book.author || 'Chưa cập nhật';
  description.textContent = book.description || 'Nội dung truyện đang được cập nhật.';
  cover.src = book.cover;
  cover.alt = `Bìa truyện ${book.title}`;

  section.style.setProperty(
    '--featured-cover-image',
    `url("${encodeURI(book.cover)}")`
  );

  genres.replaceChildren();

  getBookGenres(book).slice(0, 4).forEach(genre => {
    const genreItem = document.createElement('span');

    genreItem.className = 'featured-genre';
    genreItem.textContent = genre;

    genres.appendChild(genreItem);
  });

  const savedProgress = getProgress(book.id);
  const chapter = Number(savedProgress?.chapter) || 1;

  readButton.href = `reader.html?book=${encodeURIComponent(book.id)}&chap=${chapter}`;

  readButton.textContent = savedProgress?.chapter ? `Đọc tiếp chương ${chapter}` : 'Đọc ngay';

  detailButton.href = `book.html?id=${encodeURIComponent(book.id)}`;

  section.hidden = false;
}

function updateBookResultStatus(list) {
  const resultCount = document.getElementById('bookResultCount');
  const emptyState = document.getElementById('emptyBookState');
  const clearButton = document.getElementById('clearBookFilters');
  const bookList = document.getElementById('book-list');
  const hasSearch = Boolean(
    document.getElementById('bookSearch')?.value.trim()
  );
  const hasSelectedGenre = Boolean(
    document.querySelector(
      '#genreFilters input[type="checkbox"]:checked'
    )
  );
  const hasSelectedLibraryView =
    activeLibraryView !== 'all';

  if (resultCount) {
    resultCount.textContent = `Hiển thị ${list.length} trong ${booksData.length} truyện`;
  }

  if (emptyState) {
    emptyState.hidden = list.length !== 0;

    if (hasSearch || hasSelectedGenre) {
      emptyState.textContent =
        'Không tìm thấy truyện phù hợp. Hãy thử tên hoặc thể loại khác.';
    } else if (activeLibraryView === 'reading') {
      emptyState.textContent =
        'Bạn chưa đọc truyện nào. Hãy mở một chương để bắt đầu.';
    } else if (activeLibraryView === 'favorite') {
      emptyState.textContent =
        'Bạn chưa thêm truyện nào vào danh sách yêu thích.';
    } else {
      emptyState.textContent =
        'Hiện chưa có truyện trong thư viện.';
    }
  }

  if (bookList) {
    bookList.hidden = list.length === 0;
  }

  if (clearButton) {
    clearButton.hidden =
      !hasSearch &&
      !hasSelectedGenre &&
      !hasSelectedLibraryView;
  }
}

function renderBookList(list) {
  const container = document.getElementById('book-list');
  if (!container) return;

  container.replaceChildren();

  list.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book';
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `Xem truyện ${book.title}`);

    const saved = getProgress(book.id);

    const cover = document.createElement('img');
    cover.src = book.cover;
    cover.alt = `Bìa truyện ${book.title}`;

    const info = document.createElement('div');
    info.className = 'book-info';

    const title = document.createElement('h3');
    title.textContent = book.title;

    const author = document.createElement('p');
    author.textContent = book.author || 'Chưa cập nhật tác giả';

    const date = document.createElement('p');
    date.textContent = book.date || '';

    info.append(title, author, date);

    if (saved && saved.chapter) {
      const badge = document.createElement('div');
      badge.className = 'continue-badge';
      badge.textContent = `Tiếp tục: Chương ${saved.chapter}`;
      info.appendChild(badge);
    }

    card.append(cover, info);

    const openBookDetail = () => {
      window.location.href = `book.html?id=${encodeURIComponent(book.id)}`;
    };

    card.addEventListener('click', openBookDetail);

    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openBookDetail();
      }
    });

    container.appendChild(card);
  });

  updateBookResultStatus(list);
}

function buildGenreFilters() {
  const container = document.getElementById('genreFilters');
  if (!container) return;

  const genres = [
    ...new Set(
      booksData.flatMap(book => getBookGenres(book))
    )
  ].sort((first, second) => first.localeCompare(second, 'vi', { sensitivity: 'base'}));
  
  container.innerHTML = '';

  genres.forEach((genre, index) => {
    const input = document.createElement('input');
    const label = document.createElement('label');
    const text = document.createElement('span');

    input.type = 'checkbox';
    input.id = `genre-${index}`;
    input.value = genre;

    label.htmlFor = input.id;
    text.textContent = genre;

    label.append(input, text);
    container.appendChild(label);
  });
}

function setLibraryView(view) {
  const allowedViews = ['all', 'reading', 'favorite'];

  activeLibraryView = allowedViews.includes(view) ? view : 'all';

  document.querySelectorAll('#libraryViewTabs [data-library-view]').forEach(button => {
    const isActive = button.dataset.libraryView === activeLibraryView;

    button.classList.toggle('is-active', isActive);

    button.setAttribute('aria-pressed', String(isActive));
  });

  applyBookFilters();
}

function setupLibraryViewTabs() {
  const container = document.getElementById('libraryViewTabs');

  if (!container) {
    return;
  }

  container.addEventListener('click', event => {
    const button = event.target.closest('[data-library-view]');

    if (!button || !container.contains(button)) {
      return;
    }

    setLibraryView(button.dataset.libraryView);
  });
}

function applyBookFilters() {
  const query = normalizeSearchText(document.getElementById('bookSearch')?.value);

  const selectedGenres = Array.from(document.querySelectorAll('#genreFilters input[type="checkbox"]:checked')).map(input => normalizeSearchText(input.value));
  const favoriteBookIds = new Set(
    getFavoriteBookIds()
  );
  const progressMap = shouldRememberProgress()
    ? loadProgressMap()
    : {};

  const filteredBooks = booksData.filter(book => {
    const searchableInformation = normalizeSearchText(`${book.title || ''} ${book.author || ''}`);

    const matchesSearch = !query || searchableInformation.includes(query);

    const bookGenres = getBookGenres(book).map(genre => normalizeSearchText(genre));

    const matchesGenre =
      selectedGenres.length === 0 ||
      selectedGenres.some(
        selectedGenre =>
          bookGenres.includes(selectedGenre)
      );

    const matchesLibraryView =
      activeLibraryView === 'reading'
        ? Boolean(progressMap[book.id]?.chapter)
        : activeLibraryView === 'favorite'
          ? favoriteBookIds.has(book.id)
          : true;

    return (
      matchesSearch &&
      matchesGenre &&
      matchesLibraryView
    );
  });

  renderBookList(filteredBooks);
}

function clearBookFilters() {
  const searchInput = document.getElementById('bookSearch');

  if (searchInput) {
    searchInput.value = '';
  }

  document.querySelectorAll('#genreFilters input[type="checkbox"]').forEach(input => {
    input.checked = false;
  });

  setLibraryView('all');
}

async function loadBooks() {
  if (!document.getElementById('book-list')) return;

  booksData = await fetchBooksData();

  const featuredBook =
  booksData.find(book => book.featured === true) ||
  booksData[0];

  renderFeaturedBook(featuredBook);
  buildGenreFilters();
  setupLibraryViewTabs();
  applyBookFilters();

  document.getElementById('bookSearch')?.addEventListener('input', applyBookFilters);

  document.getElementById('genreFilters')?.addEventListener('change', applyBookFilters);

  document.getElementById('clearBookFilters')?.addEventListener('click', clearBookFilters);
}

function chapterToPart(chap) {
  return Math.floor((chap - 1) / CHAPTERS_PER_PART) + 1;
}

function normalizeChapterIndex(data) {
  if (Array.isArray(data)) {
    return data
      .map(chapter => ({
        number: Number(chapter?.number),
        title: String(chapter?.title || '').trim(),
        path: String(chapter?.path || '').trim(),
        image: String(chapter?.image || '').trim()
      }))
      .filter(chapter => Number.isInteger(chapter.number) && chapter.number > 0)
      .sort((first, second) => first.number - second.number);
  }

  return [];
}

function getChaptersForPart(part) {
  return chapterIndex.filter(chapter => chapterToPart(chapter.number) === part);
}

function getAvailableParts() {
  return [...new Set(chapterIndex.map(chapter => chapterToPart(chapter.number)))];
}

function getCurrentChapterPosition() {
  return chapterIndex.findIndex(chapter => chapter.number === currentChapter);
}

function getCurrentChapterData() {
  return chapterIndex.find(chapter => chapter.number === currentChapter) || null;
}

function getChapterDisplayTitle(chapter) {
  if (!chapter) return `Chương ${currentChapter}`;
  return String(chapter.title || `Chương ${chapter.number}`).trim();
}

function updateReaderChapterUI(title = '') {
  const position = getCurrentChapterPosition();
  const chapter = getCurrentChapterData();
  const displayTitle = title || getChapterDisplayTitle(chapter);
  const chapterLabel = `Chương ${currentChapter}`;
  const totalLabel = chapterIndex.length > 0 && position >= 0
    ? `${position + 1} / ${chapterIndex.length}`
    : '-- / --';

  const titleEl = document.getElementById('readerChapterTitle');
  const numberEl = document.getElementById('readerChapterNumber');
  const headerEl = document.getElementById('readerHeaderChapter');
  const dockChapterEl = document.getElementById('readerDockChapter');
  const dockProgressEl = document.getElementById('readerDockProgress');

  if (titleEl) titleEl.textContent = displayTitle;
  if (numberEl) numberEl.textContent = chapterLabel;
  if (headerEl) headerEl.textContent = displayTitle;
  if (dockChapterEl) dockChapterEl.textContent = chapterLabel;
  if (dockProgressEl) dockProgressEl.textContent = totalLabel;

  const previousChapter = position > 0 ? chapterIndex[position - 1] : null;
  const nextChapterData = position >= 0 && position < chapterIndex.length - 1
    ? chapterIndex[position + 1]
    : null;

  const prevLabel = document.getElementById('readerEndPrevLabel');
  const nextLabel = document.getElementById('readerEndNextLabel');
  if (prevLabel) prevLabel.textContent = previousChapter
    ? getChapterDisplayTitle(previousChapter)
    : 'Đây là chương đầu';
  if (nextLabel) nextLabel.textContent = nextChapterData
    ? getChapterDisplayTitle(nextChapterData)
    : 'Đã hết chương';

  [
    document.getElementById('readerEndPrev'),
    document.getElementById('readerDockPrev'),
    document.querySelector('.top-nav-prev')
  ].forEach(button => {
    if (button) button.disabled = !previousChapter;
  });

  [
    document.getElementById('readerEndNext'),
    document.getElementById('readerDockNext'),
    document.querySelector('.top-nav-next')
  ].forEach(button => {
    if (button) button.disabled = !nextChapterData;
  });
}

function selectExistingChapter() {
  if (!chapterIndex.length || getCurrentChapterPosition() >= 0) return;

  const nextChapter = chapterIndex.find(chapter => chapter.number > currentChapter);
  currentChapter = (nextChapter || chapterIndex.at(-1)).number;

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('chap', String(currentChapter));
  window.history.replaceState(null, '', nextUrl);
}

function getChapterPath(chap) {
  const chapter = chapterIndex.find(
    item => item.number === chap
  );

  if (chapter?.path) {
    return createBookDataUrl(
      currentBook,
      chapter.path
    );
  }

  const part = chapterToPart(chap);

  return createBookDataUrl(
    currentBook,
    `phần ${part}/${chap}.txt`
  );
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function showChapterMeta(text) {
  const metaEl = document.getElementById('chapterMeta');
  if (!metaEl) return;

  const words = countWords(text);
  const minutes = Math.max(1, Math.round(words / 200));

  metaEl.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'chapter-meta-inner';
  inner.innerHTML = `<span>${words.toLocaleString('vi-VN')} từ</span>` +
                    `<span class="chapter-meta-dot"></span>` +
                    `<span>${minutes} phút đọc</span>`;
  metaEl.appendChild(inner);
  metaEl.hidden = false;
}

function appendChapterImage(
  contentEl,
  imageUrl
) {
  if (!imageUrl) {
    return;
  }

  const figure =
    document.createElement('figure');

  const image =
    document.createElement('img');

  figure.className =
    'chapter-illustration';

  image.src = imageUrl;
  image.className = 'chapter-image';
  image.alt =
    `Ảnh minh họa chương ${currentChapter}`;
  image.loading = 'lazy';

  image.addEventListener('error', () => {
    figure.remove();
  });

  figure.appendChild(image);
  contentEl.appendChild(figure);
}

function renderChapterContent(
  contentEl,
  text,
  imageUrl = ''
) {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n');

  const lines = normalized.split('\n');

  const titleIndex = lines.findIndex(
    line => line.trim()
  );

  contentEl.innerHTML = '';

  if (titleIndex === -1) {
    const empty = document.createElement('p');
    empty.className = 'chapter-empty';
    empty.textContent = `Chương ${currentChapter} đang được cập nhật nội dung.`;
    contentEl.appendChild(empty);
    updateReaderChapterUI();
    showChapterMeta('');
    return;
  }

  const title = lines[titleIndex].trim();

  const body = lines
    .slice(titleIndex + 1)
    .join('\n')
    .trim();

  const hasChapterTitle =
    title.length <= 160 &&
    (
      body.length > 0 ||
      /^ch/i.test(title) ||
      title.includes(':')
    );

  if (!hasChapterTitle) {
    updateReaderChapterUI();
    appendChapterImage(
      contentEl,
      imageUrl
    );

    appendChapterParagraphs(contentEl, normalized);

    showChapterMeta(normalized);
    return;
  }

  updateReaderChapterUI(title);

  appendChapterImage(
    contentEl,
    imageUrl
  );

  appendChapterParagraphs(contentEl, body);

  showChapterMeta(body);
}

function appendChapterParagraphs(contentEl, text) {
  const normalized = String(text || '').trim();
  if (!normalized) return;

  let paragraphs = normalized.split(/\n\s*\n+/).map(item => item.trim()).filter(Boolean);
  if (paragraphs.length === 1 && paragraphs[0].includes('\n')) {
    paragraphs = paragraphs[0].split('\n').map(item => item.trim()).filter(Boolean);
  }

  paragraphs.forEach(paragraphText => {
    const paragraph = document.createElement('p');
    paragraph.textContent = paragraphText.replace(/\s+/g, ' ');
    contentEl.appendChild(paragraph);
  });
}

function showChapterLoading(contentEl) {
  contentEl.innerHTML =
    '<div class="reader-skeleton" aria-label="Đang tải chương">' +
      '<span></span><span></span><span></span><span></span>' +
    '</div>';
}

function loadChapter() {
  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  const metaEl = document.getElementById('chapterMeta');
  if (metaEl) metaEl.hidden = true;

  updateReaderChapterUI();

  // Hiệu ứng fade-out
  contentEl.classList.remove('is-visible');
  contentEl.classList.add('is-transitioning');

  // Hiển thị loading sau fade-out
  setTimeout(() => {
    showChapterLoading(contentEl);
    contentEl.classList.remove('is-transitioning');
    contentEl.classList.add('is-visible');
  }, 150);

  const currentChapterData =
  chapterIndex.find(
    chapter =>
      chapter.number === currentChapter
  );

  const chapterImage =
  String(
    currentChapterData?.image || ''
  ).trim();

  const partPath = getChapterPath(currentChapter);
  const fallbackPath = createBookDataUrl(
    currentBook,
    `${currentChapter}.txt`
  );
  const tryFetch = (url) => (
    fetch(encodeURI(url)).then(res => {
      if (!res.ok) throw res;
      return res.text();
    })
  );

  tryFetch(partPath)
    .catch(() => tryFetch(fallbackPath))
    .then(text => {
      // Fade-out loading, rồi fade-in nội dung
      contentEl.classList.remove('is-visible');
      contentEl.classList.add('is-transitioning');

      setTimeout(() => {
        renderChapterContent(contentEl, text, chapterImage);

        loadedChapter = currentChapter;

        contentEl.classList.remove('is-transitioning');
        contentEl.classList.add('is-visible');

        saveProgress(currentBook, currentChapter);
        restoreReadingPosition(currentBook, currentChapter);
      }, 180);
    })
    .catch(err => {
      contentEl.classList.remove('is-transitioning');
      contentEl.classList.add('is-visible');

      const msg = err && err.status
        ? `Không thể tải chương ${currentChapter} (HTTP ${err.status})`
        : (err && err.message) ? err.message : String(err);
      contentEl.innerHTML = '';
      const errorMessage = document.createElement('p');
      errorMessage.className = 'chapter-error';
      errorMessage.textContent = `Lỗi tải chương: ${msg}`;
      contentEl.appendChild(errorMessage);
    });
}

function loadSelects() {
  const partTop = document.getElementById('partSelect');
  const selectTop = document.getElementById('chapterSelect');
  const selectBottom = document.getElementById('chapterSelectBottom');
  if (!partTop || !selectTop) return;

  [partTop, selectTop, selectBottom].filter(Boolean).forEach(el => { el.innerHTML = ''; });

  const currentPart = chapterToPart(currentChapter);
  const availableParts = getAvailableParts();

  availableParts.forEach(part => {
    const opt = document.createElement('option');
    opt.value = part;
    opt.innerText = `Phần ${part}`;
    if (part === currentPart) opt.selected = true;
    partTop.appendChild(opt);
  });

  getChaptersForPart(currentPart).forEach(chapter => {
    const title = chapter.title || `Chương ${chapter.number}`;

    const topOption = document.createElement('option');
    topOption.value = chapter.number;
    topOption.innerText = title;
    if (chapter.number === currentChapter) topOption.selected = true;
    selectTop.appendChild(topOption);

    if (selectBottom) {
      const bottomOption = document.createElement('option');
      bottomOption.value = chapter.number;
      bottomOption.innerText = title;
      if (chapter.number === currentChapter) bottomOption.selected = true;
      selectBottom.appendChild(bottomOption);
    }
  });

  setupReaderToc();
  updateReaderChapterUI();
}

function normalizeReaderSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function setTocMenuState(trigger, menu, open) {
  if (!trigger || !menu) return;
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  menu.hidden = !open;
  trigger.closest('.reader-toc-field')?.classList.toggle('is-menu-open', open);
}

function closeTocMenus(exceptMenu = null) {
  [
    ['tocPartTrigger', 'tocPartMenu'],
    ['tocChapterTrigger', 'tocChapterMenu']
  ].forEach(([triggerId, menuId]) => {
    const trigger = document.getElementById(triggerId);
    const menu = document.getElementById(menuId);
    if (menu !== exceptMenu) setTocMenuState(trigger, menu, false);
  });
}

function createTocPopoverOption(label, selected, onSelect) {
  const option = document.createElement('button');
  const check = document.createElement('span');

  option.type = 'button';
  option.className = 'reader-toc-popover-option';
  option.classList.toggle('is-selected', selected);
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', selected ? 'true' : 'false');
  option.textContent = label;

  check.className = 'reader-toc-option-check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = selected ? '✓' : '';
  option.appendChild(check);
  option.addEventListener('click', onSelect);
  return option;
}

function populateTocPartMenu(selectedPart) {
  const trigger = document.getElementById('tocPartTrigger');
  const label = document.getElementById('tocPartLabel');
  const menu = document.getElementById('tocPartMenu');
  if (!trigger || !label || !menu) return;

  const partValue = Number(selectedPart) || chapterToPart(currentChapter);
  trigger.dataset.value = String(partValue);
  label.textContent = `Phần ${partValue}`;
  menu.innerHTML = '';

  getAvailableParts().forEach(part => {
    menu.appendChild(createTocPopoverOption(
      `Phần ${part}`,
      part === partValue,
      () => {
        trigger.dataset.value = String(part);
        label.textContent = `Phần ${part}`;
        document.getElementById('tocSearchInput').value = '';
        closeTocMenus();
        populateTocPartMenu(part);
        populateTocChapterSelect(part);
        renderReaderToc();
      }
    ));
  });
}

function populateTocChapterSelect(part) {
  const trigger = document.getElementById('tocChapterTrigger');
  const label = document.getElementById('tocChapterLabel');
  const menu = document.getElementById('tocChapterMenu');
  if (!trigger || !label || !menu) return;

  const chapters = getChaptersForPart(Number(part));
  const selectedChapter = chapters.find(chapter => chapter.number === currentChapter) || chapters[0];
  trigger.dataset.value = selectedChapter ? String(selectedChapter.number) : '';
  label.textContent = selectedChapter ? getChapterDisplayTitle(selectedChapter) : 'Không có chương';
  trigger.disabled = chapters.length === 0;
  menu.innerHTML = '';

  chapters.forEach(chapter => {
    menu.appendChild(createTocPopoverOption(
      getChapterDisplayTitle(chapter),
      chapter.number === currentChapter,
      () => goToReaderChapter(chapter.number)
    ));
  });
}

function renderReaderToc(query = '') {
  const list = document.getElementById('readerTocList');
  const empty = document.getElementById('readerTocEmpty');
  const count = document.getElementById('tocResultCount');
  const title = document.getElementById('tocResultTitle');
  const partTrigger = document.getElementById('tocPartTrigger');
  if (!list || !empty) return;

  const normalizedQuery = normalizeReaderSearch(query);
  const selectedPart = Number(partTrigger?.dataset.value || chapterToPart(currentChapter));
  const source = normalizedQuery ? chapterIndex : getChaptersForPart(selectedPart);
  const chapters = source.filter(chapter => {
    if (!normalizedQuery) return true;
    return normalizeReaderSearch(`${chapter.number} ${getChapterDisplayTitle(chapter)}`)
      .includes(normalizedQuery);
  });

  list.innerHTML = '';
  chapters.forEach(chapter => {
    const button = document.createElement('button');
    const number = document.createElement('span');
    const name = document.createElement('span');
    const arrow = document.createElement('span');

    button.type = 'button';
    button.className = 'reader-toc-item';
    button.classList.toggle('is-current', chapter.number === currentChapter);
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-current', chapter.number === currentChapter ? 'page' : 'false');
    button.addEventListener('click', () => goToReaderChapter(chapter.number));

    number.className = 'reader-toc-number';
    number.textContent = String(chapter.number).padStart(3, '0');
    name.className = 'reader-toc-name';
    name.textContent = getChapterDisplayTitle(chapter);
    arrow.className = 'reader-toc-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';

    button.append(number, name, arrow);
    list.appendChild(button);
  });

  empty.hidden = chapters.length > 0;
  if (count) count.textContent = `${chapters.length} chương`;
  if (title) title.textContent = normalizedQuery ? 'Kết quả tìm kiếm' : `Phần ${selectedPart}`;
}

function setupReaderToc() {
  const partTrigger = document.getElementById('tocPartTrigger');
  const partMenu = document.getElementById('tocPartMenu');
  const chapterTrigger = document.getElementById('tocChapterTrigger');
  const chapterMenu = document.getElementById('tocChapterMenu');
  const searchInput = document.getElementById('tocSearchInput');
  if (!partTrigger || !partMenu || !chapterTrigger || !chapterMenu || !searchInput) return;

  const currentPart = chapterToPart(currentChapter);
  populateTocPartMenu(currentPart);
  populateTocChapterSelect(currentPart);
  renderReaderToc(searchInput.value);

  if (partTrigger.dataset.readerBound === '1') return;
  partTrigger.dataset.readerBound = '1';

  partTrigger.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = partMenu.hidden;
    closeTocMenus(willOpen ? partMenu : null);
    setTocMenuState(partTrigger, partMenu, willOpen);
  });

  chapterTrigger.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = chapterMenu.hidden;
    closeTocMenus(willOpen ? chapterMenu : null);
    setTocMenuState(chapterTrigger, chapterMenu, willOpen);
  });

  searchInput.addEventListener('input', () => {
    closeTocMenus();
    renderReaderToc(searchInput.value);
  });

  searchInput.addEventListener('focus', () => closeTocMenus());
  document.addEventListener('click', event => {
    if (!event.target.closest('.reader-toc-field')) closeTocMenus();
  });
}

function goToReaderChapter(chapterNumber) {
  const chapter = chapterIndex.find(item => item.number === Number(chapterNumber));
  if (!chapter) return;

  navigateToReaderChapter(chapter.number);
}

function nextChapter() {
  const position = getCurrentChapterPosition();

  if (position >= 0 && position < chapterIndex.length - 1) {
    navigateToReaderChapter(chapterIndex[position + 1].number, 'next');
  }
}

function prevChapter() {
  const position = getCurrentChapterPosition();

  if (position > 0) {
    navigateToReaderChapter(chapterIndex[position - 1].number, 'prev');
  }
}

function navigateToReaderChapter(chapterNumber, requestedDirection = '') {
  const targetChapter = Number(chapterNumber);
  const exists = chapterIndex.some(chapter => chapter.number === targetChapter);
  if (!exists || chapterNavigationLocked) return;

  if (targetChapter === currentChapter) {
    closeReaderPanels();
    return;
  }

  const direction = requestedDirection === 'prev' || requestedDirection === 'next'
    ? requestedDirection
    : (targetChapter > currentChapter ? 'next' : 'prev');

  chapterNavigationLocked = true;
  closeReaderPanels();
  currentChapter = targetChapter;
  saveProgress(currentBook, currentChapter);

  try {
    sessionStorage.setItem('readerPageTurnDirection', direction);
  } catch (error) {
    // Continue without the entrance animation when storage is unavailable.
  }

  document.body.classList.add(`reader-turn-${direction}`);
  document.body.setAttribute('aria-busy', 'true');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(updateURL, reduceMotion ? 0 : 260);
}

function goHome() {
  window.location.href = 'index.html';
}

function goBack() {
  const hasLocalReferrer = (() => {
    try {
      return document.referrer && new URL(document.referrer).origin === window.location.origin;
    } catch (error) {
      return false;
    }
  })();

  if (hasLocalReferrer) {
    window.history.back();
    return;
  }

  window.location.href = currentBook
    ? `book.html?id=${encodeURIComponent(currentBook)}`
    : 'index.html';
}

function closeReaderPanels() {
  closeTocMenus();
  document.querySelectorAll('.reader-side-panel.is-open').forEach(panel => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  });

  const backdrop = document.getElementById('readerBackdrop');
  if (backdrop) {
    backdrop.classList.remove('is-visible');
    backdrop.setAttribute('aria-hidden', 'true');
  }

  document.body.classList.remove('reader-panel-open');
}

function openReaderPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  closeReaderPanels();
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');

  const backdrop = document.getElementById('readerBackdrop');
  if (backdrop) {
    backdrop.classList.add('is-visible');
    backdrop.setAttribute('aria-hidden', 'false');
  }

  document.body.classList.add('reader-panel-open');
}

function toggleTocPanel() {
  const panel = document.getElementById('tocPanel');
  if (!panel) return;

  if (panel.classList.contains('is-open')) {
    closeReaderPanels();
    return;
  }

  renderReaderToc(document.getElementById('tocSearchInput')?.value || '');
  openReaderPanel('tocPanel');
  window.setTimeout(() => document.getElementById('tocSearchInput')?.focus(), 180);
}

function toggleSettings() {
  const settings = document.getElementById('settings');
  if (!settings) return;

  if (settings.classList.contains('is-open')) {
    closeReaderPanels();
    return;
  }

  syncSettingsUI();
  openReaderPanel('settings');
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

  const activeFont = localStorage.getItem('fontFamily') || 'Merriweather';
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

  const activeWidth = localStorage.getItem('readerWidth') || 'normal';
  document.querySelectorAll('[data-reader-width]').forEach(button => {
    const isActive = button.dataset.readerWidth === activeWidth;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyTheme(index, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const theme = THEMES[index];
  if (!theme) return;

  document.body.dataset.readerTheme = theme.name;
  document.body.style.removeProperty('background');
  document.body.style.removeProperty('color');
  content.style.removeProperty('background');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', theme.color);
  localStorage.setItem('theme', index);
  syncSettingsUI();

  if (close) closeReaderPanels();
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

  if (close) closeReaderPanels();
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

  const nextFont = fontMap[fontName] ? fontName : 'Merriweather';
  content.style.setProperty('--font-family', fontMap[nextFont]);
  localStorage.setItem('fontFamily', nextFont);
  syncSettingsUI();

  if (close) closeReaderPanels();
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

  if (close) closeReaderPanels();
}

function setLetterSpacing(value, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const allowed = new Set(['normal', '0.06em', '0.12em']);
  const nextValue = allowed.has(value) ? value : 'normal';

  content.style.setProperty('--letter-spacing', nextValue);
  localStorage.setItem('letterSpacing', nextValue);
  syncSettingsUI();

  if (close) closeReaderPanels();
}

function setTextAlign(value, close = false) {
  const content = getReaderContent();
  if (!content) return;

  const nextValue = value === 'justify' ? 'justify' : 'left';
  content.style.setProperty('--chapter-text-align', nextValue);
  localStorage.setItem('textAlign', nextValue);
  syncSettingsUI();

  if (close) closeReaderPanels();
}

function setReaderWidth(value, close = false) {
  const widths = {
    narrow: '680px',
    normal: '820px',
    wide: '1000px'
  };
  const nextValue = widths[value] ? value : 'normal';

  document.body.style.setProperty('--reader-width', widths[nextValue]);
  localStorage.setItem('readerWidth', nextValue);
  syncSettingsUI();

  if (close) closeReaderPanels();
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
  const firstChapter = getChaptersForPart(selectedPart)[0];
  if (!firstChapter) return;

  navigateToReaderChapter(firstChapter.number);
}

function changeChapter() {
  const select = document.getElementById('chapterSelect');
  if (!select) return;

  navigateToReaderChapter(parseInt(select.value, 10));
}

function changeChapterBottom() {
  const select = document.getElementById('chapterSelectBottom');
  if (!select) return;

  const targetChapter = parseInt(select.value, 10);
  closeChapterPicker();
  navigateToReaderChapter(targetChapter);
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
  window.location.href = `reader.html?book=${encodeURIComponent(currentBook)}&chap=${currentChapter}`;
}

if (document.getElementById('book-list')) {
  loadBooks().catch(() => {
    booksData = [];
    renderBookList([]);
  });
}

window.addEventListener('pageshow', () => {
  if (
    document.getElementById('book-list') &&
    booksData.length > 0
  ) {
    applyBookFilters();
  }

  if (document.body.classList.contains('reader-v2')) {
    document.body.classList.remove('reader-turn-next', 'reader-turn-prev');
    document.body.removeAttribute('aria-busy');
    chapterNavigationLocked = false;
  }
});

if (document.getElementById('content')) {
  const url = new URLSearchParams(window.location.search);
  currentBook = url.get('book') || '';
  currentChapter = parseInt(url.get('chap'), 10) || 1;
  updateReaderBookTitle(currentBook);

  fetch(encodeURI(
      createBookDataUrl(
        currentBook,
        'chapters.json'
      )
    ))
    .then(res => {
      if (!res.ok) throw res;
      return res.json();
    })
    .then(data => {
      chapterIndex = normalizeChapterIndex(data);
      selectExistingChapter();
      loadChapter();
      loadSelects();
    })
    .catch(() => {
      chapterIndex = [{
        number: currentChapter,
        title: `Chương ${currentChapter}`,
        path: ''
      }];
      loadChapter();
      loadSelects();
    });
}

(function setupReaderPageTurnArrival() {
  if (!document.body.classList.contains('reader-v2')) return;

  let direction = '';
  try {
    direction = sessionStorage.getItem('readerPageTurnDirection') || '';
    sessionStorage.removeItem('readerPageTurnDirection');
  } catch (error) {
    return;
  }

  if (direction !== 'next' && direction !== 'prev') return;

  document.body.classList.add(`reader-arrive-${direction}`);
  window.setTimeout(() => {
    document.body.classList.remove(`reader-arrive-${direction}`);
  }, 520);
})();

window.addEventListener('load', () => {
  const content = getReaderContent();
  if (!content) return;

  const savedTheme = localStorage.getItem('theme');
  const savedFont = localStorage.getItem('fontsize');
  const savedFontFamily = localStorage.getItem('fontFamily');
  const savedLineHeight = localStorage.getItem('lineHeight');
  const savedLetterSpacing = localStorage.getItem('letterSpacing');
  const savedTextAlign = localStorage.getItem('textAlign');
  const savedReaderWidth = localStorage.getItem('readerWidth');

  applyTheme(savedTheme !== null ? parseInt(savedTheme, 10) : 0, false);
  if (savedFont !== null) applyFontSize(savedFont, false);
  if (savedFontFamily !== null) setFont(savedFontFamily, false);
  if (savedLineHeight !== null) setLineHeight(savedLineHeight, false);
  if (savedLetterSpacing !== null) setLetterSpacing(savedLetterSpacing, false);
  if (savedTextAlign !== null) setTextAlign(savedTextAlign, false);
  setReaderWidth(savedReaderWidth || 'normal', false);

  const settings = document.getElementById('settings');
  if (settings) settings.setAttribute('aria-hidden', settings.classList.contains('is-open') ? 'false' : 'true');
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

(function setupReaderPanels() {
  const backdrop = document.getElementById('readerBackdrop');
  if (!backdrop) return;

  backdrop.addEventListener('click', closeReaderPanels);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeReaderPanels();
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
  const statusEl = document.getElementById('ttsStatus');

  const controls = [voiceSelect, rateInput, playBtn, pauseBtn, stopBtn];
  const setStatus = message => {
    if (statusEl) statusEl.textContent = message;
  };

  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    controls.forEach(control => {
      if (control) control.disabled = true;
    });
    setStatus('Trình duyệt không hỗ trợ');
    return;
  }

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
      setStatus('');
    } else {
      const note = document.createElement('option');
      note.disabled = true;
      note.selected = true;
      note.innerText = 'Không tìm thấy giọng Tiếng Việt trên trình duyệt này';
      voiceSelect.appendChild(note);
      setStatus('Dùng giọng mặc định');
    }
  }

  function stopTTS() {
    synth.cancel();
    utter = null;
    setStatus('Đã dừng');
  }

  function pauseTTS() {
    if (synth.speaking && !synth.paused) {
      synth.pause();
      setStatus('Đang tạm dừng');
    }
  }

  function resumeTTS() {
    if (synth.paused) {
      synth.resume();
      setStatus('Đang đọc');
    }
  }

  function playTTS() {
    if (synth.paused) {
      resumeTTS();
      return;
    }

    stopTTS();

    const text = contentEl.innerText || contentEl.textContent;
    if (!text || !text.trim()) {
      setStatus('Chương này chưa có nội dung');
      return;
    }

    utter = new SpeechSynthesisUtterance(text);
    if (voiceSelect && voiceSelect.value) {
      const voice = voices.find(item => item.name === voiceSelect.value);
      if (voice) utter.voice = voice;
    }

    if (rateInput) utter.rate = parseFloat(rateInput.value) || 1;
    if (!utter.lang) utter.lang = 'vi-VN';
    utter.onstart = () => setStatus('Đang đọc');
    utter.onend = () => {
      utter = null;
      setStatus('Đã đọc xong');
    };
    utter.onerror = event => {
      utter = null;
      if (event.error !== 'canceled') setStatus('Không thể đọc chương này');
    };
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
  window.addEventListener('pagehide', () => synth.cancel());
})();

(function setupReadingPositionMemory() {
  const readerPage = document.body;

  if (
    !readerPage ||
    !readerPage.classList.contains('reader-page')
  ) {
    return;
  }

  window.addEventListener(
    'scroll',
    scheduleReadingPositionSave,
    { passive: true }
  );

  window.addEventListener('pagehide', () => {
    window.clearTimeout(readingPositionTimer);
    saveCurrentReadingPosition();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      window.clearTimeout(readingPositionTimer);
      saveCurrentReadingPosition();
    }
  });
})();

// Tính năng Sao lưu và khôi phục dữ liệu
(function setupBackupRestore() {
  const dialog = document.getElementById('backupDialog');
  const openBtn = document.getElementById('backupModalTrigger');
  const closeBtn = document.getElementById('closeBackupDialog');
  const exportBtn = document.getElementById('exportBackupBtn');
  const importBtn = document.getElementById('importBackupBtn');
  const fileInput = document.getElementById('backupFileInput');
  const statusEl = document.getElementById('backupStatus');

  if (!dialog || !openBtn) return;

  const BACKUP_KEYS = [
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
    'readerWidth'
  ];

  function showStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `backup-status ${isError ? 'is-error' : 'is-success'}`;
  }

  // mở và đóng dialogg
  openBtn.addEventListener('click', () => {
    if (statusEl) statusEl.textContent = '';
    dialog.showModal();
  });

  closeBtn?.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  // xuat file json
  exportBtn?.addEventListener('click', () => {
    try {
      const data = {};
      BACKUP_KEYS.forEach(key =>  {
        const val = localStorage.getItem(key);
        if (val !== null) {
          try {
            data[key] = JSON.parse(val);
          } catch {
            data[key] = val;
          }
        }
      });

      const payload = {
        app: 'WebDocSach',
        exportedAt: new Date().toISOString(),
        data
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `webdocsach-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showStatus('Đã tải tệp sao lưu thành công!', false);
    } catch (err) {
      showStatus('Lỗi khi xuất tệp: ' + err.message, true);
    }
  });

  // kích hoạt chọn file
  importBtn?.addEventListener('click', () => {
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  });

  // Nhập và khôi phục dữ liệu từ file JSON
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const backupData = json?.data || json;

        if (!backupData || typeof backupData !== 'object' || Object.keys(backupData).length === 0) {
          showStatus('Tệp không đúng định dạng hoặc không có dữ liệu.', true);
          return;
        }

        const confirmed = window.confirm('Dữ liệu sao lưu sẽ ghi đè lên tiến độ đọc và tủ sách hiện tại của bạn. Bạn có muốn tiếp tục ?');
        if (!confirmed) return;

        Object.entries(backupData).forEach(([key, val]) => {
          if (BACKUP_KEYS.includes(key)) {
            const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
            localStorage.setItem(key, strVal);
          }
        });

        showStatus('Khôi phục thành công! Đang tải lại trang...', false);
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        showStatus('Lỗi đọc tệp JSON: ' + err.message, true);
      }
    };
    reader.readAsText(file);
  });
})();

// ===== CẢI TIẾN TRANG ĐỌC =====

// 1. Thanh tiến độ đọc
(function setupReadingProgressBar() {
  const bar = document.getElementById('readingProgressBar');
  if (!bar || !document.body.classList.contains('reader-page')) return;

  let ticking = false;

  function updateProgress() {
    const scrollY = window.scrollY;
    const maxScroll = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1
    );
    const percent = Math.min((scrollY / maxScroll) * 100, 100);
    bar.style.width = `${percent}%`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateProgress);
    }
  }, { passive: true });

  updateProgress();
})();

// 2. Phím tắt bàn phím
(function setupKeyboardShortcuts() {
  if (!document.body.classList.contains('reader-page')) return;

  document.addEventListener('keydown', (event) => {
    // Không kích hoạt khi đang focus vào select, input
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    // Không kích hoạt khi đang giữ Ctrl, Alt, Meta
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        event.preventDefault();
        prevChapter();
        break;

      case 'ArrowRight':
      case 'd':
      case 'D':
        event.preventDefault();
        nextChapter();
        break;
    }
  });
})();

// 3. Cập nhật link trang chi tiết truyện
(function setupBookDetailLink() {
  if (!document.body.classList.contains('reader-page')) return;

  const link = document.getElementById('bookDetailLink');
  if (!link) return;

  const url = new URLSearchParams(window.location.search);
  const bookId = url.get('book');

  if (bookId) {
    link.href = `book.html?id=${encodeURIComponent(bookId)}`;
  } else {
    link.hidden = true;
  }
})();
