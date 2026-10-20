import { TagManager } from "./core/TagManager.js";
import { TagEditorDialog } from "./ui/TagEditorDialog.js";
import { PaletteEditorDialog } from "./ui/PaletteEditorDialog.js";
import { PaletteRenderer } from "./ui/PaletteRenderer.js";
import { TagAssignmentManager } from "./features/TagAssignmentManager.js";
import { DirectoryTagRenderer } from "./ui/DirectoryTagRenderer.js";
import { TagWizard } from "./features/TagWizard.js";
import { SearchIntegration } from "./features/SearchIntegration.js";
import { SmartPlaylistInjector } from "./features/SmartPlaylistInjector.js";

import {
    MODULE_ID,
    KEYBIND_PLAY_FIRST,
    KEYBIND_PLAY_LAST,
    KEYBIND_PLAY_RANDOM,
    log,
    toElement
} from "./core/constants.js";

/* -------------------------------------------- */
/*  Module Initialization                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
    log("Audio Tagger | Initializing module");

    // Register settings
    TagManager.registerSettings();

    // Initialize tag-based search integration
    SearchIntegration.init();

    // Initialize Smart Playlist feature
    SmartPlaylistInjector.init();

    // Register keybindings for audio playback
    registerKeybindings();
});

/**
 * Register keybindings for hotkey+click audio playback.
 */
function registerKeybindings() {
    game.keybindings.register(MODULE_ID, KEYBIND_PLAY_FIRST, {
        name: game.i18n.localize("AUDIO_TAGGER.Keybindings.PlayFirst"),
        hint: game.i18n.localize("AUDIO_TAGGER.Keybindings.PlayFirstHint"),
        editable: [{ key: "KeyO" }],
        restricted: false,
        reservedModifiers: [],
        onDown: () => { PaletteRenderer._activePlaybackMode = "first"; },
        onUp: () => { PaletteRenderer._activePlaybackMode = null; }
    });

    game.keybindings.register(MODULE_ID, KEYBIND_PLAY_LAST, {
        name: game.i18n.localize("AUDIO_TAGGER.Keybindings.PlayLast"),
        hint: game.i18n.localize("AUDIO_TAGGER.Keybindings.PlayLastHint"),
        editable: [{ key: "KeyL" }],
        restricted: false,
        reservedModifiers: [],
        onDown: () => { PaletteRenderer._activePlaybackMode = "last"; },
        onUp: () => { PaletteRenderer._activePlaybackMode = null; }
    });

    game.keybindings.register(MODULE_ID, KEYBIND_PLAY_RANDOM, {
        name: game.i18n.localize("AUDIO_TAGGER.Keybindings.PlayRandom"),
        hint: game.i18n.localize("AUDIO_TAGGER.Keybindings.PlayRandomHint"),
        editable: [{ key: "KeyK" }],
        restricted: false,
        reservedModifiers: [],
        onDown: () => { PaletteRenderer._activePlaybackMode = "random"; },
        onUp: () => { PaletteRenderer._activePlaybackMode = null; }
    });

    log("Audio Tagger | Keybindings registered");
}

Hooks.once("ready", async () => {
    log("Audio Tagger | Module ready");

    TagManager.applyInitialSettings();

    try {
        if (isRecoveryGM()) {
            await TagManager.initializeDefaultTags();
            for (const playlist of game.playlists) {
                await TagAssignmentManager.recoverTags(playlist);
                for (const sound of playlist.sounds) {
                    await TagAssignmentManager.recoverTags(sound);
                }
            }
        }
    } catch (error) {
        console.error("Audio Tagger | Initial tag recovery failed", error);
        ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
    } finally {
        registerAPI();
    }
});

/* -------------------------------------------- */
/*  Tag Synchronization Hooks                   */
/* -------------------------------------------- */

Hooks.on("audioTaggerTagUpdated", async (tag) => {
    try {
        if (game.user.isGM) await TagAssignmentManager.syncTagSnapshots(tag.uuid);
    } catch (error) {
        console.error("Audio Tagger | Tag snapshot synchronization failed", error);
        ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
    } finally {
        TagManager.requestRender();
    }
});

Hooks.on("audioTaggerTagDeleted", async (tag) => {
    if (!game.user.isGM) return;

    log(`Audio Tagger | Removing tag '${tag.name}' from all documents...`);
    const documents = TagAssignmentManager.getDocumentsWithTag(tag.uuid);

    try {
        for (const doc of documents) await TagAssignmentManager.unassignTag(doc, tag.uuid, true);
    } catch (error) {
        console.error("Audio Tagger | Tag assignment cleanup failed", error);
        ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
    }

    if (documents.length > 0 && TagManager.areNotificationsEnabled()) {
        ui.notifications.warn(game.i18n.format("AUDIO_TAGGER.TagDeletedWarning", { count: documents.length }));
    }

    TagManager.requestRender();
});

/* -------------------------------------------- */
/*  Playlist Directory Rendering                */
/* -------------------------------------------- */

const directories = new Map();

function renderDirectory(app, html) {
    const element = toElement(html);
    directories.set(app, element);
    PaletteRenderer.render(element, app);
    TagWizard.init(element, app);
    DirectoryTagRenderer.render(element);
    if (TagWizard.isWizardActive()) TagWizard.refresh(element, app);
}

Hooks.on("renderPlaylistDirectory", renderDirectory);
Hooks.on("closePlaylistDirectory", app => {
    directories.delete(app);
    PaletteRenderer.close(app);
    TagWizard.close(app);
});

// Refresh our additions only. Foundry retains ownership of its render lifecycle,
// playlist drag/drop, audio controls, focus and scroll positions.
Hooks.on("audioTaggerRefresh", () => {
    for (const [app, element] of directories) {
        if (!element.isConnected) continue;
        renderDirectory(app, element);
        // Re-evaluate an active native search after names/assignments change.
        const input = element.querySelector('input[name="search"]');
        if (input?.value) {
            input.dispatchEvent(new element.ownerDocument.defaultView.Event("input", { bubbles: true }));
        }
    }
});

function isRecoveryGM() {
    const gm = game.users?.activeGM;
    return game.user.isGM && (!gm || gm.id === game.user.id);
}

for (const type of ["Playlist", "PlaylistSound"]) {
    for (const event of ["create", "update", "delete"]) {
        Hooks.on(event + type, (doc, changes) => {
            if (event === "update" && !Object.keys(changes || {}).some(key =>
                key === "name" || key === "sounds" || key === "flags" || key.startsWith("flags."))) return;
            TagAssignmentManager.invalidateIndex();
            SearchIntegration.invalidateDocument(doc);
            TagManager.requestRender();
        });
    }
}

Hooks.on("createPlaylist", async playlist => {
    if (!isRecoveryGM()) return;
    try {
        await TagAssignmentManager.recoverTags(playlist);
        for (const sound of playlist.sounds) await TagAssignmentManager.recoverTags(sound);
    } catch (error) { console.error("Audio Tagger | Playlist tag recovery failed", error); }
});
Hooks.on("createPlaylistSound", async sound => {
    if (!isRecoveryGM()) return;
    try { await TagAssignmentManager.recoverTags(sound); }
    catch (error) { console.error("Audio Tagger | Sound tag recovery failed", error); }
});

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

function registerAPI() {
    const module = game.modules.get(MODULE_ID);
    if (!module) return;

    module.api = {
        getTags: () => TagManager.getSortedTags(),
        getTag: (uuid) => TagManager.getTag(uuid),
        createTag: (tagData) => TagManager.createTag(tagData),
        updateTag: (uuid, updates) => TagManager.updateTag(uuid, updates),
        deleteTag: (uuid) => TagManager.deleteTag(uuid),
        openEditor: (tag = null) => TagEditorDialog.open(tag),
        openPaletteEditor: () => PaletteEditorDialog.open(),
        getColorPresets: () => TagManager.getColorPresets(),
        saveColorPresets: (presets) => TagManager.saveColorPresets(presets),
        assignTag: (doc, tagId) => TagAssignmentManager.assignTag(doc, tagId),
        unassignTag: (doc, tagId) => TagAssignmentManager.unassignTag(doc, tagId),
        getAssignedTags: (doc) => TagAssignmentManager.getAssignedTags(doc),
        getDocumentsWithTag: (tagId) => TagAssignmentManager.getDocumentsWithTag(tagId),
        toggleWizard: () => TagWizard.toggle(),
        isWizardActive: () => TagWizard.isWizardActive()
    };

    log("Audio Tagger | Public API registered");
}
