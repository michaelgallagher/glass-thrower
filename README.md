# Glass Thrower

An Obsidian plugin that lets you toggle the left sidebar with two-finger trackpad swipes, inspired by the [Things](https://culturedcode.com/things/) app. The sidebar slides away smoothly and the window resizes to match, keeping your editing pane exactly the same size throughout.

## Installation

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/yourusername/glass-thrower/releases).
2. Create a folder called `glass-thrower` inside your vault's `.obsidian/plugins/` directory.
3. Copy the three files into that folder.
4. Open Obsidian Settings > Community plugins and enable **Glass Thrower**.

### Build from source

1. Clone this repo into your vault's `.obsidian/plugins/` directory (or anywhere you like):
   ```sh
   git clone https://github.com/yourusername/glass-thrower.git
   cd glass-thrower
   ```
2. Install dependencies and build:
   ```sh
   npm install
   npm run build
   ```
3. If you cloned outside your vault, copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/glass-thrower/`.
4. Restart Obsidian and enable the plugin in Settings > Community plugins.

## Usage

- **Swipe left** with two fingers on your trackpad to collapse the left sidebar.
- **Swipe right** with two fingers to reopen it.

The sidebar slides away and the window shrinks from the right to keep your editing pane the same size and position. When you swipe to reopen, the window grows back and the sidebar returns at its previous width.

A command palette action (**Toggle left sidebar (animated)**) is also available as a fallback.

## Settings

| Setting | Default | Description |
|---|---|---|
| Enable swipe gesture | On | Master on/off toggle |
| Sensitivity | 80 | How much horizontal movement is needed to trigger (lower = more sensitive) |
| Animation speed | 150ms | Duration of the slide animation |
| Horizontal ratio | 2.0 | How horizontal the swipe must be vs vertical (higher = stricter) |
| Cooldown | 600ms | Minimum time between consecutive triggers |

## Requirements

- Desktop only (macOS trackpad). The plugin does nothing on mobile.
- Obsidian 1.0.0 or later.
