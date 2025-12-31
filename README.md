# Audio Tagger

A customizable tag management system for Foundry VTT playlists.

## Overview

Audio Tagger is a comprehensive module for Foundry VTT that provides powerful tagging and organizational features for your audio playlists and individual sounds. Quickly categorize and find audio content with an intuitive tag-based system designed for Game Masters.

## Features

### Core Functionality
- **Flexible Tag System**: Create unlimited custom tags with personalized colors and names
- **Smart Color Management**: Built-in color presets and custom color picker for professional tag styling
- **Audio Organization**: Assign multiple tags to playlists and individual sounds for efficient organization
- **Tag Palette**: Quick-access palette in the playlist directory for rapid tag management
- **Autocomplete**: Intelligent autocomplete system when adding tags to sounds

### Advanced Features
- **Tag Wizard**: Interactive interface for bulk tag assignment and management
- **Tag Snapshots**: Automatic snapshots preserve tag appearance even if the original tag is modified
- **Tag Recovery**: Automatically recover and merge tags from imported playlists
- **Search Integration**: Native Foundry search support for finding audio by tags
- **Sorting Options**: Organize tags by name, color (hue), brightness, or custom order
- **Persistent Settings**: All tags and preferences are saved automatically

### Customization
- **22 Default Tags**: Includes pre-configured tags for common use cases (Ambient, Danger, Battle, Forest, etc.)
- **Light/Dark Theme Support**: Automatically adapts to your Foundry theme
- **Header Optimization**: Optional playlist header height limiting for better space usage
- **Notification Control**: Toggle notifications for tag operations
- **Multi-language Support**: English and Russian localization included

## Installation

### Method 1: Through Foundry VTT
1. Open the Module Settings in Foundry
2. Click "Install Module"
3. Paste the manifest URL: `https://github.com/salamander-git/audio-tagger/releases/latest/download/module.json`
4. Click "Install"

### Method 2: Manual Installation
1. Download the latest release from the [Releases page](https://github.com/salamander-git/audio-tagger/releases)
2. Extract the archive to your Foundry modules folder
3. Restart Foundry

## Getting Started

### Creating Tags
1. Open the Playlist Directory
2. Click the **"+" (Add)** button in the Audio Tagger palette
3. Enter tag name and customize the color
4. Click Create

### Assigning Tags
1. Hover over a playlist or sound in the directory
2. Click the tag icon to open the tag selector
3. Choose tags from the dropdown menu
4. Tags appear instantly below the item name

### Using the Tag Wizard
1. Click the **Wizard** button in the Audio Tagger palette
2. Select the playlist or sound to tag
3. Choose tags from the autocomplete list
4. Click "Assign" to apply tags

### Editing Tags
1. In the Audio Tagger palette, hover over a tag
2. Click the **Edit** (pencil) button
3. Modify the name or color
4. Save changes - they'll update everywhere automatically

### Deleting Tags
1. Hover over a tag in the palette
2. Click the **Delete** (trash) button
3. Confirm deletion

## Module Settings

### Available Settings
- **Limit Playlist Header Height**: Restricts header height to improve interface space (default: off)
- **Enable Notifications**: Toggle notification messages for tag operations (default: on)
- **Reset Tags**: Restore all tags to default configuration
- **Reset Color Presets**: Restore color presets to defaults

## Configuration

### Default Tags

The module includes 21 pre-configured tags organized by category:

**Ambient**: Calm, Hopeful, Forest, Ocean, Tavern

**Action**: Battle, Chase, Stealth, Danger, Heroic

**Atmosphere**: Tension, Mystery, Dark, Investigation, Ritual, Epic

**Location**: Dungeon, City, Wilderness, Ruins, Mountains, Desert

**Magical**: Arcane, Divine, Eldritch, Dream

All default tags can be customized or reset through Module Settings.

## Compatibility

- **Foundry VTT**: Version 13 or higher
- **Browser**: Modern browsers with ES Module support
- **Tested with**: Chrome, Firefox, Edge, Safari

## Public API

Developers can interact with Audio Tagger through a public API:

```javascript
const API = game.modules.get('audio-tagger').api;

// Tag Management
API.getTags() - Get all tags
API.getTag(uuid) - Get specific tag
API.createTag(tagData) - Create new tag
API.updateTag(uuid, updates) - Update tag
API.deleteTag(uuid) - Delete tag
API.openEditor(tag) - Open tag editor dialog

// Color Management
API.getColorPresets() - Get color presets
API.saveColorPresets(presets) - Save color presets
API.openPaletteEditor() - Open palette editor

// Tag Assignment
API.assignTag(doc, tagId) - Assign tag to document
API.unassignTag(doc, tagId) - Remove tag from document
API.getAssignedTags(doc) - Get all tags on document
API.getDocumentsWithTag(tagId) - Find all items with tag

// Wizard
API.toggleWizard() - Toggle wizard interface
API.isWizardActive() - Check wizard status
```

## Technical Details

### Architecture
- **TagManager**: Central management class handling CRUD operations and storage
- **TagAssignmentManager**: Manages tag assignments and search indexing
- **PaletteRenderer**: Renders the tag palette UI
- **TagWizard**: Interactive tag assignment interface
- **SearchIntegration**: Integration with Foundry's native search system

### Data Storage
- Tags are stored in world settings (accessible to all users)
- Assignments are stored in document flags on playlists and sounds
- Search indexes are maintained for native Foundry search

### Performance
- Efficient color space calculations using LCH color space
- Caching system for tag lookups
- Lazy loading of UI components
- Minimal DOM manipulation

## Troubleshooting

### Tags not appearing after module update
- Go to Module Settings and click "Reset Tags" if needed
- Check that the module is enabled in your world
- Refresh the page and reload Foundry

### Tags lost after importing playlists
- Audio Tagger automatically recovers tag information from imported playlists
- Check the browser console (F12) for recovery status messages
- Use tag snapshots to preserve tag appearance across updates

### Color changes not showing
- Wait a moment for the UI to refresh
- Try hovering over tags to trigger a visual update
- Refresh the page if the issue persists

## Support & Development

- **Issue Tracker**: [GitHub Issues](https://github.com/salamander-git/audio-tagger/issues)
- **License**: GPL-3.0
- **Author**: Salamander

## Changelog

### Version 2.0.0
- Complete rewrite with improved architecture
- Added Tag Wizard for intuitive tag management
- Implemented autocomplete system
- Enhanced color management with LCH color space
- Improved search integration
- Added tag snapshots for robust data preservation
- Multi-language support (English, Russian)
- Professional CSS styling with theme support

## Credits

Built for the Foundry VTT community by Salamander.

Special thanks to the Foundry VTT development team for the excellent framework and API documentation.

---

**Enjoy organizing your audio with Audio Tagger!** 🎵
