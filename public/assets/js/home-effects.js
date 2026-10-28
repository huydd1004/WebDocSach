(() => {
  const page = document.body;

  if (!page.classList.contains('home-v2')) {
    return;
  }

  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const finePointer = window.matchMedia(
    '(hover: hover) and (pointer: fine)'
  ).matches;

  page.classList.add('js-home-effects');

  if (reduceMotion) {
    page.classList.add('home-effects-reduced');
  } else {
    page.classList.add('home-effects-ready');
  }

  function setupScrollEffects() {
    const header =
      document.querySelector('.site-header');

    let progressBar =
      document.getElementById(
        'homeScrollProgress'
      );

    if (!progressBar) {
      progressBar =
        document.createElement('span');

      progressBar.id =
        'homeScrollProgress';

      progressBar.className =
        'home-scroll-progress';

      progressBar.setAttribute(
        'aria-hidden',
        'true'
      );

      header?.appendChild(progressBar);
    }

    let ticking = false;

    function updateScrollEffects() {
      const scrollTop =
        window.scrollY ||
        document.documentElement.scrollTop;

      const maximumScroll = Math.max(
        document.documentElement.scrollHeight -
          window.innerHeight,
        1
      );

      const progress = Math.min(
        Math.max(
          scrollTop / maximumScroll,
          0
        ),
        1
      );

      header?.classList.toggle(
        'is-scrolled',
        scrollTop > 18
      );

      if (progressBar) {
        progressBar.style.transform =
          `scaleX(${progress})`;
      }

      ticking = false;
    }

    function handleScroll() {
      if (ticking) {
        return;
      }

      ticking = true;

      window.requestAnimationFrame(
        updateScrollEffects
      );
    }

    window.addEventListener(
      'scroll',
      handleScroll,
      { passive: true }
    );

    window.addEventListener(
      'resize',
      handleScroll
    );

    updateScrollEffects();
  }

  function setupCounter(element) {
    if (!element) {
      return;
    }

    let observer = null;

    function readTarget() {
      const digits = String(
        element.textContent || ''
      ).replace(/\D/g, '');

      if (!digits) {
        return null;
      }

      return Number(digits);
    }

    function animateCounter(target) {
      if (
        element.dataset.counterAnimated ===
        'true'
      ) {
        return;
      }

      element.dataset.counterAnimated =
        'true';

      if (
        reduceMotion ||
        !Number.isFinite(target)
      ) {
        element.textContent =
          new Intl.NumberFormat(
            'vi-VN'
          ).format(target);

        return;
      }

      const formatter =
        new Intl.NumberFormat('vi-VN');

      const duration = 900;
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed =
          currentTime - startTime;

        const rawProgress = Math.min(
          elapsed / duration,
          1
        );

        const easedProgress =
          1 -
          Math.pow(
            1 - rawProgress,
            3
          );

        const currentValue = Math.round(
          target * easedProgress
        );

        element.textContent =
          formatter.format(currentValue);

        if (rawProgress < 1) {
          window.requestAnimationFrame(
            update
          );
        } else {
          element.textContent =
            formatter.format(target);
        }
      }

      window.requestAnimationFrame(update);
    }

    function tryStartCounter() {
      const target = readTarget();

      if (target === null) {
        return;
      }

      observer?.disconnect();
      animateCounter(target);
    }

    observer = new MutationObserver(
      tryStartCounter
    );

    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true
    });

    tryStartCounter();
  }

  function setupStatisticsCounters() {
    [
      'totalBooksStat',
      'readingBooksStat',
      'favoriteBooksStat'
    ].forEach(id => {
      setupCounter(
        document.getElementById(id)
      );
    });
  }

  function setupRevealEffects() {
    const selectors = [
      '.featured-book',
      '.overview-card',
      '.continue-reading-section',
      '.library-heading',
      '.library-toolbar',
      '.genre-filter-area',
      '.library-results',
      '.book',
      '.continue-card'
    ];

    let revealIndex = 0;

    const revealObserver =
      !reduceMotion &&
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            entries => {
              entries.forEach(entry => {
                if (!entry.isIntersecting) {
                  return;
                }

                entry.target.classList.add(
                  'is-visible'
                );

                revealObserver.unobserve(
                  entry.target
                );
              });
            },
            {
              threshold: 0.12,
              rootMargin:
                '0px 0px -45px 0px'
            }
          )
        : null;

    function registerElement(element) {
      if (
        !element ||
        element.dataset.revealReady ===
          'true'
      ) {
        return;
      }

      element.dataset.revealReady =
        'true';

      element.classList.add(
        'home-reveal'
      );

      element.style.setProperty(
        '--reveal-delay',
        `${Math.min(
          revealIndex % 8,
          7
        ) * 55}ms`
      );

      revealIndex += 1;

      if (revealObserver) {
        revealObserver.observe(element);
      } else {
        element.classList.add(
          'is-visible'
        );
      }
    }

    document
      .querySelectorAll(
        selectors.join(',')
      )
      .forEach(registerElement);

    const mutationObserver =
      new MutationObserver(records => {
        records.forEach(record => {
          record.addedNodes.forEach(node => {
            if (
              !(node instanceof Element)
            ) {
              return;
            }

            if (
              node.matches(
                '.book, .continue-card'
              )
            ) {
              registerElement(node);
            }

            node
              .querySelectorAll?.(
                '.book, .continue-card'
              )
              .forEach(registerElement);
          });
        });
      });

    mutationObserver.observe(page, {
      childList: true,
      subtree: true
    });

    return registerElement;
  }

  function setupHeroEffects() {
    const hero =
      document.querySelector(
        '.featured-book'
      );

    if (!hero || !finePointer) {
      return;
    }

    const cover =
      hero.querySelector(
        '.featured-cover-frame'
      );

    hero.addEventListener(
      'pointermove',
      event => {
        const rect =
          hero.getBoundingClientRect();

        const x =
          (event.clientX - rect.left) /
          rect.width;

        const y =
          (event.clientY - rect.top) /
          rect.height;

        const rotateY =
          (x - 0.5) * 7;

        const rotateX =
          (0.5 - y) * 7;

        hero.style.setProperty(
          '--hero-light-x',
          `${x * 100}%`
        );

        hero.style.setProperty(
          '--hero-light-y',
          `${y * 100}%`
        );

        cover?.style.setProperty(
          '--hero-rotate-x',
          `${rotateX}deg`
        );

        cover?.style.setProperty(
          '--hero-rotate-y',
          `${rotateY}deg`
        );
      }
    );

    hero.addEventListener(
      'pointerleave',
      () => {
        cover?.style.setProperty(
          '--hero-rotate-x',
          '0deg'
        );

        cover?.style.setProperty(
          '--hero-rotate-y',
          '0deg'
        );

        hero.style.setProperty(
          '--hero-light-x',
          '79%'
        );

        hero.style.setProperty(
          '--hero-light-y',
          '46%'
        );
      }
    );
  }

  function setupBookCardEffects(card) {
    if (
      !card ||
      card.dataset.motionBound === 'true'
    ) {
      return;
    }

    card.dataset.motionBound = 'true';

    if (!finePointer || reduceMotion) {
      return;
    }

    card.classList.add(
      'home-tilt-card'
    );

    card.addEventListener(
      'pointermove',
      event => {
        const rect =
          card.getBoundingClientRect();

        const x =
          (event.clientX - rect.left) /
          rect.width;

        const y =
          (event.clientY - rect.top) /
          rect.height;

        const rotateY =
          (x - 0.5) * 5;

        const rotateX =
          (0.5 - y) * 5;

        card.style.setProperty(
          '--card-rotate-x',
          `${rotateX}deg`
        );

        card.style.setProperty(
          '--card-rotate-y',
          `${rotateY}deg`
        );

        card.style.setProperty(
          '--card-light-x',
          `${x * 100}%`
        );

        card.style.setProperty(
          '--card-light-y',
          `${y * 100}%`
        );
      }
    );

    card.addEventListener(
      'pointerleave',
      () => {
        card.style.setProperty(
          '--card-rotate-x',
          '0deg'
        );

        card.style.setProperty(
          '--card-rotate-y',
          '0deg'
        );

        card.style.setProperty(
          '--card-light-x',
          '50%'
        );

        card.style.setProperty(
          '--card-light-y',
          '25%'
        );
      }
    );
  }

  function setupDynamicCardEffects() {
    document
      .querySelectorAll('.book')
      .forEach(setupBookCardEffects);

    const observer =
      new MutationObserver(records => {
        records.forEach(record => {
          record.addedNodes.forEach(node => {
            if (
              !(node instanceof Element)
            ) {
              return;
            }

            if (node.matches('.book')) {
              setupBookCardEffects(node);
            }

            node
              .querySelectorAll?.('.book')
              .forEach(
                setupBookCardEffects
              );
          });
        });
      });

    const bookList =
      document.getElementById('book-list');

    if (bookList) {
      observer.observe(bookList, {
        childList: true,
        subtree: true
      });
    }
  }

  function setupRippleEffects() {
    if (reduceMotion) {
      return;
    }

    const rippleSelector = [
      '.featured-read-button',
      '.featured-detail-button',
      '.library-view-tab',
      '.layout-switch-button',
      '.book-quick-read',
      '.section-text-button',
      '.backup-btn'
    ].join(',');

    document.addEventListener(
      'pointerdown',
      event => {
        const target =
          event.target.closest(
            rippleSelector
          );

        if (!target) {
          return;
        }

        const rect =
          target.getBoundingClientRect();

        const size =
          Math.max(
            rect.width,
            rect.height
          ) * 1.35;

        const ripple =
          document.createElement('span');

        ripple.className =
          'home-ripple';

        ripple.style.width =
          `${size}px`;

        ripple.style.height =
          `${size}px`;

        ripple.style.left =
          `${event.clientX -
            rect.left -
            size / 2}px`;

        ripple.style.top =
          `${event.clientY -
            rect.top -
            size / 2}px`;

        target.classList.add(
          'home-ripple-host'
        );

        target.appendChild(ripple);

        ripple.addEventListener(
          'animationend',
          () => ripple.remove(),
          { once: true }
        );
      }
    );
  }

  function setupSearchShortcut() {
    const searchInput =
      document.getElementById(
        'bookSearch'
      );

    if (!searchInput) {
      return;
    }

    document.addEventListener(
      'keydown',
      event => {
        const targetTag =
          event.target?.tagName;

        const isTyping =
          targetTag === 'INPUT' ||
          targetTag === 'TEXTAREA' ||
          targetTag === 'SELECT';

        if (
          event.key === '/' &&
          !isTyping &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey
        ) {
          event.preventDefault();

          searchInput.focus({
            preventScroll: false
          });

          searchInput.select();
        }

        if (
          event.key === 'Escape' &&
          document.activeElement ===
            searchInput
        ) {
          searchInput.value = '';

          searchInput.dispatchEvent(
            new Event('input', {
              bubbles: true
            })
          );

          searchInput.blur();
        }
      }
    );
  }

  setupScrollEffects();
  setupStatisticsCounters();
  setupRevealEffects();
  setupHeroEffects();
  setupDynamicCardEffects();
  setupRippleEffects();
  setupSearchShortcut();
})();
