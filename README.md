# Audio Tagger

A customizable tag management system for Foundry VTT playlists.

![Foundry v13](https://img.shields.io/badge/Foundry-v13-informational)
![Foundry v13](https://img.shields.io/badge/Foundry-v14-informational)
![Version](https://img.shields.io/badge/Version-1.5.4-green)

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
1. Download from [Releases](https://github.com/salamander-git/audio-tagger/releases)
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

- **Foundry VTT**: v13+ (verified 13.341)
- **Dependencies**: None (SortableJS loaded from CDN)
- **Browsers**: Chrome, Firefox, Edge, Safari

## Troubleshooting

**Tags not appearing?**
- Check module is enabled in world settings
- Try Reset Tags in module settings

**Imported playlist tags missing?**
- Audio Tagger auto-recovers tags from snapshots
- Use Refresh button in palette to trigger recovery

## Support

- [GitHub Issues](https://github.com/salamander-git/audio-tagger/issues)
- License: GPL-3.0
- Author: Salamander

---

**Enjoy organizing your audio with Audio Tagger!** 🎵
