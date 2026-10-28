(() => {
  const page = document.body;
  if (!page.classList.contains('reader-v2')) return;

  const MODE_KEY = 'readerMode';
  const WAKE_KEY = 'readerWakeLockEnabled';
  const SOUND_KEY = 'readerPageSoundEnabled';
  const ANNOTATION_KEY = 'readerAnnotationsV1';
  const HISTORY_KEY = 'readerHistoryV1';
  const SPREAD_KEY = 'readerSpreadEnabled';
  const BRIGHTNESS_KEY = 'readerBrightness';
  const AUTO_SCROLL_SPEED_KEY = 'readerAutoScrollSpeed';
  const HIGH_CONTRAST_KEY = 'readerHighContrast';
  const REDUCE_MOTION_KEY = 'readerReduceMotion';
  const GESTURE_KEY = 'readerGestureEnabled';
  const HAPTICS_KEY = 'readerHapticsEnabled';
  const OFFLINE_CACHE = 'webdocsach-reader-offline-v1';
  const DATA_RUNTIME_CACHE = 'webdocsach-data-runtime-v1';

  const paper = document.querySelector('#readerMain > .reader-paper');
  const flow = document.getElementById('readerPageFlow');
  const content = document.getElementById('content');
  const selectionTools = document.getElementById('readerSelectionTools');

  if (!paper || !flow || !content) return;

  let readerMode = localStorage.getItem(MODE_KEY) || 'paginated';
  let readerPageIndex = 0;
  let readerPageCount = 1;
  let paginationTimer = null;
  let lastSwipeFinishedAt = 0;
  let swipePreview = null;
  let pendingSelection = null;
  let pendingAnnotationTarget = null;
  let wakeLock = null;
  let wakeLockEnabled = localStorage.getItem(WAKE_KEY) === '1';
  let pageSoundEnabled = localStorage.getItem(SOUND_KEY) === '1';
  let spreadEnabled = localStorage.getItem(SPREAD_KEY) !== '0';
  let gesturesEnabled = localStorage.getItem(GESTURE_KEY) !== '0';
  let hapticsEnabled = localStorage.getItem(HAPTICS_KEY) !== '0';
  let highContrastEnabled = localStorage.getItem(HIGH_CONTRAST_KEY) === '1';
  let reduceMotionEnabled = localStorage.getItem(REDUCE_MOTION_KEY) === '1';
  let autoScrollActive = false;
  let autoScrollFrame = 0;
  let autoScrollPreviousTime = 0;
  let readerSearchScope = 'chapter';
  let readerSearchToken = 0;
  const sessionStartedAt = Date.now();
  let audioContext = null;

  const originalNextChapter = nextChapter;
  const originalPrevChapter = prevChapter;
  const originalGetReaderAdjacentChapter = getReaderAdjacentChapter;
  const originalRenderReaderToc = renderReaderToc;

  function isPaginated() {
    return readerMode === 'paginated';
  }

  function isSpreadLayout() {
    return isPaginated() && spreadEnabled && window.matchMedia('(min-width: 1101px)').matches;
  }

  function syncSpreadLayout() {
    const active = isSpreadLayout();
    page.classList.toggle('reader-spread-active', active);
    syncFeatureToggle(document.getElementById('readerSpreadToggle'), spreadEnabled);
    return active;
  }

  function clampPageIndex(value) {
    return Math.min(Math.max(Number(value) || 0, 0), Math.max(readerPageCount - 1, 0));
  }

  function getColumnGap() {
    const value = parseFloat(window.getComputedStyle(flow).columnGap);
    return Number.isFinite(value) ? value : 0;
  }

  function getPageStep() {
    return Math.max(flow.clientWidth + getColumnGap(), 1);
  }

  function getSavedPageIndex() {
    const progress = getProgress(currentBook);
    if (
      progress &&
      Number(progress.positionChapter) === Number(currentChapter) &&
      progress.readingMode === 'paginated'
    ) {
      return Number(progress.pageIndex) || 0;
    }
    return 0;
  }

  function savePaginatedProgress() {
    if (!currentBook || !shouldRememberProgress()) return;

    const map = loadProgressMap();
    const previous = map[currentBook] || {};

    map[currentBook] = {
      ...previous,
      chapter: Number(currentChapter),
      positionChapter: Number(currentChapter),
      readingMode: 'paginated',
      pageIndex: readerPageIndex,
      pageCount: readerPageCount,
      scrollY: 0,
      scrollRatio: readerPageCount > 1
        ? readerPageIndex / (readerPageCount - 1)
        : 0,
      updated: Date.now()
    };

    saveProgressMap(map);
  }

  function setFlowPage(index, smooth = false) {
    readerPageIndex = clampPageIndex(index);
    const previousBehavior = flow.style.scrollBehavior;
    flow.style.scrollBehavior = smooth ? 'smooth' : 'auto';
    flow.scrollLeft = readerPageIndex * getPageStep();

    window.requestAnimationFrame(() => {
      flow.style.scrollBehavior = previousBehavior;
    });

    updatePaginationControls();
  }

  function canTurnReaderUnit(direction) {
    if (!isPaginated()) return Boolean(originalGetReaderAdjacentChapter(direction));
    if (direction === 'next' && readerPageIndex < readerPageCount - 1) return true;
    if (direction === 'prev' && readerPageIndex > 0) return true;
    return Boolean(originalGetReaderAdjacentChapter(direction));
  }

  function updatePaginationControls() {
    const chapterPosition = getCurrentChapterPosition();
    const chapterTotal = chapterIndex.length;
    const dockProgress = document.getElementById('readerDockProgress');
    const readingProgress = document.getElementById('readingProgressBar');
    const previousChapter = originalGetReaderAdjacentChapter('prev');
    const nextChapterData = originalGetReaderAdjacentChapter('next');
    const canGoBack = isPaginated()
      ? readerPageIndex > 0 || Boolean(previousChapter)
      : Boolean(previousChapter);
    const canGoForward = isPaginated()
      ? readerPageIndex < readerPageCount - 1 || Boolean(nextChapterData)
      : Boolean(nextChapterData);

    if (dockProgress) {
      dockProgress.textContent = isPaginated()
        ? `Trang ${readerPageIndex + 1} / ${readerPageCount}`
        : `${chapterPosition + 1} / ${chapterTotal}`;
    }

    if (readingProgress && isPaginated() && chapterTotal > 0) {
      const chapterFraction = (readerPageIndex + 1) / Math.max(readerPageCount, 1);
      const overallProgress = ((Math.max(chapterPosition, 0) + chapterFraction) / chapterTotal) * 100;
      readingProgress.style.width = `${Math.min(Math.max(overallProgress, 0), 100)}%`;
    }

    [
      document.getElementById('readerEndPrev'),
      document.getElementById('readerDockPrev'),
      document.querySelector('.top-nav-prev')
    ].forEach(button => {
      if (button) button.disabled = !canGoBack;
    });

    [
      document.getElementById('readerEndNext'),
      document.getElementById('readerDockNext'),
      document.querySelector('.top-nav-next')
    ].forEach(button => {
      if (button) button.disabled = !canGoForward;
    });

    const previousLabel = document.getElementById('readerEndPrevLabel');
    const nextLabel = document.getElementById('readerEndNextLabel');

    if (previousLabel) {
      previousLabel.textContent = isPaginated() && readerPageIndex > 0
        ? `Trang ${readerPageIndex}`
        : previousChapter?.title || 'Quay lại';
    }

    if (nextLabel) {
      nextLabel.textContent = isPaginated() && readerPageIndex < readerPageCount - 1
        ? `Trang ${readerPageIndex + 2}`
        : nextChapterData?.title || 'Đọc tiếp';
    }
  }

  function recalculatePagination({ restore = false } = {}) {
    window.clearTimeout(paginationTimer);

    if (!isPaginated()) {
      readerPageIndex = 0;
      readerPageCount = 1;
      flow.style.removeProperty('--reader-column-width');
      flow.scrollLeft = 0;
      updatePaginationControls();
      return;
    }

    paginationTimer = window.setTimeout(() => {
      const oldPageCount = readerPageCount;
      const oldRatio = oldPageCount > 1
        ? readerPageIndex / (oldPageCount - 1)
        : 0;

      const columnsPerView = syncSpreadLayout() ? 2 : 1;
      const columnWidth = Math.max(
        (flow.clientWidth - getColumnGap() * (columnsPerView - 1)) / columnsPerView,
        1
      );
      flow.style.setProperty('--reader-column-width', `${columnWidth}px`);

      window.requestAnimationFrame(() => {
        const step = getPageStep();
        readerPageCount = Math.max(
          1,
          Math.round((flow.scrollWidth + getColumnGap()) / step)
        );

        const nextPage = restore
          ? getSavedPageIndex()
          : Math.round(oldRatio * Math.max(readerPageCount - 1, 0));

        setFlowPage(nextPage, false);
        savePaginatedProgress();

        document.dispatchEvent(new CustomEvent('reader:pagination-updated', {
          detail: {
            page: readerPageIndex + 1,
            total: readerPageCount
          }
        }));
      });
    }, 70);
  }

  function finishInternalPageTurn() {
    finishReaderPageTurn();
    lastSwipeFinishedAt = Date.now();
    savePaginatedProgress();
    updatePaginationControls();
  }

  function turnPageWithinChapter(direction) {
    if (!isPaginated() || chapterNavigationLocked) return false;

    const delta = direction === 'next' ? 1 : -1;
    const matchingPreview = swipePreview?.direction === direction
      ? swipePreview
      : null;
    const targetPage = matchingPreview?.target ?? readerPageIndex + delta;
    if (targetPage < 0 || targetPage >= readerPageCount) return false;

    swipePreview = null;

    chapterNavigationLocked = true;
    document.body.setAttribute('aria-busy', 'true');

    const reduceMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      reduceMotionEnabled;
    const turn = reduceMotion
      ? null
      : readerPageTurnState?.direction === direction
        ? readerPageTurnState
        : createReaderPageTurn(direction, window.innerHeight * 0.84);

    setFlowPage(targetPage, false);
    document.dispatchEvent(new CustomEvent('reader:page-turn', {
      detail: {
        direction,
        chapter: currentChapter,
        page: readerPageIndex + 1
      }
    }));

    (reduceMotion ? Promise.resolve() : settleReaderPageTurn(turn, true))
      .then(finishInternalPageTurn)
      .catch(finishInternalPageTurn);

    return true;
  }

  function readerNext() {
    if (turnPageWithinChapter('next')) return;
    originalNextChapter();
  }

  function readerPrevious() {
    if (turnPageWithinChapter('prev')) return;
    originalPrevChapter();
  }

  nextChapter = readerNext;
  prevChapter = readerPrevious;
  getReaderAdjacentChapter = direction => {
    if (isPaginated() && swipePreview?.direction === direction) {
      return getCurrentChapterData() || { number: currentChapter };
    }
    if (
      isPaginated() &&
      ((direction === 'next' && readerPageIndex < readerPageCount - 1) ||
       (direction === 'prev' && readerPageIndex > 0))
    ) {
      return getCurrentChapterData() || { number: currentChapter };
    }
    return originalGetReaderAdjacentChapter(direction);
  };

  function cancelSwipePreview() {
    if (!swipePreview) return;
    const originalPage = swipePreview.original;
    swipePreview = null;
    setFlowPage(originalPage, false);
  }

  document.addEventListener('reader:swipe-preview', event => {
    if (!isPaginated() || chapterNavigationLocked) return;
    const direction = event.detail?.direction;
    if (direction !== 'next' && direction !== 'prev') return;
    if (swipePreview?.direction === direction) return;

    if (swipePreview) cancelSwipePreview();

    const original = readerPageIndex;
    const target = original + (direction === 'next' ? 1 : -1);
    if (target < 0 || target >= readerPageCount) return;

    swipePreview = { direction, original, target };
    setFlowPage(target, false);
  });

  document.addEventListener('reader:swipe-preview-cancel', cancelSwipePreview);

  function setReaderMode(mode, persist = true) {
    cancelSwipePreview();
    readerMode = mode === 'scroll' ? 'scroll' : 'paginated';
    page.classList.toggle('reader-mode-paginated', isPaginated());
    page.classList.toggle('reader-mode-scroll', !isPaginated());
    syncSpreadLayout();

    document.querySelectorAll('[data-reader-mode]').forEach(button => {
      const active = button.dataset.readerMode === readerMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (persist) localStorage.setItem(MODE_KEY, readerMode);
    window.scrollTo({ top: 0, behavior: 'auto' });
    recalculatePagination({ restore: true });
  }

  window.setReaderMode = setReaderMode;

  function setImmersiveMode(enabled) {
    const active = Boolean(enabled);
    page.classList.toggle('reader-immersive', active);
    const label = document.querySelector('#readerFullscreenButton span');
    if (label) label.textContent = active ? 'Thoát toàn màn hình' : 'Đọc toàn màn hình';
    window.requestAnimationFrame(() => recalculatePagination());
  }

  async function toggleReaderFullscreen() {
    const fullscreenSupported = typeof document.documentElement.requestFullscreen === 'function';
    if (!fullscreenSupported) {
      setImmersiveMode(!page.classList.contains('reader-immersive'));
      return;
    }

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setImmersiveMode(true);
      } else {
        await document.exitFullscreen();
        setImmersiveMode(false);
      }
    } catch (error) {
      setImmersiveMode(!page.classList.contains('reader-immersive'));
    }
  }

  window.toggleReaderFullscreen = toggleReaderFullscreen;

  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    setImmersiveMode(active);
  });

  document.getElementById('readerMain')?.addEventListener('click', event => {
    if (
      !gesturesEnabled ||
      !window.matchMedia('(max-width: 900px), (pointer: coarse)').matches ||
      Date.now() - lastSwipeFinishedAt < 450 ||
      event.target.closest('a, button, input, select, textarea, mark') ||
      window.getSelection()?.toString()
    ) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);

    if (ratio <= 0.28) readerPrevious();
    else if (ratio >= 0.72) readerNext();
    else setImmersiveMode(!page.classList.contains('reader-immersive'));
  });

  function syncFeatureToggle(button, enabled) {
    if (!button) return;
    button.classList.toggle('is-active', enabled);
    button.setAttribute('aria-checked', String(enabled));
  }

  function toggleReaderSpread() {
    spreadEnabled = !spreadEnabled;
    localStorage.setItem(SPREAD_KEY, spreadEnabled ? '1' : '0');
    syncSpreadLayout();
    recalculatePagination();
  }

  function toggleReaderGestures() {
    gesturesEnabled = !gesturesEnabled;
    localStorage.setItem(GESTURE_KEY, gesturesEnabled ? '1' : '0');
    syncFeatureToggle(document.getElementById('readerGestureToggle'), gesturesEnabled);
  }

  function toggleReaderHaptics() {
    hapticsEnabled = !hapticsEnabled;
    localStorage.setItem(HAPTICS_KEY, hapticsEnabled ? '1' : '0');
    syncFeatureToggle(document.getElementById('readerHapticsToggle'), hapticsEnabled);
  }

  function toggleReaderHighContrast() {
    highContrastEnabled = !highContrastEnabled;
    localStorage.setItem(HIGH_CONTRAST_KEY, highContrastEnabled ? '1' : '0');
    page.classList.toggle('reader-high-contrast', highContrastEnabled);
    syncFeatureToggle(document.getElementById('readerHighContrastToggle'), highContrastEnabled);
  }

  function toggleReaderReduceMotion() {
    reduceMotionEnabled = !reduceMotionEnabled;
    localStorage.setItem(REDUCE_MOTION_KEY, reduceMotionEnabled ? '1' : '0');
    page.classList.toggle('reader-reduce-motion', reduceMotionEnabled);
    syncFeatureToggle(document.getElementById('readerReduceMotionToggle'), reduceMotionEnabled);
  }

  window.toggleReaderSpread = toggleReaderSpread;
  window.toggleReaderGestures = toggleReaderGestures;
  window.toggleReaderHaptics = toggleReaderHaptics;
  window.toggleReaderHighContrast = toggleReaderHighContrast;
  window.toggleReaderReduceMotion = toggleReaderReduceMotion;

  async function requestWakeLock() {
    if (!wakeLockEnabled || !('wakeLock' in navigator) || document.hidden) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      }, { once: true });
    } catch (error) {
      wakeLock = null;
    }
  }

  async function toggleReaderWakeLock() {
    wakeLockEnabled = !wakeLockEnabled;
    localStorage.setItem(WAKE_KEY, wakeLockEnabled ? '1' : '0');
    syncFeatureToggle(document.getElementById('readerWakeLockToggle'), wakeLockEnabled);

    if (wakeLockEnabled) await requestWakeLock();
    else if (wakeLock) await wakeLock.release();
  }

  window.toggleReaderWakeLock = toggleReaderWakeLock;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });

  function ensureAudioContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    audioContext?.resume?.();
    return audioContext;
  }

  function playPageSound() {
    if (!pageSoundEnabled) return;
    const context = ensureAudioContext();
    if (!context) return;

    const duration = 0.22;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const samples = buffer.getChannelData(0);

    for (let index = 0; index < samples.length; index += 1) {
      const envelope = Math.sin((index / samples.length) * Math.PI);
      samples[index] = (Math.random() * 2 - 1) * envelope * 0.34;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    filter.type = 'bandpass';
    filter.frequency.value = 1150;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);

    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }

  function toggleReaderPageSound() {
    pageSoundEnabled = !pageSoundEnabled;
    localStorage.setItem(SOUND_KEY, pageSoundEnabled ? '1' : '0');
    syncFeatureToggle(document.getElementById('readerPageSoundToggle'), pageSoundEnabled);
    if (pageSoundEnabled) ensureAudioContext();
  }

  window.toggleReaderPageSound = toggleReaderPageSound;
  document.addEventListener('reader:page-turn', playPageSound);

  function loadAnnotations() {
    try {
      const value = JSON.parse(localStorage.getItem(ANNOTATION_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function saveAnnotations(items) {
    localStorage.setItem(ANNOTATION_KEY, JSON.stringify(items));
  }

  function getChapterParagraphs() {
    return Array.from(content.querySelectorAll(
      'p:not(.chapter-empty):not(.chapter-error):not(.chapter-loading)'
    ));
  }

  function applyReaderAnnotations() {
    const annotations = loadAnnotations().filter(item => (
      item.bookId === currentBook &&
      Number(item.chapter) === Number(currentChapter) &&
      (item.type === 'highlight' || item.type === 'note')
    ));
    const paragraphs = getChapterParagraphs();

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const items = annotations
        .filter(item => item.paragraphIndex === paragraphIndex)
        .sort((first, second) => first.start - second.start);
      if (!items.length) return;

      const text = paragraph.textContent;
      const fragment = document.createDocumentFragment();
      let cursor = 0;

      items.forEach(item => {
        const start = Math.min(Math.max(item.start, cursor), text.length);
        const end = Math.min(Math.max(item.end, start), text.length);
        if (start > cursor) fragment.append(text.slice(cursor, start));
        if (end > start) {
          const mark = document.createElement('mark');
          mark.dataset.annotationId = item.id;
          mark.className = item.type === 'note' ? 'reader-note-mark' : 'reader-highlight-mark';
          mark.textContent = text.slice(start, end);
          if (item.note) mark.title = item.note;
          fragment.appendChild(mark);
        }
        cursor = Math.max(cursor, end);
      });

      if (cursor < text.length) fragment.append(text.slice(cursor));
      paragraph.replaceChildren(fragment);
    });
  }

  function getSelectionData() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    const endNode = range.endContainer.nodeType === Node.ELEMENT_NODE
      ? range.endContainer
      : range.endContainer.parentElement;
    const startParagraph = startNode?.closest?.('p');
    const endParagraph = endNode?.closest?.('p');
    if (!startParagraph || startParagraph !== endParagraph || !content.contains(startParagraph)) return null;

    const paragraphs = getChapterParagraphs();
    const paragraphIndex = paragraphs.indexOf(startParagraph);
    if (paragraphIndex < 0) return null;

    const prefix = document.createRange();
    prefix.selectNodeContents(startParagraph);
    prefix.setEnd(range.startContainer, range.startOffset);
    const selectedText = range.toString().trim();
    if (!selectedText) return null;

    const start = prefix.toString().length;
    const end = start + range.toString().length;

    return {
      paragraphIndex,
      start,
      end,
      text: range.toString(),
      rect: range.getBoundingClientRect()
    };
  }

  function hideSelectionTools() {
    if (selectionTools) selectionTools.hidden = true;
    pendingSelection = null;
  }

  function showSelectionTools() {
    if (!selectionTools) return;
    const data = getSelectionData();
    if (!data) {
      hideSelectionTools();
      return;
    }

    pendingSelection = data;
    selectionTools.hidden = false;
    selectionTools.style.left = `${Math.min(
      Math.max(data.rect.left + data.rect.width / 2, 92),
      window.innerWidth - 92
    )}px`;
    selectionTools.style.top = `${Math.max(data.rect.top - 8, 46)}px`;
  }

  function createAnnotation(type, note = '') {
    if (!pendingSelection) return;
    const items = loadAnnotations();
    items.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      bookId: currentBook,
      chapter: currentChapter,
      pageIndex: readerPageIndex,
      paragraphIndex: pendingSelection.paragraphIndex,
      start: pendingSelection.start,
      end: pendingSelection.end,
      text: pendingSelection.text.trim(),
      note: String(note || '').trim(),
      createdAt: Date.now()
    });
    saveAnnotations(items);
    window.getSelection()?.removeAllRanges();
    hideSelectionTools();
    renderChapterContentAnnotations();
  }

  function renderChapterContentAnnotations() {
    document.querySelectorAll('#content mark[data-annotation-id]').forEach(mark => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    content.querySelectorAll('p').forEach(paragraph => paragraph.normalize());
    applyReaderAnnotations();
    renderAnnotationsPanel();
  }

  selectionTools?.addEventListener('click', event => {
    const action = event.target.closest('[data-annotation-action]')?.dataset.annotationAction;
    if (!action || !pendingSelection) return;

    if (action === 'note') {
      const note = window.prompt('Nhập ghi chú cho đoạn đã chọn:');
      if (note === null) return;
      createAnnotation('note', note);
    } else {
      createAnnotation('highlight');
    }
  });

  document.addEventListener('selectionchange', () => {
    window.clearTimeout(selectionTools?._selectionTimer);
    if (!selectionTools) return;
    selectionTools._selectionTimer = window.setTimeout(showSelectionTools, 180);
  });

  document.addEventListener('pointerdown', event => {
    if (!selectionTools?.hidden && !event.target.closest('#readerSelectionTools')) {
      selectionTools.hidden = true;
    }
  });

  function saveCurrentBookmark() {
    const items = loadAnnotations();
    const existingIndex = items.findIndex(item => (
      item.type === 'bookmark' &&
      item.bookId === currentBook &&
      Number(item.chapter) === Number(currentChapter) &&
      Number(item.pageIndex || 0) === Number(readerPageIndex)
    ));

    if (existingIndex >= 0) {
      items.splice(existingIndex, 1);
    } else {
      items.push({
        id: `${Date.now()}-bookmark`,
        type: 'bookmark',
        bookId: currentBook,
        chapter: currentChapter,
        pageIndex: readerPageIndex,
        createdAt: Date.now()
      });
    }

    saveAnnotations(items);
    renderAnnotationsPanel();
  }

  function goToAnnotation(item) {
    pendingAnnotationTarget = item;
    closeReaderPanels();

    if (Number(item.chapter) !== Number(currentChapter)) {
      navigateToReaderChapter(item.chapter);
      return;
    }

    setFlowPage(item.pageIndex || 0, false);
    const escapeSelector = window.CSS?.escape
      ? window.CSS.escape(item.id)
      : item.id.replace(/["\\]/g, '\\$&');
    const mark = document.querySelector(`[data-annotation-id="${escapeSelector}"]`);
    if (!isPaginated()) mark?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  function deleteAnnotation(id) {
    saveAnnotations(loadAnnotations().filter(item => item.id !== id));
    renderChapterContentAnnotations();
  }

  function renderAnnotationsPanel() {
    const list = document.getElementById('readerAnnotationsList');
    const empty = document.getElementById('readerAnnotationsEmpty');
    if (!list || !empty) return;

    const items = loadAnnotations()
      .filter(item => item.bookId === currentBook)
      .sort((first, second) => second.createdAt - first.createdAt);

    list.replaceChildren();
    empty.hidden = items.length > 0;

    items.forEach(item => {
      const row = document.createElement('article');
      const open = document.createElement('button');
      const remove = document.createElement('button');
      const label = document.createElement('small');
      const title = document.createElement('strong');
      const excerpt = document.createElement('p');

      row.className = `reader-annotation-item is-${item.type}`;
      open.type = 'button';
      open.className = 'reader-annotation-open';
      label.textContent = item.type === 'bookmark'
        ? `Dấu trang · Chương ${item.chapter} · Trang ${(item.pageIndex || 0) + 1}`
        : `${item.type === 'note' ? 'Ghi chú' : 'Đánh dấu'} · Chương ${item.chapter}`;
      title.textContent = item.note || item.text || `Chương ${item.chapter}`;
      excerpt.textContent = item.note && item.text ? item.text : '';
      open.append(label, title);
      if (excerpt.textContent) open.appendChild(excerpt);
      open.addEventListener('click', () => goToAnnotation(item));

      remove.type = 'button';
      remove.className = 'reader-annotation-delete';
      remove.setAttribute('aria-label', 'Xóa mục này');
      remove.textContent = '×';
      remove.addEventListener('click', () => deleteAnnotation(item.id));
      row.append(open, remove);
      list.appendChild(row);
    });
  }

  function toggleReaderAnnotations() {
    const panel = document.getElementById('readerAnnotationsPanel');
    if (!panel) return;
    if (panel.classList.contains('is-open')) {
      closeReaderPanels();
      return;
    }
    renderAnnotationsPanel();
    openReaderPanel('readerAnnotationsPanel');
  }

  window.toggleReaderAnnotations = toggleReaderAnnotations;
  document.getElementById('bookmarkCurrentPage')?.addEventListener('click', saveCurrentBookmark);
  content.addEventListener('click', event => {
    const mark = event.target.closest('mark[data-annotation-id]');
    if (mark) toggleReaderAnnotations();
  });

  function applyReaderBrightness(value) {
    const brightness = Math.min(Math.max(Number(value) || 100, 45), 100);
    const range = document.getElementById('readerBrightnessRange');
    const label = document.getElementById('readerBrightnessValue');
    page.style.setProperty('--reader-dim-opacity', String((100 - brightness) / 100 * 0.58));
    if (range) range.value = String(brightness);
    if (label) label.textContent = `${brightness}%`;
    localStorage.setItem(BRIGHTNESS_KEY, String(brightness));
  }

  document.getElementById('readerBrightnessRange')?.addEventListener('input', event => {
    applyReaderBrightness(event.target.value);
  });

  function stopReaderAutoScroll() {
    autoScrollActive = false;
    autoScrollPreviousTime = 0;
    window.cancelAnimationFrame(autoScrollFrame);
    const button = document.getElementById('readerAutoScrollToggle');
    button?.classList.remove('is-active');
    button?.setAttribute('aria-pressed', 'false');
  }

  function autoScrollStep(timestamp) {
    if (!autoScrollActive) return;
    if (!autoScrollPreviousTime) autoScrollPreviousTime = timestamp;
    const elapsed = Math.min(timestamp - autoScrollPreviousTime, 50);
    const speed = Number(document.getElementById('readerAutoScrollSpeed')?.value || 35);
    window.scrollBy(0, speed * elapsed / 1000);
    autoScrollPreviousTime = timestamp;

    const reachedEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    if (reachedEnd) {
      stopReaderAutoScroll();
      return;
    }
    autoScrollFrame = window.requestAnimationFrame(autoScrollStep);
  }

  function toggleReaderAutoScroll() {
    if (autoScrollActive) {
      stopReaderAutoScroll();
      return;
    }

    const oldRatio = readerPageCount > 1
      ? readerPageIndex / (readerPageCount - 1)
      : 0;
    if (isPaginated()) {
      setReaderMode('scroll');
      window.requestAnimationFrame(() => {
        const maximum = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
        window.scrollTo({ top: maximum * oldRatio, behavior: 'auto' });
      });
    }

    autoScrollActive = true;
    autoScrollPreviousTime = 0;
    const button = document.getElementById('readerAutoScrollToggle');
    button?.classList.add('is-active');
    button?.setAttribute('aria-pressed', 'true');
    closeReaderPanels();
    autoScrollFrame = window.requestAnimationFrame(autoScrollStep);
  }

  window.toggleReaderAutoScroll = toggleReaderAutoScroll;
  document.getElementById('readerAutoScrollSpeed')?.addEventListener('input', event => {
    localStorage.setItem(AUTO_SCROLL_SPEED_KEY, String(event.target.value));
  });
  document.getElementById('readerMain')?.addEventListener('pointerdown', () => {
    if (autoScrollActive) stopReaderAutoScroll();
  }, { passive: true });
  window.addEventListener('wheel', () => {
    if (autoScrollActive) stopReaderAutoScroll();
  }, { passive: true });

  function loadReaderHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function recordCurrentChapter() {
    if (!currentBook || !currentChapter) return;
    const history = loadReaderHistory();
    history[currentBook] = {
      ...(history[currentBook] || {}),
      [currentChapter]: { visitedAt: Date.now() }
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function decorateReaderToc() {
    const history = loadReaderHistory()[currentBook] || {};
    document.querySelectorAll('.reader-toc-item[data-chapter]').forEach(item => {
      const chapter = Number(item.dataset.chapter);
      const read = Boolean(history[chapter]);
      item.classList.toggle('is-read', read);
      item.classList.toggle('is-unread', !read);
    });
  }

  renderReaderToc = function enhancedReaderToc(...args) {
    const result = originalRenderReaderToc(...args);
    decorateReaderToc();
    return result;
  };

  function updateReaderSessionSummary() {
    const summary = document.getElementById('readerSessionSummary');
    if (!summary) return;
    const fields = summary.querySelectorAll('strong');
    const words = countWords(content.textContent);
    const chapterMinutes = Math.max(1, Math.round(words / 220));
    const estimatedBookMinutes = chapterMinutes * Math.max(chapterIndex.length, 1);
    const sessionMinutes = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 60000));

    if (fields[0]) fields[0].textContent = `${chapterMinutes} phút`;
    if (fields[1]) {
      fields[1].textContent = estimatedBookMinutes >= 60
        ? `≈ ${(estimatedBookMinutes / 60).toFixed(1)} giờ`
        : `≈ ${estimatedBookMinutes} phút`;
    }
    if (fields[2]) fields[2].textContent = `${sessionMinutes} phút`;
  }

  window.setInterval(updateReaderSessionSummary, 30000);

  function exportReaderNotes() {
    const items = loadAnnotations()
      .filter(item => item.bookId === currentBook)
      .sort((first, second) => Number(first.chapter) - Number(second.chapter));
    if (!items.length) return;

    const lines = [
      `Ghi chú đọc truyện: ${document.getElementById('readerBookTitle')?.textContent || currentBook}`,
      `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`,
      ''
    ];

    items.forEach(item => {
      const type = item.type === 'bookmark' ? 'DẤU TRANG' : item.type === 'note' ? 'GHI CHÚ' : 'ĐÁNH DẤU';
      lines.push(`[${type}] Chương ${item.chapter}${item.pageIndex !== undefined ? ` · Trang ${Number(item.pageIndex) + 1}` : ''}`);
      if (item.text) lines.push(`Trích đoạn: ${item.text}`);
      if (item.note) lines.push(`Nội dung: ${item.note}`);
      lines.push('');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentBook || 'truyen'}-ghi-chu.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('exportReaderNotes')?.addEventListener('click', exportReaderNotes);

  function normalizeStorySearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase();
  }

  function createSearchExcerpt(text, query) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    const normalizedSource = normalizeStorySearch(source);
    const normalizedQuery = normalizeStorySearch(query);
    const index = normalizedSource.indexOf(normalizedQuery);
    if (index < 0) return '';
    const start = Math.max(index - 90, 0);
    const end = Math.min(index + normalizedQuery.length + 130, source.length);
    return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
  }

  function renderReaderSearchResults(results) {
    const container = document.getElementById('readerSearchResults');
    if (!container) return;
    container.replaceChildren();

    results.forEach(result => {
      const button = document.createElement('button');
      const heading = document.createElement('strong');
      const excerpt = document.createElement('span');
      button.type = 'button';
      button.className = 'reader-search-result';
      heading.textContent = result.title;
      excerpt.textContent = result.excerpt;
      button.append(heading, excerpt);
      button.addEventListener('click', () => {
        closeReaderPanels();
        if (Number(result.chapter) !== Number(currentChapter)) {
          navigateToReaderChapter(result.chapter);
        } else if (!isPaginated()) {
          content.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      container.appendChild(button);
    });
  }

  async function runReaderSearch() {
    const input = document.getElementById('readerStorySearchInput');
    const status = document.getElementById('readerSearchStatus');
    const submit = document.getElementById('runReaderSearch');
    const query = input?.value.trim() || '';
    if (query.length < 2) {
      if (status) status.textContent = 'Hãy nhập ít nhất 2 ký tự.';
      return;
    }

    const token = ++readerSearchToken;
    const results = [];
    submit.disabled = true;
    if (status) status.textContent = 'Đang tìm kiếm…';

    const inspectChapter = async chapter => {
      try {
        const text = await fetchChapterText(chapter.number);
        const excerpt = createSearchExcerpt(text, query);
        if (excerpt) {
          results.push({
            chapter: chapter.number,
            title: getChapterDisplayTitle(chapter),
            excerpt
          });
        }
      } catch {
        // Bỏ qua chương chưa có nội dung hoặc không thể tải.
      }
    };

    try {
      if (readerSearchScope === 'chapter') {
        const chapter = getCurrentChapterData() || { number: currentChapter, title: `Chương ${currentChapter}` };
        await inspectChapter(chapter);
      } else {
        const batchSize = 4;
        for (let index = 0; index < chapterIndex.length && results.length < 120; index += batchSize) {
          if (token !== readerSearchToken) return;
          const batch = chapterIndex.slice(index, index + batchSize);
          await Promise.all(batch.map(inspectChapter));
          if (status) {
            status.textContent = `Đã tìm ${Math.min(index + batch.length, chapterIndex.length)}/${chapterIndex.length} chương · ${results.length} kết quả`;
          }
        }
      }

      if (token !== readerSearchToken) return;
      results.sort((first, second) => first.chapter - second.chapter);
      renderReaderSearchResults(results);
      if (status) {
        status.textContent = results.length
          ? `${results.length} chương có chứa “${query}”${results.length >= 120 ? ' · đã giới hạn 120 kết quả' : ''}`
          : `Không tìm thấy “${query}”.`;
      }
    } finally {
      if (token === readerSearchToken) submit.disabled = false;
    }
  }

  function toggleReaderSearch() {
    const panel = document.getElementById('readerSearchPanel');
    if (!panel) return;
    if (panel.classList.contains('is-open')) {
      closeReaderPanels();
      return;
    }
    openReaderPanel('readerSearchPanel');
    window.setTimeout(() => document.getElementById('readerStorySearchInput')?.focus(), 180);
  }

  window.toggleReaderSearch = toggleReaderSearch;
  document.querySelectorAll('[data-reader-search-scope]').forEach(button => {
    button.addEventListener('click', () => {
      readerSearchScope = button.dataset.readerSearchScope === 'book' ? 'book' : 'chapter';
      document.querySelectorAll('[data-reader-search-scope]').forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    });
  });
  document.getElementById('runReaderSearch')?.addEventListener('click', runReaderSearch);
  document.getElementById('readerStorySearchInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') runReaderSearch();
  });

  function setOfflineStatus(message, error = false) {
    const status = document.getElementById('readerOfflineStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  async function cacheReaderUrl(cache, url) {
    const request = new Request(encodeURI(url), { mode: 'cors' });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await cache.put(request, response.clone());
  }

  async function saveReaderOffline() {
    if (!('caches' in window)) {
      setOfflineStatus('Trình duyệt này chưa hỗ trợ lưu ngoại tuyến.', true);
      return;
    }

    const button = document.getElementById('saveOfflineChapters');
    button.disabled = true;
    setOfflineStatus('Đang lưu chương và hình ảnh…');

    try {
      const cache = await caches.open(OFFLINE_CACHE);
      const currentPosition = getCurrentChapterPosition();
      const chapters = chapterIndex.slice(
        Math.max(currentPosition - 2, 0),
        Math.min(currentPosition + 3, chapterIndex.length)
      );
      const urls = [createBookDataUrl(currentBook, 'chapters.json')];

      chapters.forEach(chapter => {
        urls.push(getChapterPath(chapter.number));
        urls.push(createBookDataUrl(currentBook, `${chapter.number}.txt`));
        const image = getChapterImage(chapter.number);
        if (image) urls.push(image);
      });

      const uniqueUrls = [...new Set(urls.filter(Boolean))];
      const outcomes = await Promise.allSettled(uniqueUrls.map(url => cacheReaderUrl(cache, url)));
      const saved = outcomes.filter(result => result.status === 'fulfilled').length;
      setOfflineStatus(`Đã lưu ${saved}/${uniqueUrls.length} tài nguyên để đọc khi mất mạng.`);
    } catch (error) {
      setOfflineStatus('Không thể lưu ngoại tuyến. Hãy kiểm tra dung lượng trình duyệt.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function clearReaderOffline() {
    if (!('caches' in window)) return;
    const cachesToClean = await Promise.all([
      caches.open(OFFLINE_CACHE),
      caches.open(DATA_RUNTIME_CACHE)
    ]);
    let deletedCount = 0;

    for (const cache of cachesToClean) {
      const requests = await cache.keys();
      const deleted = await Promise.all(requests.map(request => {
        let belongsToBook = false;
        try {
          const pathname = decodeURIComponent(new URL(request.url).pathname);
          belongsToBook = pathname.includes(`/data/${currentBook}/`) ||
            pathname.includes(`/${currentBook}/`);
        } catch {
          belongsToBook = false;
        }
        return belongsToBook ? cache.delete(request) : false;
      }));
      deletedCount += deleted.filter(Boolean).length;
    }

    setOfflineStatus(`Đã xóa ${deletedCount} tài nguyên ngoại tuyến của truyện này.`);
  }

  window.saveReaderOffline = saveReaderOffline;
  window.clearReaderOffline = clearReaderOffline;

  function prefetchNearbyChapters() {
    const position = getCurrentChapterPosition();
    const candidates = [-2, -1, 1, 2]
      .map(offset => chapterIndex[position + offset])
      .filter(Boolean);
    const run = () => {
      candidates.forEach(chapter => {
        fetchChapterText(chapter.number).catch(() => {});
        const chapterImage = getChapterImage(chapter.number);
        if (chapterImage) {
          const image = new Image();
          image.src = chapterImage;
        }
      });
    };

    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1800 });
    else window.setTimeout(run, 500);
  }

  function handleChapterRendered() {
    applyReaderAnnotations();
    recordCurrentChapter();
    decorateReaderToc();
    updateReaderSessionSummary();
    recalculatePagination({ restore: true });
    prefetchNearbyChapters();

    if (pendingAnnotationTarget) {
      const target = pendingAnnotationTarget;
      pendingAnnotationTarget = null;
      window.setTimeout(() => goToAnnotation(target), 160);
    }
  }

  document.addEventListener('reader:chapter-rendered', handleChapterRendered);
  document.addEventListener('reader:page-turn-finished', () => {
    lastSwipeFinishedAt = Date.now();
  });

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => recalculatePagination())
    : null;
  resizeObserver?.observe(paper);

  window.addEventListener('resize', () => {
    syncSpreadLayout();
    recalculatePagination();
  });
  window.addEventListener('orientationchange', () => recalculatePagination());

  setReaderMode(readerMode, false);
  applyReaderBrightness(localStorage.getItem(BRIGHTNESS_KEY) || 100);
  const autoSpeed = document.getElementById('readerAutoScrollSpeed');
  if (autoSpeed) autoSpeed.value = localStorage.getItem(AUTO_SCROLL_SPEED_KEY) || '35';
  page.classList.toggle('reader-high-contrast', highContrastEnabled);
  page.classList.toggle('reader-reduce-motion', reduceMotionEnabled);
  syncFeatureToggle(document.getElementById('readerWakeLockToggle'), wakeLockEnabled);
  syncFeatureToggle(document.getElementById('readerPageSoundToggle'), pageSoundEnabled);
  syncFeatureToggle(document.getElementById('readerSpreadToggle'), spreadEnabled);
  syncFeatureToggle(document.getElementById('readerGestureToggle'), gesturesEnabled);
  syncFeatureToggle(document.getElementById('readerHapticsToggle'), hapticsEnabled);
  syncFeatureToggle(document.getElementById('readerHighContrastToggle'), highContrastEnabled);
  syncFeatureToggle(document.getElementById('readerReduceMotionToggle'), reduceMotionEnabled);
  updateReaderSessionSummary();
  requestWakeLock();
})();
