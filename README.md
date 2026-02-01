# My Firefox Frontpage

A minimal, beautiful new tab page for Firefox that displays RSS feeds from your favorite sources.

![Firefox Extension](https://img.shields.io/badge/Firefox-Extension-ff7139?logo=firefox)

## Features

- **4-column layout** with independent scrolling per column
- **Brand-colored columns** - each feed uses its website's brand color
- **Drag-and-drop reordering** - arrange columns as you like (persists across sessions)
- **Quick view modal** - preview articles in reader-friendly format without leaving the page
- **AI-powered summaries** - get instant summaries using OpenAI or Anthropic APIs
- **Daily quote/trivia** - refreshes on each new tab
- **Hacker News integration** - shows points, comments count, and direct link to discussions
- **Dark glassmorphism UI** - modern 2026 design aesthetics
- **Fully configurable** - add/remove feeds, customize colors, import/export settings

### Default Feeds

| Feed | Description |
|------|-------------|
| Hacker News | Tech news and discussions |
| Simon Willison | AI/LLM insights and tutorials |
| TechCrunch | Startup and tech industry news |
| MIT AI News | Academic AI research updates |

## Installation

### Temporary Installation (Development)

1. Clone the repository:
   ```bash
   git clone git@github.com:varunvs/my-firefox-frontpage.git
   ```

2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`

3. Click **"Load Temporary Add-on"**

4. Select the `manifest.json` file from the cloned directory

5. Open a new tab to see your feeds

### Permanent Installation

1. Package the extension:
   ```bash
   cd my-firefox-frontpage
   zip -r ../my-firefox-frontpage.xpi * -x ".*" -x "README.md"
   ```

2. Open Firefox and go to `about:addons`

3. Click the gear icon → **"Install Add-on From File"**

4. Select the `.xpi` file

## Configuration

### Adding/Removing Feeds

1. Click the **⚙️ Settings** button in the header (or right-click extension → Options)

2. In the settings page:
   - **Add feeds**: Enter name, RSS URL, and pick a color
   - **Remove feeds**: Click "Delete" on any feed
   - **Change colors**: Use the color picker next to each feed

3. Changes apply immediately on the new tab page

### Finding RSS Feed URLs

Most websites have RSS feeds. Common patterns:
- `/feed/` or `/rss/`
- `/atom.xml` or `/feed.xml`
- Look for the RSS icon on the website

Example feeds you can add:
```
The Verge:     https://www.theverge.com/rss/index.xml
Wired:         https://www.wired.com/feed/rss
Ars Technica:  https://feeds.arstechnica.com/arstechnica/index
Lobsters:      https://lobste.rs/rss
```

### Import/Export

- **Export**: Click "Export Feeds" to download your configuration as JSON
- **Import**: Click "Import Feeds" to restore from a JSON file
- **Reset**: Click "Reset to Defaults" to restore original feeds

### Reordering Columns

Drag any column by its header (grip icon) and drop it in a new position. Order is saved automatically.

### Quick View & AI Summary

Hover over any article to reveal action buttons:
- **📖 Read** - Opens the article in a reader-friendly modal (extracts main content)
- **✨ Summary** - Generates an AI-powered summary using your configured API

Press `ESC` or click outside to close modals.

### AI Summary Setup

1. Go to **Settings** → **AI Summary** section
2. Enter your API key:
   - **Anthropic**: Get from [console.anthropic.com](https://console.anthropic.com/)
   - **OpenAI**: Get from [platform.openai.com](https://platform.openai.com/)
3. Select your preferred provider
4. Click **Save API Settings**

The summary feature uses:
- Anthropic: Claude 3 Haiku (fast, cost-effective)
- OpenAI: GPT-4o Mini (fast, cost-effective)

## Project Structure

```
my-firefox-frontpage/
├── manifest.json        # Extension manifest
├── newtab/
│   ├── newtab.html      # New tab page
│   ├── newtab.css       # Styles
│   └── newtab.js        # Feed fetching, rendering, drag-drop
├── options/
│   ├── options.html     # Settings page
│   ├── options.css      # Settings styles
│   └── options.js       # Feed management
└── icons/               # Extension icons (add your own)
```

## Permissions

- `storage` - Save feed configuration and cache
- `<all_urls>` - Fetch RSS feeds from any domain

## License

MIT
