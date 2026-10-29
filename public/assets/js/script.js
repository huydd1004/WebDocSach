const PROGRESS_KEY = 'readingProgress';
const REMEMBER_PROGRESS_KEY = 'rememberReadingPosition';
const FAVORITE_BOOKS_KEY = 'favoriteBooks';
const CHAPTERS_PER_PART = 200;
const HOME_BOOK_BATCH_SIZE = 12;

const {createDataUrl, createBookDataUrl} = window.WebDocSachData;

const THEMES = [
  { name: 'dark', color: '#0a0f1b' },
  { name: 'light', color: '#eef1f5' },
  { name: 'sepia', color: '#e9dfcb' },
  { name: 'oled', color: '#000000' },
  { name: 'sage', color: '#dfe9df' }
];

let booksData = [];
let activeLibraryView = 'all';
let homeBookDisplayLimit = HOME_BOOK_BATCH_SIZE;
let homeFilteredBooksCache = [];
let homeFilterSignature = '';
let currentBook = '';
let currentChapter = 1;
let chapterIndex = [];

let loadedChapter = 0;
let readingPositionTimer = null;
let chapterNavigationLocked = false;
let readerPageTurnState = null;
const readerChapterTextCache = new Map();

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

function saveFavoriteBookIds(bookIds) {
  try {
    const uniqueBookIds = [...new Set(bookIds)];

    localStorage.setItem(
      FAVORITE_BOOKS_KEY,
      JSON.stringify(uniqueBookIds)
    );
  } catch (error) {
    // Ignore storage errors.
  }
}

function updateHomeFavoriteButton(button, bookId) {
  const isFavorite = getFavoriteBookIds().includes(bookId);

  button.classList.toggle('is-favorite', isFavorite);
  button.setAttribute('aria-pressed', String(isFavorite));
  button.setAttribute(
    'aria-label',
    isFavorite
      ? 'Bỏ khỏi danh sách yêu thích'
      : 'Thêm vào danh sách yêu thích'
  );
  button.title = isFavorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích';
  button.textContent = isFavorite ? '♥' : '♡';
}

function toggleHomeFavorite(bookId) {
  const favoriteBookIds = getFavoriteBookIds();
  const isFavorite = favoriteBookIds.includes(bookId);
  const nextFavoriteBookIds = isFavorite
    ? favoriteBookIds.filter(id => id !== bookId)
    : [...favoriteBookIds, bookId];

  saveFavoriteBookIds(nextFavoriteBookIds);
  const nextState = !isFavorite;

  document.dispatchEvent(new CustomEvent('webdocsach:favorite-changed', {
    detail: {
      bookId,
      isFavorite: nextState
    }
  }));

  return nextState;
}

function getHomeProgressEntries() {
  if (!shouldRememberProgress()) {
    return [];
  }

  const progressMap = loadProgressMap();

  return booksData .map(book => ({
    book, progress: progressMap[book.id]
  }))
  .filter(item => item.progress && Number(item.progress.chapter) > 0)
  .sort((first, second) => Number(second.progress.updated || 0) - Number(first.progress.updated || 0));
}

function updateHomeStats() {
  const totalElement = document.getElementById('totalBooksStat');
  const readingElement = document.getElementById('readingBooksStat');
  const favoriteElement = document.getElementById('favoriteBooksStat');
  const validBookIds = new Set(booksData.map(book => book.id));
  const readingCount = getHomeProgressEntries().length;
  const favoriteCount = getFavoriteBookIds().filter(bookId => validBookIds.has(bookId)).length;
  const formatter = new Intl.NumberFormat('vi-VN');

  if (totalElement) {
    totalElement.textContent = formatter.format(booksData.length);
  }

  if (readingElement) {
    readingElement.textContent = formatter.format(readingCount);
  }

  if (favoriteElement) {
    favoriteElement.textContent = formatter.format(favoriteCount);
  }
}

function updateFeaturedProgress(book) {
  const progressContainer = document.getElementById('featuredProgress');
  const progressText = document.getElementById('featuredProgressText');
  const progressBar = document.getElementById('featuredProgressBar');

  if (!progressContainer || !progressText || !progressBar) {
    return;
  }

  const progress = getProgress(book.id);
  const chapter = Number(progress?.chapter);

  if (!Number.isFinite(chapter) || chapter <= 0) {
    progressContainer.hidden = true;
    progressBar.style.width = '0%';
    return;
  }

  const savedRatio = Number(progress.scrollRatio);

  const chapterPercent = Number.isFinite(savedRatio) ? Math.round(Math.min(Math.max(savedRatio, 0), 1) * 100) : 0;
  progressText.textContent = chapterPercent > 0 ? `Chương ${chapter} • ${chapterPercent}%` : `Chương ${chapter}`;
  progressBar.style.width = `${chapterPercent}%`;
  progressContainer.hidden = false;
}

function createContinueReadingCard(book, progress) {
  const chapter = Math.max(Number(progress.chapter) || 1, 1);

  const savedRatio = Number(progress.scrollRatio);

  const chapterPercent = Number.isFinite(savedRatio) ? Math.round(Math.min(Math.max(savedRatio, 0), 1) * 100) : 0;

  const card = document.createElement('a');
  card.className = 'continue-card';
  card.href = `reader.html?book=${encodeURIComponent(book.id)}` + `&chap=${chapter}`;

  card.setAttribute('aria-label', `Đọc tiếp ${book.title}, chương ${chapter}`);

  const cover = document.createElement('img');
  cover.src = book.cover;
  cover.alt = `Bìa truyện ${book.title}`;
  cover.loading = 'lazy';
  cover.decoding = 'async';
  cover.addEventListener('error', () => {
    cover.src = 'assets/images/Logo.png';
  }, { once: true });

  const content = document.createElement('div');
  content.className = 'continue-card-content';

  const title = document.createElement('h3');
  title.className = 'continue-card-title';
  title.textContent = book.title;

  const chapterText = document.createElement('p');
  chapterText.className = 'continue-card-chapter';

  chapterText.textContent = chapterPercent > 0 ? `Chương ${chapter} • Đã đọc ${chapterPercent}%` : `Tiếp tục chương ${chapter}`;

  const progressTrack = document.createElement('div');
  progressTrack.className = 'continue-card-progress';
  progressTrack.setAttribute('aria-hidden', 'true');

  const progressValue = document.createElement('span');
  progressValue.style.width = `${chapterPercent}%`;

  progressTrack.appendChild(progressValue);

  content.append(title, chapterText, progressTrack);

  card.append(cover, content);

  return card;
}

function renderContinueReading() {
  const section = document.getElementById('continueReadingSection');
  const container = document.getElementById('continueReadingList');

  if (!section || !container) {
    return;
  }

  const entries = getHomeProgressEntries().slice(0, 6);
  container.replaceChildren();

  entries.forEach(({ book, progress }) => {
    container.appendChild(createContinueReadingCard(book, progress));
  });

  section.hidden = entries.length === 0;
}

function getBookDateValue(book) {
  const rawValue = book.updatedAt || book.updated || book.date || '';

  if (typeof rawValue === 'number') {
    return rawValue;
  }

  const text = String(rawValue).trim();

  const vietnameseDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);

  if (vietnameseDate) {
    const [, day, month, year] = vietnameseDate;

    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const timestamp = Date.parse(text);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getBookChapterCount(book) {
  const candidates = [
    book?.chapterCount,
    book?.totalChapters,
    book?.chaptersCount,
    typeof book?.chapters === 'number' ? book.chapters : undefined
  ];
  const value = candidates.map(Number).find(Number.isFinite);
  return value && value > 0 ? value : 0;
}

function isCompletedBook(book) {
  const status = normalizeSearchText(book?.status || '');
  return ['hoan thanh', 'hoan', 'completed', 'full'].some(value => status.includes(value));
}

function sortBookList(list) {
  const sortValue = document.getElementById('bookSort')?.value || 'default';
  const sortedList = [...list];

  if (sortValue === 'title-asc') {
    sortedList.sort((first, second) => String(first.title || '').localeCompare(String(second.title || ''), 'vi', { sensitivity: 'base' }));
  }

  if (sortValue === 'title-desc') {
    sortedList.sort((first, second) => String(second.title || '').localeCompare(String(first.title || ''), 'vi', { sensitivity: 'base' }));
  }

  if (sortValue === 'newest') {
    sortedList.sort((first, second) => getBookDateValue(second) - getBookDateValue(first));
  }

  return sortedList;
}

function setLibraryLayout(layout) {
  const bookList = document.getElementById('book-list');
  const normalizedLayout = layout === 'list' ? 'list' : 'grid';

  if (bookList) {
    bookList.classList.toggle('is-list-view', normalizedLayout === 'list');
  }

  document
    .querySelectorAll('[data-library-layout]')
    .forEach(button => {
      const isActive = button.dataset.libraryLayout === normalizedLayout;
      button.classList.toggle('is-active', isActive);

      button.setAttribute('aria-pressed', String(isActive));
    });

  try {
    localStorage.setItem('webdocsachHomeLayout', normalizedLayout);
  } catch (error) {
    // Bỏ qua nếu trình duyệt không cho phép lưu
  }
}

function setupHomeLibraryControls() {
  const sortSelect = document.getElementById('bookSort');

  if (sortSelect && sortSelect.dataset.bound !== 'true') {
    sortSelect.dataset.bound = 'true';
    sortSelect.addEventListener('change', applyBookFilters);
  }

  ['bookStatusFilter', 'bookLengthFilter'].forEach(id => {
    const select = document.getElementById(id);
    if (select && select.dataset.bound !== 'true') {
      select.dataset.bound = 'true';
      select.addEventListener('change', applyBookFilters);
    }
  });

  const layoutContainer = document.querySelector('.library-layout-switch');

  if (layoutContainer && layoutContainer.dataset.bound !== 'true') {
    layoutContainer.dataset.bound = 'true';

    layoutContainer.addEventListener('click', event => {
      const button = event.target.closest('[data-library-layout]');
      if (!button) {
        return;
      }

      setLibraryLayout(button.dataset.libraryLayout);
    });
  }

  const showReadingButton = document.getElementById('showAllReadingBooks');

  if (showReadingButton && showReadingButton.dataset.bound !== 'true') {
    showReadingButton.dataset.bound = 'true';

    showReadingButton.addEventListener('click', () => {
      setLibraryView('reading');
      document
        .getElementById('library')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  let savedLayout = 'grid';

  try {
    savedLayout = localStorage.getItem('webdocsachHomeLayout') || 'grid';
  } catch (error) {
    savedLayout = 'grid';
  }

  setLibraryLayout(savedLayout);
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
  cover.loading = 'eager';
  cover.decoding = 'async';
  cover.fetchPriority = 'high';
  cover.onerror = () => {
    cover.onerror = null;
    cover.src = 'assets/images/Logo.png';
  };

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

  updateFeaturedProgress(book);

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
  const hasAdvancedFilter =
    (document.getElementById('bookStatusFilter')?.value || 'all') !== 'all' ||
    (document.getElementById('bookLengthFilter')?.value || 'all') !== 'all';

  if (resultCount) {
    const visibleCount = Math.min(homeBookDisplayLimit, list.length);
    resultCount.textContent = `Hiển thị ${visibleCount} trong ${list.length} kết quả • ${booksData.length} truyện`;
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
      !hasAdvancedFilter &&
      !hasSelectedLibraryView;
  }
}

function renderBookList(list) {
  const container = document.getElementById('book-list');
  if (!container) {
    return;
  }

  homeFilteredBooksCache = [...list];
  const visibleBooks = list.slice(0, homeBookDisplayLimit);

  container.replaceChildren();

  visibleBooks.forEach(book => {
    const saved = getProgress(book.id);
    const currentChapter = Math.max(Number(saved?.chapter) || 1, 1);
    const savedRatio = Number(saved?.scrollRatio);
    const chapterPercent = Number.isFinite(savedRatio)
      ? Math.round(Math.min(Math.max(savedRatio, 0), 1) * 100)
      : 0;

    const card = document.createElement('article');
    card.className = 'book';
    card.dataset.bookId = book.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `Xem truyện ${book.title}`);

    const coverArea = document.createElement('div');
    coverArea.className = 'book-cover-area';

    const cover = document.createElement('img');
    cover.src = book.cover || 'assets/images/Logo.png';
    cover.alt = `Bìa truyện ${book.title}`;
    cover.loading = 'lazy';
    cover.decoding = 'async';
    cover.addEventListener('error', () => {
      cover.src = 'assets/images/Logo.png';
    }, { once: true });

    const statusBadge = document.createElement('span');
    statusBadge.className = 'book-status-badge';
    statusBadge.textContent = book.status || 'Đang cập nhật';

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = 'book-favorite-button';
    updateHomeFavoriteButton(favoriteButton, book.id);

    favoriteButton.addEventListener('click', event => {
      event.stopPropagation();
      toggleHomeFavorite(book.id);
      updateHomeFavoriteButton(favoriteButton, book.id);
      updateHomeStats();

      if (activeLibraryView === 'favorite') {
        applyBookFilters();
      }
    });

    coverArea.append(cover, statusBadge, favoriteButton);

    const info = document.createElement('div');
    info.className = 'book-info';

    const author = document.createElement('p');
    author.className = 'book-author';
    author.textContent = book.author || 'Chưa cập nhật tác giả';

    const title = document.createElement('h3');
    title.textContent = book.title;

    const genreList = document.createElement('div');
    genreList.className = 'book-genre-list';

    getBookGenres(book).slice(0, 2).forEach(genre => {
      const genreItem = document.createElement('span');
      genreItem.className = 'book-genre-chip';
      genreItem.textContent = genre;
      genreList.appendChild(genreItem);
    });

    const metadata = document.createElement('div');
    metadata.className = 'book-metadata';

    const date = document.createElement('span');
    date.textContent = book.date ? `Cập nhật ${book.date}` : 'Đang cập nhật';
    metadata.appendChild(date);

    info.append(author, title, genreList, metadata);

    if (saved?.chapter) {
      const progressBlock = document.createElement('div');
      progressBlock.className = 'book-progress-block';

      const progressHeading = document.createElement('div');
      progressHeading.className = 'book-progress-heading';

      const progressLabel = document.createElement('span');
      progressLabel.textContent = `Chương ${currentChapter}`;

      const progressPercent = document.createElement('strong');
      progressPercent.textContent = `${chapterPercent}%`;

      const progressTrack = document.createElement('div');
      progressTrack.className = 'book-progress-track';

      const progressValue = document.createElement('span');
      progressValue.style.width = `${chapterPercent}%`;

      progressHeading.append(progressLabel, progressPercent);
      progressTrack.appendChild(progressValue);
      progressBlock.append(progressHeading, progressTrack);
      info.appendChild(progressBlock);
    }

    const footer = document.createElement('div');
    footer.className = 'book-card-footer';

    const detailText = document.createElement('span');
    detailText.className = 'book-detail-text';
    detailText.textContent = saved?.chapter
      ? 'Tiếp tục hành trình'
      : 'Khám phá câu chuyện';

    const readButton = document.createElement('a');
    readButton.className = 'book-quick-read';
    readButton.href = `reader.html?book=${encodeURIComponent(book.id)}&chap=${currentChapter}`;
    readButton.textContent = saved?.chapter ? 'Đọc tiếp' : 'Đọc ngay';
    readButton.setAttribute(
      'aria-label',
      saved?.chapter
        ? `Đọc tiếp ${book.title}, chương ${currentChapter}`
        : `Bắt đầu đọc ${book.title}`
    );
    readButton.addEventListener('click', event => {
      event.stopPropagation();
    });

    footer.append(detailText, readButton);
    info.appendChild(footer);
    card.append(coverArea, info);

    const openBookDetail = () => {
      window.location.href = `book.html?id=${encodeURIComponent(book.id)}`;
    };

    card.addEventListener('click', openBookDetail);

    card.addEventListener('keydown', event => {
      if (event.target !== card) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openBookDetail();
      }
    });

    container.appendChild(card);
  });

  updateBookResultStatus(list);

  const loadMoreButton = document.getElementById('loadMoreBooks');
  if (loadMoreButton) {
    const remaining = Math.max(list.length - visibleBooks.length, 0);
    loadMoreButton.hidden = remaining === 0;
    loadMoreButton.textContent = remaining > 0
      ? `Tải thêm ${Math.min(remaining, HOME_BOOK_BATCH_SIZE)} truyện`
      : 'Đã hiển thị tất cả';
  }
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
  const statusFilter = document.getElementById('bookStatusFilter')?.value || 'all';
  const lengthFilter = document.getElementById('bookLengthFilter')?.value || 'all';

  const selectedGenres = Array.from(document.querySelectorAll('#genreFilters input[type="checkbox"]:checked')).map(input => normalizeSearchText(input.value));
  const favoriteBookIds = new Set(
    getFavoriteBookIds()
  );
  const progressMap = shouldRememberProgress()
    ? loadProgressMap()
    : {};

  const filteredBooks = booksData.filter(book => {
    const searchableInformation = normalizeSearchText([
      book.title,
      book.author,
      ...getBookGenres(book)
    ].filter(Boolean).join(' '));

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

    const completed = isCompletedBook(book);
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'completed' ? completed : !completed);

    const chapterCount = getBookChapterCount(book);
    const matchesLength = lengthFilter === 'all' ||
      (lengthFilter === 'short' && chapterCount > 0 && chapterCount < 100) ||
      (lengthFilter === 'medium' && chapterCount >= 100 && chapterCount <= 500) ||
      (lengthFilter === 'long' && chapterCount > 500);

    return (
      matchesSearch &&
      matchesGenre &&
      matchesStatus &&
      matchesLength &&
      matchesLibraryView
    );
  });

  const sortedBooks = sortBookList(filteredBooks);

  const nextFilterSignature = JSON.stringify({
    query,
    selectedGenres,
    activeLibraryView,
    statusFilter,
    lengthFilter,
    sort: document.getElementById('bookSort')?.value || 'default'
  });

  if (nextFilterSignature !== homeFilterSignature) {
    homeBookDisplayLimit = HOME_BOOK_BATCH_SIZE;
    homeFilterSignature = nextFilterSignature;
  }

  renderBookList(sortedBooks);

  document.dispatchEvent(new CustomEvent('webdocsach:library-updated', {
    detail: {
      total: booksData.length,
      filtered: sortedBooks.length,
      visible: Math.min(homeBookDisplayLimit, sortedBooks.length)
    }
  }));
}

function clearBookFilters() {
  const searchInput = document.getElementById('bookSearch');

  if (searchInput) {
    searchInput.value = '';
  }

  document.querySelectorAll('#genreFilters input[type="checkbox"]').forEach(input => {
    input.checked = false;
  });

  const statusFilter = document.getElementById('bookStatusFilter');
  const lengthFilter = document.getElementById('bookLengthFilter');
  if (statusFilter) statusFilter.value = 'all';
  if (lengthFilter) lengthFilter.value = 'all';

  setLibraryView('all');
}

async function loadBooks() {
  if (!document.getElementById('book-list')) {
    return;
  }

  setHomeLoadingState(true);

  try {
    booksData = await fetchBooksData();

    if (!Array.isArray(booksData)) {
      booksData = [];
    }

    const featuredBook = booksData.find(book => book.featured === true) || booksData[0];

    renderFeaturedBook(featuredBook);
    updateHomeStats();
    renderContinueReading();
    buildGenreFilters();
    setupLibraryViewTabs();
    setupHomeLibraryControls();
    setupHomePagination();
    applyBookFilters();

    document
      .getElementById('bookSearch')?.addEventListener('input', applyBookFilters);

    document.getElementById('genreFilters')?.addEventListener('change', applyBookFilters);

    document.getElementById('clearBookFilters')?.addEventListener('click', clearBookFilters);

    document.dispatchEvent(new CustomEvent('webdocsach:books-ready', {
      detail: {
        count: booksData.length
      }
    }));
  } finally {
    setHomeLoadingState(false);
  }
}

function setHomeLoadingState(isLoading) {
  const skeleton = document.getElementById('homeLoadingSkeleton');
  const bookList = document.getElementById('book-list');

  document.body.classList.toggle('home-data-loading', isLoading);

  if (skeleton) {
    skeleton.hidden = !isLoading;
  }

  if (bookList && isLoading) {
    bookList.hidden = true;
  }
}

function setupHomePagination() {
  const button = document.getElementById('loadMoreBooks');

  if (!button || button.dataset.bound === 'true') {
    return;
  }

  button.dataset.bound = 'true';
  button.addEventListener('click', () => {
    homeBookDisplayLimit += HOME_BOOK_BATCH_SIZE;
    renderBookList(homeFilteredBooksCache);

    document.dispatchEvent(new CustomEvent('webdocsach:books-expanded', {
      detail: {
        visible: Math.min(homeBookDisplayLimit, homeFilteredBooksCache.length),
        total: homeFilteredBooksCache.length
      }
    }));
  });
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

function getChapterImage(chapterNumber) {
  const chapter = chapterIndex.find(
    item => item.number === Number(chapterNumber)
  );

  return String(chapter?.image || '').trim();
}

function fetchChapterText(chapterNumber) {
  const cacheKey = `${currentBook}:${chapterNumber}`;
  if (readerChapterTextCache.has(cacheKey)) {
    return Promise.resolve(readerChapterTextCache.get(cacheKey));
  }

  const partPath = getChapterPath(chapterNumber);
  const fallbackPath = createBookDataUrl(
    currentBook,
    `${chapterNumber}.txt`
  );

  const tryFetch = url => (
    fetch(encodeURI(url)).then(response => {
      if (!response.ok) throw response;
      return response.text();
    })
  );

  return tryFetch(partPath)
    .catch(() => tryFetch(fallbackPath))
    .then(text => {
      readerChapterTextCache.set(cacheKey, text);
      return text;
    });
}

function renderChapterLoadError(contentEl, error, chapterNumber = currentChapter) {
  const message = error && error.status
    ? `Không thể tải chương ${chapterNumber} (HTTP ${error.status})`
    : (error && error.message) ? error.message : String(error);

  contentEl.innerHTML = '';

  const errorMessage = document.createElement('p');
  errorMessage.className = 'chapter-error';
  errorMessage.textContent = `Lỗi tải chương: ${message}`;
  contentEl.appendChild(errorMessage);
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

  const chapterImage = getChapterImage(currentChapter);

  fetchChapterText(currentChapter)
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
        document.dispatchEvent(new CustomEvent('reader:chapter-rendered', {
          detail: { chapter: currentChapter, direction: '' }
        }));
      }, 180);
    })
    .catch(err => {
      contentEl.classList.remove('is-transitioning');
      contentEl.classList.add('is-visible');

      renderChapterLoadError(contentEl, err);
      document.dispatchEvent(new CustomEvent('reader:chapter-rendered', {
        detail: { chapter: currentChapter, direction: '' }
      }));
    });
}

function loadSelects() {
  const partTop = document.getElementById('partSelect');
  const chapterTop = document.getElementById('chapterSelect');
  const partLabel = document.getElementById('topPartLabel');
  const chapterLabel = document.getElementById('topChapterLabel');
  const partMenu = document.getElementById('topPartMenu');
  const chapterMenu = document.getElementById('topChapterMenu');
  if (!partTop || !chapterTop || !partLabel || !chapterLabel || !partMenu || !chapterMenu) return;

  const currentPart = chapterToPart(currentChapter);
  const availableParts = getAvailableParts();
  const chapters = getChaptersForPart(currentPart);

  partTop.dataset.value = String(currentPart);
  partLabel.textContent = `Phần ${currentPart}`;
  partMenu.innerHTML = '';

  availableParts.forEach(part => {
    partMenu.appendChild(createTocPopoverOption(
      `Phần ${part}`,
      part === currentPart,
      () => {
        const firstChapter = getChaptersForPart(part)[0];
        closeTocMenus();
        if (firstChapter) navigateToReaderChapter(firstChapter.number);
      }
    ));
  });

  chapterTop.dataset.value = String(currentChapter);
  chapterLabel.textContent = getChapterDisplayTitle(getCurrentChapterData());
  chapterMenu.innerHTML = '';

  chapters.forEach(chapter => {
    chapterMenu.appendChild(createTocPopoverOption(
      getChapterDisplayTitle(chapter),
      chapter.number === currentChapter,
      () => goToReaderChapter(chapter.number)
    ));
  });

  bindReaderMenuTrigger(partTop, partMenu);
  bindReaderMenuTrigger(chapterTop, chapterMenu);
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
  const owner = trigger.closest('.reader-toc-field, .reader-top-select-field');
  owner?.classList.toggle('is-menu-open', open);

  if (open && owner?.classList.contains('reader-top-select-field')) {
    mountTopReaderMenu(trigger, menu, owner);
  }

  menu.hidden = !open;

  if (!open && menu.classList.contains('is-portal-menu')) {
    unmountTopReaderMenu(menu);
  }
}

function mountTopReaderMenu(trigger, menu, owner) {
  const rect = trigger.getBoundingClientRect();
  const viewportGap = 12;
  const isChapterMenu = menu.classList.contains('reader-top-chapter-popover');
  const desiredWidth = isChapterMenu
    ? Math.max(rect.width, Math.min(460, window.innerWidth - viewportGap * 2))
    : Math.max(rect.width, 180);
  const width = Math.min(desiredWidth, window.innerWidth - viewportGap * 2);
  const left = Math.min(
    Math.max(viewportGap, rect.left),
    window.innerWidth - width - viewportGap
  );
  const spaceBelow = window.innerHeight - rect.bottom - viewportGap;
  const spaceAbove = rect.top - viewportGap;
  const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;

  menu._readerMenuOwner = owner;
  document.body.appendChild(menu);
  menu.classList.add('is-portal-menu');
  menu.style.width = `${width}px`;
  menu.style.left = `${left}px`;
  menu.style.right = 'auto';
  menu.style.maxHeight = `${Math.max(120, Math.min(420, openAbove ? spaceAbove - 8 : spaceBelow - 8))}px`;

  if (openAbove) {
    menu.style.top = 'auto';
    menu.style.bottom = `${window.innerHeight - rect.top + 7}px`;
  } else {
    menu.style.top = `${rect.bottom + 7}px`;
    menu.style.bottom = 'auto';
  }
}

function unmountTopReaderMenu(menu) {
  const owner = menu._readerMenuOwner;
  if (owner) owner.appendChild(menu);

  menu.classList.remove('is-portal-menu');
  menu.style.removeProperty('width');
  menu.style.removeProperty('left');
  menu.style.removeProperty('right');
  menu.style.removeProperty('top');
  menu.style.removeProperty('bottom');
  menu.style.removeProperty('max-height');
  delete menu._readerMenuOwner;
}

function closeTocMenus(exceptMenu = null) {
  [
    ['partSelect', 'topPartMenu'],
    ['chapterSelect', 'topChapterMenu'],
    ['tocPartTrigger', 'tocPartMenu'],
    ['tocChapterTrigger', 'tocChapterMenu']
  ].forEach(([triggerId, menuId]) => {
    const trigger = document.getElementById(triggerId);
    const menu = document.getElementById(menuId);
    if (menu !== exceptMenu) setTocMenuState(trigger, menu, false);
  });
}

function bindReaderMenuTrigger(trigger, menu) {
  if (!trigger || !menu || trigger.dataset.menuBound === '1') return;
  trigger.dataset.menuBound = '1';

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = menu.hidden;
    closeTocMenus(willOpen ? menu : null);
    setTocMenuState(trigger, menu, willOpen);
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
    button.dataset.chapter = String(chapter.number);
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
    if (!event.target.closest('.reader-toc-field, .reader-top-select-field')) {
      closeTocMenus();
    }
  });
}

function getReaderAdjacentChapter(direction) {
  const position = getCurrentChapterPosition();

  if (direction === 'next' && position >= 0 && position < chapterIndex.length - 1) {
    return chapterIndex[position + 1];
  }

  if (direction === 'prev' && position > 0) {
    return chapterIndex[position - 1];
  }

  return null;
}

function removeReaderPageTurn() {
  readerPageTurnState?.stage?.remove();
  readerPageTurnState = null;
  document.body.classList.remove(
    'reader-page-turning',
    'reader-swipe-active'
  );
}

function createReaderPageTurn(direction, originClientY = window.innerHeight / 2) {
  if (direction !== 'next' && direction !== 'prev') return null;

  if (readerPageTurnState?.direction === direction) {
    return readerPageTurnState;
  }

  removeReaderPageTurn();

  const paper = document.querySelector('#readerMain > .reader-paper');
  if (!paper) return null;

  const rect = paper.getBoundingClientRect();
  const paperHeight = Math.max(rect.height, paper.offsetHeight, 1);
  const visibleTop = Math.max(rect.top, 0);
  const visibleBottom = Math.min(rect.bottom, window.innerHeight);
  const visibleHeight = Math.max(visibleBottom - visibleTop, 1);
  const stage = document.createElement('div');
  const sheet = document.createElement('div');
  const paperCopy = paper.cloneNode(true);
  const shade = document.createElement('span');
  const curl = document.createElement('span');
  const sourceFlow = paper.querySelector('.reader-page-flow');
  const copiedFlow = paperCopy.querySelector('.reader-page-flow');
  const originY = Math.min(
    Math.max(visibleHeight * 0.82, originClientY - visibleTop, 28),
    Math.max(visibleHeight - 20, 28)
  );

  stage.className = `reader-page-turn-stage is-${direction}`;
  stage.setAttribute('aria-hidden', 'true');

  paperCopy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  paperCopy.removeAttribute('id');
  paperCopy.removeAttribute('aria-live');
  paperCopy.classList.add('reader-page-turn-copy');
  paperCopy.setAttribute('aria-hidden', 'true');
  paperCopy.inert = true;
  paperCopy.style.top = `${rect.top - visibleTop}px`;
  paperCopy.style.left = '0';
  paperCopy.style.width = `${rect.width}px`;
  paperCopy.style.height = `${paperHeight}px`;
  paperCopy.style.margin = '0';

  sheet.className = 'reader-page-turn-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.inert = true;
  sheet.style.top = `${visibleTop}px`;
  sheet.style.left = `${rect.left}px`;
  sheet.style.width = `${rect.width}px`;
  sheet.style.height = `${visibleHeight}px`;
  sheet.style.margin = '0';
  sheet.style.transformOrigin = `${direction === 'next' ? 'left' : 'right'} ${originY}px`;
  sheet.classList.toggle('is-clipped-top', rect.top < 0);
  sheet.classList.toggle('is-clipped-bottom', rect.bottom > window.innerHeight);

  shade.className = 'reader-page-turn-shade';
  curl.className = 'reader-page-turn-curl';
  sheet.append(paperCopy, shade);
  stage.append(sheet, curl);
  document.body.appendChild(stage);
  document.body.classList.add('reader-page-turning');

  if (sourceFlow && copiedFlow) {
    copiedFlow.scrollLeft = sourceFlow.scrollLeft;
  }

  readerPageTurnState = {
    stage,
    sheet,
    shade,
    curl,
    direction,
    left: rect.left,
    top: visibleTop,
    width: rect.width,
    height: visibleHeight,
    progress: 0
  };

  updateReaderPageTurn(readerPageTurnState, 0);
  return readerPageTurnState;
}

function updateReaderPageTurn(turn, progress) {
  if (!turn?.sheet) return;

  const normalizedProgress = Math.min(Math.max(Number(progress) || 0, 0), 1);
  const directionSign = turn.direction === 'next' ? -1 : 1;
  const curlProgress = Math.min(normalizedProgress / 0.24, 1);
  const turnProgress = Math.max((normalizedProgress - 0.12) / 0.88, 0);
  const angle = directionSign * turnProgress * 104;
  const horizontalShift = directionSign * turnProgress * 28;
  const lift = Math.sin(turnProgress * Math.PI) * -11;
  const tilt = directionSign * Math.sin(turnProgress * Math.PI) * 2.2;
  const maximumCurl = Math.min(turn.width * 0.34, turn.height * 0.27, 220);
  const curlSize = maximumCurl * curlProgress;

  turn.progress = normalizedProgress;
  turn.sheet.style.transform =
    `translate3d(${horizontalShift}px, ${lift}px, ${turnProgress * 42}px) ` +
    `rotateX(${tilt}deg) rotateY(${angle}deg)`;

  if (turn.direction === 'next') {
    turn.sheet.style.clipPath =
      `polygon(0 0, 100% 0, 100% calc(100% - ${curlSize}px), ` +
      `calc(100% - ${curlSize}px) 100%, 0 100%)`;
  } else {
    turn.sheet.style.clipPath =
      `polygon(0 0, 100% 0, 100% 100%, ${curlSize}px 100%, ` +
      `0 calc(100% - ${curlSize}px))`;
  }

  turn.curl.style.width = `${curlSize}px`;
  turn.curl.style.height = `${curlSize}px`;
  turn.curl.style.left = `${
    turn.direction === 'next'
      ? turn.left + turn.width - curlSize
      : turn.left
  }px`;
  turn.curl.style.top = `${turn.top + turn.height - curlSize}px`;
  turn.curl.style.opacity = String(
    curlProgress * Math.max(1 - turnProgress * 0.9, 0)
  );
  turn.curl.style.transform = turn.direction === 'next'
    ? `translate3d(${curlSize * 0.04}px, ${curlSize * -0.06}px, 42px) rotateZ(-5deg) rotateY(-34deg)`
    : `translate3d(${curlSize * -0.04}px, ${curlSize * -0.06}px, 42px) rotateZ(5deg) rotateY(34deg)`;
  turn.shade.style.opacity = String(Math.min(0.68, turnProgress * 0.82));
  turn.stage.style.setProperty('--reader-turn-progress', String(normalizedProgress));
  turn.stage.style.setProperty('--reader-curl-progress', String(curlProgress));
}

function settleReaderPageTurn(turn, commit) {
  if (!turn) return Promise.resolve();

  const distance = commit ? 1 - turn.progress : turn.progress;
  const reduceMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    localStorage.getItem('readerReduceMotion') === '1';
  const duration = reduceMotion
    ? 0
    : commit
      ? Math.max(320, Math.round(680 * distance))
      : Math.max(190, Math.round(360 * distance));

  turn.stage.style.setProperty('--reader-turn-duration', `${duration}ms`);
  turn.stage.classList.add('is-settling');

  window.requestAnimationFrame(() => {
    updateReaderPageTurn(turn, commit ? 1 : 0);
  });

  return new Promise(resolve => {
    window.setTimeout(() => {
      if (!commit) removeReaderPageTurn();
      resolve();
    }, duration + 35);
  });
}

function finishReaderPageTurn() {
  removeReaderPageTurn();
  document.body.classList.remove('reader-chapter-prefetching');
  document.body.removeAttribute('aria-busy');
  chapterNavigationLocked = false;
  document.dispatchEvent(new CustomEvent('reader:page-turn-finished'));
}

function renderPreparedReaderChapter(chapterNumber, direction, result) {
  const contentEl = document.getElementById('content');
  const metaEl = document.getElementById('chapterMeta');
  if (!contentEl) return;

  currentChapter = chapterNumber;
  updateURL();
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (metaEl) metaEl.hidden = true;
  contentEl.classList.remove('is-transitioning');
  contentEl.classList.add('is-visible');

  if (result.ok) {
    renderChapterContent(
      contentEl,
      result.text,
      getChapterImage(chapterNumber)
    );
  } else {
    updateReaderChapterUI();
    renderChapterLoadError(contentEl, result.error, chapterNumber);
  }

  loadedChapter = chapterNumber;
  saveProgress(currentBook, chapterNumber);
  loadSelects();
  restoreReadingPosition(currentBook, chapterNumber);
  document.dispatchEvent(new CustomEvent('reader:chapter-rendered', {
    detail: { chapter: chapterNumber, direction }
  }));
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
  saveCurrentReadingPosition();
  document.body.setAttribute('aria-busy', 'true');
  document.body.classList.add('reader-chapter-prefetching');
  const preparedChapter = fetchChapterText(targetChapter)
    .then(text => ({ ok: true, text }))
    .catch(error => ({ ok: false, error }));

  const reduceMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    localStorage.getItem('readerReduceMotion') === '1';
  const turn = reduceMotion
    ? null
    : readerPageTurnState?.direction === direction
      ? readerPageTurnState
      : createReaderPageTurn(direction);
  preparedChapter
    .then(result => {
      renderPreparedReaderChapter(targetChapter, direction, result);
      document.dispatchEvent(new CustomEvent('reader:page-turn', {
        detail: { direction, chapter: targetChapter }
      }));
      return reduceMotion
        ? Promise.resolve()
        : settleReaderPageTurn(turn, true);
    })
    .then(() => {
      finishReaderPageTurn();
    })
    .catch(() => {
      removeReaderPageTurn();
      document.body.classList.remove('reader-chapter-prefetching');
      document.body.removeAttribute('aria-busy');
      chapterNavigationLocked = false;
    });
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

  const savedFont = localStorage.getItem('fontFamily');
  const activeFont = savedFont === 'Merriweather'
    ? 'Noto Serif'
    : (savedFont || 'Noto Serif');

  if (savedFont === 'Merriweather') {
    localStorage.setItem('fontFamily', 'Noto Serif');
  }
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
    'Noto Serif': "'Noto Serif', 'Times New Roman', serif",
    Verdana: "'Verdana', 'Geneva', sans-serif"
  };

  const normalizedFontName = fontName === 'Merriweather' ? 'Noto Serif' : fontName;
  const nextFont = fontMap[normalizedFontName] ? normalizedFontName : 'Noto Serif';
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

  const selectedPart = parseInt(partSel.dataset.value || partSel.value, 10);
  const firstChapter = getChaptersForPart(selectedPart)[0];
  if (!firstChapter) return;

  navigateToReaderChapter(firstChapter.number);
}

function changeChapter() {
  const select = document.getElementById('chapterSelect');
  if (!select) return;

  navigateToReaderChapter(parseInt(select.dataset.value || select.value, 10));
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
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('book', currentBook);
  nextUrl.searchParams.set('chap', String(currentChapter));

  window.history.replaceState(
    {
      ...(window.history.state || {}),
      book: currentBook,
      chapter: currentChapter
    },
    '',
    nextUrl
  );
}

if (document.getElementById('book-list')) {
  loadBooks().catch(() => {
    booksData = [];
    renderBookList([]);
    document.dispatchEvent(new CustomEvent('webdocsach:books-error'));
  });
}

window.addEventListener('pageshow', () => {
  if (
    document.getElementById('book-list') && booksData.length > 0
  ) {
    const featuredBook = booksData.find(book => book.featured === true) || booksData[0];

    renderFeaturedBook(featuredBook);
    updateHomeStats();
    renderContinueReading();
    applyBookFilters();
  }

  if (document.body.classList.contains('reader-v2')) {
    removeReaderPageTurn();
    document.body.classList.remove(
      'reader-turn-next',
      'reader-turn-prev',
      'reader-chapter-prefetching'
    );
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

// 3. Vuốt ngang để lật toàn bộ trang trên thiết bị cảm ứng
(function setupReaderSwipeNavigation() {
  const readerStage = document.getElementById('readerMain');
  if (!readerStage || !document.body.classList.contains('reader-page')) return;

  let gesture = null;

  function shouldIgnoreSwipeTarget(target) {
    return Boolean(target?.closest?.(
      'a, button, input, select, textarea, label, [contenteditable="true"], ' +
      '.reader-side-panel, .reader-dock, .reader-header'
    ));
  }

  function dismissSwipeHint() {
    const hint = document.querySelector('.reader-swipe-hint');
    if (!hint) return;
    hint.classList.add('is-leaving');
    window.setTimeout(() => hint.remove(), 240);
  }

  function cancelGesture() {
    if (gesture?.active) {
      document.dispatchEvent(new CustomEvent('reader:swipe-preview-cancel'));
    }
    if (gesture?.turn) {
      settleReaderPageTurn(gesture.turn, false);
    }
    gesture = null;
    document.body.classList.remove('reader-swipe-active');
  }

  readerStage.addEventListener('pointerdown', event => {
    if (
      event.pointerType !== 'touch' ||
      !event.isPrimary ||
      localStorage.getItem('readerGestureEnabled') === '0' ||
      chapterNavigationLocked ||
      document.body.classList.contains('reader-panel-open') ||
      shouldIgnoreSwipeTarget(event.target) ||
      window.getSelection()?.toString()
    ) {
      return;
    }

    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      startedAt: performance.now(),
      direction: '',
      active: false,
      rejected: false,
      turn: null
    };
  }, { passive: true });

  readerStage.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.rejected) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    gesture.lastX = event.clientX;

    if (!gesture.active) {
      if (verticalDistance > 14 && verticalDistance > horizontalDistance) {
        gesture.rejected = true;
        return;
      }

      if (horizontalDistance < 12 || horizontalDistance < verticalDistance * 1.15) {
        return;
      }

      gesture.active = true;
      gesture.direction = deltaX < 0 ? 'next' : 'prev';
      gesture.turn = createReaderPageTurn(gesture.direction, gesture.startY);
      document.dispatchEvent(new CustomEvent('reader:swipe-preview', {
        detail: { direction: gesture.direction }
      }));
      document.body.classList.add('reader-swipe-active');
      dismissSwipeHint();

      try {
        readerStage.setPointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture is optional; the gesture can continue without it.
      }
    }

    const nextDirection = deltaX < 0 ? 'next' : 'prev';
    if (nextDirection !== gesture.direction) {
      gesture.direction = nextDirection;
      gesture.turn = createReaderPageTurn(nextDirection, gesture.startY);
      document.dispatchEvent(new CustomEvent('reader:swipe-preview', {
        detail: { direction: nextDirection }
      }));
    }

    if (!gesture.turn) return;

    const canNavigate = Boolean(getReaderAdjacentChapter(gesture.direction));
    const availableWidth = Math.max(readerStage.clientWidth, 280);
    let progress = Math.min(horizontalDistance / (availableWidth * 0.72), 0.72);

    if (!canNavigate) {
      progress *= 0.2;
      gesture.turn.stage.classList.add('is-edge');
    } else {
      gesture.turn.stage.classList.remove('is-edge');
    }

    updateReaderPageTurn(gesture.turn, progress);

    if (event.cancelable) event.preventDefault();
  }, { passive: false });

  readerStage.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (!gesture.active || !gesture.turn) {
      gesture = null;
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const elapsed = Math.max(performance.now() - gesture.startedAt, 1);
    const velocity = Math.abs(deltaX) / elapsed;
    const threshold = Math.min(
      Math.max(readerStage.clientWidth * 0.16, 68),
      122
    );
    const canNavigate = Boolean(getReaderAdjacentChapter(gesture.direction));
    const shouldCommit = canNavigate && (
      Math.abs(deltaX) >= threshold ||
      (Math.abs(deltaX) >= 38 && velocity >= 0.55)
    );
    const direction = gesture.direction;
    const turn = gesture.turn;

    gesture = null;
    document.body.classList.remove('reader-swipe-active');

    if (shouldCommit) {
      if ('vibrate' in navigator && localStorage.getItem('readerHapticsEnabled') !== '0') {
        navigator.vibrate(8);
      }
      if (direction === 'next') nextChapter();
      else prevChapter();
      return;
    }

    if (!canNavigate) {
      if ('vibrate' in navigator && localStorage.getItem('readerHapticsEnabled') !== '0') {
        navigator.vibrate(16);
      }
    }

    document.dispatchEvent(new CustomEvent('reader:swipe-preview-cancel'));
    settleReaderPageTurn(turn, false);
  }, { passive: true });

  readerStage.addEventListener('pointercancel', cancelGesture, { passive: true });
  window.addEventListener('blur', cancelGesture);

  const canShowHint = window.matchMedia(
    '(max-width: 900px), (pointer: coarse)'
  ).matches;

  if (canShowHint) {
    let hintWasSeen = false;
    try {
      hintWasSeen = localStorage.getItem('readerSwipeHintSeen') === '1';
    } catch (error) {
      hintWasSeen = false;
    }

    if (!hintWasSeen) {
      const hint = document.createElement('div');
      hint.className = 'reader-swipe-hint';
      hint.setAttribute('role', 'status');
      hint.innerHTML =
        '<span aria-hidden="true">←</span>' +
        '<strong>Vuốt để chuyển chương</strong>' +
        '<span aria-hidden="true">→</span>';
      document.body.appendChild(hint);

      window.setTimeout(() => hint.classList.add('is-visible'), 900);
      window.setTimeout(dismissSwipeHint, 5200);

      try {
        localStorage.setItem('readerSwipeHintSeen', '1');
      } catch (error) {
        // The hint simply appears again when storage is unavailable.
      }
    }
  }
})();

// 4. Cập nhật link trang chi tiết truyện
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
