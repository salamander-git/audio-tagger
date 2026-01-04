import { TagManager } from "./TagManager.js";
import { TagEditorDialog } from "./TagEditorDialog.js";
import { PaletteEditorDialog } from "./PaletteEditorDialog.js";
import { PaletteRenderer } from "./PaletteRenderer.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";
import { DirectoryTagRenderer } from "./DirectoryTagRenderer.js";
import { TagWizard } from "./TagWizard.js";
import { SearchIntegration } from "./SearchIntegration.js";
import { SmartPlaylistInjector } from "./SmartPlaylistInjector.js";

import { MODULE_ID } from "./constants.js";

/* -------------------------------------------- */
/*  SortableJS Loading                          */
/* -------------------------------------------- */

let sortableLoaded = false;

/**
 * Load SortableJS from CDN for drag-and-drop functionality.
 * @returns {Promise<void>}
 */
async function loadSortableJS() {
    if (sortableLoaded || typeof Sortable !== "undefined") {
        sortableLoaded = true;
        return;
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js";
        script.onload = () => {
            sortableLoaded = true;
            console.log("Audio Tagger | SortableJS loaded");
            resolve();
        };
        script.onerror = () => {
            console.error("Audio Tagger | Failed to load SortableJS");
            reject(new Error("Failed to load SortableJS"));
        };
        document.head.appendChild(script);
    });
}

/* -------------------------------------------- */
/*  Module Initialization                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
    console.log("Audio Tagger | Initializing module");

    // Register settings
    TagManager.registerSettings();

    // Initialize tag-based search integration
    SearchIntegration.init();
    
    // Initialize Smart Playlist feature
    SmartPlaylistInjector.init();
    
    // Load SortableJS for drag-and-drop
    loadSortableJS();
});

Hooks.once("ready", async () => {
    console.log("Audio Tagger | Module ready");

    TagManager.applyInitialSettings();

    if (game.user.isGM) {
        await TagManager.initializeDefaultTags();
        
        // Recover tags from imported playlists
        for (const playlist of game.playlists) {
            await TagAssignmentManager.recoverTags(playlist);
            for (const sound of playlist.sounds) {
                await TagAssignmentManager.recoverTags(sound);
            }
        }
    }

    registerAPI();
});

/* -------------------------------------------- */
/*  Tag Synchronization Hooks                   */
/* -------------------------------------------- */

Hooks.on("audioTaggerTagUpdated", async (tag) => {
    if (game.user.isGM) {
        await TagAssignmentManager.syncTagSnapshots(tag.uuid);
    }
    ui.playlists?.render();
});

Hooks.on("audioTaggerTagDeleted", async (tag) => {
    if (!game.user.isGM) return;
    
    console.log(`Audio Tagger | Removing tag '${tag.name}' from all documents...`);
    const documents = TagAssignmentManager.getDocumentsWithTag(tag.uuid);
    
    for (const doc of documents) {
        await TagAssignmentManager.unassignTag(doc, tag.uuid, true);
    }

    if (documents.length > 0 && TagManager.areNotificationsEnabled()) {
        ui.notifications.warn(game.i18n.format("AUDIO_TAGGER.TagDeletedWarning", { count: documents.length }));
    }

    ui.playlists?.render();
});

/* -------------------------------------------- */
/*  Playlist Directory Rendering                */
/* -------------------------------------------- */

Hooks.on("renderPlaylistDirectory", (app, html) => {
    const element = html instanceof jQuery ? html[0] : html;

    // Render tag palette
    PaletteRenderer.render(element);

    // Render assigned tags on playlists and sounds
    DirectoryTagRenderer.render(element);

    // Render wizard UI if active
    if (TagWizard.isWizardActive()) {
        TagWizard.refresh(element);
    }
});

/* -------------------------------------------- */
/*  Playlist Creation Hooks                     */
/* -------------------------------------------- */

Hooks.on("createPlaylist", async (playlist) => {
    if (game.user.isGM) {
        await TagAssignmentManager.recoverTags(playlist);
        for (const sound of playlist.sounds) {
            await TagAssignmentManager.recoverTags(sound);
        }
    }
});

Hooks.on("createPlaylistSound", async (sound) => {
    if (game.user.isGM) {
        await TagAssignmentManager.recoverTags(sound);
    }
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

    console.log("Audio Tagger | Public API registered");
}
