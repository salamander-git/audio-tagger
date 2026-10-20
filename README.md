# Audio Tagger

A customizable tag management system for Foundry VTT playlists.

![Foundry v13](https://img.shields.io/badge/Foundry-v13-informational)
![Foundry v14](https://img.shields.io/badge/Foundry-v14-informational)
![Version](https://img.shields.io/badge/Version-1.5.5-green)

## Overview

Audio Tagger is a comprehensive module for Foundry VTT that provides powerful tagging and organizational features for your audio playlists and individual sounds. Quickly categorize and find audio content with an intuitive tag-based system designed for Game Masters.

## Features

### Tag Management
- **Custom Tags**: Create unlimited tags with custom names, colors, and emoji icons
- **Tag Folders**: Organize tags hierarchically with folder mode
- **Drag & Drop**: Reorder tags and move them between folders via drag-and-drop
- **Smart Color Presets**: Configurable color palette for quick tag styling
- **31 Default Tags**: Pre-configured tags for common use cases (Ambient, Battle, Forest, etc.)

### Audio Organization
- **Flexible Assignment**: Assign multiple tags to playlists and individual sounds
- **Tag Wizard**: Bulk tag assignment mode with visual indicators
- **Smart Playlists**: Auto-populate playlists based on tag selection (inclusive/exclusive modes)
- **Inheritance**: Sounds inherit parent playlist tags for hierarchical playback

### Search & Playback
- **Native Search Integration**: Find audio by tags using Foundry's built-in search
- **Multi-Word Search**: AND logic for multiple search terms with partial matching
- **Hotkey Playback**: Play first/last/random matching sound with configurable hotkeys (O, L, K)
- **Tag Hierarchy Playback**: Nested folder tags filter sounds by full hierarchy chain

### Customization
- **Sorting Options**: Sort by name (A-Z, Z-A), brightness (dark/light), or custom order
- **Toggle Icons**: Show/hide emoji icons on default tags
- **Header Optimization**: Optional compact playlist headers
- **Notification Control**: Enable/disable notification messages
- **Multi-language**: English and Russian localization

## Installation

### Via Foundry VTT
1. Open Module Settings → Install Module
2. Paste manifest URL: `https://github.com/salamander-git/audio-tagger/releases/latest/download/module.json`
3. Click Install

### Manual
1. Download `audio-tagger.zip` from [Releases](https://github.com/salamander-git/audio-tagger/releases)
2. Extract to `Data/modules/audio-tagger`
3. Restart Foundry

## Quick Start

### Creating Tags
1. Open Playlist Directory
2. Click **+ Create Tag** in the Audio Tagger palette
3. Set name, color, and optional emoji icon
4. Enable "Folder Mode" to create tag folders

### Assigning Tags
**Quick Method**: Use the Tag Wizard button (wand icon) to enter bulk assignment mode, then click + buttons next to each playlist/sound.

**Direct Method**: Tags appear below playlist/sound names — click × to remove.

Optionally enable **Clear search after adding a tag in Tag Wizard** in
Settings → Configure Settings → Audio Tagger. After selecting a tag from the
results, the search is cleared and focused for the next query. This is a
per-client setting, disabled by default. Removing a tag does not reset the
search. Assignments are still saved when leaving Tag Wizard.

### Smart Playlists
1. Open a playlist's configuration
2. In the Smart Playlist section, select desired tags
3. Choose inclusive (has all selected tags) or exclusive (has ONLY selected tags)
4. Click "Add Matching Sounds"

### Hotkey Playback
Hold a hotkey while clicking a tag to play matching sounds:
- **O** — Play first matching sound
- **L** — Play last matching sound  
- **K** — Play random matching sound

## Settings

| Setting                    | Description                        |
| -------------------------- | ---------------------------------- |
| Limit Header Height        | Compact 20px playlist headers      |
| Enable Notifications       | Toggle operation notifications     |
| Show Icons on Default Tags | Toggle emoji icons on default tags |
| Clear Search in Tag Wizard | Clear and focus search after adding a tag; off by default |
| Reset Tags                 | Restore default tag set            |
| Reset Color Presets        | Restore default color palette      |

## Public API

```javascript
const API = game.modules.get('audio-tagger').api;

// Tags
API.getTags()                    // Get all tags
API.getTag(uuid)                 // Get specific tag
API.createTag(data)              // Create tag
API.updateTag(uuid, updates)     // Update tag
API.deleteTag(uuid)              // Delete tag
API.openEditor(tag)              // Open tag editor

// Assignments
API.assignTag(doc, tagId)        // Assign tag to document
API.unassignTag(doc, tagId)      // Remove tag from document
API.getAssignedTags(doc)         // Get document's tags
API.getDocumentsWithTag(tagId)   // Find all items with tag

// Palette
API.getColorPresets()            // Get color presets
API.saveColorPresets(presets)    // Save presets
API.openPaletteEditor()          // Open palette editor

// Wizard
API.toggleWizard()               // Toggle wizard mode
API.isWizardActive()             // Check wizard status
```

## Compatibility

- **Foundry VTT**: v13+ (previously verified on 13.341; integration-tested on 14.369)
- **Dependencies**: SortableJS 1.15.0 is bundled locally as an ES module, with its MIT license in `scripts/vendor/Sortable.LICENSE`. No CDN connection or global `Sortable` variable is required.
- **Browsers**: Chrome, Firefox, Edge, Safari

## Troubleshooting

**Tags not appearing?**
- Check module is enabled in world settings
- Try Reset Tags in module settings

**Imported playlist tags missing?**
- Audio Tagger auto-recovers tags from snapshots
- Use Refresh button in palette to trigger recovery

## Development and verification

Run the regression suite with Node.js 20 or newer:

```sh
npm ci
npm test
```

The suite uses the bundled Sortable library, jsdom and Foundry document/settings
test doubles. It checks lifecycle cleanup, partial and full directory renders,
multiple directory views, drag cancellation and write failures, folder
integrity, persisted sibling order, assignment updates, Wizard drafts and both
search-reset settings. It does not replace testing in a running Foundry world.
Development dependencies and `tests/` are not required by the installed module.

An opt-in integration harness is provided in `tests/live-foundry.js`. In a
disposable GM test world, temporarily deploy it as `qa-live.js` in the module
directory and execute `await (await import("/modules/audio-tagger/qa-live.js")).run()`
from a script macro. Close any active Wizard session first. The harness creates
temporary tags and a playlist, exercises the real Foundry document and directory
APIs, and removes its fixtures in `finally`. Inspect the `AT-QA REPORT` console
entry, including cleanup and unchanged-data checks. Remove the temporary script
and macro afterwards; this harness is not loaded by the module.

### Release packaging

From the repository root, run:

```powershell
powershell -NoProfile -File tools/Build-Release.ps1
```

The script packages the current working files into `dist/audio-tagger.zip` and
copies the manifest to `dist/module.json`. Upload both files as assets of the
GitHub release: these are the filenames used by Foundry's manifest URLs.
The ZIP contains only `module.json`, `scripts/`, `styles/`, `lang/`, `packs/`,
`LICENSE` and `README.md`. Tests, development tools and npm files remain in Git
but are excluded from this installer. Build output is ignored by Git.
The `.gitattributes` export rules also exclude development files from archives
created by `git archive`; they do not affect a full Git clone or a ZIP made
manually from the entire repository directory.

Before releasing, check these scenarios in Foundry v13 and v14:

- Drag tags within the root, within folders and between nested/empty folders;
  exit folders above/below them in a multi-row palette. Reload and verify order.
- Change each sort mode, create/edit/delete folders, cancel dragging with Escape,
  resize the sidebar, and trigger playlist updates while dragging.
- Use the sidebar and Playlist Directory popout together. Also check v14's
  detached-window mode, touch input and browser-specific drag behavior.
- Verify native playlist/sound dragging, playback, volume controls, folder
  expansion and search continue working, including alongside other modules.
- In Wizard, edit multiple tracks, collapse/reopen playlists, rerender the
  directory, close/reopen its popout, and then save. Check a failed save can be
  retried without losing drafts.
- Test `Ba → Battle` with search reset disabled and enabled, including a click
  before the search debounce expires. With reset enabled, focus must return to
  the empty input without immediately saving assignments.
- Import tagged playlists, rename/delete tags, and verify results from a second
  client. Check ordinary players cannot modify world tags.

Existing tag UUIDs and assignment flags are retained. Folder sibling order is
stored explicitly when a layout is saved; older layouts retain their original
hierarchy order until then. Deleting a folder or turning it into a regular tag
promotes its children to the containing level without deleting their assignments.
Tag drags use Sortable's fallback mode so they do not generate Foundry document
drag payloads. Module refreshes update Audio Tagger's elements without replacing
the native directory or overriding its render/drop handlers.

## Support

- [GitHub Issues](https://github.com/salamander-git/audio-tagger/issues)
- License: GPL-3.0
- Author: Salamander

---

**Enjoy organizing your audio with Audio Tagger!** 🎵
