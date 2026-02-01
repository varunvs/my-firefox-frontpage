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

// Auto Backup Settings
const AUTO_BACKUP_KEY = 'autoBackupSettings';
const MAX_BACKUP_ROTATIONS = 10;

async function getAutoBackupSettings() {
  const result = await browser.storage.local.get(AUTO_BACKUP_KEY);
  return result[AUTO_BACKUP_KEY] || {
    enabled: false,
    folder: 'firefox-frontpage-backup',
    lastBackup: null,
    backupIndex: 0  // Rotates 1-10
  };
}

async function saveAutoBackupSettings(settings) {
  await browser.storage.local.set({ [AUTO_BACKUP_KEY]: settings });
}

async function loadAutoBackupUI() {
  const settings = await getAutoBackupSettings();
  document.getElementById('backup-folder').value = settings.folder || 'firefox-frontpage-backup';
  document.getElementById('auto-backup-toggle').checked = settings.enabled;
  updateLastBackupTime(settings.lastBackup);
}

function updateLastBackupTime(timestamp) {
  const el = document.getElementById('last-backup-time');
  if (timestamp) {
    const date = new Date(timestamp);
    const relative = getRelativeTime(date);
    el.textContent = `Last backup: ${relative}`;
    el.title = date.toLocaleString();
  } else {
    el.textContent = 'Never backed up';
  }
}

function getRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

async function performBackup() {
  const settings = await getAutoBackupSettings();
  const folder = settings.folder || 'firefox-frontpage-backup';

  // Gather all data
  const data = {};
  const storage = await browser.storage.local.get(null);

  for (const key of Object.values(STORAGE_KEYS)) {
    if (storage[key] !== undefined) {
      data[key] = storage[key];
    }
  }

  const timestamp = new Date().toISOString();
  data._meta = {
    exportedAt: timestamp,
    version: '1.0',
    auto: true
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  try {
    // Calculate next backup index (1-10 rotation)
    const nextIndex = (settings.backupIndex % MAX_BACKUP_ROTATIONS) + 1;
    const paddedIndex = String(nextIndex).padStart(2, '0');

    // Create timestamped filename for rotation
    const dateStr = timestamp.replace(/[:.]/g, '-').slice(0, 19);

    // Download main data.json (always the latest - used for restore)
    await browser.downloads.download({
      url: url,
      filename: `${folder}/data.json`,
      saveAs: false,
      conflictAction: 'overwrite'
    });

    // Also create a rotating timestamped backup
    const rotatingBlob = new Blob([json], { type: 'application/json' });
    const rotatingUrl = URL.createObjectURL(rotatingBlob);

    try {
      await browser.downloads.download({
        url: rotatingUrl,
        filename: `${folder}/backup-${paddedIndex}-${dateStr}.json`,
        saveAs: false,
        conflictAction: 'overwrite'
      });
    } finally {
      URL.revokeObjectURL(rotatingUrl);
    }

    // Update settings with new backup index and time
    settings.lastBackup = Date.now();
    settings.backupIndex = nextIndex;
    await saveAutoBackupSettings(settings);
    updateLastBackupTime(settings.lastBackup);

    showMessage(`Backup saved (slot ${nextIndex}/${MAX_BACKUP_ROTATIONS})`, 'success');
  } catch (err) {
    showMessage(`Backup failed: ${err.message}`, 'error');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Auto backup on data changes
let backupTimeout = null;
async function scheduleAutoBackup() {
  const settings = await getAutoBackupSettings();
  if (!settings.enabled) return;

  // Debounce - wait 5 seconds after last change before backing up
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(async () => {
    await performBackup();
  }, 5000);
}

// Listen for storage changes to trigger auto backup
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  // Don't trigger backup for backup settings changes
  if (changes[AUTO_BACKUP_KEY]) return;

  // Check if any important data changed
  const importantKeys = ['bookmarks', 'readHistory', 'summaryCache', 'feeds', 'feedOrder'];
  const hasImportantChange = importantKeys.some(key => changes[key]);

  if (hasImportantChange) {
    scheduleAutoBackup();
  }
});

document.getElementById('backup-folder').addEventListener('change', async (e) => {
  const settings = await getAutoBackupSettings();
  settings.folder = e.target.value.trim() || 'firefox-frontpage-backup';
  await saveAutoBackupSettings(settings);
  updateSyncCommands(settings.folder);
});

document.getElementById('backup-folder').addEventListener('input', (e) => {
  const folder = e.target.value.trim() || 'firefox-frontpage-backup';
  updateSyncCommands(folder);
});

function updateSyncCommands(folder) {
  document.querySelectorAll('.folder-name').forEach(el => {
    el.textContent = folder;
  });
}

// Copy button handlers
document.querySelectorAll('.btn-copy').forEach(btn => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.target;
    const codeEl = document.getElementById(targetId);
    const text = codeEl.textContent;

    try {
      await navigator.clipboard.writeText(text);
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1500);
    } catch {
      showMessage('Failed to copy', 'error');
    }
  });
});

document.getElementById('auto-backup-toggle').addEventListener('change', async (e) => {
  const settings = await getAutoBackupSettings();
  settings.enabled = e.target.checked;
  await saveAutoBackupSettings(settings);

  if (settings.enabled) {
    showMessage('Auto backup enabled', 'success');
    // Do initial backup when enabled
    performBackup();
  } else {
    showMessage('Auto backup disabled', 'success');
  }
});

document.getElementById('backup-now-btn').addEventListener('click', performBackup);

// Backup & Restore
const STORAGE_KEYS = {
  feeds: 'feeds',
  feedOrder: 'feedOrder',
  bookmarks: 'bookmarks',
  readHistory: 'readHistory',
  readLinks: 'readLinks',
  summaryCache: 'summaryCache',
  hnFeedType: 'hnFeedType',
  apiSettingsEncrypted: 'apiSettingsEncrypted'
};

async function updateBackupCounts() {
  const bookmarks = (await browser.storage.local.get('bookmarks')).bookmarks || [];
  const history = (await browser.storage.local.get('readHistory')).readHistory || [];
  const summaries = (await browser.storage.local.get('summaryCache')).summaryCache || {};

  document.getElementById('bookmarks-count').textContent = `${bookmarks.length} bookmarks`;
  document.getElementById('history-count').textContent = `${history.length} items`;
  document.getElementById('summaries-count').textContent = `${Object.keys(summaries).length} summaries`;
}

function downloadJson(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export All
document.getElementById('export-all-btn').addEventListener('click', async () => {
  const data = {};

  // Get all storage data
  const storage = await browser.storage.local.get(null);

  // Include relevant keys
  for (const key of Object.values(STORAGE_KEYS)) {
    if (storage[key] !== undefined) {
      data[key] = storage[key];
    }
  }

  // Add metadata
  data._meta = {
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };

  const date = new Date().toISOString().split('T')[0];
  downloadJson(data, `firefox-frontpage-backup-${date}.json`);
  showMessage('Full backup exported', 'success');
});

// Import All
document.getElementById('import-all-btn').addEventListener('click', () => {
  document.getElementById('import-all-file').click();
});

document.getElementById('import-all-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate it's a backup file
    if (!data._meta && !data.feeds && !data.bookmarks && !data.readHistory) {
      throw new Error('Invalid backup file');
    }

    // Count what we're importing
    let counts = [];

    // Import each key if present
    for (const key of Object.values(STORAGE_KEYS)) {
      if (data[key] !== undefined) {
        await browser.storage.local.set({ [key]: data[key] });
        if (key === 'bookmarks') counts.push(`${data[key].length} bookmarks`);
        if (key === 'readHistory') counts.push(`${data[key].length} history items`);
        if (key === 'summaryCache') counts.push(`${Object.keys(data[key]).length} summaries`);
        if (key === 'feeds') counts.push(`${data[key].length} feeds`);
      }
    }

    renderFeeds();
    loadApiSettings();
    updateBackupCounts();
    showMessage(`Imported: ${counts.join(', ')}`, 'success');
  } catch (err) {
    showMessage('Invalid backup file', 'error');
  }

  e.target.value = '';
});

// Export Bookmarks Only
document.getElementById('export-bookmarks-btn').addEventListener('click', async () => {
  const bookmarks = (await browser.storage.local.get('bookmarks')).bookmarks || [];
  if (bookmarks.length === 0) {
    showMessage('No bookmarks to export', 'error');
    return;
  }
  const date = new Date().toISOString().split('T')[0];
  downloadJson({ bookmarks, _meta: { exportedAt: new Date().toISOString() } }, `bookmarks-${date}.json`);
  showMessage(`Exported ${bookmarks.length} bookmarks`, 'success');
});

// Export History Only
document.getElementById('export-history-btn').addEventListener('click', async () => {
  const history = (await browser.storage.local.get('readHistory')).readHistory || [];
  if (history.length === 0) {
    showMessage('No history to export', 'error');
    return;
  }
  const date = new Date().toISOString().split('T')[0];
  downloadJson({ readHistory: history, _meta: { exportedAt: new Date().toISOString() } }, `history-${date}.json`);
  showMessage(`Exported ${history.length} history items`, 'success');
});

// Export Summaries Only
document.getElementById('export-summaries-btn').addEventListener('click', async () => {
  const summaries = (await browser.storage.local.get('summaryCache')).summaryCache || {};
  const count = Object.keys(summaries).length;
  if (count === 0) {
    showMessage('No summaries to export', 'error');
    return;
  }
  const date = new Date().toISOString().split('T')[0];
  downloadJson({ summaryCache: summaries, _meta: { exportedAt: new Date().toISOString() } }, `summaries-${date}.json`);
  showMessage(`Exported ${count} summaries`, 'success');
});

renderFeeds();
loadApiSettings();
updateBackupCounts();
loadAutoBackupUI();
