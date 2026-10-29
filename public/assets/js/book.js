const READING_PROGRESS_KEY = 'readingProgress';
const REMEMBER_PROGRESS_KEY = 'rememberReadingPosition';
const FAVORITE_BOOKS_KEY = 'favoriteBooks';
const CHAPTERS_PER_PAGE = 50;
const CHAPTERS_PER_PART = 200;

const { createDataUrl, createBookDataUrl } = window.WebDocSachData;

let selectedBookId = '';
let selectedBook = null;
let catalogBooks = [];
let availableChapters = [];
let currentChapterPage = 1;
let selectedChapterPart = 'all';
let chapterReadFilter = 'all';
let chapterSortOrder = 'asc';
let chapterSearchQuery = '';
let toastTimer = 0;

function getBookIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id') || '';
}

async function fetchBookList() {
  const response = await fetch(createDataUrl('books.json'));
  if (!response.ok) throw new Error('Không thể tải danh sách truyện');
  return response.json();
}

async function fetchChapterIndex(bookId) {
  try {
    const response = await fetch(encodeURI(createBookDataUrl(bookId, 'chapters.json')));
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .map(chapter => ({
        number: Number(chapter?.number),
        title: String(chapter?.title || '').trim()
      }))
      .filter(chapter => Number.isInteger(chapter.number) && chapter.number > 0)
      .sort((first, second) => first.number - second.number);
  } catch (_) {
    return [];
  }
}

function loadProgressMap() {
  if (localStorage.getItem(REMEMBER_PROGRESS_KEY) === '0') return {};
  try {
    const value = JSON.parse(localStorage.getItem(READING_PROGRESS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
}

function getBookProgress(bookId) {
  const progress = loadProgressMap()[bookId];
  return progress && Number(progress.chapter) > 0 ? progress : null;
}

function getSavedChapter(bookId) {
  return Number(getBookProgress(bookId)?.chapter) || null;
}

function clearBookProgress(bookId) {
  try {
    const map = JSON.parse(localStorage.getItem(READING_PROGRESS_KEY) || '{}');
    if (!map || typeof map !== 'object') return;
    delete map[bookId];
    localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(map));
  } catch (_) {}
}

function normalizeGenres(genre) {
  const values = Array.isArray(genre) ? genre : String(genre || '').split(/[,;]+/);
  const unique = new Map();
  values.map(value => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean).forEach(value => {
    unique.set(value.toLocaleLowerCase('vi-VN'), value);
  });
  return [...unique.values()];
}

function createReaderUrl(bookId, chapter) {
  const params = new URLSearchParams({ book: bookId, chap: String(chapter) });
  return `reader.html?${params.toString()}`;
}

function createBookUrl(bookId) {
  return `book.html?${new URLSearchParams({ id: bookId }).toString()}`;
}

function showToast(message) {
  const toast = document.getElementById('detailToast');
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.querySelector('p').textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2800);
}

function normalizeChapterSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

function getChapterPart(chapterNumber) {
  return Math.floor((Number(chapterNumber) - 1) / CHAPTERS_PER_PART) + 1;
}

function getVisibleChapters() {
  const normalizedQuery = normalizeChapterSearch(chapterSearchQuery);
  const savedChapter = getSavedChapter(selectedBookId);

  const filtered = availableChapters.filter(chapter => {
    if (selectedChapterPart !== 'all' && getChapterPart(chapter.number) !== Number(selectedChapterPart)) return false;
    if (chapterReadFilter === 'read' && (!savedChapter || chapter.number > savedChapter)) return false;
    if (chapterReadFilter === 'unread' && savedChapter && chapter.number <= savedChapter) return false;
    if (!normalizedQuery) return true;
    return normalizeChapterSearch(`${chapter.number} ${chapter.title || ''}`).includes(normalizedQuery);
  });

  return filtered.sort((first, second) => chapterSortOrder === 'desc'
    ? second.number - first.number
    : first.number - second.number);
}

function getCleanChapterTitle(chapter) {
  const title = String(chapter.title || '')
    .replace(/^Chương\s*\d+\s*[:\-]?\s*/i, '')
    .trim();
  return title || `Chương ${chapter.number}`;
}

function getFullChapterTitle(chapter) {
  const chapterLabel = `Chương ${chapter.number}`;
  const cleanTitle = getCleanChapterTitle(chapter);
  return cleanTitle.toLocaleLowerCase('vi') === chapterLabel.toLocaleLowerCase('vi')
    ? chapterLabel
    : `${chapterLabel}: ${cleanTitle}`;
}

function createChapterLink(chapter, savedChapter) {
  const link = document.createElement('a');
  const number = document.createElement('span');
  const title = document.createElement('strong');
  const state = document.createElement('i');

  link.className = 'chapter-link';
  link.href = createReaderUrl(selectedBookId, chapter.number);
  number.className = 'chapter-link-number';
  number.textContent = String(chapter.number).padStart(3, '0');
  title.className = 'chapter-link-title';
  title.textContent = getFullChapterTitle(chapter);
  state.className = 'chapter-link-state';
  state.setAttribute('aria-hidden', 'true');
  link.append(number, title, state);

  if (savedChapter && chapter.number < savedChapter) {
    link.classList.add('is-read');
    link.title = 'Đã đọc';
  }
  if (chapter.number === savedChapter) {
    link.classList.add('is-current');
    link.setAttribute('aria-current', 'page');
    link.title = 'Chương đang đọc';
  }
  return link;
}

function renderLatestChapters(bookId, chapters) {
  const container = document.getElementById('latestChapterList');
  if (!container) return;
  const fragment = document.createDocumentFragment();

  chapters.slice(-5).reverse().forEach((chapter, index) => {
    const link = document.createElement('a');
    const number = document.createElement('span');
    const title = document.createElement('strong');
    link.className = 'latest-chapter-link';
    link.href = createReaderUrl(bookId, chapter.number);
    link.setAttribute('aria-label', `Đọc chương ${chapter.number}: ${getCleanChapterTitle(chapter)}`);
    number.className = 'latest-chapter-number';
    number.textContent = `Chương ${chapter.number}`;
    title.className = 'latest-chapter-title';
    title.textContent = getCleanChapterTitle(chapter);
    link.append(number, title);

    if (index === 0) {
      const badge = document.createElement('span');
      badge.className = 'latest-chapter-badge';
      badge.textContent = 'MỚI NHẤT';
      link.appendChild(badge);
    }
    fragment.appendChild(link);
  });
  container.replaceChildren(fragment);
}

function rebuildChapterPageOptions(chapters, totalPages) {
  const pageSelect = document.getElementById('chapterPageSelect');
  const options = document.createDocumentFragment();

  for (let page = 1; page <= totalPages; page += 1) {
    const start = (page - 1) * CHAPTERS_PER_PAGE;
    const group = chapters.slice(start, start + CHAPTERS_PER_PAGE);
    const first = group[0]?.number;
    const last = group[group.length - 1]?.number;
    const option = document.createElement('option');
    option.value = String(page);
    option.textContent = first && last ? `Chương ${first}–${last}` : `Nhóm ${page}`;
    options.appendChild(option);
  }

  pageSelect.replaceChildren(options);
  pageSelect.disabled = totalPages <= 1;
  if (totalPages) pageSelect.value = String(currentChapterPage);
}

function renderChapterExplorer(options = {}) {
  const chapterList = document.getElementById('chapterList');
  const pagination = document.querySelector('.chapter-pagination');
  const pageSelect = document.getElementById('chapterPageSelect');
  const previousButton = document.getElementById('previousChapterPage');
  const nextButton = document.getElementById('nextChapterPage');
  const rangeSummary = document.getElementById('chapterRangeSummary');
  const clearButton = document.getElementById('clearChapterSearch');
  const searchStatus = document.getElementById('chapterSearchStatus');
  const chapters = getVisibleChapters();

  if (options.resetPage) currentChapterPage = 1;
  const totalPages = Math.ceil(chapters.length / CHAPTERS_PER_PAGE);
  currentChapterPage = totalPages ? Math.min(Math.max(currentChapterPage, 1), totalPages) : 1;
  rebuildChapterPageOptions(chapters, totalPages);

  const start = (currentChapterPage - 1) * CHAPTERS_PER_PAGE;
  const pageChapters = chapters.slice(start, start + CHAPTERS_PER_PAGE);
  const savedChapter = getSavedChapter(selectedBookId);
  const fragment = document.createDocumentFragment();

  pageChapters.forEach(chapter => fragment.appendChild(createChapterLink(chapter, savedChapter)));
  if (!chapters.length) {
    const empty = document.createElement('div');
    empty.className = 'chapter-search-empty';
    empty.innerHTML = '<strong>Không có chương phù hợp</strong><span>Hãy thử đổi bộ lọc hoặc từ khóa tìm kiếm.</span>';
    fragment.appendChild(empty);
  }
  chapterList.replaceChildren(fragment);

  const firstChapter = pageChapters[0]?.number;
  const lastChapter = pageChapters[pageChapters.length - 1]?.number;
  rangeSummary.textContent = firstChapter && lastChapter
    ? `Chương ${firstChapter}–${lastChapter} · ${chapters.length.toLocaleString('vi-VN')} kết quả`
    : '0 chương phù hợp';
  searchStatus.textContent = chapterSearchQuery
    ? `Tìm thấy ${chapters.length.toLocaleString('vi-VN')} chương phù hợp.`
    : `${chapters.length.toLocaleString('vi-VN')} chương đang hiển thị theo bộ lọc.`;
  clearButton.hidden = !chapterSearchQuery;
  pagination.hidden = totalPages <= 1;
  previousButton.disabled = currentChapterPage <= 1;
  nextButton.disabled = currentChapterPage >= totalPages;
  pageSelect.value = totalPages ? String(currentChapterPage) : '';
}

function populateChapterParts(chapters) {
  const select = document.getElementById('chapterPartSelect');
  const parts = [...new Set(chapters.map(chapter => getChapterPart(chapter.number)))];
  const fragment = document.createDocumentFragment();
  fragment.appendChild(new Option('Tất cả các phần', 'all'));
  parts.forEach(part => {
    const partChapters = chapters.filter(chapter => getChapterPart(chapter.number) === part);
    const first = partChapters[0]?.number;
    const last = partChapters[partChapters.length - 1]?.number;
    fragment.appendChild(new Option(`Phần ${part} · Chương ${first}–${last}`, String(part)));
  });
  select.replaceChildren(fragment);
}

function initializeChapterList(bookId, chapters) {
  const section = document.getElementById('chapterSection');
  if (!section || !chapters.length) return;

  selectedBookId = bookId;
  availableChapters = chapters;
  renderLatestChapters(bookId, chapters);
  populateChapterParts(chapters);

  const savedChapter = getSavedChapter(bookId);
  const savedIndex = availableChapters.findIndex(chapter => chapter.number === savedChapter);
  currentChapterPage = savedIndex >= 0 ? Math.floor(savedIndex / CHAPTERS_PER_PAGE) + 1 : 1;

  document.getElementById('chapterSearchInput').addEventListener('input', event => {
    chapterSearchQuery = event.target.value;
    renderChapterExplorer({ resetPage: true });
  });
  document.getElementById('clearChapterSearch').addEventListener('click', () => {
    const input = document.getElementById('chapterSearchInput');
    input.value = '';
    chapterSearchQuery = '';
    renderChapterExplorer({ resetPage: true });
    input.focus();
  });
  document.getElementById('chapterPartSelect').addEventListener('change', event => {
    selectedChapterPart = event.target.value;
    renderChapterExplorer({ resetPage: true });
  });
  document.getElementById('chapterSortSelect').addEventListener('change', event => {
    chapterSortOrder = event.target.value;
    renderChapterExplorer({ resetPage: true });
  });
  document.querySelectorAll('[data-chapter-filter]').forEach(button => {
    button.addEventListener('click', () => {
      chapterReadFilter = button.dataset.chapterFilter;
      document.querySelectorAll('[data-chapter-filter]').forEach(item => {
        item.classList.toggle('is-active', item === button);
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
      renderChapterExplorer({ resetPage: true });
    });
  });
  document.getElementById('previousChapterPage').addEventListener('click', () => {
    currentChapterPage -= 1;
    renderChapterExplorer();
  });
  document.getElementById('nextChapterPage').addEventListener('click', () => {
    currentChapterPage += 1;
    renderChapterExplorer();
  });
  document.getElementById('chapterPageSelect').addEventListener('change', event => {
    currentChapterPage = Number(event.target.value) || 1;
    renderChapterExplorer();
  });

  renderChapterExplorer();
  section.hidden = false;
}

function getFavoriteBookIds() {
  try {
    const favorites = JSON.parse(localStorage.getItem(FAVORITE_BOOKS_KEY) || '[]');
    return Array.isArray(favorites) ? favorites : [];
  } catch (_) {
    return [];
  }
}

function saveFavoriteBookIds(bookIds) {
  try { localStorage.setItem(FAVORITE_BOOKS_KEY, JSON.stringify(bookIds)); } catch (_) {}
}

function updateFavoriteControls(bookId) {
  const isFavorite = getFavoriteBookIds().includes(bookId);
  const button = document.getElementById('favoriteButton');
  const mobileButton = document.getElementById('mobileFavoriteButton');
  button.classList.toggle('is-favorite', isFavorite);
  button.setAttribute('aria-pressed', String(isFavorite));
  document.getElementById('favoriteButtonLabel').textContent = isFavorite ? 'Đã yêu thích' : 'Thêm vào yêu thích';
  mobileButton.classList.toggle('is-favorite', isFavorite);
  mobileButton.setAttribute('aria-pressed', String(isFavorite));
  mobileButton.querySelector('span').textContent = isFavorite ? 'Đã lưu' : 'Yêu thích';
}

function toggleFavorite(bookId) {
  const favorites = getFavoriteBookIds();
  const isFavorite = favorites.includes(bookId);
  saveFavoriteBookIds(isFavorite ? favorites.filter(id => id !== bookId) : [...favorites, bookId]);
  updateFavoriteControls(bookId);
  showToast(isFavorite ? 'Đã bỏ truyện khỏi tủ yêu thích' : 'Đã thêm truyện vào tủ yêu thích');
}

function setupFavoriteButtons(bookId) {
  document.getElementById('favoriteButton').addEventListener('click', () => toggleFavorite(bookId));
  document.getElementById('mobileFavoriteButton').addEventListener('click', () => toggleFavorite(bookId));
  updateFavoriteControls(bookId);
}

async function shareBook(book) {
  const shareData = { title: book.title, text: `Đọc “${book.title}” tại Thư Viện Truyện`, url: window.location.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    showToast('Đã sao chép đường dẫn truyện');
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Không thể chia sẻ. Hãy sao chép đường dẫn trên trình duyệt.');
  }
}

function setupShareButtons(book) {
  document.getElementById('shareBookButton').addEventListener('click', () => shareBook(book));
  document.getElementById('mobileShareButton').addEventListener('click', () => shareBook(book));
}

function renderGenres(genre) {
  const container = document.getElementById('detailGenres');
  const genres = normalizeGenres(genre);
  const fragment = document.createDocumentFragment();
  (genres.length ? genres : ['Chưa cập nhật']).forEach(genreName => {
    const tag = document.createElement('span');
    tag.textContent = genreName;
    fragment.appendChild(tag);
  });
  container.replaceChildren(fragment);
}

function renderDescription(description) {
  const content = document.getElementById('detailDescription');
  const toggle = document.getElementById('toggleDescriptionButton');
  const text = description || 'Phần giới thiệu của truyện đang được cập nhật. Bạn có thể bắt đầu đọc ngay để khám phá nội dung.';
  content.textContent = text;
  content.classList.add('is-collapsed');
  toggle.hidden = text.length < 300;
  toggle.textContent = 'Xem thêm';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const expanded = content.classList.toggle('is-expanded');
    content.classList.toggle('is-collapsed', !expanded);
    toggle.textContent = expanded ? 'Thu gọn' : 'Xem thêm';
    toggle.setAttribute('aria-expanded', String(expanded));
  });
}

function syncReadingActions(book, chapters) {
  const startButton = document.getElementById('startReadingButton');
  const startLabel = startButton.querySelector('span');
  const continueButton = document.getElementById('continueReadingButton');
  const continueLabel = continueButton.querySelector('span');
  const mobileContinue = document.getElementById('mobileContinueButton');
  const savedChapter = getSavedChapter(book.id);
  const firstChapter = chapters[0]?.number;

  if (!firstChapter) {
    startButton.removeAttribute('href');
    startButton.classList.add('is-disabled');
    startButton.setAttribute('aria-disabled', 'true');
    startLabel.textContent = 'Chưa có chương';
    continueButton.hidden = true;
    mobileContinue.removeAttribute('href');
    mobileContinue.classList.add('is-disabled');
    return;
  }

  startButton.href = createReaderUrl(book.id, firstChapter);
  startButton.classList.remove('is-disabled');
  startButton.removeAttribute('aria-disabled');
  startLabel.textContent = 'Đọc từ đầu';
  const validSavedChapter = chapters.some(chapter => chapter.number === savedChapter) ? savedChapter : null;
  const targetChapter = validSavedChapter || firstChapter;
  mobileContinue.href = createReaderUrl(book.id, targetChapter);
  mobileContinue.classList.remove('is-disabled');
  mobileContinue.querySelector('span').textContent = validSavedChapter ? 'Đọc tiếp' : 'Đọc ngay';

  continueButton.hidden = !validSavedChapter;
  if (validSavedChapter) {
    continueButton.href = createReaderUrl(book.id, validSavedChapter);
    continueLabel.textContent = `Đọc tiếp chương ${validSavedChapter}`;
  }
}

function renderReadingJourney(book, chapters) {
  const section = document.getElementById('readingJourney');
  if (!chapters.length) return;
  const progress = getBookProgress(book.id);
  const savedChapter = Number(progress?.chapter) || null;
  const savedIndex = chapters.findIndex(chapter => chapter.number === savedChapter);
  const scrollRatio = Math.min(Math.max(Number(progress?.scrollRatio) || 0, 0), 1);
  const progressRatio = savedIndex >= 0 ? (savedIndex + scrollRatio) / chapters.length : 0;
  const percent = Math.min(Math.max(Math.round(progressRatio * 100), 0), 100);
  const targetChapter = savedIndex >= 0 ? savedChapter : chapters[0].number;
  const title = document.getElementById('readingJourneyTitle');
  const text = document.getElementById('readingJourneyText');
  const bar = document.getElementById('readingJourneyBar');
  const progressElement = bar.parentElement;
  const continueButton = document.getElementById('journeyContinueButton');
  const resetButton = document.getElementById('resetReadingProgress');

  title.textContent = savedIndex >= 0 ? `Gần nhất: Chương ${savedChapter}` : 'Sẵn sàng bắt đầu';
  text.textContent = savedIndex >= 0
    ? `Bạn đã đi qua khoảng ${percent}% câu chuyện · ${savedIndex + 1}/${chapters.length.toLocaleString('vi-VN')} chương`
    : `${chapters.length.toLocaleString('vi-VN')} chương đang chờ bạn khám phá.`;
  bar.style.width = `${percent}%`;
  progressElement.setAttribute('aria-valuenow', String(percent));
  continueButton.href = createReaderUrl(book.id, targetChapter);
  continueButton.querySelector('span').textContent = savedIndex >= 0 ? `Tiếp tục chương ${savedChapter}` : 'Bắt đầu đọc';
  resetButton.hidden = savedIndex < 0;
  section.hidden = false;
}

function setupJourneyReset(book, chapters) {
  document.getElementById('resetReadingProgress').addEventListener('click', () => {
    clearBookProgress(book.id);
    syncReadingActions(book, chapters);
    renderReadingJourney(book, chapters);
    renderChapterExplorer();
    showToast('Đã đặt lại tiến độ đọc');
  });
}

function renderRelatedBooks(books, currentBook) {
  const currentGenres = new Set(normalizeGenres(currentBook.genre).map(value => value.toLocaleLowerCase('vi-VN')));
  const related = books
    .filter(book => book?.id && book.id !== currentBook.id)
    .map(book => ({
      book,
      score: normalizeGenres(book.genre).reduce((total, genre) => total + (currentGenres.has(genre.toLocaleLowerCase('vi-VN')) ? 1 : 0), 0)
    }))
    .filter(item => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 4);

  if (!related.length) return;
  const container = document.getElementById('relatedBooksList');
  const fragment = document.createDocumentFragment();
  related.forEach(({ book }) => {
    const card = document.createElement('a');
    const image = document.createElement('img');
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    const meta = document.createElement('small');
    card.className = 'related-book-card';
    card.href = createBookUrl(book.id);
    image.src = book.cover;
    image.alt = `Bìa truyện ${book.title}`;
    image.loading = 'lazy';
    title.textContent = book.title || book.id;
    meta.textContent = `${book.author || 'Đang cập nhật'} · ${normalizeGenres(book.genre)[0] || 'Truyện chữ'}`;
    copy.append(title, meta);
    card.append(image, copy);
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
  document.getElementById('relatedBooksSection').hidden = false;
}

function setupMobileActions() {
  document.getElementById('mobileTocButton').addEventListener('click', () => {
    document.getElementById('chapterSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('mobileBookActions').hidden = false;
}

function updateDocumentMetadata(book) {
  document.title = `${book.title} | Thư Viện Truyện`;
  document.getElementById('bookMetaDescription').content = String(book.description || `Đọc ${book.title} tại Thư Viện Truyện`).slice(0, 155);
}

function renderBookDetail(book, chapters, books) {
  const cover = document.getElementById('detailCover');
  const backdrop = document.getElementById('detailBackdrop');
  cover.src = book.cover;
  cover.alt = `Bìa truyện ${book.title}`;
  backdrop.src = book.cover;
  cover.addEventListener('load', () => document.getElementById('bookDetail').classList.add('is-cover-loaded'), { once: true });

  document.getElementById('detailTitle').textContent = book.title;
  document.getElementById('detailAuthor').textContent = book.author ? `Tác giả · ${book.author}` : 'Tác giả đang cập nhật';
  document.getElementById('detailBookStatus').textContent = book.status || 'Đang cập nhật';
  document.getElementById('detailChapterCount').textContent = chapters.length
    ? `${chapters.length.toLocaleString('vi-VN')} chương`
    : 'Chưa có chương';
  document.getElementById('detailDate').textContent = book.date || 'Chưa cập nhật';

  renderGenres(book.genre);
  renderDescription(book.description);
  syncReadingActions(book, chapters);
  setupFavoriteButtons(book.id);
  setupShareButtons(book);
  renderReadingJourney(book, chapters);
  setupJourneyReset(book, chapters);
  initializeChapterList(book.id, chapters);
  renderRelatedBooks(books, book);
  setupMobileActions();
  updateDocumentMetadata(book);

  document.getElementById('detailStatus').hidden = true;
  document.getElementById('bookDetail').hidden = false;
}

function showError(message) {
  const status = document.getElementById('detailStatus');
  status.replaceChildren(document.createTextNode(message));
  status.classList.add('is-error');
}

async function loadBookDetail() {
  const bookId = getBookIdFromUrl();
  if (!bookId) {
    showError('Đường dẫn truyện không hợp lệ');
    return;
  }

  try {
    const [books, chapters] = await Promise.all([fetchBookList(), fetchChapterIndex(bookId)]);
    const book = books.find(item => item.id === bookId);
    if (!book) {
      showError('Không tìm thấy truyện này.');
      return;
    }
    selectedBook = book;
    catalogBooks = books;
    renderBookDetail(book, chapters, books);
  } catch (_) {
    showError('Không thể tải thông tin truyện. Vui lòng thử lại.');
  }
}

loadBookDetail();
