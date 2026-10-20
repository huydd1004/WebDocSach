const READING_PROGRESS_KEY = 'readingProgress';
const REMEMBER_PROGRESS_KEY = 'rememberReadingPosition';
const CHAPTERS_PER_PAGE = 100;

let selectedBookId = '';
let availableChapters = [];
let currentChapterPage = 1;

function getBookIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || '';
}

async function fetchBookList() {
    const response = await fetch('data/books.json');

    if (!response.ok) {
        throw new Error('Không thể tải danh sách truyện');
    }

    return response.json();
}

async function fetchChapterIndex(bookId) {
    try {
        const path = `data/${bookId}/chapters.json`;
        const response = await fetch(encodeURI(path));

        if (!response.ok) {
            return [];
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            return [];
        }

        return data
            .map(chapter => ({
                number: Number(chapter?.number),
                title: String(chapter?.title || '').trim()
            }))
            .filter(chapter => (
                Number.isInteger(chapter.number) && chapter.number > 0
            ))
            .sort((first, second) => first.number - second.number);
    } catch (error) {
        return [];
    }
}

function getSavedChapter(bookId) {
    if (localStorage.getItem(REMEMBER_PROGRESS_KEY) === '0') {
        return null;
    }

    try {
        const progress = JSON.parse(
            localStorage.getItem(READING_PROGRESS_KEY) || '{}'
        );

        const chapter = Number(progress[bookId]?.chapter);
        return chapter > 0 ? chapter : null;
    } catch (error) {
        return null;
    }
}

function formatGenres(genre) {
    if (Array.isArray(genre) && genre.length > 0) {
        return genre.join(', ');
    }

    if (typeof genre === 'string' && genre.trim()) {
        return genre;
    }

    return 'Chưa cập nhật';
}

function createReaderUrl(bookId, chapter) {
    const params = new URLSearchParams({
        book: bookId,
        chap: String(chapter)
    });

    return `reader.html?${params.toString()}`;
}

function getTotalChapterPages() {
    return Math.ceil(availableChapters.length / CHAPTERS_PER_PAGE);
}

function renderChapterPage(page) {
    const chapterList = document.getElementById('chapterList');
    const pageSelect = document.getElementById('chapterPageSelect');
    const previousButton = document.getElementById('previousChapterPage');
    const nextButton = document.getElementById('nextChapterPage');
    const rangeSummary = document.getElementById('chapterRangeSummary');

    if (!chapterList || availableChapters.length === 0) {
        return;
    }

    const totalPages = getTotalChapterPages();

    currentChapterPage = Math.min(
        Math.max(Number(page) || 1, 1),
        totalPages
    );

    const startIndex = (currentChapterPage - 1) * CHAPTERS_PER_PAGE;
    const chaptersOnPage = availableChapters.slice(
        startIndex,
        startIndex + CHAPTERS_PER_PAGE
    );

    const savedChapter = getSavedChapter(selectedBookId);
    const fragment = document.createDocumentFragment();

    chaptersOnPage.forEach(chapter => {
        const link = document.createElement('a');

        link.className = 'chapter-link';
        link.href = createReaderUrl(selectedBookId, chapter.number);
        link.textContent = chapter.title || `Chương ${chapter.number}`;

        if (chapter.number === savedChapter) {
            link.classList.add('is-current');
            link.setAttribute('aria-current', 'page');
            link.title = 'Chương đang đọc';
        }

        fragment.appendChild(link);
    });

    chapterList.replaceChildren(fragment);

    pageSelect.value = String(currentChapterPage);
    previousButton.disabled = currentChapterPage === 1;
    nextButton.disabled = currentChapterPage === totalPages;

    const firstChapter = chaptersOnPage[0]?.number;
    const lastChapter = chaptersOnPage.at(-1)?.number;

    rangeSummary.textContent = firstChapter && lastChapter
        ? `Chương ${firstChapter}–${lastChapter} / ` +
          `${availableChapters.length.toLocaleString('vi-VN')} chương`
        : '';
}

function initializeChapterList(bookId, chapters) {
    const section = document.getElementById('chapterSection');
    const pageSelect = document.getElementById('chapterPageSelect');
    const previousButton = document.getElementById('previousChapterPage');
    const nextButton = document.getElementById('nextChapterPage');

    if (!section || !pageSelect || chapters.length === 0) {
        return;
    }

    selectedBookId = bookId;
    availableChapters = chapters;

    const totalPages = getTotalChapterPages();
    const options = document.createDocumentFragment();

    for (let page = 1; page <= totalPages; page += 1) {
        const startIndex = (page - 1) * CHAPTERS_PER_PAGE;
        const firstChapter = availableChapters[startIndex]?.number;
        const lastChapter = availableChapters[
            Math.min(startIndex + CHAPTERS_PER_PAGE, availableChapters.length) - 1
        ]?.number;

        const option = document.createElement('option');

        option.value = String(page);
        option.textContent =
            `Chương ${firstChapter}–${lastChapter}`;

        options.appendChild(option);
    }

    pageSelect.replaceChildren(options);

    const savedChapter = getSavedChapter(bookId);
    const savedChapterIndex = availableChapters.findIndex(
        chapter => chapter.number === savedChapter
    );

    currentChapterPage = savedChapterIndex >= 0
        ? Math.floor(savedChapterIndex / CHAPTERS_PER_PAGE) + 1
        : 1;

    previousButton.addEventListener('click', () => {
        renderChapterPage(currentChapterPage - 1);
    });

    nextButton.addEventListener('click', () => {
        renderChapterPage(currentChapterPage + 1);
    });

    pageSelect.addEventListener('change', event => {
        renderChapterPage(Number(event.target.value));
    });

    renderChapterPage(currentChapterPage);
    section.hidden = false;
}

function showError(message) {
    const status = document.getElementById('detailStatus');
    status.textContent = message;
    status.classList.add('is-error');
}

function renderBookDetail(book, chapters) {
    const status = document.getElementById('detailStatus');
    const detail = document.getElementById('bookDetail');

    const cover = document.getElementById('detailCover');
    cover.src = book.cover;
    cover.alt = `Bìa truyện ${book.title}`;

    document.getElementById('detailTitle').textContent = book.title;
    document.getElementById('detailAuthor').textContent = 
        book.author ? `Tác giả: ${book.author}` : 'Chưa cập nhật tác giả';

    document.getElementById('detailBookStatus').textContent = 
        book.status || 'Đang cập nhật';

    const totalChapters = chapters.length;

    document.getElementById('detailChapterCount').textContent = 
        totalChapters > 0 
            ? `${totalChapters.toLocaleString('vi-VN')} chương`
            : 'Chưa rõ số chương';
    document.getElementById('detailGenres').textContent = formatGenres(book.genre);
    document.getElementById('detailDate').textContent = book.date || 'Chưa cập nhật';
    document.getElementById('detailDescription').textContent = book.description ||
        'Phần giới thiệu của truyện đang được cập nhật. Bạn có thể bắt đầu đọc ngay để khám phá nội dung.';

    const startButton = document.getElementById('startReadingButton');
    startButton.href = createReaderUrl(book.id, chapters[0]?.number || 1);

    const savedChapter = getSavedChapter(book.id);
    const continueButton = document.getElementById('continueReadingButton');

    if (savedChapter) {
        const savedChapterExists = chapters.some(
            chapter => chapter.number === savedChapter
        );
        const validChapter = savedChapterExists
            ? savedChapter
            : chapters[0]?.number || savedChapter;

        continueButton.href = createReaderUrl(book.id, validChapter);
        continueButton.textContent = `Đọc tiếp chương ${validChapter}`;
        continueButton.hidden = false;
    }

    document.title = `${book.title} | Thư Viện Truyện`;

    initializeChapterList(book.id, chapters);

    status.hidden = true;
    detail.hidden = false;
}

async function loadBookDetail() {
    const bookId = getBookIdFromUrl();

    if (!bookId) {
        showError('Đường dẫn truyện không hợp lệ');
        return;
    }

    try {
        const [books, chapters] = await Promise.all([
            fetchBookList(),
            fetchChapterIndex(bookId)
        ]);

        const book = books.find(item => item.id === bookId);

        if (!book) {
            showError('Không tìm thấy truyện này.');
            return;
        }

        renderBookDetail(book, chapters);
    } catch (error) {
        showError('Không thể tải thông tin truyện. Vui lòng thử lại.');
    }
}

loadBookDetail();
