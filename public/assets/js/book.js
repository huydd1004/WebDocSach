const READING_PROGRESS_KEY = 'readingProgress';
const REMEMBER_PROGRESS_KEY = 'rememberReadingPosition';

function getBookIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || '';
}

async function fetchBookList() {
    try {
        const reponse = await fetch('/api/books');

        if (!reponse.ok) {
            throw new Error('API không phản hồi');
        }

        return await reponse.json();
    } catch (error) {
        const response = await fetch('data/books.json');

        if (!response.ok) {
            throw new Error('Không thể tải danh sách truyện');
        }

        return response.json();
    }
}

async function fetchChapterTotal(bookId) {
    try {
        const path = `data/${bookId}/index.json`;
        const response = await fetch(encodeURI(path));

        if (!response.ok) {
            return 0;
        }

        const data = await response.json();
        return Number(data.total) || 0;
    } catch (error) {
        return 0;
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

function showError(message) {
    const status = document.getElementById('detailStatus');
    status.textContent = message;
    status.classList.add('is-error');
}

function renderBookDetail(book, totalChapters) {
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

    document.getElementById('detailChapterCount').textContent = 
        totalChapters > 0 
            ? `${totalChapters.toLocaleString('vi-VN')} chương`
            : 'Chưa rõ số chương';
    document.getElementById('detailGenres').textContent = formatGenres(book.genre);
    document.getElementById('detailDate').textContent = book.date || 'Chưa cập nhật';
    document.getElementById('detailDescription').textContent = book.description ||
        'Phần giới thiệu của truyện đang được cập nhật. Bạn có thể bắt đầu đọc ngay để khám phá nội dung.';

    const startButton = document.getElementById('startReadingButton');
    startButton.href = createReaderUrl(book.id, 1);

    const savedChapter = getSavedChapter(book.id);
    const continueButton = document.getElementById('continueReadingButton');

    if (savedChapter) {
        const validChapter = totalChapters > 0
            ? Math.min(savedChapter, totalChapters)
            : savedChapter;

        continueButton.href = createReaderUrl(book.id, validChapter);
        continueButton.textContent = `Đọc tiếp chương ${validChapter}`;
        continueButton.hidden = false;
    }

    document.title = `${book.title} | Thư Viện Truyện`;

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
        const [books, totalChapters] = await Promise.all([
            fetchBookList(),
            fetchChapterTotal(bookId)
        ]);

        const book = books.find(item => item.id === bookId);

        if (!book) {
            showError('Không tìm thấy truyện này.');
            return;
        }

        renderBookDetail(book, totalChapters);
    } catch (error) {
        showError('Không thể tải thông tin truyện. Vui lòng thử lại.');
    }
}

loadBookDetail();