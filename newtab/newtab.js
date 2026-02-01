const DEFAULT_FEEDS = [
  { id: '1', name: 'Hacker News', url: 'https://hnrss.org/frontpage', color: '#ff6600' },
  { id: '2', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', color: '#3b82f6' },
  { id: '3', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', color: '#0a9c00' },
  { id: '4', name: 'MIT AI News', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', color: '#a31f34' },
];

const CACHE_DURATION = 10 * 60 * 1000;
const QUOTE_CACHE_DURATION = 60 * 60 * 1000;

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

async function fetchFeed(url) {
  const cached = await getCachedFeed(url);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);

  const text = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const items = parseFeed(doc, url);
  await cacheFeed(url, items);

  return items;
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
    if (index >= 15) return;

    const title = entry.querySelector('title')?.textContent || 'Untitled';
    const link = entry.querySelector('link')?.textContent
      || entry.querySelector('link')?.getAttribute('href')
      || '#';
    const pubDate = entry.querySelector('pubDate, published, updated')?.textContent;

    // Extract additional metadata
    const item = {
      title: title.trim(),
      link: link.trim(),
      pubDate: formatDate(pubDate),
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

function renderFeedSection(feed, items) {
  const section = document.createElement('article');
  section.className = 'feed-section';
  section.dataset.feedId = feed.id;
  section.draggable = true;

  // Apply brand color as CSS custom properties
  const color = feed.color || '#6366f1';
  section.style.cssText = generateColorVars(color);

  const isHN = feed.url?.includes('hnrss.org');

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
    <div class="feed-items" role="list">
      ${items.map(item => `
        <div class="feed-item-wrapper" role="listitem">
          <a href="${escapeHtml(item.link)}" class="feed-item" target="_blank" rel="noopener noreferrer">
            <div class="feed-item-title">${escapeHtml(item.title)}</div>
            <div class="feed-item-meta">
              <span class="feed-item-time">${escapeHtml(item.pubDate)}</span>
              ${item.meta?.map(m => `<span class="feed-item-stat">${m.icon} ${escapeHtml(m.value)}</span>`).join('') || ''}
            </div>
          </a>
          <div class="feed-item-actions">
            <button class="feed-item-btn feed-item-read" data-url="${escapeHtml(item.link)}" data-title="${escapeHtml(item.title)}" title="Quick view">
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
      `).join('')}
    </div>
  `;

  // Add click handlers for quick view buttons
  section.querySelectorAll('.feed-item-read').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(btn.dataset.url, btn.dataset.title);
    });
  });

  // Add click handlers for summary buttons
  section.querySelectorAll('.feed-item-summary').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSummary(btn.dataset.url, btn.dataset.title);
    });
  });

  setupDragAndDrop(section);
  return section;
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

  if (savedOrder) {
    const feedMap = new Map(feeds.map(f => [f.id, f]));
    const orderedFeeds = savedOrder.map(id => feedMap.get(id)).filter(Boolean);
    const remainingFeeds = feeds.filter(f => !savedOrder.includes(f.id));
    feeds = [...orderedFeeds, ...remainingFeeds];
  }

  if (forceRefresh) {
    for (const feed of feeds) {
      await browser.storage.local.remove(`cache_${feed.url}`);
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

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const items = await fetchFeed(feed.url);
      return { feed, items };
    })
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      container.appendChild(renderFeedSection(result.value.feed, result.value.items));
    } else {
      container.appendChild(renderError(feeds[index]));
    }
  });
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

async function getApiSettings() {
  const result = await browser.storage.local.get('apiSettings');
  return result.apiSettings || {};
}

async function openSummary(url, title) {
  summaryTitle.textContent = `Summary: ${title}`;
  summaryOpen.href = url;
  summaryOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  summaryLoading.classList.remove('hidden');
  summaryContent.classList.add('hidden');
  summaryContent.innerHTML = '';

  const settings = await getApiSettings();
  const { anthropicKey, openaiKey } = settings;

  // Check if we have any API key
  if (!anthropicKey && !openaiKey) {
    summaryLoading.classList.add('hidden');
    summaryContent.classList.remove('hidden');
    summaryContent.innerHTML = `
      <div class="summary-no-key">
        <p>No API key configured. Please add an OpenAI or Anthropic API key in settings.</p>
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

    // Generate summary using AI
    const summary = await generateAISummary(content, title, settings);

    summaryContent.innerHTML = `
      <h2>Key Points</h2>
      <div class="summary-text">${summary}</div>
    `;
    summaryContent.classList.remove('hidden');
    summaryLoading.classList.add('hidden');

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

async function generateAISummary(content, title, settings) {
  const { anthropicKey, openaiKey, provider } = settings;

  // Determine which API to use
  const useAnthropic = provider === 'anthropic' && anthropicKey;
  const useOpenAI = provider === 'openai' && openaiKey;

  // Fallback to whichever key is available
  const actualProvider = useAnthropic ? 'anthropic' :
                         useOpenAI ? 'openai' :
                         anthropicKey ? 'anthropic' : 'openai';

  const prompt = `Please provide a concise summary of the following article titled "${title}".
Format your response as:
1. A 2-3 sentence overview
2. 3-5 key bullet points

Article content:
${content}`;

  if (actualProvider === 'anthropic') {
    return await callAnthropic(prompt, anthropicKey);
  } else {
    return await callOpenAI(prompt, openaiKey);
  }
}

async function callAnthropic(prompt, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return formatSummaryResponse(data.content[0].text);
}

async function callOpenAI(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return formatSummaryResponse(data.choices[0].message.content);
}

function formatSummaryResponse(text) {
  // Convert markdown-style lists to HTML
  let formatted = escapeHtml(text);

  // Convert bullet points
  formatted = formatted.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>.*<\/li>\n?)+/gs, '<ul class="summary-bullets">$&</ul>');

  // Convert numbered lists
  formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Convert line breaks to paragraphs
  formatted = formatted.split('\n\n').map(p => {
    if (p.includes('<ul') || p.includes('<li')) return p;
    return `<p>${p}</p>`;
  }).join('');

  return formatted;
}

function closeSummary() {
  summaryOverlay.classList.remove('active');
  summaryContent.innerHTML = '';
  document.body.style.overflow = '';
}

document.getElementById('summary-close').addEventListener('click', closeSummary);
summaryOverlay.addEventListener('click', (e) => {
  if (e.target === summaryOverlay) closeSummary();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeSummary();
  }
});

// Event Listeners
document.getElementById('refresh-btn').addEventListener('click', () => loadFeeds(true));
document.getElementById('settings-btn').addEventListener('click', () => browser.runtime.openOptionsPage());
document.getElementById('quote-btn').addEventListener('click', () => loadQuote(true));

// Initialize
loadQuote(true); // Always fetch fresh quote on page load
loadFeeds();
