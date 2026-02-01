const DEFAULT_FEEDS = [
  { id: '1', name: 'Hacker News', url: 'https://hnrss.org/frontpage', color: '#ff6600' },
  { id: '2', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', color: '#3b82f6' },
  { id: '3', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', color: '#0a9c00' },
  { id: '4', name: 'MIT AI News', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', color: '#a31f34' },
];

async function getFeeds() {
  const result = await browser.storage.local.get('feeds');
  return result.feeds || DEFAULT_FEEDS;
}

async function saveFeeds(feeds) {
  await browser.storage.local.set({ feeds });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function showMessage(text, type) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.className = `message show ${type}`;
  setTimeout(() => {
    msg.className = 'message';
  }, 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function renderFeeds() {
  const feeds = await getFeeds();
  const container = document.getElementById('feeds-list');

  if (feeds.length === 0) {
    container.innerHTML = '<div class="empty-state">No feeds configured. Add one below!</div>';
    return;
  }

  container.innerHTML = feeds.map((feed) => `
    <div class="feed-item" data-id="${feed.id}">
      <span class="feed-color" style="background: ${feed.color || '#6366f1'}"></span>
      <div class="feed-info">
        <div class="feed-name">${escapeHtml(feed.name)}</div>
        <div class="feed-url">${escapeHtml(feed.url)}</div>
      </div>
      <input type="color" class="color-picker" data-id="${feed.id}" value="${feed.color || '#6366f1'}" title="Change color">
      <button class="btn-delete" data-id="${feed.id}">Delete</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const feeds = await getFeeds();
      const updated = feeds.filter(f => f.id !== id);
      await saveFeeds(updated);
      renderFeeds();
      showMessage('Feed removed', 'success');
    });
  });

  container.querySelectorAll('.color-picker').forEach(picker => {
    picker.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const newColor = e.target.value;
      const feeds = await getFeeds();
      const feed = feeds.find(f => f.id === id);
      if (feed) {
        feed.color = newColor;
        await saveFeeds(feeds);
        renderFeeds();
        showMessage('Color updated', 'success');
      }
    });
  });
}

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById('feed-name');
  const urlInput = document.getElementById('feed-url');
  const colorInput = document.getElementById('feed-color');

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const color = colorInput.value;

  if (!name || !url) {
    showMessage('Please fill in both fields', 'error');
    return;
  }

  try {
    new URL(url);
  } catch {
    showMessage('Please enter a valid URL', 'error');
    return;
  }

  const feeds = await getFeeds();

  if (feeds.some(f => f.url === url)) {
    showMessage('This feed URL already exists', 'error');
    return;
  }

  feeds.push({ id: generateId(), name, url, color });
  await saveFeeds(feeds);

  nameInput.value = '';
  urlInput.value = '';
  colorInput.value = '#6366f1';

  renderFeeds();
  showMessage('Feed added', 'success');
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (confirm('Reset to default feeds? This will remove all your custom feeds.')) {
    await saveFeeds(DEFAULT_FEEDS);
    await browser.storage.local.remove('feedOrder');
    renderFeeds();
    showMessage('Reset to defaults', 'success');
  }
});

document.getElementById('export-btn').addEventListener('click', async () => {
  const feeds = await getFeeds();
  const data = JSON.stringify(feeds, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-feeds.json';
  a.click();

  URL.revokeObjectURL(url);
  showMessage('Feeds exported', 'success');
});

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const feeds = JSON.parse(text);

    if (!Array.isArray(feeds)) {
      throw new Error('Invalid format');
    }

    const validFeeds = feeds.filter(f => f.name && f.url).map(f => ({
      id: f.id || generateId(),
      name: f.name,
      url: f.url,
      color: f.color || '#6366f1'
    }));

    if (validFeeds.length === 0) {
      throw new Error('No valid feeds found');
    }

    await saveFeeds(validFeeds);
    renderFeeds();
    showMessage(`Imported ${validFeeds.length} feeds`, 'success');
  } catch {
    showMessage('Invalid feed file', 'error');
  }

  e.target.value = '';
});

// API Settings (encrypted)
async function loadApiSettings() {
  const settings = await CryptoUtils.loadApiSettingsEncrypted();
  document.getElementById('anthropic-key').value = settings.anthropicKey || '';
  document.getElementById('anthropic-model').value = settings.anthropicModel || 'claude-3-haiku-20240307';
  document.getElementById('openai-key').value = settings.openaiKey || '';
  document.getElementById('openai-model').value = settings.openaiModel || 'gpt-4o-mini';
  document.getElementById('ai-provider').value = settings.provider || 'anthropic';
}

document.getElementById('save-api-btn').addEventListener('click', async () => {
  const anthropicKey = document.getElementById('anthropic-key').value.trim();
  const anthropicModel = document.getElementById('anthropic-model').value;
  const openaiKey = document.getElementById('openai-key').value.trim();
  const openaiModel = document.getElementById('openai-model').value;
  const provider = document.getElementById('ai-provider').value;

  await CryptoUtils.saveApiSettingsEncrypted({
    anthropicKey,
    anthropicModel,
    openaiKey,
    openaiModel,
    provider
  });

  showMessage('API settings saved (encrypted)', 'success');
});

renderFeeds();
loadApiSettings();
