const DEFAULT_FEEDS = [
  { id: '1', name: 'Hacker News', url: 'https://hnrss.org/frontpage', color: '#ff6600' },
  { id: '2', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', color: '#3b82f6' },
  { id: '3', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', color: '#0a9c00' },
  { id: '4', name: 'MIT AI News', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', color: '#a31f34' },
];

const CACHE_DURATION = 10 * 60 * 1000;
const QUOTE_CACHE_DURATION = 60 * 60 * 1000;
const SUMMARY_CACHE_KEY = 'summaryCache';
const READ_LINKS_KEY = 'readLinks';
const READ_HISTORY_KEY = 'readHistory';
const BOOKMARKS_KEY = 'bookmarks';
const HN_FEED_TYPE_KEY = 'hnFeedType';

const HN_FEED_TYPES = {
  frontpage: { url: 'https://hnrss.org/frontpage', label: 'Front Page' },
  newest: { url: 'https://hnrss.org/newest', label: 'Latest' },
  best: { url: 'https://hnrss.org/best', label: 'Best' },
  ask: { url: 'https://hnrss.org/ask', label: 'Ask HN' },
  show: { url: 'https://hnrss.org/show', label: 'Show HN' },
};

// Feed pagination
const INITIAL_ITEMS_COUNT = 10;
const LOAD_MORE_COUNT = 10;
const MAX_FEED_ITEMS = 50;
const feedItemsStore = {}; // Store all items per feed
const feedDisplayCount = {}; // Track how many items are displayed per feed

// Feed archive settings
const FEED_ARCHIVE_KEY = 'feedArchive';
const MAX_ARCHIVE_ITEMS = 200; // Max items to keep per feed

const QUOTE_APIS = [
  {
    url: 'https://api.quotable.io/random?maxLength=120',
    parse: (data) => ({ text: data.content, author: data.author })
  },
  {
    url: 'https://uselessfacts.jsph.pl/random.json?language=en',
    parse: (data) => ({ text: data.text, author: 'Useless Fact' })
  }
];

const FALLBACK_QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
  { text: "The best error message is the one that never shows up.", author: "Thomas Fuchs" },
];

// Convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 99, g: 102, b: 241 };
}

// Generate CSS custom properties from a brand color
function generateColorVars(hex) {
  const rgb = hexToRgb(hex);
  return `
    --col-bg: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08);
    --col-accent: ${hex};
    --col-glow: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4);
    --col-hover: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15);
    --col-border: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25);
  `;
}

async function getFeeds() {
  const result = await browser.storage.local.get('feeds');
  return result.feeds || DEFAULT_FEEDS;
}

// eslint-disable-next-line no-unused-vars
async function saveFeeds(feeds) {
  await browser.storage.local.set({ feeds });
}

async function getFeedOrder() {
  const result = await browser.storage.local.get('feedOrder');
  return result.feedOrder || null;
}

async function saveFeedOrder(order) {
  await browser.storage.local.set({ feedOrder: order });
}

async function getHNFeedType() {
  const result = await browser.storage.local.get(HN_FEED_TYPE_KEY);
  return result[HN_FEED_TYPE_KEY] || 'frontpage';
}

async function saveHNFeedType(type) {
  await browser.storage.local.set({ [HN_FEED_TYPE_KEY]: type });
}

async function getCachedFeed(url) {
  const result = await browser.storage.local.get(`cache_${url}`);
  const cached = result[`cache_${url}`];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.items;
  }
  return null;
}

async function cacheFeed(url, items) {
  await browser.storage.local.set({
    [`cache_${url}`]: { items, timestamp: Date.now() }
  });
}

// Read links tracking
async function getReadLinks() {
  const result = await browser.storage.local.get(READ_LINKS_KEY);
  return new Set(result[READ_LINKS_KEY] || []);
}

async function markLinkAsRead(url, title = '') {
  const readLinks = await getReadLinks();
  readLinks.add(url);
  // Keep only the last 1000 links to prevent storage bloat
  const linksArray = [...readLinks].slice(-1000);
  await browser.storage.local.set({ [READ_LINKS_KEY]: linksArray });

  // Also add to history with metadata
  await addToHistory(url, title);

  // Update UI
  document.querySelectorAll(`a.feed-item[href="${CSS.escape(url)}"]`).forEach(el => {
    el.classList.add('read');
  });
}

// eslint-disable-next-line no-unused-vars
async function isLinkRead(url) {
  const readLinks = await getReadLinks();
  return readLinks.has(url);
}

// History tracking (with metadata)
async function getHistory() {
  const result = await browser.storage.local.get(READ_HISTORY_KEY);
  return result[READ_HISTORY_KEY] || [];
}

async function addToHistory(url, title) {
  const history = await getHistory();
  // Check if already exists, update timestamp if so
  const existingIndex = history.findIndex(h => h.url === url);
  if (existingIndex !== -1) {
    history[existingIndex].timestamp = Date.now();
    history[existingIndex].title = title || history[existingIndex].title;
  } else {
    history.push({ url, title, timestamp: Date.now() });
  }
  // Keep last 1000 entries, sorted by timestamp
  const sorted = history.sort((a, b) => b.timestamp - a.timestamp).slice(0, 1000);
  await browser.storage.local.set({ [READ_HISTORY_KEY]: sorted });
}

// Bookmarks
async function getBookmarks() {
  const result = await browser.storage.local.get(BOOKMARKS_KEY);
  return result[BOOKMARKS_KEY] || [];
}

// eslint-disable-next-line no-unused-vars
async function isBookmarked(url) {
  const bookmarks = await getBookmarks();
  return bookmarks.some(b => b.url === url);
}

async function toggleBookmark(url, title) {
  const bookmarks = await getBookmarks();
  const existingIndex = bookmarks.findIndex(b => b.url === url);

  if (existingIndex !== -1) {
    // Remove bookmark
    bookmarks.splice(existingIndex, 1);
    await browser.storage.local.set({ [BOOKMARKS_KEY]: bookmarks });
    return false;
  } else {
    // Add bookmark
    bookmarks.unshift({ url, title, timestamp: Date.now() });
    await browser.storage.local.set({ [BOOKMARKS_KEY]: bookmarks });
    return true;
  }
}

// eslint-disable-next-line no-unused-vars
async function updateBookmarkUI(url, isNowBookmarked) {
  document.querySelectorAll(`.feed-item-bookmark[data-url="${CSS.escape(url)}"]`).forEach(btn => {
    btn.classList.toggle('active', isNowBookmarked);
    btn.title = isNowBookmarked ? 'Remove bookmark' : 'Bookmark';
  });
}

// Summary caching
async function getCachedSummary(url) {
  const result = await browser.storage.local.get(SUMMARY_CACHE_KEY);
  const cache = result[SUMMARY_CACHE_KEY] || {};
  return cache[url] || null;
}

async function cacheSummary(url, summary, chatHistory = null) {
  const result = await browser.storage.local.get(SUMMARY_CACHE_KEY);
  const cache = result[SUMMARY_CACHE_KEY] || {};

  // Preserve existing chat history if not provided
  const existing = cache[url] || {};
  cache[url] = {
    summary,
    timestamp: Date.now(),
    chatHistory: chatHistory !== null ? chatHistory : (existing.chatHistory || [])
  };

  // Keep only the last 100 summaries to prevent storage bloat
  const entries = Object.entries(cache);
  if (entries.length > 100) {
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    const trimmed = Object.fromEntries(entries.slice(0, 100));
    await browser.storage.local.set({ [SUMMARY_CACHE_KEY]: trimmed });
  } else {
    await browser.storage.local.set({ [SUMMARY_CACHE_KEY]: cache });
  }
}

async function updateCachedChatHistory(url, chatHistory) {
  const result = await browser.storage.local.get(SUMMARY_CACHE_KEY);
  const cache = result[SUMMARY_CACHE_KEY] || {};
  if (cache[url]) {
    cache[url].chatHistory = chatHistory;
    cache[url].timestamp = Date.now();
    await browser.storage.local.set({ [SUMMARY_CACHE_KEY]: cache });
  }
}

// Archive functions for persistent feed history
async function getArchivedItems(feedId) {
  const result = await browser.storage.local.get(FEED_ARCHIVE_KEY);
  const archive = result[FEED_ARCHIVE_KEY] || {};
  return archive[feedId] || [];
}

async function saveArchivedItems(feedId, items) {
  const result = await browser.storage.local.get(FEED_ARCHIVE_KEY);
  const archive = result[FEED_ARCHIVE_KEY] || {};

  // Keep only the most recent MAX_ARCHIVE_ITEMS
  archive[feedId] = items.slice(0, MAX_ARCHIVE_ITEMS);
  await browser.storage.local.set({ [FEED_ARCHIVE_KEY]: archive });
}

function mergeAndSortItems(liveItems, archivedItems) {
  // Create a map of items by link (URL) to deduplicate
  const itemMap = new Map();

  // Add archived items first
  archivedItems.forEach(item => {
    itemMap.set(item.link, item);
  });

  // Add/update with live items (they take priority for fresh data like points/comments)
  liveItems.forEach(item => {
    itemMap.set(item.link, item);
  });

  // Convert back to array and sort by date (newest first)
  const merged = Array.from(itemMap.values());
  merged.sort((a, b) => (b.pubDateRaw || 0) - (a.pubDateRaw || 0));

  return merged;
}

async function fetchFeed(url, feedId) {
  const cached = await getCachedFeed(url);

  // Get archived items
  const archivedItems = feedId ? await getArchivedItems(feedId) : [];

  if (cached) {
    // Merge cached items with archive
    const merged = mergeAndSortItems(cached, archivedItems);
    if (feedId) await saveArchivedItems(feedId, merged);
    return merged;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);

  const text = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const liveItems = parseFeed(doc, url);
  await cacheFeed(url, liveItems);

  // Merge with archive and save
  const merged = mergeAndSortItems(liveItems, archivedItems);
  if (feedId) await saveArchivedItems(feedId, merged);

  return merged;
}

function parseFeed(doc, feedUrl) {
  const items = [];
  let entries = doc.querySelectorAll('item');
  const isAtom = entries.length === 0;
  if (isAtom) {
    entries = doc.querySelectorAll('entry');
  }

  const isHN = feedUrl?.includes('hnrss.org');

  entries.forEach((entry, index) => {
    if (index >= MAX_FEED_ITEMS) return;

    const title = entry.querySelector('title')?.textContent || 'Untitled';
    const link = entry.querySelector('link')?.textContent
      || entry.querySelector('link')?.getAttribute('href')
      || '#';
    const pubDateStr = entry.querySelector('pubDate, published, updated')?.textContent;
    const pubDateRaw = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();

    // Extract additional metadata
    const item = {
      title: title.trim(),
      link: link.trim(),
      pubDate: formatDate(pubDateStr),
      pubDateRaw, // Raw timestamp for sorting
      meta: []
    };

    // Hacker News specific: extract points and comments
    if (isHN) {
      const description = entry.querySelector('description')?.textContent || '';
      const pointsMatch = description.match(/Points:\s*(\d+)/i);
      const commentsMatch = description.match(/Comments:\s*(\d+)/i);

      if (pointsMatch) {
        item.meta.push({ icon: '▲', value: pointsMatch[1] });
      }
      if (commentsMatch) {
        item.meta.push({ icon: '💬', value: commentsMatch[1] });
      }

      // Get HN comments link
      const commentsLink = entry.querySelector('comments')?.textContent;
      if (commentsLink) {
        item.commentsLink = commentsLink;
      }
    } else {
      // For other feeds: extract author
      const author = entry.querySelector('author name, dc\\:creator, creator, author')?.textContent;
      if (author) {
        item.meta.push({ icon: '✍', value: author.trim() });
      }

      // Extract category/tags
      const categories = entry.querySelectorAll('category');
      if (categories.length > 0) {
        const cat = categories[0].textContent || categories[0].getAttribute('term');
        if (cat) {
          item.meta.push({ icon: '🏷', value: cat.trim() });
        }
      }
    }

    items.push(item);
  });

  return items;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderFeedItem(item, readLinks, bookmarkedUrls, isHN) {
  return `
    <div class="feed-item-wrapper" role="listitem">
      <a href="${escapeHtml(item.link)}" class="feed-item${readLinks.has(item.link) ? ' read' : ''}" target="_blank" rel="noopener noreferrer">
        <div class="feed-item-title">${escapeHtml(item.title)}</div>
        <div class="feed-item-meta">
          <span class="feed-item-time">${escapeHtml(item.pubDate)}</span>
          ${item.meta?.map(m => `<span class="feed-item-stat">${m.icon} ${escapeHtml(m.value)}</span>`).join('') || ''}
        </div>
      </a>
      <div class="feed-item-actions">
        <button class="feed-item-btn feed-item-bookmark${bookmarkedUrls.has(item.link) ? ' active' : ''}" data-url="${escapeHtml(item.link)}" data-title="${escapeHtml(item.title)}" title="${bookmarkedUrls.has(item.link) ? 'Remove bookmark' : 'Bookmark'}">
          <svg viewBox="0 0 24 24" fill="${bookmarkedUrls.has(item.link) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button class="feed-item-btn feed-item-read-btn" data-url="${escapeHtml(item.link)}" data-title="${escapeHtml(item.title)}" title="Quick view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </button>
        <button class="feed-item-btn feed-item-summary" data-url="${escapeHtml(item.link)}" data-title="${escapeHtml(item.title)}" title="AI Summary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454z"/>
            <path d="M17 4a2 2 0 0 0 0 4"/><path d="M19 2v6"/><path d="M16 5h6"/>
          </svg>
        </button>
        ${isHN && item.commentsLink ? `<a href="${escapeHtml(item.commentsLink)}" class="feed-item-btn" target="_blank" rel="noopener noreferrer" title="View comments">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </a>` : ''}
      </div>
    </div>
  `;
}

async function renderFeedSection(feed, items, readLinks, bookmarkedUrls, hnFeedType) {
  const section = document.createElement('article');
  section.className = 'feed-section';
  section.dataset.feedId = feed.id;
  section.draggable = true;

  // Store all items and initialize display count
  feedItemsStore[feed.id] = { items, readLinks, bookmarkedUrls };
  feedDisplayCount[feed.id] = INITIAL_ITEMS_COUNT;

  // Apply brand color as CSS custom properties
  const color = feed.color || '#6366f1';
  section.style.cssText = generateColorVars(color);

  const isHN = feed.url?.includes('hnrss.org');

  // Build HN dropdown if this is a HN feed
  const hnDropdown = isHN ? `
    <select class="hn-feed-select" title="Change feed type">
      ${Object.entries(HN_FEED_TYPES).map(([key, { label }]) =>
        `<option value="${key}"${key === hnFeedType ? ' selected' : ''}>${label}</option>`
      ).join('')}
    </select>
  ` : '';

  // Only show initial items
  const displayItems = items.slice(0, INITIAL_ITEMS_COUNT);
  const hasMore = items.length > INITIAL_ITEMS_COUNT;

  section.innerHTML = `
    <div class="feed-header">
      <span class="drag-handle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          <circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
        </svg>
      </span>
      <h2 class="feed-title">${escapeHtml(feed.name)}</h2>
      ${hnDropdown}
    </div>
    <div class="feed-items" role="list">
      ${displayItems.map(item => renderFeedItem(item, readLinks, bookmarkedUrls, isHN)).join('')}
    </div>
    ${hasMore ? `<button class="load-more-btn" data-feed-id="${feed.id}">Load more</button>` : ''}
  `;

  // Track link clicks
  section.querySelectorAll('.feed-item').forEach(link => {
    link.addEventListener('click', () => {
      const title = link.querySelector('.feed-item-title')?.textContent || '';
      markLinkAsRead(link.href, title);
    });
  });

  // Add click handlers for bookmark buttons
  section.querySelectorAll('.feed-item-bookmark').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const isNowBookmarked = await toggleBookmark(btn.dataset.url, btn.dataset.title);
      btn.classList.toggle('active', isNowBookmarked);
      btn.title = isNowBookmarked ? 'Remove bookmark' : 'Bookmark';
      btn.querySelector('svg').setAttribute('fill', isNowBookmarked ? 'currentColor' : 'none');
    });
  });

  // Add click handlers for quick view buttons
  section.querySelectorAll('.feed-item-read-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      markLinkAsRead(btn.dataset.url, btn.dataset.title);
      openModal(btn.dataset.url, btn.dataset.title);
    });
  });

  // Add click handlers for summary buttons
  section.querySelectorAll('.feed-item-summary').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      markLinkAsRead(btn.dataset.url, btn.dataset.title);
      openSummary(btn.dataset.url, btn.dataset.title);
    });
  });

  // Add HN feed type change handler
  const hnSelect = section.querySelector('.hn-feed-select');
  if (hnSelect) {
    hnSelect.addEventListener('change', async (e) => {
      const newType = e.target.value;
      await saveHNFeedType(newType);
      // Clear HN cache and reload
      const hnFeedTypes = Object.values(HN_FEED_TYPES);
      for (const { url } of hnFeedTypes) {
        await browser.storage.local.remove(`cache_${url}`);
      }
      loadFeeds();
    });
  }

  // Add Load More handler
  const loadMoreBtn = section.querySelector('.load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      loadMoreItems(feed.id, section, isHN);
    });
  }

  setupDragAndDrop(section);
  return section;
}

function loadMoreItems(feedId, section, isHN) {
  const store = feedItemsStore[feedId];
  if (!store) return;

  const { items, readLinks, bookmarkedUrls } = store;
  const currentCount = feedDisplayCount[feedId];
  const newCount = Math.min(currentCount + LOAD_MORE_COUNT, items.length);

  // Get items to add
  const newItems = items.slice(currentCount, newCount);
  feedDisplayCount[feedId] = newCount;

  // Append new items to the feed
  const feedItemsContainer = section.querySelector('.feed-items');
  newItems.forEach(item => {
    const itemHtml = renderFeedItem(item, readLinks, bookmarkedUrls, isHN);
    feedItemsContainer.insertAdjacentHTML('beforeend', itemHtml);
  });

  // Attach event handlers to new items
  attachFeedItemHandlers(section);

  // Update or hide Load More button
  const loadMoreBtn = section.querySelector('.load-more-btn');
  if (loadMoreBtn) {
    if (newCount >= items.length) {
      loadMoreBtn.remove();
    } else {
      loadMoreBtn.textContent = `Load more (${items.length - newCount} remaining)`;
    }
  }
}

function attachFeedItemHandlers(section) {
  // Track link clicks
  section.querySelectorAll('.feed-item:not([data-handler-attached])').forEach(link => {
    link.dataset.handlerAttached = 'true';
    link.addEventListener('click', () => {
      const title = link.querySelector('.feed-item-title')?.textContent || '';
      markLinkAsRead(link.href, title);
    });
  });

  // Add click handlers for bookmark buttons
  section.querySelectorAll('.feed-item-bookmark:not([data-handler-attached])').forEach(btn => {
    btn.dataset.handlerAttached = 'true';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const isNowBookmarked = await toggleBookmark(btn.dataset.url, btn.dataset.title);
      btn.classList.toggle('active', isNowBookmarked);
      btn.title = isNowBookmarked ? 'Remove bookmark' : 'Bookmark';
      btn.querySelector('svg').setAttribute('fill', isNowBookmarked ? 'currentColor' : 'none');
    });
  });

  // Add click handlers for quick view buttons
  section.querySelectorAll('.feed-item-read-btn:not([data-handler-attached])').forEach(btn => {
    btn.dataset.handlerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      markLinkAsRead(btn.dataset.url, btn.dataset.title);
      openModal(btn.dataset.url, btn.dataset.title);
    });
  });

  // Add click handlers for summary buttons
  section.querySelectorAll('.feed-item-summary:not([data-handler-attached])').forEach(btn => {
    btn.dataset.handlerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      markLinkAsRead(btn.dataset.url, btn.dataset.title);
      openSummary(btn.dataset.url, btn.dataset.title);
    });
  });
}

function renderError(feed) {
  const section = document.createElement('article');
  section.className = 'feed-section';
  section.dataset.feedId = feed.id;
  section.draggable = true;

  const color = feed.color || '#6366f1';
  section.style.cssText = generateColorVars(color);

  section.innerHTML = `
    <div class="feed-header">
      <span class="drag-handle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          <circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
        </svg>
      </span>
      <h2 class="feed-title">${escapeHtml(feed.name)}</h2>
    </div>
    <div class="feed-items">
      <div class="error">Failed to load feed</div>
    </div>
  `;

  setupDragAndDrop(section);
  return section;
}

// Drag and Drop
let draggedElement = null;

function setupDragAndDrop(section) {
  section.addEventListener('dragstart', handleDragStart);
  section.addEventListener('dragend', handleDragEnd);
  section.addEventListener('dragover', handleDragOver);
  section.addEventListener('dragenter', handleDragEnter);
  section.addEventListener('dragleave', handleDragLeave);
  section.addEventListener('drop', handleDrop);
}

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.feedId);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.feed-section').forEach(s => s.classList.remove('drag-over'));
  draggedElement = null;
  saveCurrentOrder();
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  if (this !== draggedElement) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');

  if (draggedElement && this !== draggedElement) {
    const container = document.getElementById('feeds');
    const sections = [...container.querySelectorAll('.feed-section')];
    const draggedIdx = sections.indexOf(draggedElement);
    const targetIdx = sections.indexOf(this);

    if (draggedIdx < targetIdx) {
      this.parentNode.insertBefore(draggedElement, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedElement, this);
    }
  }
}

async function saveCurrentOrder() {
  const container = document.getElementById('feeds');
  const order = [...container.querySelectorAll('.feed-section')].map(s => s.dataset.feedId);
  await saveFeedOrder(order);
}

async function loadFeeds(forceRefresh = false) {
  const container = document.getElementById('feeds');
  container.innerHTML = '<div class="loading" aria-live="polite">Loading feeds...</div>';

  let feeds = await getFeeds();
  const savedOrder = await getFeedOrder();
  const hnFeedType = await getHNFeedType();

  if (savedOrder) {
    const feedMap = new Map(feeds.map(f => [f.id, f]));
    const orderedFeeds = savedOrder.map(id => feedMap.get(id)).filter(Boolean);
    const remainingFeeds = feeds.filter(f => !savedOrder.includes(f.id));
    feeds = [...orderedFeeds, ...remainingFeeds];
  }

  // Apply HN feed type to HN feeds
  feeds = feeds.map(feed => {
    if (feed.url?.includes('hnrss.org')) {
      return { ...feed, url: HN_FEED_TYPES[hnFeedType]?.url || feed.url };
    }
    return feed;
  });

  if (forceRefresh) {
    for (const feed of feeds) {
      await browser.storage.local.remove(`cache_${feed.url}`);
    }
    // Also clear all HN feed caches when refreshing
    for (const { url } of Object.values(HN_FEED_TYPES)) {
      await browser.storage.local.remove(`cache_${url}`);
    }
  }

  if (feeds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No feeds configured</p>
        <p>Click the settings button to add feeds</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  // Load read links and bookmarks for marking
  const readLinks = await getReadLinks();
  const bookmarks = await getBookmarks();
  const bookmarkedUrls = new Set(bookmarks.map(b => b.url));

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const items = await fetchFeed(feed.url, feed.id);
      return { feed, items };
    })
  );

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'fulfilled') {
      const section = await renderFeedSection(result.value.feed, result.value.items, readLinks, bookmarkedUrls, hnFeedType);
      container.appendChild(section);
    } else {
      container.appendChild(renderError(feeds[index]));
    }
  }
}

// Quotes
async function loadQuote(forceNew = false) {
  if (!forceNew) {
    const cached = await browser.storage.local.get('cachedQuote');
    if (cached.cachedQuote && Date.now() - cached.cachedQuote.timestamp < QUOTE_CACHE_DURATION) {
      displayQuote(cached.cachedQuote);
      return;
    }
  }

  for (const api of QUOTE_APIS) {
    try {
      const response = await fetch(api.url);
      if (response.ok) {
        const data = await response.json();
        const quote = api.parse(data);
        await browser.storage.local.set({
          cachedQuote: { ...quote, timestamp: Date.now() }
        });
        displayQuote(quote);
        return;
      }
    } catch {
      continue;
    }
  }

  const fallback = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
  displayQuote(fallback);
}

function displayQuote(quote) {
  const quoteEl = document.getElementById('quote');
  quoteEl.innerHTML = `"${escapeHtml(quote.text)}"<span class="quote-author">— ${escapeHtml(quote.author)}</span>`;
}

// Modal functionality with Reader Mode
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalOpen = document.getElementById('modal-open');
const readerLoading = document.getElementById('reader-loading');
const readerContent = document.getElementById('reader-content');

async function openModal(url, title) {
  modalTitle.textContent = title;
  modalOpen.href = url;
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Show loading, hide content
  readerLoading.classList.remove('hidden');
  readerLoading.textContent = 'Loading article...';
  readerContent.classList.add('hidden');
  readerContent.innerHTML = '';

  try {
    // Fetch the article
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch');

    const html = await response.text();

    // Parse with Readability
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Fix relative URLs
    const baseUrl = new URL(url);
    doc.querySelectorAll('img[src]').forEach(img => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('/')) {
        img.setAttribute('src', baseUrl.origin + src);
      }
    });
    doc.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href.startsWith('/')) {
        a.setAttribute('href', baseUrl.origin + href);
      }
    });

    const reader = new Readability(doc);
    const article = reader.parse();

    if (article && article.content) {
      readerContent.innerHTML = article.content;
      readerContent.classList.remove('hidden');
      readerLoading.classList.add('hidden');

      // Make all links open in new tab
      readerContent.querySelectorAll('a').forEach(a => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
    } else {
      throw new Error('Could not parse article');
    }
  } catch {
    readerLoading.innerHTML = `
      <div class="reader-error">
        <p>Could not load reader view</p>
        <p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open in new tab →</a></p>
      </div>
    `;
  }
}

function closeModal() {
  modalOverlay.classList.remove('active');
  readerContent.innerHTML = '';
  document.body.style.overflow = '';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Summary Modal functionality
const summaryOverlay = document.getElementById('summary-overlay');
const summaryTitle = document.getElementById('summary-title');
const summaryOpen = document.getElementById('summary-open');
const summaryLoading = document.getElementById('summary-loading');
const summaryContent = document.getElementById('summary-content');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

// Store current article context for chat
let currentArticleContext = {
  content: '',
  title: '',
  url: '',
  chatHistory: []
};

async function getApiSettings() {
  return await CryptoUtils.loadApiSettingsEncrypted();
}

// Fetch article content for chat (used when summary is cached)
async function fetchArticleForChat(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return;

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const reader = new Readability(doc);
    const article = reader.parse();

    if (article?.textContent) {
      currentArticleContext.content = article.textContent.substring(0, 12000);
    }
  } catch {
    // Silently fail - chat just won't work
  }
}

async function openSummary(url, title) {
  summaryTitle.textContent = `Summary: ${title}`;
  summaryOpen.href = url;
  summaryOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  summaryLoading.classList.remove('hidden');
  summaryContent.classList.add('hidden');
  summaryContent.innerHTML = '';
  chatMessages.innerHTML = '';

  // Reset article context
  currentArticleContext = { content: '', title, url, chatHistory: [] };

  // Check cache first
  const cached = await getCachedSummary(url);
  if (cached) {
    summaryContent.innerHTML = `
      <h2>Key Points</h2>
      <div class="summary-text">${cached.summary}</div>
      <p class="summary-cached">Cached summary</p>
    `;
    summaryContent.classList.remove('hidden');
    summaryLoading.classList.add('hidden');

    // Load cached chat history
    if (cached.chatHistory && cached.chatHistory.length > 0) {
      currentArticleContext.chatHistory = [...cached.chatHistory];
      renderChatHistory(cached.chatHistory);
    }

    // Still fetch article content for chat functionality
    fetchArticleForChat(url);
    return;
  }

  const settings = await getApiSettings();
  const { groqKey, geminiKey, anthropicKey, openaiKey } = settings;

  // Check if we have any API key
  if (!groqKey && !geminiKey && !anthropicKey && !openaiKey) {
    summaryLoading.classList.add('hidden');
    summaryContent.classList.remove('hidden');
    summaryContent.innerHTML = `
      <div class="summary-no-key">
        <p>No API key configured. Please add an API key in settings.</p>
        <button onclick="browser.runtime.openOptionsPage(); closeSummary();">Open Settings</button>
      </div>
    `;
    return;
  }

  try {
    // First fetch the article content
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch article');

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article || !article.textContent) {
      throw new Error('Could not parse article');
    }

    // Truncate content to avoid token limits
    const maxChars = 12000;
    const content = article.textContent.substring(0, maxChars);

    // Store content for chat
    currentArticleContext.content = content;

    // Set up streaming UI
    summaryContent.innerHTML = `
      <h2>Key Points</h2>
      <div class="summary-text" id="summary-stream"></div>
    `;
    summaryContent.classList.remove('hidden');
    summaryLoading.classList.add('hidden');

    const streamContainer = document.getElementById('summary-stream');
    let fullText = '';

    // Generate summary using AI with streaming
    await generateAISummaryStreaming(content, title, settings, (chunk) => {
      fullText += chunk;
      streamContainer.innerHTML = formatSummaryResponse(fullText);
    });

    // Mark streaming as complete (removes cursor)
    streamContainer.classList.add('done');

    // Cache the final summary
    await cacheSummary(url, formatSummaryResponse(fullText));

  } catch (err) {
    summaryLoading.classList.add('hidden');
    summaryContent.classList.remove('hidden');
    summaryContent.innerHTML = `
      <div class="summary-error">
        <p>Could not generate summary: ${escapeHtml(err.message)}</p>
        <p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open article in new tab →</a></p>
      </div>
    `;
  }
}

async function generateAISummaryStreaming(content, title, settings, onChunk) {
  const { groqKey, groqModel, geminiKey, geminiModel, anthropicKey, anthropicModel, openaiKey, openaiModel, provider } = settings;

  // Determine which API to use based on preference and available keys
  const providerAvailable = {
    groq: provider === 'groq' && groqKey,
    gemini: provider === 'gemini' && geminiKey,
    anthropic: provider === 'anthropic' && anthropicKey,
    openai: provider === 'openai' && openaiKey
  };

  // Fallback order: preferred -> groq -> gemini -> anthropic -> openai
  const actualProvider = providerAvailable[provider] ? provider :
                         groqKey ? 'groq' :
                         geminiKey ? 'gemini' :
                         anthropicKey ? 'anthropic' :
                         openaiKey ? 'openai' : null;

  if (!actualProvider) {
    throw new Error('No API key configured');
  }

  const prompt = `Summarize the following article titled "${title}".

Guidelines:
- Use simple, clear English
- Use bullet points for key takeaways
- Use tables to compare data, features, or options if applicable
- Keep it concise and scannable

Format:
1. **Overview**: 2-3 sentence summary
2. **Key Points**: Bullet points of main takeaways
3. **Tags**: 3-5 relevant topic tags at the end (e.g., #AI #Startup #Funding)

Article content:
${content}`;

  switch (actualProvider) {
    case 'groq':
      await callGroqStreaming(prompt, groqKey, groqModel || 'llama-3.3-70b-versatile', onChunk);
      break;
    case 'gemini':
      await callGeminiStreaming(prompt, geminiKey, geminiModel || 'gemini-2.5-flash-lite', onChunk);
      break;
    case 'anthropic':
      await callAnthropicStreaming(prompt, anthropicKey, anthropicModel || 'claude-haiku-4-5-20251001', onChunk);
      break;
    case 'openai':
      await callOpenAIStreaming(prompt, openaiKey, openaiModel || 'gpt-4.1-nano', onChunk);
      break;
  }
}

async function callAnthropicStreaming(prompt, apiKey, model, onChunk) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            onChunk(parsed.delta.text);
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

async function callOpenAIStreaming(prompt, apiKey, model, onChunk) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

// Groq API (OpenAI-compatible format)
async function callGroqStreaming(prompt, apiKey, model, onChunk) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Groq API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

// Google Gemini API
async function callGeminiStreaming(prompt, apiKey, model, onChunk) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            onChunk(text);
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

function formatSummaryResponse(text) {
  // Use marked.js for markdown to HTML conversion
  if (typeof marked !== 'undefined') {
    // Configure marked for safe output
    marked.setOptions({
      breaks: true,  // Convert \n to <br>
      gfm: true,     // GitHub Flavored Markdown (tables, etc.)
    });
    return marked.parse(text);
  }

  // Fallback if marked is not loaded
  let formatted = escapeHtml(text);
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

function closeSummary() {
  summaryOverlay.classList.remove('active');
  summaryContent.innerHTML = '';
  chatMessages.innerHTML = '';
  chatInput.value = '';
  currentArticleContext = { content: '', title: '', url: '', chatHistory: [] };
  document.body.style.overflow = '';
}

document.getElementById('summary-close').addEventListener('click', closeSummary);

// Render saved chat history
function renderChatHistory(history) {
  chatMessages.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const userMsg = history[i];
    const aiMsg = history[i + 1];

    if (userMsg && userMsg.role === 'user') {
      const userMsgEl = document.createElement('div');
      userMsgEl.className = 'chat-message chat-message-user';
      userMsgEl.innerHTML = `
        <div class="chat-avatar">You</div>
        <div class="chat-bubble">${escapeHtml(userMsg.content)}</div>
      `;
      chatMessages.appendChild(userMsgEl);
    }

    if (aiMsg && aiMsg.role === 'assistant') {
      const aiMsgEl = document.createElement('div');
      aiMsgEl.className = 'chat-message chat-message-ai';
      aiMsgEl.innerHTML = `
        <div class="chat-avatar">AI</div>
        <div class="chat-bubble">${formatSummaryResponse(aiMsg.content)}</div>
      `;
      chatMessages.appendChild(aiMsgEl);
    }
  }
}

// Chat functionality
async function sendChatMessage() {
  const question = chatInput.value.trim();
  if (!question || !currentArticleContext.content) return;

  const settings = await getApiSettings();
  const { groqKey, geminiKey, anthropicKey, openaiKey } = settings;

  if (!groqKey && !geminiKey && !anthropicKey && !openaiKey) {
    alert('Please configure an API key in settings to use chat.');
    return;
  }

  // Disable input while processing
  chatInput.disabled = true;
  chatSend.disabled = true;
  chatInput.value = '';

  // Add user message to chat
  const userMsgEl = document.createElement('div');
  userMsgEl.className = 'chat-message chat-message-user';
  userMsgEl.innerHTML = `
    <div class="chat-avatar">You</div>
    <div class="chat-bubble">${escapeHtml(question)}</div>
  `;
  chatMessages.appendChild(userMsgEl);

  // Add AI response placeholder with typing indicator
  const aiMsgEl = document.createElement('div');
  aiMsgEl.className = 'chat-message chat-message-ai';
  aiMsgEl.innerHTML = `
    <div class="chat-avatar">AI</div>
    <div class="chat-bubble">
      <div class="chat-typing"><span></span><span></span><span></span></div>
    </div>
  `;
  chatMessages.appendChild(aiMsgEl);
  const aiBubble = aiMsgEl.querySelector('.chat-bubble');

  // Scroll to bottom
  const modalContent = summaryOverlay.querySelector('.modal-content');
  modalContent.scrollTop = modalContent.scrollHeight;

  // Add to chat history
  currentArticleContext.chatHistory.push({ role: 'user', content: question });

  try {
    let fullResponse = '';

    // Generate response with streaming
    await generateChatResponse(settings, (chunk) => {
      fullResponse += chunk;
      aiBubble.innerHTML = formatSummaryResponse(fullResponse);
      modalContent.scrollTop = modalContent.scrollHeight;
    });

    // Add AI response to history
    currentArticleContext.chatHistory.push({ role: 'assistant', content: fullResponse });

    // Save chat history to cache
    await updateCachedChatHistory(currentArticleContext.url, currentArticleContext.chatHistory);

  } catch (err) {
    aiBubble.innerHTML = `<span style="color: #ef4444;">Error: ${escapeHtml(err.message)}</span>`;
    // Remove the failed user message from history
    currentArticleContext.chatHistory.pop();
  }

  // Re-enable input
  chatInput.disabled = false;
  chatSend.disabled = false;
  chatInput.focus();
}

async function generateChatResponse(settings, onChunk) {
  const { groqKey, groqModel, geminiKey, geminiModel, anthropicKey, anthropicModel, openaiKey, openaiModel, provider } = settings;

  // Determine which API to use based on preference and available keys
  const providerAvailable = {
    groq: provider === 'groq' && groqKey,
    gemini: provider === 'gemini' && geminiKey,
    anthropic: provider === 'anthropic' && anthropicKey,
    openai: provider === 'openai' && openaiKey
  };

  const actualProvider = providerAvailable[provider] ? provider :
                         groqKey ? 'groq' :
                         geminiKey ? 'gemini' :
                         anthropicKey ? 'anthropic' :
                         openaiKey ? 'openai' : null;

  if (!actualProvider) {
    throw new Error('No API key configured');
  }

  // Build conversation with article context
  const systemPrompt = `You are a helpful assistant answering questions about an article.

Article Title: "${currentArticleContext.title}"

Article Content:
${currentArticleContext.content}

Answer questions based on the article content. Be concise and helpful. If the answer isn't in the article, say so.`;

  switch (actualProvider) {
    case 'groq':
      await callGroqChat(systemPrompt, groqKey, groqModel || 'llama-3.3-70b-versatile', onChunk);
      break;
    case 'gemini':
      await callGeminiChat(systemPrompt, geminiKey, geminiModel || 'gemini-2.5-flash-lite', onChunk);
      break;
    case 'anthropic':
      await callAnthropicChat(systemPrompt, anthropicKey, anthropicModel || 'claude-haiku-4-5-20251001', onChunk);
      break;
    case 'openai':
      await callOpenAIChat(systemPrompt, openaiKey, openaiModel || 'gpt-4.1-nano', onChunk);
      break;
  }
}

async function callAnthropicChat(systemPrompt, apiKey, model, onChunk) {
  // Build messages including chat history
  const messages = [];

  for (const msg of currentArticleContext.chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      system: systemPrompt,
      messages
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            onChunk(parsed.delta.text);
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

async function callGroqChat(systemPrompt, apiKey, model, onChunk) {
  // Build messages including chat history (OpenAI-compatible format)
  const messages = [{ role: 'system', content: systemPrompt }];

  for (const msg of currentArticleContext.chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      messages
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

async function callGeminiChat(systemPrompt, apiKey, model, onChunk) {
  // Build contents array with system instruction and chat history
  const contents = [];

  // Add system prompt as first user message if no history, otherwise prepend to context
  const systemContext = `System instructions: ${systemPrompt}\n\n`;

  for (let i = 0; i < currentArticleContext.chatHistory.length; i++) {
    const msg = currentArticleContext.chatHistory[i];
    const role = msg.role === 'assistant' ? 'model' : 'user';
    let text = msg.content;

    // Prepend system context to first user message
    if (i === 0 && role === 'user') {
      text = systemContext + text;
    }

    contents.push({
      role,
      parts: [{ text }]
    });
  }

  // If no history, we shouldn't be here, but handle it gracefully
  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: systemContext + 'Hello' }]
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 1024 }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) onChunk(text);
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

async function callOpenAIChat(systemPrompt, apiKey, model, onChunk) {
  // Build messages including chat history
  const messages = [{ role: 'system', content: systemPrompt }];

  for (const msg of currentArticleContext.chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      messages
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

   
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch { /* ignore parse errors */ }
      }
    }
  }
}

// Chat event listeners
chatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});
summaryOverlay.addEventListener('click', (e) => {
  if (e.target === summaryOverlay) closeSummary();
});

// Focus chat input when typing in summary overlay
document.addEventListener('keydown', (e) => {
  // Check if summary overlay is active and chat input exists
  if (summaryOverlay.classList.contains('active') && chatInput) {
    // Ignore if already focused on an input or if modifier keys are pressed
    if (document.activeElement === chatInput ||
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // Focus on printable characters (single character keys)
    if (e.key.length === 1 && !e.key.match(/^\s$/)) {
      chatInput.focus();
      // The character will be typed naturally since we're just focusing
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeSummary();
    closeHistory();
  }
});

// History Modal functionality
const historyOverlay = document.getElementById('history-overlay');
const historyList = document.getElementById('history-list');
const historySearch = document.getElementById('history-search');
const historyDateFrom = document.getElementById('history-date-from');
const historyDateTo = document.getElementById('history-date-to');
let currentHistoryTab = 'history';

function formatDateForGroup(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';

  const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }

  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

async function renderHistory() {
  const items = currentHistoryTab === 'history' ? await getHistory() : await getBookmarks();
  const summaryCache = (await browser.storage.local.get(SUMMARY_CACHE_KEY))[SUMMARY_CACHE_KEY] || {};
  const bookmarks = await getBookmarks();
  const bookmarkedUrls = new Set(bookmarks.map(b => b.url));

  // Apply filters
  const searchQuery = historySearch.value.toLowerCase().trim();
  const dateFrom = historyDateFrom.value ? new Date(historyDateFrom.value).getTime() : null;
  const dateTo = historyDateTo.value ? new Date(historyDateTo.value + 'T23:59:59').getTime() : null;

  let filtered = items.filter(item => {
    if (searchQuery) {
      const matchesTitle = item.title?.toLowerCase().includes(searchQuery);
      const matchesUrl = item.url.toLowerCase().includes(searchQuery);
      const cached = summaryCache[item.url];
      const matchesSummary = cached?.summary && stripHtml(cached.summary).toLowerCase().includes(searchQuery);
      if (!matchesTitle && !matchesUrl && !matchesSummary) return false;
    }
    if (dateFrom && item.timestamp < dateFrom) return false;
    if (dateTo && item.timestamp > dateTo) return false;
    return true;
  });

  if (filtered.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">${currentHistoryTab === 'history' ? '📚' : '🔖'}</div>
        <p>${searchQuery || dateFrom || dateTo ? 'No matches found' : (currentHistoryTab === 'history' ? 'No history yet' : 'No bookmarks yet')}</p>
      </div>
    `;
    return;
  }

  // Group by date
  const groups = {};
  filtered.forEach(item => {
    const groupKey = formatDateForGroup(item.timestamp);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
  });

  historyList.innerHTML = Object.entries(groups).map(([date, items]) => `
    <div class="history-date-group">
      <div class="history-date-header">${date}</div>
      ${items.map(item => {
        const cached = summaryCache[item.url];
        const summaryText = cached?.summary ? stripHtml(cached.summary).substring(0, 200) : '';
        const isBookmarked = bookmarkedUrls.has(item.url);
        return `
          <div class="history-item" data-url="${escapeHtml(item.url)}">
            <div class="history-item-main">
              <a href="${escapeHtml(item.url)}" class="history-item-title" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(item.title || 'Untitled')}
              </a>
              <div class="history-item-url">${escapeHtml(item.url)}</div>
              <div class="history-item-time">${formatTime(item.timestamp)}</div>
              ${summaryText ? `<div class="history-item-summary">${escapeHtml(summaryText)}${summaryText.length >= 200 ? '...' : ''}</div>` : ''}
            </div>
            <div class="history-item-actions">
              <button class="history-item-btn history-bookmark-btn${isBookmarked ? ' bookmarked' : ''}" data-url="${escapeHtml(item.url)}" data-title="${escapeHtml(item.title || '')}" title="${isBookmarked ? 'Remove bookmark' : 'Add bookmark'}">
                <svg viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <button class="history-item-btn history-summary-btn" data-url="${escapeHtml(item.url)}" data-title="${escapeHtml(item.title || '')}" title="View summary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454z"/>
                  <path d="M17 4a2 2 0 0 0 0 4"/><path d="M19 2v6"/><path d="M16 5h6"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');

  // Add event listeners
  historyList.querySelectorAll('.history-bookmark-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isNowBookmarked = await toggleBookmark(btn.dataset.url, btn.dataset.title);
      btn.classList.toggle('bookmarked', isNowBookmarked);
      btn.querySelector('svg').setAttribute('fill', isNowBookmarked ? 'currentColor' : 'none');
      btn.title = isNowBookmarked ? 'Remove bookmark' : 'Add bookmark';
      // Re-render if on bookmarks tab and removing
      if (currentHistoryTab === 'bookmarks' && !isNowBookmarked) {
        renderHistory();
      }
    });
  });

  historyList.querySelectorAll('.history-summary-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeHistory();
      openSummary(btn.dataset.url, btn.dataset.title);
    });
  });
}

function openHistory() {
  historyOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  renderHistory();
}

function closeHistory() {
  historyOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

document.getElementById('history-btn').addEventListener('click', openHistory);
document.getElementById('history-close').addEventListener('click', closeHistory);
historyOverlay.addEventListener('click', (e) => {
  if (e.target === historyOverlay) closeHistory();
});

// Tab switching
document.querySelectorAll('.history-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentHistoryTab = tab.dataset.tab;
    renderHistory();
  });
});

// Filters
historySearch.addEventListener('input', renderHistory);
historyDateFrom.addEventListener('change', renderHistory);
historyDateTo.addEventListener('change', renderHistory);
document.getElementById('history-clear-filters').addEventListener('click', () => {
  historySearch.value = '';
  historyDateFrom.value = '';
  historyDateTo.value = '';
  renderHistory();
});

// Event Listeners
document.getElementById('refresh-btn').addEventListener('click', () => loadFeeds(true));
document.getElementById('settings-btn').addEventListener('click', () => browser.runtime.openOptionsPage());
document.getElementById('quote-btn').addEventListener('click', () => loadQuote(true));

// First-run detection and restore functionality
const FIRST_RUN_KEY = 'hasRunBefore';
const SKIP_RESTORE_KEY = 'skipRestorePrompt';

// Merge utilities for reconciling data from multiple sources
function mergeArrayByUrl(local, incoming, limit = 1000) {
  const map = new Map();
  for (const item of local) map.set(item.url, item);
  for (const item of incoming) {
    const existing = map.get(item.url);
    if (!existing || (item.timestamp && item.timestamp > (existing.timestamp || 0))) {
      map.set(item.url, item);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);
}

function mergeArrayById(local, incoming) {
  const map = new Map();
  for (const item of local) map.set(item.id, item);
  for (const item of incoming) if (!map.has(item.id)) map.set(item.id, item);
  return Array.from(map.values());
}

function mergeSet(local, incoming, limit = 1000) {
  return Array.from(new Set([...local, ...incoming])).slice(-limit);
}

function mergeSummaryCache(local, incoming) {
  const merged = { ...local };
  for (const [url, entry] of Object.entries(incoming)) {
    if (!merged[url] || (entry.timestamp && entry.timestamp > (merged[url].timestamp || 0))) {
      merged[url] = entry;
    }
  }
  const entries = Object.entries(merged)
    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
    .slice(0, 100);
  return Object.fromEntries(entries);
}

async function checkFirstRun() {
  const result = await browser.storage.local.get([FIRST_RUN_KEY, SKIP_RESTORE_KEY]);

  // Check if user explicitly skipped restore
  if (result[SKIP_RESTORE_KEY]) {
    return;
  }

  // Check if this is first run (no data exists)
  if (result[FIRST_RUN_KEY]) {
    return; // Not first run
  }

  // Check if there's any meaningful data (feeds modified, history, bookmarks)
  const storage = await browser.storage.local.get(['feeds', 'readHistory', 'bookmarks']);
  const defaultFeedUrls = DEFAULT_FEEDS.map(f => f.url);
  const currentFeedUrls = (storage.feeds || []).map(f => f.url);

  // If feeds are different from defaults OR have history/bookmarks, mark as not first run
  const feedsModified = JSON.stringify(defaultFeedUrls.sort()) !== JSON.stringify(currentFeedUrls.sort());
  const hasHistory = (storage.readHistory || []).length > 0;
  const hasBookmarks = (storage.bookmarks || []).length > 0;

  if (feedsModified || hasHistory || hasBookmarks) {
    await browser.storage.local.set({ [FIRST_RUN_KEY]: true });
    return;
  }

  // Show restore prompt
  showRestorePrompt();
}

function showRestorePrompt() {
  const overlay = document.getElementById('restore-overlay');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeRestorePrompt() {
  const overlay = document.getElementById('restore-overlay');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

async function handleRestoreImport() {
  document.getElementById('restore-file-input').click();
}

async function handleRestoreSkip() {
  const dontAsk = document.getElementById('restore-dont-ask').checked;

  if (dontAsk) {
    await browser.storage.local.set({ [SKIP_RESTORE_KEY]: true });
  }

  await browser.storage.local.set({ [FIRST_RUN_KEY]: true });
  closeRestorePrompt();
}

document.getElementById('restore-close').addEventListener('click', closeRestorePrompt);
document.getElementById('restore-import-btn').addEventListener('click', handleRestoreImport);
document.getElementById('restore-skip-btn').addEventListener('click', handleRestoreSkip);

document.getElementById('restore-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'restore-overlay') {
    closeRestorePrompt();
  }
});

document.getElementById('restore-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate backup file
    if (!data._meta && !data.feeds && !data.bookmarks && !data.readHistory) {
      throw new Error('Invalid backup file');
    }

    // Get current local data for merging
    const local = await browser.storage.local.get(null);
    const counts = [];

    // Merge bookmarks
    if (data.bookmarks) {
      const merged = mergeArrayByUrl(local.bookmarks || [], data.bookmarks);
      await browser.storage.local.set({ bookmarks: merged });
      counts.push(`${merged.length} bookmarks`);
    }

    // Merge history
    if (data.readHistory) {
      const merged = mergeArrayByUrl(local.readHistory || [], data.readHistory);
      await browser.storage.local.set({ readHistory: merged });
      counts.push(`${merged.length} history`);
    }

    // Merge read links
    if (data.readLinks) {
      const merged = mergeSet(local.readLinks || [], data.readLinks);
      await browser.storage.local.set({ readLinks: merged });
    }

    // Merge summary cache
    if (data.summaryCache) {
      const merged = mergeSummaryCache(local.summaryCache || {}, data.summaryCache);
      await browser.storage.local.set({ summaryCache: merged });
      counts.push(`${Object.keys(merged).length} summaries`);
    }

    // Merge feeds
    if (data.feeds) {
      const merged = mergeArrayById(local.feeds || [], data.feeds);
      await browser.storage.local.set({ feeds: merged });
      counts.push(`${merged.length} feeds`);
    }

    // Simple overwrites for settings (only if not set locally)
    if (data.feedOrder && !local.feedOrder) {
      await browser.storage.local.set({ feedOrder: data.feedOrder });
    }
    if (data.hnFeedType && !local.hnFeedType) {
      await browser.storage.local.set({ hnFeedType: data.hnFeedType });
    }
    if (data.apiSettingsEncrypted && !local.apiSettingsEncrypted) {
      await browser.storage.local.set({ apiSettingsEncrypted: data.apiSettingsEncrypted });
    }

    // Mark as restored
    await browser.storage.local.set({ [FIRST_RUN_KEY]: true });

    closeRestorePrompt();
    loadFeeds();

    // Show success message
    const restoreContent = document.querySelector('.restore-content');
    if (restoreContent) {
      restoreContent.innerHTML = `
        <div class="restore-icon" style="color: #22c55e;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2>Restored & Merged!</h2>
        <p>${counts.join(', ') || 'Data restored'}</p>
      `;
      document.getElementById('restore-overlay').classList.add('active');
      setTimeout(closeRestorePrompt, 2000);
    }

  } catch (err) {
    alert('Failed to import backup: ' + err.message);
  }

  e.target.value = '';
});

// Initialize
loadQuote(true); // Always fetch fresh quote on page load
loadFeeds();
checkFirstRun();
