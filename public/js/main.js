const res = await fetch("/games/json");
const games = await res.json();
window.games = games;
console.table(games);

const bannerGame = games.find(game => game.banner);
const gameBanner = document.getElementById('game-banner');
if (bannerGame && gameBanner) {
  const bannerImage = document.getElementById('banner-image');
  bannerImage.src = bannerGame.img || 'https://placehold.co/400x400?text=No+Image';
  bannerImage.alt = bannerGame.name || 'Featured game';
  bannerImage.onerror = () => {
    bannerImage.src = 'https://placehold.co/400x400?text=No+Image';
  };
  document.getElementById('banner-title').textContent =
    String(bannerGame.name || 'Featured game').replace(' - DAILY FEATURE', '');
  document.getElementById('banner-description').textContent = bannerGame.description || '';
  gameBanner.hidden = false;
}
    
const bootSequence = document.getElementById('boot-sequence');
const qotdElement = document.getElementById('qotd');

const { openBlankTab } = await import('./module/private.js'); 

if (window.location.href.includes('?secret')) { 
  openBlankTab('https://games.chedar.dev/'); 
  window.close();
}

// ADMIN THINGY

async function showAdminPopup() {
  location.href = '/admin/';
}

window.showAdminPopup = showAdminPopup;

const FAVS_KEY = 'goofygames:favs';
const RECENT_KEY = 'goofygames:recent';
const THEME_KEY = 'goofygames:theme';

const readStore = (k) => { try { return JSON.parse(localStorage.getItem(k)) || [] } catch { return [] } };
const writeStore = (k, v) => localStorage.setItem(k, JSON.stringify(v));
function getFavs() { return readStore(FAVS_KEY); }
function isFav(id) { return getFavs().includes(String(id)); }
function toggleFav(id) {
  const f = getFavs();
  const s = String(id);
  const i = f.indexOf(s);
  if (i === -1) f.push(s);
  else f.splice(i, 1);
  writeStore(FAVS_KEY, f);
  return i === -1;
}
function getRecent() { return readStore(RECENT_KEY); }
function pushRecent(id) {
  const r = getRecent().filter(x => x !== String(id));
  r.unshift(String(id));
  if (r.length > 12) r.length = 12;
  writeStore(RECENT_KEY, r);
}

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  const label = document.getElementById('theme-toggle-label');
  const icon = toggle?.querySelector('.theme-toggle-icon');
  if (!toggle || !label || !icon) return;

  const root = document.documentElement;
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  let hasThemeOverride = root.dataset.theme === 'light' || root.dataset.theme === 'dark';

  function updateToggle() {
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : colorScheme.matches;
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    label.textContent = isDark ? 'Light mode' : 'Dark mode';
    icon.textContent = isDark ? '☀' : '☾';
  }

  toggle.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' || (!root.dataset.theme && colorScheme.matches)
      ? 'light'
      : 'dark';
    root.dataset.theme = nextTheme;
    hasThemeOverride = true;
    updateToggle();
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.error('Could not save the theme preference.', error);
    }
  });

  colorScheme.addEventListener('change', () => {
    if (!hasThemeOverride) updateToggle();
  });
  updateToggle();
}

function init() {
  try {
    initThemeToggle();
    let activeTimeouts = [];

    const popup = document.getElementById('popup');
    const closePopupBtn = document.getElementById('close-popup');
    const notification = document.querySelector('.notif');
    const notificationCloseBtn = document.getElementById('notification-close');
    const gameIframe = document.getElementById('game-iframe');
    const gamesGrid = document.getElementById('games-grid');
    const searchInput = document.getElementById('search');
    const sidebarTitle = document.getElementById('sidebar-title');
    const sidebarImage = document.getElementById('sidebar-image');
    const sidebarDescription = document.getElementById('sidebar-description');
    const sidebarSimilarGames = document.getElementById('sidebar-similar-games');
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarCloseBtn = document.getElementById('sidebar-close-game');
    const popupTitle = document.getElementById('popup-title');
    const bannerPlay = document.getElementById('banner-play');

    const chipRow = document.getElementById('chip-row');
    const sidebarFullscreen = document.getElementById('sidebar-fullscreen');
    const sidebarNewTab = document.getElementById('sidebar-newtab');
    const saveStateSection = document.getElementById('save-state-section');
    const ssSave = document.getElementById('ss-save');
    const ssLoad = document.getElementById('ss-load');
    const ssFile = document.getElementById('ss-file');
    const ssStatus = document.getElementById('ss-status');

    const state = { tab: 'all', category: null, sort: 'clicks' };
    let activeGame = null;
    let launchGameEffect = null;
    let caseSpinTimeout = null;
    let caseLaunchTimeout = null;
    let caseWinnerTile = null;
    let caseOpener = null;

    const caseModal = document.getElementById('case-opening-modal');
    const caseCloseBtn = document.getElementById('case-opening-close');
    const caseTrack = document.getElementById('case-reel-track');
    const caseReel = document.getElementById('case-reel');
    const caseStatus = document.getElementById('case-opening-status');
    const randomGameBtn = document.getElementById('random-game-btn');
    let caseIsSpinning = false;
    let caseScaleAnimationFrame = null;

    function updateCaseItemScales() {
      if (!caseIsSpinning) return;

      const reelBounds = caseReel.getBoundingClientRect();
      const markerX = reelBounds.left + reelBounds.width / 2;
      const fadeDistance = reelBounds.width * 0.42;
      const tiles = caseTrack.children;
      const firstTile = tiles[0];
      if (!firstTile) return;

      const firstBounds = firstTile.getBoundingClientRect();
      const tileWidth = firstTile.offsetWidth;
      const gap = parseFloat(window.getComputedStyle(caseTrack).columnGap) || 0;
      const step = tileWidth + gap;
      const firstCenter = firstBounds.left + firstBounds.width / 2;

      Array.from(tiles).forEach((tile, index) => {
        const distance = Math.min(1, Math.abs(firstCenter + index * step - markerX) / fadeDistance);
        tile.style.setProperty('--case-item-scale', (1 - distance * 0.12).toFixed(3));
        tile.style.setProperty('--case-item-opacity', (1 - distance * 0.62).toFixed(3));
        tile.style.setProperty('--case-item-blur', `${(distance * 1.5).toFixed(2)}px`);
      });

      caseScaleAnimationFrame = requestAnimationFrame(updateCaseItemScales);
    }

    function closeCaseModal() {
      if (caseSpinTimeout) clearTimeout(caseSpinTimeout);
      if (caseLaunchTimeout) clearTimeout(caseLaunchTimeout);
      if (caseScaleAnimationFrame) cancelAnimationFrame(caseScaleAnimationFrame);
      caseSpinTimeout = null;
      caseLaunchTimeout = null;
      caseScaleAnimationFrame = null;
      caseIsSpinning = false;
      caseModal.hidden = true;
      caseModal.classList.remove('case-opening-modal--revealed');
      caseTrack.style.transition = 'none';
      caseTrack.style.transform = 'translateX(0)';
      caseWinnerTile = null;
      if (caseOpener) caseOpener.focus();
    }

    function openRandomGameCase() {
      if (caseIsSpinning || !caseModal.hidden) return;

      const availableGames = games.filter(game => game && game.url && game.name);
      caseOpener = randomGameBtn;
      caseModal.hidden = false;
      caseModal.classList.remove('case-opening-modal--revealed');
      caseCloseBtn.focus();

      if (!availableGames.length) {
        caseStatus.textContent = 'No games are available right now.';
        return;
      }

      caseIsSpinning = true;
      caseWinnerTile = null;
      caseTrack.innerHTML = '';
      caseTrack.style.transition = 'none';
      caseTrack.style.transform = 'translateX(0)';

      const winner = availableGames[Math.floor(Math.random() * availableGames.length)];
      const winnerIndex = 42;
      const trailingItems = 14;
      const tierColors = ['var(--blue)', 'var(--purple)', 'var(--pink)', 'var(--red)', 'var(--yellow)'];
      let winnerTile = null;

      for (let index = 0; index <= winnerIndex + trailingItems; index += 1) {
        const game = index === winnerIndex
          ? winner
          : availableGames[Math.floor(Math.random() * availableGames.length)];
        const tile = document.createElement('div');
        tile.className = 'case-reel-item';
        tile.style.setProperty('--case-tier-color', tierColors[Math.floor(Math.random() * tierColors.length)]);

        const image = document.createElement('img');
        image.src = game.img || 'https://placehold.co/160x110/1a1a2e/667eea?text=No+Image';
        image.alt = '';
        image.draggable = false;
        image.onerror = () => {
          image.src = 'https://placehold.co/160x110/1a1a2e/667eea?text=No+Image';
        };

        const name = document.createElement('span');
        name.textContent = String(game.name).replace(' - DAILY FEATURE', '');
        tile.append(image, name);
        caseTrack.appendChild(tile);

        if (index === winnerIndex) {
          tile.classList.add('case-reel-item--winner');
          winnerTile = tile;
        }
      }

      caseStatus.textContent = 'Rolling...';
      void caseTrack.offsetWidth;
      const targetOffset = winnerTile.offsetLeft + winnerTile.offsetWidth / 2 - caseTrack.parentElement.clientWidth / 2;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const revealWinner = () => {
        if (!caseIsSpinning) return;
        caseIsSpinning = false;
        caseSpinTimeout = null;
        if (caseScaleAnimationFrame) cancelAnimationFrame(caseScaleAnimationFrame);
        caseScaleAnimationFrame = null;
        caseWinnerTile = winnerTile;
        caseModal.classList.add('case-opening-modal--revealed');
        winnerTile.style.setProperty('--case-item-scale', '1');
        caseStatus.textContent = `${String(winner.name).replace(' - DAILY FEATURE', '')}`;
        caseLaunchTimeout = setTimeout(() => {
          if (launchGameEffect) {
            launchGameEffect(winnerTile, winner.url, winner.id || '');
            caseModal.hidden = true;
            caseModal.classList.remove('case-opening-modal--revealed');
            caseWinnerTile = null;
            if (caseOpener) caseOpener.focus();
          } else {
            closeCaseModal();
            openPopup(winner.url, winner.id || '');
          }
        }, 950);
      };

      caseTrack.addEventListener('transitionend', event => {
        if (event.target === caseTrack && event.propertyName === 'transform') revealWinner();
      }, { once: true });
      if (reducedMotion) {
        caseTrack.style.transition = 'none';
        caseTrack.style.transform = `translateX(-${Math.max(0, targetOffset)}px)`;
        updateCaseItemScales();
        revealWinner();
      } else {
        caseTrack.style.transition = 'transform 5.4s cubic-bezier(0.08, 0.82, 0.15, 1)';
        caseTrack.style.transform = `translateX(-${Math.max(0, targetOffset)}px)`;
        updateCaseItemScales();
        caseSpinTimeout = setTimeout(revealWinner, 6200);
      }
    }

    randomGameBtn.addEventListener('click', openRandomGameCase);
    caseCloseBtn.addEventListener('click', closeCaseModal);
    caseModal.addEventListener('click', event => {
      if (event.target === caseModal) closeCaseModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !caseModal.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeCaseModal();
      }
    }, true);

    function closeNotification() {
      if (notification.classList.contains('is-closing')) return;

      notification.classList.add('is-closing');
      notification.querySelector('.notif-content').addEventListener('animationend', (event) => {
        if (event.animationName === 'notification-slide-up') notification.hidden = true;
      }, { once: true });
    }

    notificationCloseBtn.addEventListener('click', closeNotification);

    (function () {
      let flashOverlay, hero, heroImg, loadingRing, backdrop;
      let launchTimeout = null;

      function buildDOM() {
        flashOverlay = document.createElement('div');
        flashOverlay.className = 'card-flash-overlay';
        document.body.appendChild(flashOverlay);

        backdrop = document.createElement('div');
        backdrop.className = 'launch-backdrop';
        document.body.appendChild(backdrop);

        hero = document.createElement('div');
        hero.className = 'game-launch-hero';
        heroImg = document.createElement('img');
        heroImg.draggable = false;
        hero.appendChild(heroImg);
        document.body.appendChild(hero);

        loadingRing = document.createElement('div');
        loadingRing.className = 'launch-loading-ring';
        loadingRing.innerHTML = `
          <div class="ring-spinner"></div>
          <span class="ring-label">Loading</span>
        `;
        document.body.appendChild(loadingRing);
      }

      function clearClasses(el, ...classes) { el.classList.remove(...classes); }
      function getCardRect(card) { return card.getBoundingClientRect(); }
      function getImgSrc(card) { const img = card.querySelector('img'); return img ? img.src : ''; }

      function spawnRipple(cx, cy, size) {
        const r = document.createElement('div');
        r.className = 'click-ripple';
        r.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`;
        document.body.appendChild(r);
        r.addEventListener('animationend', () => r.remove());
      }



      function launchGame(card, url, gameId, openPopupFn) {
        if (launchTimeout) clearTimeout(launchTimeout);



        const rect = getCardRect(card);
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        spawnRipple(cx, cy, Math.min(rect.width, rect.height));

        card.classList.add('launching');
        card.addEventListener('animationend', () => card.classList.remove('launching'), { once: true });

        flashOverlay.classList.remove('flash-active');
        void flashOverlay.offsetWidth;
        flashOverlay.classList.add('flash-active');
        flashOverlay.addEventListener('animationend', () => flashOverlay.classList.remove('flash-active'), { once: true });

        hero.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;opacity:1;border-radius:16px;`;
        heroImg.src = getImgSrc(card);

        clearClasses(hero, 'hero-expanding', 'hero-blurring', 'hero-fadeout');
        clearClasses(loadingRing, 'ring-visible', 'ring-fadeout');
        clearClasses(backdrop, 'backdrop-visible', 'backdrop-hidden');

        requestAnimationFrame(() => { backdrop.classList.add('backdrop-visible'); });

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const duration = '0.82s';
            const easing = 'cubic-bezier(0.15, 0.85, 0.35, 1)';

            hero.style.transition = [
              `left ${duration} ${easing}`,
              `top ${duration} ${easing}`,
              `width ${duration} ${easing}`,
              `height ${duration} ${easing}`,
              `border-radius ${duration} ${easing}`,
              'box-shadow 0.6s ease'
            ].join(',');

            hero.style.left = '0px';
            hero.style.top = '0px';
            hero.style.width = `${vw}px`;
            hero.style.height = `${vh}px`;
            hero.style.borderRadius = '0px';
            hero.style.boxShadow = '0 0 0 0 transparent';
            hero.classList.add('hero-expanding');
          });
        });

        launchTimeout = setTimeout(() => {
          hero.classList.add('hero-blurring');
          loadingRing.classList.add('ring-visible');

          openPopupFn(url, gameId);

          const iframe = document.getElementById('game-iframe');
          let iframeLoaded = false;

          function onIframeLoad() {
            if (iframeLoaded) return;
            iframeLoaded = true;
            revealGame();
          }

          iframe.addEventListener('load', onIframeLoad, { once: true });

          launchTimeout = setTimeout(() => { if (!iframeLoaded) onIframeLoad(); }, 5000);
        }, 650);
      }

      function revealGame() {
        loadingRing.classList.add('ring-fadeout');
        loadingRing.classList.remove('ring-visible');
        hero.classList.remove('hero-blurring');
        hero.classList.add('hero-fadeout');
        backdrop.classList.remove('backdrop-visible');
        backdrop.classList.add('backdrop-hidden');

        hero.addEventListener('animationend', () => {
          clearClasses(hero, 'hero-expanding', 'hero-blurring', 'hero-fadeout');
          hero.style.cssText = 'left:0;top:0;width:0;height:0;opacity:0;';
          clearClasses(loadingRing, 'ring-visible', 'ring-fadeout');
          clearClasses(backdrop, 'backdrop-visible', 'backdrop-hidden');
        }, { once: true });
      }

      window.initLaunchEffect = function (openPopupFn) {
        buildDOM();

        const gamesGrid = document.getElementById('games-grid');
        if (!gamesGrid) return null;

        gamesGrid.addEventListener('click', function (e) {
          const favBtn = e.target.closest('.fav-btn');
          if (favBtn) return;

          const card = e.target.closest('.game-card, .banner-game');
          if (!card || !card.dataset.url) return;

          e.stopImmediatePropagation();
          launchGame(card, card.dataset.url, card.dataset.gameId, openPopupFn);
        }, true);

        return (card, url, gameId) => launchGame(card, url, gameId, openPopupFn);
      };
    })();

    function trackClick(gameId) {
      if (!gameId) return;
      fetch('/api/games/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: String(gameId) }),
        keepalive: true
      }).catch(() => { });
    }

    function openPopup(url, gameId) {
      muteAudio();
      gameIframe.src = url;
      popup.classList.add('popup-active');

      sidebar.classList.add('collapsed');
      sidebarToggle.textContent = '◀';

      const currentGame = games.find(g => g.id === gameId);
      activeGame = currentGame || null;
      updateSidebarContent(currentGame);
      popupTitle.textContent = currentGame?.name || 'Game Player';

      if (currentGame && currentGame.id) {
        trackClick(currentGame.id);
        pushRecent(currentGame.id);
        if (state.tab === 'recent') filterAndRenderGames();
      }
    }

    function closePopup() {
      gameIframe.src = '';
      popup.classList.remove('popup-active');
      activeGame = null;
      saveStateSection.hidden = true;
      ssStatus.textContent = '';
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      unmuteAudio();
    }

    if (bannerPlay && bannerGame) {
      bannerPlay.addEventListener('click', () => openPopup(bannerGame.url, bannerGame.id));
    }

    closePopupBtn.addEventListener('click', closePopup);

    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      sidebarToggle.textContent = sidebar.classList.contains('collapsed') ? '◀' : '▶';
    });

    sidebarCloseBtn.addEventListener('click', closePopup);

    popup.addEventListener('click', (e) => {
      if (e.target === popup) closePopup();
    });

    const renderGames = (filteredGames) => {
      activeTimeouts.forEach(t => clearTimeout(t));
      activeTimeouts = [];

      gamesGrid.innerHTML = '';

      if (filteredGames.length === 0) {
        const msg = state.tab === 'favs'
          ? 'No favorites yet — tap the ★ on any game.'
          : state.tab === 'recent'
            ? 'Nothing played recently yet.'
            : 'No games match your search.';
        gamesGrid.innerHTML = `<div class="empty-state">${msg}</div>`;
        return;
      }

      const fmtClicks = (game) => {
        const n = Number(game.clicks || 0);
        return `<span class="game-clicks" title="Times played">${n.toLocaleString()} clicks</span>`;
      };

      filteredGames.forEach((game, index) => {
        const cardSubtitle = game.description || 'Tell mason he stupidly didn\'t add a description for dis game';
        const gameCard = `
          <div data-url="${game.url}" data-game-id="${game.id || ''}" class="game-card${isFav(game.id) ? ' is-fav' : ''}" role="button" tabindex="0">
            <button class="fav-btn${isFav(game.id) ? ' is-fav' : ''}" data-fav="${game.id || ''}" title="${isFav(game.id) ? 'Remove from favorites' : 'Add to favorites'}" aria-label="Toggle favorite">${isFav(game.id) ? '★' : '☆'}</button>
            ${fmtClicks(game)}
            <img fetchpriority="low" loading="lazy" decoding="async" src="${game.img}" alt="${game.name}" onerror="this.src='https://placehold.co/220x160/1a1a2e/667eea?text=No+Image';" draggable="false"/>
            <div class="game-info">
              <div class="game-title">${game.name.replace(' - DAILY FEATURE', '')}</div>
              <div class="game-desc">${cardSubtitle}</div>
            </div>
          </div>`;

        const timeoutId = setTimeout(() => {
          gamesGrid.insertAdjacentHTML('beforeend', gameCard);
        }, index);

        activeTimeouts.push(timeoutId);
      });
    };

    const matchesCategory = (game) => {
      if (!state.category) return true;
      const check = state.category.toLowerCase();
      return (game.keywords || '').toLowerCase().split(',').map(t => t.trim()).includes(check);
    };

    const filterAndRenderGames = () => {
      const searchTerm = searchInput.value.toLowerCase();
      const filteredGames = games.filter(game => {
        if (state.tab === 'favs' && !isFav(game.id)) return false;
        if (state.tab === 'recent' && !getRecent().includes(String(game.id))) return false;
        if (!matchesCategory(game)) return false;
        if (searchTerm && !(
          (game.name && game.name.toLowerCase().includes(searchTerm)) ||
          (game.description && game.description.toLowerCase().includes(searchTerm)) ||
          (game.keywords && game.keywords.toLowerCase().includes(searchTerm)) ||
          (game.id && game.id.toLowerCase().includes(searchTerm))
        )) return false;
        return true;
      });

      if (state.sort === 'clicks') {
        filteredGames.sort((a, b) => ((b.clicks || 0) - (a.clicks || 0)) || String(a.name).localeCompare(String(b.name)));
      } else {
        filteredGames.reverse();
      }
      renderGames(filteredGames);
    };

    searchInput.addEventListener('input', filterAndRenderGames);

    const sortSelect = document.getElementById('sort');
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      filterAndRenderGames();
    });

    filterAndRenderGames();

    gamesGrid.addEventListener('click', (e) => {
      const favBtn = e.target.closest('.fav-btn');
      if (favBtn) {
        const id = favBtn.dataset.fav;
        toggleFav(id);
        const card = favBtn.closest('.game-card');
        if (card) card.classList.toggle('is-fav', isFav(id));
        favBtn.textContent = isFav(id) ? '★' : '☆';
        favBtn.title = isFav(id) ? 'Remove from favorites' : 'Add to favorites';
        if (state.tab === 'favs') filterAndRenderGames();
        return;
      }
      const card = e.target.closest('.game-card, .banner-game');
      if (card && card.dataset.url) {
        openPopup(card.dataset.url, card.dataset.gameId);
      }
    });

    function updateSidebarContent(currentGame) {
      if (!currentGame) return;

      activeGame = currentGame;
      const emulate = (currentGame.keywords || '').toLowerCase().split(',').map(t => t.trim()).includes('emulate');
      saveStateSection.hidden = !emulate;

      sidebarTitle.textContent = currentGame.name || 'Game Title';
      sidebarImage.src = currentGame.img || 'https://placehold.co/280x180/1a1a2e/667eea?text=No+Image';
      sidebarImage.alt = currentGame.name || 'Game Image';
      sidebarDescription.textContent = currentGame.description || 'No description available.';
      sidebarSimilarGames.innerHTML = '';

      const currentTags = (currentGame.keywords || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
      if (currentTags.length === 0) {
        sidebarSimilarGames.innerHTML = '<p style="font-size: 12px; color: rgba(255,255,255,0.5);">No tags available.</p>';
        return;
      }

      const similarGames = games.filter(g => {
        if (g.id === currentGame.id) return false;
        const tags = (g.keywords || '').toLowerCase().split(',').map(t => t.trim());
        return tags.some(tag => currentTags.includes(tag));
      }).slice(0, 6);

      if (similarGames.length === 0) {
        sidebarSimilarGames.innerHTML = '<p class="similar-games-empty">No similar games found.</p>';
        return;
      }

      similarGames.forEach(game => {
        const gameItem = document.createElement('div');
        gameItem.className = 'similar-game-item';
        gameItem.tabIndex = 0;

        const img = document.createElement('img');
        img.src = game.img || 'https://placehold.co/50x50/1a1a2e/667eea?text=?';
        img.alt = game.name;

        const title = document.createElement('span');
        title.textContent = game.name;

        gameItem.appendChild(img);
        gameItem.appendChild(title);
        gameItem.addEventListener('click', () => openPopup(game.url, game.id));
        sidebarSimilarGames.appendChild(gameItem);
      });
    }

    const KEEP_TOP_CATS = 8;
    const BROAD_TAGS = new Set(['game', 'fun', 'kill']);

    function buildChips() {
      const counts = new Map();
      for (const g of games) {
        for (const t of (g.keywords || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean)) {
          if (BROAD_TAGS.has(t)) continue;
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      }
      const topCats = [...counts.entries()]
        .filter(([, c]) => c >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, KEEP_TOP_CATS)
        .map(([t]) => t);

      chipRow.innerHTML = '';
      const chips = [
        { label: 'All', tab: 'all' },
        { label: '♥ Favorites', tab: 'favs' },
        { label: 'Recent', tab: 'recent' },
        ...topCats.map(cat => ({ label: cat.charAt(0).toUpperCase() + cat.slice(1), cat }))
      ];
      for (const chip of chips) {
        const el = document.createElement('button');
        el.className = 'chip';
        const active = chip.tab ? state.tab === chip.tab : state.category === chip.cat;
        if (active) el.classList.add('active');
        el.textContent = chip.label;
        el.addEventListener('click', () => {
          if (chip.tab) {
            state.tab = chip.tab;
            state.category = null;
          } else {
            state.category = chip.cat;
            state.tab = 'all';
          }
          buildChips();
          filterAndRenderGames();
        });
        chipRow.appendChild(el);
      }
    }

    buildChips();

    function toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      else popup.requestFullscreen().catch(() => { });
    }

    sidebarFullscreen.addEventListener('click', toggleFullscreen);

    sidebarNewTab.addEventListener('click', () => {
      if (!activeGame) return;
      trackClick(activeGame.id);
      const win = window.open('about:blank', '_blank');
      if (!win) return;
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      win.document.open();
      win.document.write(
        `<!DOCTYPE html><html><head><title>${esc(activeGame.name)}</title>` +
        `<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000;}` +
        `iframe{width:100vw;height:100vh;border:0;display:block;}` +
        `#panic-btn{position:fixed;left:8px;bottom:8px;z-index:99999;width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;opacity:.35;background:#e0e0e0;color:#333;font-size:18px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.4);}` +
        `#panic-btn:hover{opacity:.8;}</style></head>` +
        `<body><iframe src="${esc(activeGame.url)}" allow="autoplay; fullscreen; clipboard-write; encrypted-media" allowfullscreen></iframe>` +
        `<button id="panic-btn" title="Panic">&#9888;</button>` +
        `<script>document.getElementById('panic-btn').addEventListener('click',function(){document.open();document.write('<!DOCTYPE html><html><head><title>Blank</title></head><body style="margin:0;background:#fff"></body></html>');document.close();});</script></body></html>`
      );
      win.document.close();
    });

    document.addEventListener('keydown', (e) => {
      if (popup.classList.contains('popup-active')) {
        const key = e.key.toLowerCase();
        const browserShortcut = (e.ctrlKey || e.metaKey) && (key === 'r' || key === 'w');
        if (e.key === 'Escape' || browserShortcut) {
          e.preventDefault();
          return;
        }
      }

      const tag = ((document.activeElement && document.activeElement.tagName) || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });

    function postToFrame(payload) {
      return new Promise(resolve => {
        const done = (res) => { window.removeEventListener('message', handler); resolve(res); };
        const handler = (e) => {
          if (!e.data || typeof e.data !== 'object') return;
          if (payload.type === 'ejs-save' && e.data.type === 'ejs-save-result') done(e.data);
          if (payload.type === 'ejs-load' && e.data.type === 'ejs-load-result') done(e.data);
        };
        window.addEventListener('message', handler);
        const target = gameIframe.contentWindow;
        if (target) target.postMessage(payload, '*');
        setTimeout(() => done(null), 8000);
      });
    }

    let ssTimeout = null;
    function setSsStatus(text, cls) {
      clearTimeout(ssTimeout);
      ssStatus.textContent = text;
      ssStatus.className = 'ss-status' + (cls ? ' ' + cls : '');
      ssTimeout = setTimeout(() => { ssStatus.textContent = ''; }, 5000);
    }

    const sanitizeName = (name) => String(name || 'game').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'game';

    ssSave.addEventListener('click', async () => {
      if (!activeGame) return;
      setSsStatus('Saving…', 'muted');
      const res = await postToFrame({ type: 'ejs-save' });
      if (res && res.ok && res.state) {
        const blob = new Blob([res.state], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${sanitizeName(activeGame.name)}.state`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        setSsStatus('Saved to downloads ✓', 'ok');
      } else {
        setSsStatus('Couldn’t save — emulator not ready', 'err');
      }
    });

    ssLoad.addEventListener('click', () => ssFile.click());

    ssFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || !activeGame) return;
      setSsStatus('Loading…', 'muted');
      const stateBytes = await file.arrayBuffer();
      const res = await postToFrame({ type: 'ejs-load', state: stateBytes });
      if (res && res.ok) setSsStatus('State loaded ✓', 'ok');
      else setSsStatus("Couldn't load that state", 'err');
    });

    launchGameEffect = window.initLaunchEffect(openPopup);

  } catch (e) {
    console.error('Error in init:', e);
    alert('Error: ' + e.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function setQuote() {
  if (!qotdElement) return;

  fetch('https://chedargamingdevelopment.cheeseyfries2023.workers.dev/api/quote')
    .then((response) => response.json())
    .then((data) => {
      if (data && data.quote) {
        qotdElement.textContent = data.quote;
      }
    })
    .catch((error) => {
      console.warn('Error fetching quote:', error);
    });
}

setQuote();

const POTW_VID = 'goofygames:potw-id';
const POTW_VOTED = 'goofygames:potw-voted';

async function initPotwVoting() {
  const container = document.getElementById('potw-voting');
  const questionEl = document.getElementById('potw-question');
  if (!container) return;

  const label = document.createElement('span');
  label.className = 'potw-voting-label';
  label.textContent = 'Vote:';
  container.appendChild(label);

  const msg = document.createElement('span');
  msg.className = 'potw-vote-msg';
  container.appendChild(msg);

  let options = [];
  let problemId = '';
  const btnEls = {};

  const setCounts = (opts) => {
    for (const o of opts) {
      const btn = btnEls[o.key];
      if (btn) btn.querySelector('.potw-vote-count').textContent = `(${o.votes || 0})`;
    }
  };

  const lockVotes = () => {
    for (const btn of Object.values(btnEls)) btn.disabled = true;
  };

  const markSelected = (key) => {
    const btn = key && btnEls[key];
    if (!btn) return;
    btn.classList.add('is-selected');
  };

  async function load() {
    try {
      const res = await fetch('/api/potw');
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      problemId = data.id;
      options = data.options || [];
      if (questionEl) questionEl.textContent = data.question;

      for (const key of Object.keys(btnEls)) btnEls[key].remove();
      Object.keys(btnEls).forEach(k => delete btnEls[k]);

      for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'potw-vote-btn';
        const count = document.createElement('span');
        count.className = 'potw-vote-count';
        btn.appendChild(document.createTextNode(opt.label + ' '));
        btn.appendChild(count);
        btn.addEventListener('click', () => castVote(opt.key));
        container.appendChild(btn);
        btnEls[opt.key] = btn;
      }
      setCounts(options);

      let voted = null;
      try { voted = JSON.parse(localStorage.getItem(POTW_VOTED)) } catch { }
      if (voted && voted.problem === problemId && btnEls[voted.option]) {
        msg.textContent = 'You\'ve voted.';
        lockVotes();
        markSelected(voted.option);
      }
    } catch {
      msg.textContent = 'Couldn\'t load the vote';
    }
  }

  const fingerprint = () => {
    let id = localStorage.getItem(POTW_VID);
    if (!id) {
      id = 'potw-' + (crypto.randomUUID
        ? crypto.randomUUID().replaceAll('-', '')
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(POTW_VID, id);
    }
    return id;
  };

  async function castVote(key) {
    if (localStorage.getItem(POTW_VOTED)) return;
    msg.textContent = '…';
    try {
      const res = await fetch('/api/potw/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option: key, problem: problemId, fingerprint: fingerprint() }),
      });
      if (res.status === 409) {
        await load();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        msg.textContent = 'Vote failed — try again';
        return;
      }
      setCounts(data.options);
      msg.textContent = 'Voted ✓';
      localStorage.setItem(POTW_VOTED, JSON.stringify({ problem: problemId, option: key }));
      lockVotes();
      markSelected(key);
    } catch {
      msg.textContent = 'Vote failed — try again';
    }
  }

  await load();
}

initPotwVoting();

if (bootSequence) {
  bootSequence.classList.add('is-visible');

  window.setTimeout(() => {
    bootSequence.classList.remove('is-visible');
    window.setTimeout(() => {
      bootSequence.remove();
    }, 500);
  }, 2250);
}

// AUDIO

const audio = document.getElementById('theme-audio');

function muteAudio() {
  return 'Removed'
}

function unmuteAudio() {
  return 'Removed'
}

const interactionEvents = ['click', 'keydown'];

function addListeners() {
  interactionEvents.forEach(event => {
    document.addEventListener(event, unmuteAudio, { once: true });
  });
}

function removeListeners() {
  interactionEvents.forEach(event => {
    document.removeEventListener(event, unmuteAudio);
  });
}

addListeners();

const wallpaper = document.createElement('div');
wallpaper.className = 'wallpaper';
document.body.appendChild(wallpaper);

let beatContext = null;
let analyser = null;

(function setupBeatWallpaper() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!audio || !AudioCtx) return;

  beatContext = new AudioCtx();
  const source = beatContext.createMediaElementSource(audio);
  analyser = beatContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);
  analyser.connect(beatContext.destination);

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  let rafId = null;
  let lastFrame = 0;

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = null;
    wallpaper.style.transform = '';
  }

  function tick(ts) {
    if (rafId === null) return;

    if (ts - lastFrame < 80) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    lastFrame = ts;

    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeData.length);

    let bass = 0;
    for (let i = 1; i < 8; i++) bass += freqData[i];
    bass /= 7 * 255;

    const scale = (1 + rms * 3).toFixed(3);
    const rotate = ((bass - 0.5) * 18).toFixed(2);

    wallpaper.style.transform = `scale(${scale}) rotate(${rotate}deg)`;
    rafId = requestAnimationFrame(tick);
  }

  audio.addEventListener('play', () => {
    cancelAnimationFrame(rafId);
    lastFrame = 0;
    rafId = requestAnimationFrame(tick);
  });
  audio.addEventListener('pause', stop);
  audio.addEventListener('ended', stop);
})();

//                               .:xxxxxxxx:.
//                            .xxxxxxxxxxxxxxxx.
//                           :xxxxxxxxxxxxxxxxxxx:.
//                          .xxxxxxxxxxxxxxxxxxxxxxx:
//                         :xxxxxxxxxxxxxxxxxxxxxxxxx:
//                         xxxxxxxxxxxxxxxxxxxxxxxxxxX:
//                         xxx:::xxxxxxxx::::xxxxxxxxx:
//                        .xx:   ::xxxxx:     :xxxxxxxx
//                        :xx  x.  xxxx:  xx.  xxxxxxxx
//                        :xx xxx  xxxx: xxxx  :xxxxxxx
//                        'xx 'xx  xxxx:. xx'  xxxxxxxx
//                         xx ::::::xx:::::.   xxxxxxxx
//                         xx:::::.::::.:::::::xxxxxxxx
//                         :x'::::'::::':::::':xxxxxxxxx.
//                         :xx.::::::::::::'   xxxxxxxxxx
//                         :xx: '::::::::'     :xxxxxxxxxx.
//                        .xx     '::::'        'xxxxxxxxxx.
//                      .xxxx                     'xxxxxxxxx.
//                    .xxxx                         'xxxxxxxxx.
//                  .xxxxx:                          xxxxxxxxxx.
//                 .xxxxx:'                          xxxxxxxxxxx.
//                .xxxxxx:::.           .       ..:::_xxxxxxxxxxx:.
//               .xxxxxxx''      ':::''            ''::xxxxxxxxxxxx.
//               xxxxxx            :                  '::xxxxxxxxxxxx
//              :xxxx:'            :                    'xxxxxxxxxxxx:
//             .xxxxx              :                     ::xxxxxxxxxxxx
//             xxxx:'                                    ::xxxxxxxxxxxx
//             xxxx               .                      ::xxxxxxxxxxxx.
//         .:xxxxxx               :                      ::xxxxxxxxxxxx::
//         xxxxxxxx               :                      ::xxxxxxxxxxxxx:
//         xxxxxxxx               :                      ::xxxxxxxxxxxxx:
//         ':xxxxxx               '                      ::xxxxxxxxxxxx:'
//           .:. xx:.                                   .:xxxxxxxxxxxxx'
//         ::::::.'xx:.            :                  .:: xxxxxxxxxxx':
// .:::::::::::::::.'xxxx.                            ::::'xxxxxxxx':::.
// ::::::::::::::::::.'xxxxx                          :::::.'.xx.'::::::.
// ::::::::::::::::::::.'xxxx:.                       :::::::.'':::::::::
// ':::::::::::::::::::::.'xx:'                     .'::::::::::::::::::::..
//   :::::::::::::::::::::.'xx                    .:: :::::::::::::::::::::::
// .:::::::::::::::::::::::. xx               .::xxxx :::::::::::::::::::::::
// :::::::::::::::::::::::::.'xxx..        .::xxxxxxx ::::::::::::::::::::'
// '::::::::::::::::::::::::: xxxxxxxxxxxxxxxxxxxxxxx :::::::::::::::::'
//   '::::::::::::::::::::::: xxxxxxxxxxxxxxxxxxxxxxx :::::::::::::::'
//       ':::::::::::::::::::_xxxxxx::'''::xxxxxxxxxx '::::::::::::'
//            '':.::::::::::'                        `._'::::::'' 

// "Any fool can write code that a computer can understand. Good programmers write code that humans can understand." - Martin Fowler