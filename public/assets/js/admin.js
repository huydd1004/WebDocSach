const API_BASE_URL =
  'https://webdocsach-data-api.huydd12401.workers.dev';

const MAX_UPLOAD_SIZE =
  20 * 1024 * 1024;

const form = document.getElementById(
  'bookUploadForm'
);

const adminTokenInput = document.getElementById(
  'adminToken'
);

const bookIdInput = document.getElementById(
  'bookId'
);

const bookTitleInput = document.getElementById(
  'bookTitle'
);

const bookAuthorInput = document.getElementById(
  'bookAuthor'
);

const bookStatusInput = document.getElementById(
  'bookStatus'
);

const bookDateInput = document.getElementById(
  'bookDate'
);

const bookGenresInput = document.getElementById(
  'bookGenres'
);

const bookGenreTagsElement = document.getElementById(
  'bookGenreTags'
);

const addBookGenreButton = document.getElementById(
  'addBookGenreButton'
);

const bookDescriptionInput =
  document.getElementById(
    'bookDescription'
  );

const coverFileInput = document.getElementById(
  'coverFile'
);

const chapterFolderInput =
  document.getElementById(
    'chapterFolder'
  );

const validateButton = document.getElementById(
  'validateBookButton'
);

const uploadButton = document.getElementById(
  'uploadBookButton'
);

const progressWrapper = document.getElementById(
  'uploadProgressWrapper'
);

const progressBar = document.getElementById(
  'uploadProgress'
);

const progressText = document.getElementById(
  'uploadProgressText'
);

const statusElement = document.getElementById(
  'adminStatus'
);

const summaryElement = document.getElementById(
  'uploadSummary'
);

const singleChapterBookInput = document.getElementById('singleChapterBook');
const singleChapterStatusElement = document.getElementById('singleChapterStatus');
const singleChapterNumberInput = document.getElementById('singleChapterNumber');
const singleChapterTitleInput = document.getElementById('singleChapterTitle');
const singleChapterContentInput = document.getElementById('singleChapterContent');
const singleChapterImageInput = document.getElementById('singleChapterImage');
const uploadSingleChapterButton = document.getElementById('uploadSingleChapterButton');
const loadExistingChapterButton = document.getElementById('loadExistingChapterButton');
const singleChapterProgressWrapper = document.getElementById('singleChapterProgressWrapper');
const singleChapterProgress = document.getElementById('singleChapterProgress');
const singleChapterProgressText = document.getElementById('singleChapterProgressText');
const singleChapterSummary = document.getElementById('singleChapterSummary');

let preparedUpload = null;
const selectedBookGenres = new Map();

function showStatus(message, type = '') {
  statusElement.textContent = message;
  statusElement.className = 'admin-status';

  if (type) {
    statusElement.classList.add(
      `is-${type}`
    );
  }
}

function setDefaultDate() {
  if (bookDateInput.value) {
    return;
  }

  const now = new Date();

  const localDate = new Date(
    now.getTime() -
    now.getTimezoneOffset() * 60_000
  )
    .toISOString()
    .slice(0, 10);

  bookDateInput.value = localDate;
}

function formatDateForCatalog(value) {
  const [
    year,
    month,
    day
  ] = String(value).split('-');

  if (!year || !month || !day) {
    return '';
  }

  return `${day}/${month}/${year}`;
}

function getFileExtension(fileName) {
  return String(fileName)
    .split('.')
    .pop()
    ?.toLowerCase() || '';
}

function getRelativeChapterPath(file) {
  const originalPath =
    file.webkitRelativePath ||
    file.name;

  const parts = originalPath
    .split('/')
    .filter(Boolean);

  if (parts.length > 1) {
    return parts
      .slice(1)
      .join('/');
  }

  return parts[0] || file.name;
}

async function readChapterTitle(
  file,
  chapterNumber
) {
  const content = (
  await file.slice(0, 64 * 1024).text()
  ).replace(/^\uFEFF/, '');

  const firstLine = content
    .split(/\r?\n/)
    .find(line => line.trim());

  if (!firstLine) {
    return `Chương ${chapterNumber}`;
  }

  return firstLine
    .replace(/^\*+|\*+$/g, '')
    .trim() || `Chương ${chapterNumber}`;
}

function resetPreparedUpload() {
  preparedUpload = null;
  uploadButton.disabled = true;

  summaryElement.hidden = true;
  summaryElement.textContent = '';

  progressWrapper.hidden = true;
  progressBar.value = 0;
  progressText.textContent = 'Đang chuẩn bị...';
}

setDefaultDate();

async function collectChapterEntries() {
  const selectedFiles = Array.from(
    chapterFolderInput.files || []
  );

  if (selectedFiles.length === 0) {
    return [];
  }

  const chapterFiles = selectedFiles.filter(
    file =>
      getFileExtension(file.name) === 'txt'
  );

  if (chapterFiles.length === 0) {
    throw new Error(
      'Thư mục không có file chương .txt.'
    );
  }

  const entries = await Promise.all(
    chapterFiles.map(async file => {
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(
          `${file.name} vượt quá giới hạn 20 MB.`
        );
      }

      const chapterNumber = Number(
        file.name.replace(/\.txt$/i, '')
      );

      if (
        !Number.isInteger(chapterNumber) ||
        chapterNumber <= 0
      ) {
        throw new Error(
          `Tên file không hợp lệ: ${file.name}`
        );
      }

      return {
        number: chapterNumber,
        title: await readChapterTitle(
          file,
          chapterNumber
        ),
        path: getRelativeChapterPath(file),
        file
      };
    })
  );

  entries.sort(
    (first, second) =>
      first.number - second.number
  );

  for (
    let index = 1;
    index < entries.length;
    index += 1
  ) {
    if (
      entries[index].number ===
      entries[index - 1].number
    ) {
      throw new Error(
        `Trùng chương ${entries[index].number}.`
      );
    }
  }

  return entries;
}

function normalizeGenreKey(genre) {
  return String(genre || '')
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ')
    .trim();
}

function syncBookGenreValidity() {
  const hasPendingGenre =
    bookGenresInput.value
      .split(/[,;\n]+/)
      .some(genre => genre.trim());

  const hasGenre =
    selectedBookGenres.size > 0 ||
    hasPendingGenre;

  bookGenresInput.setCustomValidity(
    hasGenre
      ? ''
      : 'Hãy thêm ít nhất một thể loại.'
  );
}

function renderBookGenreTags() {
  const fragment =
    document.createDocumentFragment();

  selectedBookGenres.forEach(
    (genre, genreKey) => {
      const tag = document.createElement(
        'button'
      );

      const removeIcon =
        document.createElement('span');

      tag.type = 'button';
      tag.className = 'admin-genre-tag';
      tag.setAttribute(
        'aria-label',
        `Xóa thể loại ${genre}`
      );

      tag.append(
        document.createTextNode(genre),
        removeIcon
      );

      removeIcon.textContent = '×';
      removeIcon.setAttribute(
        'aria-hidden',
        'true'
      );

      tag.addEventListener('click', () => {
        selectedBookGenres.delete(genreKey);
        renderBookGenreTags();
        syncBookGenreValidity();
        invalidatePreparedUpload();
      });

      fragment.appendChild(tag);
    }
  );

  bookGenreTagsElement.replaceChildren(
    fragment
  );
}

function addGenresFromInput() {
  const genres = bookGenresInput.value
    .split(/[,;\n]+/)
    .map(genre =>
      genre.replace(/\s+/g, ' ').trim()
    )
    .filter(Boolean);

  genres.forEach(genre => {
    const genreKey = normalizeGenreKey(genre);

    if (genreKey) {
      selectedBookGenres.set(
        genreKey,
        genre
      );
    }
  });

  if (genres.length > 0) {
    bookGenresInput.value = '';
    renderBookGenreTags();
  }

  syncBookGenreValidity();
}

function getSelectedGenres() {
  addGenresFromInput();
  return [...selectedBookGenres.values()];
}

async function prepareBookUpload() {
  resetPreparedUpload();
  addGenresFromInput();

  if (!form.reportValidity()) {
    showStatus(
      'Hãy điền đầy đủ các trường bắt buộc.',
      'error'
    );

    return;
  }

  validateButton.disabled = true;

  showStatus(
    'Đang kiểm tra dữ liệu...'
  );

  try {
    const coverFile =
      coverFileInput.files?.[0];

    if (!coverFile) {
      throw new Error(
        'Bạn chưa chọn ảnh bìa.'
      );
    }

    if (coverFile.size > MAX_UPLOAD_SIZE) {
      throw new Error(
        'Ảnh bìa vượt quá giới hạn 20 MB.'
      );
    }

    const allowedCoverExtensions =
      new Set([
        'jpg',
        'jpeg',
        'png',
        'webp'
      ]);

    const coverExtension =
      getFileExtension(coverFile.name);

    if (
      !allowedCoverExtensions.has(
        coverExtension
      )
    ) {
      throw new Error(
        'Ảnh bìa phải là JPG, PNG hoặc WEBP.'
      );
    }

    const chapterEntries =
      await collectChapterEntries();

    const bookId =
      bookIdInput.value.trim();

    const coverKey =
      `assets/images/` +
      `${bookId}.${coverExtension}`;

    const book = {
      id: bookId,
      title: bookTitleInput.value.trim(),
      author: bookAuthorInput.value.trim(),
      status: bookStatusInput.value,
      date: formatDateForCatalog(
        bookDateInput.value
      ),
      cover:
        `${API_BASE_URL}/${coverKey}`,
      genre: getSelectedGenres(),
      description:
        bookDescriptionInput.value.trim()
    };

    const chapters = chapterEntries.map(
      chapter => ({
        number: chapter.number,
        title: chapter.title,
        path: chapter.path
      })
    );

    const index = {
      total: chapters.length,
      firstChapter:
        chapters[0]?.number || 0,
      lastChapter:
        chapters.at(-1)?.number || 0
    };

    const totalChapterBytes =
      chapterEntries.reduce(
        (total, chapter) =>
          total + chapter.file.size,
        0
      );

    const chapterSummary = chapters.length > 0
      ? [
          `Số chương: ${chapters.length}`,
          `Chương đầu: ${index.firstChapter}`,
          `Chương cuối: ${index.lastChapter}`,
          `Dung lượng chương: ` +
            `${(
              totalChapterBytes /
              1024 /
              1024
            ).toFixed(2)} MB`
        ]
      : [
          'Số chương: Chưa có',
          'Nội dung sẽ được đăng sau ở phần Đăng hoặc sửa một chương.'
        ];

    preparedUpload = {
      book,
      chapters,
      index,
      chapterEntries,
      coverFile,
      coverKey
    };

    summaryElement.textContent = [
      `Truyện: ${book.title}`,
      `Mã truyện: ${book.id}`,
      `Tác giả: ${book.author}`,
      ...chapterSummary,
      `Ảnh bìa: ${coverFile.name}`,
      '',
      'Dữ liệu hợp lệ và sẵn sàng tải lên.'
    ].join('\n');

    summaryElement.hidden = false;
    uploadButton.disabled = false;

    showStatus(
      chapters.length > 0
        ? `Đã kiểm tra ${chapters.length} chương.`
        : 'Thông tin truyện hợp lệ. Bạn có thể tải lên mà chưa cần nội dung.',
      'success'
    );
  } catch (error) {
    resetPreparedUpload();

    showStatus(
      error instanceof Error
        ? error.message
        : 'Không thể kiểm tra dữ liệu.',
      'error'
    );
  } finally {
    validateButton.disabled = false;
  }
}

function invalidatePreparedUpload(event) {
  if (event?.target === adminTokenInput) {
    return;
  }

  if (!preparedUpload) {
    return;
  }

  resetPreparedUpload();

  showStatus(
    'Dữ liệu đã thay đổi. Hãy kiểm tra lại.'
  );
}

validateButton.addEventListener(
  'click',
  prepareBookUpload
);

addBookGenreButton.addEventListener(
  'click',
  () => {
    addGenresFromInput();
    bookGenresInput.focus();
  }
);

bookGenresInput.addEventListener(
  'keydown',
  event => {
    if (
      event.key !== 'Enter' &&
      event.key !== ',' &&
      event.key !== ';'
    ) {
      return;
    }

    event.preventDefault();
    addGenresFromInput();
  }
);

bookGenresInput.addEventListener(
  'input',
  syncBookGenreValidity
);

bookGenresInput.addEventListener(
  'blur',
  addGenresFromInput
);

syncBookGenreValidity();

form.addEventListener(
  'input',
  invalidatePreparedUpload
);

form.addEventListener(
  'change',
  invalidatePreparedUpload
);

function createJsonBlob(data) {
  return new Blob(
    [
      `${JSON.stringify(data, null, 2)}\n`
    ],
    {
      type:
        'application/json; charset=utf-8'
    }
  );
}

function encodeObjectKey(key) {
  return String(key)
    .split('/')
    .map(segment =>
      encodeURIComponent(segment)
    )
    .join('/');
}

function getCoverContentType(file) {
  const extension = getFileExtension(
    file.name
  );

  const contentTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };

  return (
    contentTypes[extension] ||
    file.type ||
    'application/octet-stream'
  );
}

async function uploadObject(
  key,
  body,
  contentType,
  adminToken
) {
  const response = await fetch(
    `${API_BASE_URL}/` +
    encodeObjectKey(key),
    {
      method: 'PUT',
      headers: {
        Authorization:
          `Bearer ${adminToken}`,
        'Content-Type': contentType
      },
      body
    }
  );

  let result = {};

  try {
    result = await response.json();
  } catch (error) {
    result = {};
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
      `Không thể tải ${key}`
    );
  }

  return result;
}

async function runUploadPool(
  items,
  uploadItem,
  onProgress,
  concurrency = 4
) {
  let nextIndex = 0;
  let completed = 0;

  const failures = [];

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      const item = items[currentIndex];

      try {
        await uploadItem(item);
      } catch (error) {
        failures.push({
          key: item.key,
          message:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }

      completed += 1;

      onProgress(
        completed,
        items.length,
        item
      );
    }
  }

  const workerCount = Math.min(
    concurrency,
    items.length
  );

  await Promise.all(
    Array.from(
      {
        length: workerCount
      },
      () => runWorker()
    )
  );

  return failures;
}

async function createUpdatedCatalog(book) {
  const response = await fetch(
  `${API_BASE_URL}/data/books.json` +
  `?time=${Date.now()}`,
  {
    cache: 'no-store'
  }
  );
  let catalog = [];

  if (response.ok) {
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        'books.json trên R2 không hợp lệ.'
      );
    }

    catalog = data;
  } else if (response.status !== 404) {
    throw new Error(
      'Không thể đọc books.json từ R2.'
    );
  }

  const existingIndex = catalog.findIndex(
    item => item.id === book.id
  );

  const previousBook =
    existingIndex >= 0
      ? catalog[existingIndex]
      : null;

  const nextBook = {
    ...(previousBook || {}),
    ...book
  };

  if (previousBook?.featured === true) {
    nextBook.featured = true;
  }

  if (existingIndex >= 0) {
    catalog[existingIndex] = nextBook;
  } else {
    catalog.push(nextBook);
  }

  return catalog;
}

function buildUploadItems(data) {
  const chapterItems =
    data.chapterEntries.map(chapter => ({
      key:
        `data/${data.book.id}/` +
        chapter.path,
      body: chapter.file,
      contentType:
        'text/plain; charset=utf-8'
    }));

  const chapterDataItems =
    chapterItems.length > 0
      ? [
          {
            key:
              `data/${data.book.id}/` +
              'chapters.json',
            body: createJsonBlob(
              data.chapters
            ),
            contentType:
              'application/json; charset=utf-8'
          },
          {
            key:
              `data/${data.book.id}/` +
              'index.json',
            body: createJsonBlob(
              data.index
            ),
            contentType:
              'application/json; charset=utf-8'
          }
        ]
      : [];

  return [
    ...chapterItems,
    {
      key: data.coverKey,
      body: data.coverFile,
      contentType:
        getCoverContentType(
          data.coverFile
        )
    },
    ...chapterDataItems
  ];
}

async function uploadPreparedBook(event) {
  event.preventDefault();

  if (!preparedUpload) {
    showStatus(
      'Hãy kiểm tra dữ liệu trước khi tải lên.',
      'error'
    );

    return;
  }

  const adminToken =
    adminTokenInput.value.trim();

  if (!adminToken) {
    showStatus(
      'Bạn chưa nhập ADMIN_TOKEN.',
      'error'
    );

    adminTokenInput.focus();
    return;
  }

  const uploadData = preparedUpload;

  const uploadItems =
    buildUploadItems(uploadData);

  const totalSteps =
    uploadItems.length + 1;

  uploadButton.disabled = true;
  validateButton.disabled = true;

  progressWrapper.hidden = false;
  progressBar.max = totalSteps;
  progressBar.value = 0;

  progressText.textContent =
    `Chuẩn bị tải ${uploadItems.length} file...`;

  showStatus(
    'Đang tải truyện lên R2...'
  );

  try {
    const failures = await runUploadPool(
      uploadItems,
      item =>
        uploadObject(
          item.key,
          item.body,
          item.contentType,
          adminToken
        ),
      (completed, total, item) => {
        progressBar.value = completed;

        progressText.textContent =
          `Đã tải ${completed}/${totalSteps}: ` +
          item.key;
      }
    );

    if (failures.length > 0) {
      const firstFailure = failures[0];

      throw new Error(
        `Có ${failures.length} file tải thất bại. ` +
        `${firstFailure.key}: ` +
        firstFailure.message
      );
    }

    progressText.textContent =
      'Đang cập nhật danh mục books.json...';

    const updatedCatalog =
      await createUpdatedCatalog(
        {
          ...uploadData.book,
          chapterCount: uploadData.chapters.length || uploadData.book.chapterCount || 0
        }
      );

    await uploadObject(
      'data/books.json',
      createJsonBlob(updatedCatalog),
      'application/json; charset=utf-8',
      adminToken
    );

    if (uploadData.chapterEntries.length === 0) {
      await loadChapterBookOptions();

      singleChapterBookInput.value =
        uploadData.book.id;

      singleChapterNumberInput.value = '1';
    }

    progressBar.value = totalSteps;

    progressText.textContent =
      `Hoàn tất ${totalSteps}/${totalSteps}`;

    showStatus(
      `Đã tải thành công truyện ` +
      `"${uploadData.book.title}" lên R2.`,
      'success'
    );

    summaryElement.textContent += [
      '',
      '',
      'TẢI LÊN THÀNH CÔNG',
      `Đã tải ${uploadItems.length} file truyện.`,
      'Đã cập nhật data/books.json.'
    ].join('\n');

    preparedUpload = null;
    uploadButton.disabled = true;
  } catch (error) {
    showStatus(
      error instanceof Error
        ? error.message
        : 'Không thể tải truyện lên R2.',
      'error'
    );

    progressText.textContent =
      'Quá trình tải lên chưa hoàn tất.';

    uploadButton.disabled = false;
  } finally {
    validateButton.disabled = false;
  }
}

form.addEventListener(
  'submit',
  uploadPreparedBook
);

function showSingleChapterStatus(message, type = '') {
  singleChapterStatusElement.textContent = message;
  singleChapterStatusElement.className = 'admin-status';

  if (type) {
    singleChapterStatusElement.classList.add(`is-${type}`);
  }
}

async function loadChapterBookOptions() {
  singleChapterBookInput.disabled = true;

  try {
    const response = await fetch(
      `${API_BASE_URL}/data/books.json` +
      `?time=${Date.now()}`,
      {
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error('Không thể tải danh sách truyện.');
    }

    const books = await response.json();

    if (!Array.isArray(books)) {
      throw new Error('Danh sách truyện không hợp lệ.');
    }

    const placeholder = document.createElement('option');

    placeholder.value = '';
    placeholder.textContent = 'Chọn truyện cần đăng chương';
    placeholder.selected = true;
    placeholder.disabled = true;

    singleChapterBookInput.replaceChildren(placeholder);

    books
      .filter(book => book?.id)
      .sort((firstBook, secondBook) => String(firstBook.title || firstBook.id)
        .localeCompare(
          String(secondBook.title || secondBook.id), 'vi'
        ))
      .forEach(book => {
        const option = document.createElement('option');

        option.value = book.id;

        option.textContent = `${book.title || book.id} ` + `(${book.id})`;

        singleChapterBookInput.appendChild(option);
      });

      if (singleChapterBookInput.options.length < 2) {
        throw new Error('Danh mục hiện chưa có truyện.');
      }

      singleChapterBookInput.disabled = false;

      showSingleChapterStatus('');
  } catch (error) {
    const failedOption = document.createElement('option');

    failedOption.value = '';
    failedOption.textContent = 'Không thể tải danh sách truyện';

    singleChapterBookInput.replaceChildren(failedOption);

    showSingleChapterStatus(error instanceof Error ? error.message : 'Không thể tải danh sách truyện.', 'error');
  }
}

function createSingleChapterDraft() {
  const bookId = singleChapterBookInput.value.trim();
  const chapterNumber = Number(singleChapterNumberInput.value);
  const enteredTitle = singleChapterTitleInput.value.trim();
  const chapterContent = singleChapterContentInput.value
        .replace(/\r\n/g, '\n')
        .trim();

  if (!bookId) {
    throw new Error('Bạn chưa chọn truyện.');
  }

  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error('Số chương phải là số nguyên lớn hơn 0.');
  }

  if (!enteredTitle) {
    throw new Error('Bạn chưa nhập tên chương.');
  }

  if (!chapterContent) {
    throw new Error('Bạn chưa nhập nội dung chương.');
  }

  const chapterTitle = /^chương\s+/i.test(enteredTitle) ? enteredTitle : `Chương ${chapterNumber}: ` + enteredTitle;

  const textContent = `${chapterTitle}\n\n` + `${chapterContent}\n`;

  const chapterFile = new File([textContent], `${chapterNumber}.txt`, {
    type: 'text/plain; charset=utf-8'
  });

  if (chapterFile.size > MAX_UPLOAD_SIZE) {
    throw new Error('Nội dung chương vượt quá giới hạn 20MB.');
  }

  return {
    bookId,
    chapterNumber,
    chapterTitle,
    chapterPath: `chapters/${chapterNumber}.txt`,
    chapterFile,
    imageFile: singleChapterImageInput.files?.[0] || null
  };
}

function validateSingleChapterImage(imageFile) {
  if (!imageFile) {
    return '';
  }

  if (imageFile.size > MAX_UPLOAD_SIZE) {
    throw new Error('Ảnh minh họa vượt quá giới hạn 20MB.');
  }

  const extension = getFileExtension(imageFile.name);

  const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);

  if (!allowedExtensions.has(extension)) {
    throw new Error('Ảnh minh họa phải là JPG, PNG hoặc WEBP.');
  }

  return extension;
}

async function fetchBookChapters(bookId) {
  const response = await fetch(
    `${API_BASE_URL}/data/${encodeURIComponent(
      bookId
    )}/chapters.json?time=${Date.now()}`,
    {
      cache: 'no-store'
    }
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error('Không thể đọc danh sách chương trên R2.');
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('File chapters.json trên R2 không hợp lệ.');
  }

  return data
    .map(chapter => ({
      ...chapter,
      number: Number(chapter?.number)
    }))
    .filter(chapter =>
      Number.isInteger(chapter.number) &&
      chapter.number > 0
    );
}

async function prepareSingleChapterUpload() {
  const draft = createSingleChapterDraft();

  const imageExtension = validateSingleChapterImage(draft.imageFile);

  const chapters = await fetchBookChapters(draft.bookId);

  const existingIndex = chapters.findIndex(chapter => chapter.number === draft.chapterNumber);

  const previousChapter =
  existingIndex >= 0
    ? chapters[existingIndex]
    : null;

  if (previousChapter) {
    const shouldOverwrite = window.confirm(`Chương ${draft.chapterNumber} đã tồn tại.\n\n` + 'Bạn có muốn ghi đè chương này không?');

    if (!shouldOverwrite) {
      throw new Error('Bạn đã hủy cập nhật chương.');
    }
  }

  const imageKey = imageExtension
  ? (
    `assets/images/chapters/` +
    `${draft.bookId}/` +
    `${draft.chapterNumber}.` +
    imageExtension
  )
  : '';

  const chapterPath =
    previousChapter?.path ||
    draft.chapterPath;

  const chapterEntry = {...(previousChapter || {}),
                      number: draft.chapterNumber,
                      title: draft.chapterTitle,
                      path: chapterPath
                      };

  if (imageKey) {chapterEntry.image = `${API_BASE_URL}/${imageKey}`;}

  const updatedChapters = [...chapters];

  if (existingIndex >= 0) {
    updatedChapters[existingIndex] = chapterEntry;
  } else {
    updatedChapters.push(chapterEntry);
  }

  updatedChapters.sort((firstChapter, secondChapter) => firstChapter.number - secondChapter.number);

  const index = {
    total: updatedChapters.length,
    firstChapter: updatedChapters[0]?.number || 0,
    lastChapter: updatedChapters.at(-1)?.number || 0
  };

  return {
    ...draft,
    chapterPath,
    imageKey,
    chapters: updatedChapters,
    index,
    isUpdate: existingIndex >= 0
  };
}

async function fetchExistingChapterText(
  bookId,
  chapter
) {
  const chapterNumber = chapter.number;
  const partNumber = Math.floor(
    (chapterNumber - 1) / 200
  ) + 1;

  const possiblePaths = [
    chapter.path,
    `chapters/${chapterNumber}.txt`,
    `${chapterNumber}.txt`,
    `phần ${partNumber}/${chapterNumber}.txt`
  ].filter(Boolean);

  const uniquePaths = [
    ...new Set(possiblePaths)
  ];

  for (const path of uniquePaths) {
    const key = `data/${bookId}/${path}`;

    const response = await fetch(
      `${API_BASE_URL}/${encodeObjectKey(key)}` +
      `?time=${Date.now()}`,
      {
        cache: 'no-store'
      }
    );

    if (response.ok) {
      return {
        path,
        text: await response.text()
      };
    }
  }

  throw new Error(
    `Không tìm thấy file của chương ${chapterNumber}.`
  );
}

function parseExistingChapterText(
  text,
  chapter
) {
  const normalized = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const lines = normalized.split('\n');
  const titleIndex = lines.findIndex(
    line => line.trim()
  );

  const manifestTitle = String(
    chapter.title || ''
  ).trim();

  if (titleIndex === -1) {
    return {
      title: manifestTitle,
      content: ''
    };
  }

  const firstLine = lines[titleIndex]
    .replace(/^\*+|\*+$/g, '')
    .trim();

  const normalizeTitle = value =>
    String(value || '')
      .toLocaleLowerCase('vi-VN')
      .replace(/\s+/g, ' ')
      .trim();

  const firstLineIsTitle =
    normalizeTitle(firstLine) ===
      normalizeTitle(manifestTitle) ||
    /^ch(?:ương|uong)?\s*\d+/i.test(
      firstLine
    );

  return {
    title:
      firstLineIsTitle
        ? firstLine
        : manifestTitle,
    content:
      firstLineIsTitle
        ? lines
            .slice(titleIndex + 1)
            .join('\n')
            .trim()
        : normalized
  };
}

function getEditableChapterTitle(
  title,
  chapterNumber
) {
  const cleanTitle = String(title || '')
    .replace(
      new RegExp(
        `^Chương\\s*${chapterNumber}` +
        `\\s*[:\\-]?\\s*`,
        'i'
      ),
      ''
    )
    .trim();

  return cleanTitle || String(title || '').trim();
}

async function loadExistingChapterForEdit() {
  const bookId =
    singleChapterBookInput.value.trim();

  const chapterNumber = Number(
    singleChapterNumberInput.value
  );

  if (!bookId) {
    showSingleChapterStatus(
      'Bạn chưa chọn truyện.',
      'error'
    );
    return;
  }

  if (
    !Number.isInteger(chapterNumber) ||
    chapterNumber < 1
  ) {
    showSingleChapterStatus(
      'Hãy nhập số chương cần sửa.',
      'error'
    );
    singleChapterNumberInput.focus();
    return;
  }

  loadExistingChapterButton.disabled = true;
  uploadSingleChapterButton.disabled = true;
  singleChapterSummary.hidden = true;

  showSingleChapterStatus(
    `Đang tải chương ${chapterNumber}...`
  );

  try {
    const chapters = await fetchBookChapters(
      bookId
    );

    const chapter = chapters.find(
      item => item.number === chapterNumber
    );

    if (!chapter) {
      throw new Error(
        `Chương ${chapterNumber} chưa tồn tại.`
      );
    }

    const loaded =
      await fetchExistingChapterText(
        bookId,
        chapter
      );

    const parsed = parseExistingChapterText(
      loaded.text,
      chapter
    );

    singleChapterTitleInput.value =
      getEditableChapterTitle(
        parsed.title,
        chapterNumber
      );

    singleChapterContentInput.value =
      parsed.content;

    singleChapterImageInput.value = '';
    singleChapterProgressWrapper.hidden = true;

    singleChapterSummary.textContent = [
      `Đang sửa chương ${chapterNumber}`,
      `File hiện tại: ${loaded.path}`,
      chapter.image
        ? `Ảnh hiện tại: ${chapter.image}`
        : 'Ảnh hiện tại: Không có',
      '',
      'Chỉ sửa phần cần thay đổi rồi bấm Tải chương lên R2.'
    ].join('\n');

    singleChapterSummary.hidden = false;

    showSingleChapterStatus(
      `Đã mở chương ${chapterNumber} để sửa.`,
      'success'
    );

    singleChapterContentInput.focus();
  } catch (error) {
    showSingleChapterStatus(
      error instanceof Error
        ? error.message
        : 'Không thể mở chương để sửa.',
      'error'
    );
  } finally {
    loadExistingChapterButton.disabled = false;
    uploadSingleChapterButton.disabled = false;
  }
}

async function uploadSingleChapter() {
  const adminToken = adminTokenInput.value.trim();

  if (!adminToken) {
    showSingleChapterStatus('Bạn chưa nhập ADMIN_TOKEN ở bước 1.', 'error');

    adminTokenInput.focus();
    return;
  }

  uploadSingleChapterButton.disabled = true;
  loadExistingChapterButton.disabled = true;

  showSingleChapterStatus('Đang kiểm tra dữ liệu chương...');

  singleChapterSummary.hidden = true;
  singleChapterProgressWrapper.hidden = false;
  singleChapterProgress.value = 0;

  singleChapterProgressText.textContent = 'Đang chuẩn bị...';

  try {
    const uploadData = await prepareSingleChapterUpload();

    const contentItems = [
      {
        key: `data/${uploadData.bookId}/` + uploadData.chapterPath,
        body: uploadData.chapterFile,
        contentType: 'text/plain; charset=utf-8'
      }
    ];

    if (uploadData.imageFile && uploadData.imageKey) {
      contentItems.push({
        key: uploadData.imageKey,
        body: uploadData.imageFile,
        contentType: getCoverContentType(uploadData.imageFile)
      });
    }

    const totalSteps = contentItems.length + 3;
    singleChapterProgress.max = totalSteps;

    const failures = await runUploadPool(contentItems, item =>
      uploadObject(item.key, item.body, item.contentType, adminToken),
      (completed, total, item) => {
        singleChapterProgress.value = completed;

        singleChapterProgressText.textContent = `Đã tải ${completed}/${totalSteps}: ` + item.key;
      }, 2
    );

    if (failures.length > 0) {
      const firstFailure = failures[0];

      throw new Error(`Có ${failures.length} file tải thất bại. ` + `${firstFailure.key}: ` + firstFailure.message);
    }

    let completedSteps = contentItems.length;

    singleChapterProgressText.textContent = 'Đang cập nhật index.json...';

    await uploadObject(`data/${uploadData.bookId}/index.json`,
                        createJsonBlob(uploadData.index),
                        'application/json; charset=utf-8',
                        adminToken
    );

    completedSteps += 1;
    singleChapterProgress.value = completedSteps;
    singleChapterProgressText.textContent = 'Đang cập nhật chapters.json...';

    await uploadObject(`data/${uploadData.bookId}/chapters.json`,
                       createJsonBlob(uploadData.chapters),
                       'application/json; charset=utf-8',
                       adminToken
    );

    completedSteps += 1;
    singleChapterProgress.value = completedSteps;
    singleChapterProgressText.textContent = 'Đang cập nhật số chương trong books.json...';

    const updatedCatalog = await createUpdatedCatalog({
      id: uploadData.bookId,
      chapterCount: uploadData.chapters.length,
      updatedAt: new Date().toISOString()
    });

    await uploadObject('data/books.json',
                       createJsonBlob(updatedCatalog),
                       'application/json; charset=utf-8',
                       adminToken
    );

    completedSteps += 1;
    singleChapterProgress.value = completedSteps;
    singleChapterProgressText.textContent = `Hoàn tất ${completedSteps}/${totalSteps}`;

    showSingleChapterStatus(uploadData.isUpdate ? `Đã cập nhật chương ` + `${uploadData.chapterNumber}.` : `Đã đăng chương ` + `${uploadData.chapterNumber}.`, 'success');

    singleChapterSummary.textContent = [
      `Truyện: ${uploadData.bookId}`,
      `Chương: ${uploadData.chapterNumber}`,
      `Tên: ${uploadData.chapterTitle}`,
      `File: ${uploadData.chapterPath}`,
      uploadData.imageKey ? `Ảnh: ${uploadData.imageKey}` : 'Ảnh: Không có', '',
      uploadData.isUpdate ? 'Cập nhật chương thành công.' : 'Đăng chương mới thành công.'
    ].join('\n');

    singleChapterSummary.hidden = false;

    singleChapterNumberInput.value = String(uploadData.chapterNumber + 1);

    singleChapterTitleInput.value = '';
    singleChapterContentInput.value = '';
    singleChapterImageInput.value = '';

    singleChapterContentInput.focus();
  } catch (error) {
    showSingleChapterStatus(error instanceof Error ? error.message : 'Không thể tải chương lên R2.', 'error');

    singleChapterProgressText.textContent = 'Quá trình tải chương chưa hoàn tất.';
  } finally {
    uploadSingleChapterButton.disabled = false;
    loadExistingChapterButton.disabled = false;
  }
}

uploadSingleChapterButton.addEventListener('click', uploadSingleChapter);

loadExistingChapterButton.addEventListener(
  'click',
  loadExistingChapterForEdit
);

loadChapterBookOptions();
