import {
    MODULE_ID,
    SETTING_TAGS,
    SETTING_PRESETS,
    SETTING_COLLAPSED,
    SETTING_LIMIT_HEADER,
    SETTING_NOTIFICATIONS,
    SETTING_DEFAULT_TAG_ICONS,
    SETTING_SORT_MODE,
    SETTING_TAG_HIERARCHY,
    SETTING_CLEAR_WIZARD_SEARCH,
    DEFAULT_BG_COLOR,
    DEFAULT_TEXT_COLOR,
    normalizeHexColor,
    log
} from "./constants.js";
import { childrenOf, normalizeHierarchy, sameHierarchy } from "./TagLayout.js";

/**
 * TagManager - Central management class for tag operations
 * Handles CRUD operations, storage, and events for the Tag Palette module
 */
export class TagManager {

    static _cache = null;
    static _sortCache = new Map();
    static _brightness = new Map();
    static revision = 0;
    static _writes = Promise.resolve();
    static _renderPending = false;
    static _batchDepth = 0;

    static requestRender() {
        if (this._renderPending) return;
        this._renderPending = true;
        queueMicrotask(() => {
            if (this._batchDepth) return;
            this._renderPending = false;
            Hooks.callAll("audioTaggerRefresh");
        });
    }

    static _enqueue(operation) {
        const result = this._writes.catch(() => {}).then(async () => {
            this._batchDepth++;
            try {
                return await operation();
            } finally {
                this._batchDepth--;
                if (!this._batchDepth && this._renderPending) {
                    this._renderPending = false;
                    this.requestRender();
                }
            }
        });
        this._writes = result;
        return result;
    }

    static async _writeTags(tags) {
        // Never persist derived cache data from older module versions.
        for (const tag of Object.values(tags)) delete tag._brightness;
        await game.settings.set(MODULE_ID, SETTING_TAGS, tags);
        this._invalidateCache();
        this.requestRender();
    }

    static DEFAULT_PRESETS = [
        "#ff595e", "#ffca3a", "#8ac926", "#1982c4",
        "#6a4c93", "#ff924c", "#e76f51", "#2a9d8f",
        "#264653", "#f4a261", "#e9c46a", "#a8dadc"
    ];

    static DEFAULT_TAGS = [
        { name: "Ambient", icon: "🎵", backgroundColor: "#E1E7EF", textColor: "#1A1F26" },
        { name: "Exploration", icon: "🏃", backgroundColor: "#D9E8C8", textColor: "#2B3D1F" },
        { name: "Tension", icon: "😤", backgroundColor: "#F6D9C5", textColor: "#3A1C14" },
        { name: "Danger", icon: "⚠️", backgroundColor: "#B83E3E", textColor: "#FFFFFF" },
        { name: "Mystery", icon: "🤔", backgroundColor: "#5C5A7A", textColor: "#F4F1FA" },
        { name: "Dark", icon: "🌙", backgroundColor: "#1B1B1B", textColor: "#E5E5E5" },
        { name: "Battle", icon: "⚔️", backgroundColor: "#8B1A1A", textColor: "#FFFFFF" },
        { name: "Chase", icon: "💨", backgroundColor: "#F0B429", textColor: "#2C1A00" },
        { name: "Stealth", icon: "👤", backgroundColor: "#2E3A3F", textColor: "#D7E5EA" },
        { name: "Investigation", icon: "🔍", backgroundColor: "#C9D3E7", textColor: "#1C2633" },
        { name: "Ritual", icon: "🔮", backgroundColor: "#6A2E6A", textColor: "#F9EAFE" },
        { name: "Epic", icon: "🏆", backgroundColor: "#F7E7A1", textColor: "#3C3300" },
        { name: "Forest", icon: "🌲", backgroundColor: "#3E6B47", textColor: "#E6F5E9" },
        { name: "Dungeon", icon: "🗿", backgroundColor: "#2A2A33", textColor: "#CFCFE1" },
        { name: "City", icon: "🏠", backgroundColor: "#D6CEC2", textColor: "#2C2622" },
        { name: "Tavern", icon: "🍺", backgroundColor: "#A57A52", textColor: "#F3EDE6" },
        { name: "Wilderness", icon: "🌳", backgroundColor: "#6E8F4C", textColor: "#F0F7E8" },
        { name: "Ruins", icon: "🏚️", backgroundColor: "#7A7169", textColor: "#F3F1EE" },
        { name: "Mountains", icon: "⛰️", backgroundColor: "#8DA3B8", textColor: "#1F2A33" },
        { name: "Desert", icon: "🏜️", backgroundColor: "#E4C289", textColor: "#3C2D14" },
        { name: "Ocean", icon: "🌊", backgroundColor: "#2C587C", textColor: "#D4EAF8" },
        { name: "Arcane", icon: "✨", backgroundColor: "#5F4DA8", textColor: "#EFEAFE" },
        { name: "Divine", icon: "☀️", backgroundColor: "#FFF2D9", textColor: "#3C3010" },
        { name: "Eldritch", icon: "👁️", backgroundColor: "#1A2632", textColor: "#BFD6E8" },
        { name: "Dream", icon: "💭", backgroundColor: "#B9A9E6", textColor: "#2A1F47" },
        { name: "Calm", icon: "😌", backgroundColor: "#DFF4F2", textColor: "#153C39" },
        { name: "Hopeful", icon: "🌈", backgroundColor: "#F5F0C6", textColor: "#3A3A10" },
        { name: "Sad", icon: "😢", backgroundColor: "#93A2B8", textColor: "#1F272F" },
        { name: "Suspense", icon: "😱", backgroundColor: "#EFE3B8", textColor: "#332B0F" },
        { name: "Heroic", icon: "🦸", backgroundColor: "#FFD66B", textColor: "#3C2E00" },
        { name: "Horror", icon: "💀", backgroundColor: "#1A0D0D", textColor: "#FBEAEA" }
    ];

    /* -------------------------------------------- */
    /*  Settings Registration                       */
    /* -------------------------------------------- */

    static _settingsRegistered = false;

    static registerSettings() {
        if (this._settingsRegistered) return;

        log("Audio Tagger | Registering settings...");

        // Hidden storage settings
        game.settings.register(MODULE_ID, SETTING_TAGS, {
            scope: "world",
            config: false,
            type: Object,
            default: {},
            onChange: () => {
                this._invalidateCache();
                // Trigger re-render to update tag display
                this.requestRender();
            }
        });

        game.settings.register(MODULE_ID, SETTING_PRESETS, {
            scope: "world",
            config: false,
            type: Array,
            default: this.DEFAULT_PRESETS,
            onChange: () => {
                this._invalidateCache();
            }
        });

        game.settings.register(MODULE_ID, SETTING_COLLAPSED, {
            scope: "client",
            config: false,
            type: Boolean,
            default: true
        });

        // Sort mode persistence (per client)
        game.settings.register(MODULE_ID, SETTING_SORT_MODE, {
            scope: "client",
            config: false,
            type: String,
            default: "order"
        });

        // Tag hierarchy storage (folder structure)
        game.settings.register(MODULE_ID, SETTING_TAG_HIERARCHY, {
            scope: "world",
            config: false,
            type: Object,
            default: {},
            onChange: () => {
                this._invalidateCache();
                this.requestRender();
            }
        });

        // Limit playlist header height setting
        game.settings.register(MODULE_ID, SETTING_LIMIT_HEADER, {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.LimitHeaderHeight"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.LimitHeaderHeightHint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
            onChange: (value) => {
                document.body.classList.toggle("audio-tagger-limit-header-height", value);
            }
        });

        // Optional Wizard behavior, kept separate from notification settings.
        game.settings.register(MODULE_ID, SETTING_CLEAR_WIZARD_SEARCH, {
            name: "AUDIO_TAGGER.Settings.ClearWizardSearch",
            hint: "AUDIO_TAGGER.Settings.ClearWizardSearchHint",
            scope: "client",
            config: true,
            type: Boolean,
            default: false
        });

        // Enable/disable notifications setting
        game.settings.register(MODULE_ID, SETTING_NOTIFICATIONS, {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.EnableNotifications"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.EnableNotificationsHint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true
        });

        // Toggle default tag icons setting
        game.settings.register(MODULE_ID, SETTING_DEFAULT_TAG_ICONS, {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.DefaultTagIcons"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.DefaultTagIconsHint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            onChange: (showIcons) => {
                if (game.user.isGM) {
                    this._enqueue(() => this._updateDefaultTagsIcons(showIcons)).catch(console.error);
                }
            }
        });

        // Reset settings - visible in Module Settings
        game.settings.registerMenu(MODULE_ID, "resetTags", {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.ResetTags"),
            label: game.i18n.localize("AUDIO_TAGGER.Settings.ResetTagsBtn"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.ResetTagsHint"),
            icon: "fas fa-undo",
            type: class extends foundry.applications.api.ApplicationV2 {
                static DEFAULT_OPTIONS = { window: { title: "" } };
                async _renderHTML() { return ""; }
                async render() { await TagManager._showResetTagsDialog(); }
            },
            restricted: true
        });

        game.settings.registerMenu(MODULE_ID, "resetPresets", {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresets"),
            label: game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresetsBtn"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresetsHint"),
            icon: "fas fa-palette",
            type: class extends foundry.applications.api.ApplicationV2 {
                static DEFAULT_OPTIONS = { window: { title: "" } };
                async _renderHTML() { return ""; }
                async render() { await TagManager._showResetPresetsDialog(); }
            },
            restricted: true
        });

        this._settingsRegistered = true;
        log("Audio Tagger | Settings registered successfully");
    }

    /**
     * Apply initial settings that need DOM manipulation.
     */
    static applyInitialSettings() {
        // Apply playlist header height limit if enabled
        const limitHeader = game.settings.get(MODULE_ID, SETTING_LIMIT_HEADER);
        if (limitHeader) {
            document.body.classList.add("audio-tagger-limit-header-height");
        }
    }

    /* -------------------------------------------- */
    /*  Dialogs                                     */
    /* -------------------------------------------- */

    static async _showResetTagsDialog() {
        const tags = TagManager.getTags();
        const content = `
            <p>${game.i18n.localize("AUDIO_TAGGER.Settings.ResetConfirmContent")}</p>
            <p class="notes">${game.i18n.format("AUDIO_TAGGER.Settings.CurrentTagsInfo", {
            current: Object.keys(tags).length,
            default: TagManager.DEFAULT_TAGS.length
        })}</p>
        `;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: {
                title: game.i18n.localize("AUDIO_TAGGER.Settings.ResetConfirmTitle"),
                icon: "fas fa-undo"
            },
            content,
            modal: false,
            rejectClose: false
        });

        if (confirmed) {
            await TagManager.resetToDefaults();
        }
    }

    static async _showResetPresetsDialog() {
        const content = `<p>${game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresetsConfirm")}</p>`;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: {
                title: game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresets"),
                icon: "fas fa-palette"
            },
            content,
            modal: false,
            rejectClose: false
        });

        if (confirmed) {
            await game.settings.set(MODULE_ID, SETTING_PRESETS, TagManager.DEFAULT_PRESETS);
            if (this.areNotificationsEnabled()) {
                ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.Settings.PresetsReset"));
            }
        }
    }

    /**
     * Update icons on default tags based on setting.
     * Only affects tags that match default tag names.
     * @param {boolean} showIcons - Whether to show icons
     * @private
     */
    static async _updateDefaultTagsIcons(showIcons) {
        const tags = foundry.utils.deepClone(this.getTags());
        const defaultTagNames = new Set(this.DEFAULT_TAGS.map(t => t.name.toLowerCase()));
        const defaultTagMap = new Map(this.DEFAULT_TAGS.map(t => [t.name.toLowerCase(), t.icon]));

        let changed = false;

        for (const [uuid, tag] of Object.entries(tags)) {
            const nameLower = tag.name.toLowerCase();
            if (defaultTagNames.has(nameLower)) {
                const newIcon = showIcons ? (defaultTagMap.get(nameLower) || "") : "";
                if (tag.icon !== newIcon) {
                    tag.icon = newIcon;
                    changed = true;
                }
            }
        }

        if (changed) {
            await this._writeTags(tags);

            if (this.areNotificationsEnabled()) {
                const msgKey = showIcons ? "AUDIO_TAGGER.IconsEnabled" : "AUDIO_TAGGER.IconsDisabled";
                ui.notifications.info(game.i18n.localize(msgKey));
            }
        }
    }

    /* -------------------------------------------- */
    /*  Tag CRUD Operations                         */
    /* -------------------------------------------- */

    static getTags() {
        if (!this._cache) {
            try {
                this._cache = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTING_TAGS) || {});
                for (const tag of Object.values(this._cache)) delete tag._brightness;
            } catch (e) {
                return {};
            }
        }
        return this._cache;
    }

    static _invalidateCache() {
        this._cache = null;
        this._sortCache.clear();
        this._brightness.clear();
        this.revision++;
    }

    static getTag(uuid) {
        return this.getTags()[uuid] || null;
    }


    static _getBrightness(hex) {
        hex = normalizeHexColor(hex, DEFAULT_BG_COLOR);
        if (this._brightness.has(hex)) return this._brightness.get(hex);
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        this._brightness.set(hex, brightness);
        return brightness;
    }

    static getSortedTags(mode = 'order') {
        // Check cache first
        const cached = this._sortCache.get(mode);
        if (cached) return cached;

        const tags = Object.values(this.getTags());
        let result;

        switch (mode) {
            case 'name-asc':
                result = tags.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
                break;
            case 'name-desc':
                result = tags.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base' }));
                break;
            case 'color-brightness-dark':
                // Dark to Light
                result = tags.sort((a, b) => this._getBrightness(a.backgroundColor) - this._getBrightness(b.backgroundColor));
                break;
            case 'color-brightness':
                // Light to Dark
                result = tags.sort((a, b) => this._getBrightness(b.backgroundColor) - this._getBrightness(a.backgroundColor));
                break;
            case 'order':
            default:
                result = tags.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        // Cache the result
        this._sortCache.set(mode, result);
        return result;
    }

    static createTag(tagData) {
        return this._enqueue(() => this._createTag(tagData));
    }

    static updateTag(uuid, updates) {
        return this._enqueue(() => this._updateTag(uuid, updates));
    }

    static deleteTag(uuid) {
        return this._enqueue(() => this._deleteTag(uuid));
    }

    static async _createTag(tagData) {
        const tags = foundry.utils.deepClone(this.getTags());
        const uuid = tagData.uuid || `Tag.${foundry.utils.randomID()}`;
        // Concurrent recovery of the same imported tag must not overwrite edits.
        if (tags[uuid]) return tags[uuid];
        const now = Date.now();

        const newTag = {
            uuid,
            name: tagData.name,
            icon: tagData.icon || "",
            isFolder: Boolean(tagData.isFolder),
            backgroundColor: tagData.backgroundColor || "#6c757d",
            textColor: tagData.textColor || "#ffffff",
            order: Object.keys(tags).length,
            createdAt: now,
            updatedAt: now
        };

        tags[uuid] = newTag;
        await this._writeTags(tags);
        Hooks.callAll("audioTaggerTagCreated", newTag);
        log(`Audio Tagger | Created tag: ${newTag.name}`);
        return newTag;
    }

    static async _updateTag(uuid, updates) {
        const tags = foundry.utils.deepClone(this.getTags());
        const tag = tags[uuid];
        if (!tag) throw new Error(`Tag with UUID ${uuid} not found`);

        if (tag.isFolder && updates.isFolder === false) await this._releaseChildren(uuid, tags);
        const updatedTag = { ...tag, ...updates, uuid, updatedAt: Date.now() };
        tags[uuid] = updatedTag;
        await this._writeTags(tags);
        Hooks.callAll("audioTaggerTagUpdated", updatedTag);
        log(`Audio Tagger | Updated tag: ${updatedTag.name}`);
        return updatedTag;
    }

    static async _deleteTag(uuid) {
        const tags = foundry.utils.deepClone(this.getTags());
        if (!tags[uuid]) return false;

        const deletedTag = tags[uuid];
        await this._releaseChildren(uuid, tags, true);
        delete tags[uuid];

        await this._writeTags(tags);
        Hooks.callAll("audioTaggerTagDeleted", deletedTag);
        log(`Audio Tagger | Deleted tag: ${deletedTag.name}`);
        return true;
    }

    /**
     * Reorder tags based on new order from drag-and-drop.
     * @param {string[]} uuids - Array of tag UUIDs in new order
     * @returns {Promise<void>}
     */
    static async reorderTags(uuids) {
        const tags = foundry.utils.deepClone(this.getTags());
        let changed = false;
        uuids.forEach((uuid, index) => {
            if (tags[uuid] && tags[uuid].order !== index) {
                tags[uuid].order = index;
                tags[uuid].updatedAt = Date.now();
                changed = true;
            }
        });

        if (changed) await this._writeTags(tags);
        log("Audio Tagger | Tags reordered");
    }

    /* -------------------------------------------- */
    /*  Color Preset Operations                     */
    /* -------------------------------------------- */

    static getColorPresets() {
        const presets = game.settings.get(MODULE_ID, SETTING_PRESETS);
        // Ensure we always return an array (handle migration from Object to Array)
        if (Array.isArray(presets)) return presets;
        return this.DEFAULT_PRESETS;
    }

    static async saveColorPresets(presets) {
        await game.settings.set(MODULE_ID, SETTING_PRESETS, presets);
        log(`Audio Tagger | Saved ${presets.length} color presets`);
    }

    /* -------------------------------------------- */
    /*  Collapsed State                             */
    /* -------------------------------------------- */

    static isCollapsed() {
        try {
            return game.settings.get(MODULE_ID, SETTING_COLLAPSED);
        } catch (e) {
            // Setting not yet registered, return default
            return true;
        }
    }

    static async setCollapsed(collapsed) {
        await game.settings.set(MODULE_ID, SETTING_COLLAPSED, collapsed);
    }

    /* -------------------------------------------- */
    /*  Reset & Initialization                       */
    /* -------------------------------------------- */

    static async resetToDefaults() {
        await this._enqueue(() => this._createDefaults());

        const msg = `Audio Tagger: Reset to ${this.DEFAULT_TAGS.length} default tags`;
        log(msg);
        if (this.areNotificationsEnabled()) {
            ui.notifications.info(msg);
        }
    }

    static async initializeDefaultTags() {
        if (!this._settingsRegistered) {
            console.warn("Audio Tagger | Settings not registered, registering now...");
            this.registerSettings();
        }

        try {
            let tags = this.getTags();
            if (this._needsMigration(tags)) {
                log("Audio Tagger | Migrating tags...");
                await this._migrate(tags);
                return;
            }

            if (Object.keys(tags).length > 0) return;

            await this._enqueue(async () => {
                if (!Object.keys(this.getTags()).length) await this._createDefaults();
            });
            log(`Audio Tagger | Created ${this.DEFAULT_TAGS.length} default tags`);
        } catch (error) {
            console.error("Audio Tagger | Error during initialization:", error);
            // A transient write failure must never erase an existing world.
            ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
        }
    }

    static async _createDefaults() {
        const showIcons = game.settings.get(MODULE_ID, SETTING_DEFAULT_TAG_ICONS);
        const now = Date.now();
        const tags = {};
        for (const [order, data] of this.DEFAULT_TAGS.entries()) {
            const uuid = `Tag.${foundry.utils.randomID()}`;
            tags[uuid] = { ...data, uuid, icon: showIcons ? data.icon : "",
                isFolder: false, order, createdAt: now, updatedAt: now };
        }
        await this._writeTags(tags);
        await this.setTagHierarchy({});
        for (const tag of Object.values(tags)) Hooks.callAll("audioTaggerTagCreated", tag);
    }

    static _needsMigration(tags) {
        if (Array.isArray(tags)) return true;
        return Object.values(tags).some(tag =>
            tag.text !== undefined || tag.bg !== undefined || tag.color !== undefined
        );
    }

    /**
     * Check if notifications are enabled.
     * @returns {boolean}
     */
    static areNotificationsEnabled() {
        try {
            return game.settings.get(MODULE_ID, SETTING_NOTIFICATIONS);
        } catch (e) {
            // Setting not yet registered, return default
            return true;
        }
    }

    static async _migrate(tags) {
        const newTags = {};
        const source = Array.isArray(tags) ? tags : Object.values(tags);

        source.forEach((tag, index) => {
            const uuid = tag.uuid || `Tag.${foundry.utils.randomID()}`;
            newTags[uuid] = {
                uuid,
                name: tag.name || tag.text || "Unnamed",
                icon: tag.icon || "",
                isFolder: Boolean(tag.isFolder),
                backgroundColor: tag.backgroundColor || tag.bg || "#6c757d",
                textColor: tag.textColor || tag.color || "#ffffff",
                order: tag.order ?? index,
                createdAt: tag.createdAt || Date.now(),
                updatedAt: Date.now()
            };
        });

        await this._writeTags(newTags);
        log(`Audio Tagger | Migrated ${Object.keys(newTags).length} tags`);
    }

    /* -------------------------------------------- */
    /*  Sort Mode Operations                        */
    /* -------------------------------------------- */

    /**
     * Get the current sort mode.
     * @returns {string}
     */
    static getSortMode() {
        try {
            return game.settings.get(MODULE_ID, SETTING_SORT_MODE);
        } catch (e) {
            return "order";
        }
    }

    /**
     * Set the sort mode.
     * @param {string} mode - The sort mode to set
     */
    static async setSortMode(mode) {
        await game.settings.set(MODULE_ID, SETTING_SORT_MODE, mode);
    }

    /* -------------------------------------------- */
    /*  Tag Hierarchy Operations                    */
    /* -------------------------------------------- */

    /**
     * Get the tag hierarchy (folder structure).
     * @returns {Object} Map of childUuid -> parentUuid
     */
    static getTagHierarchy() {
        try {
            return normalizeHierarchy(game.settings.get(MODULE_ID, SETTING_TAG_HIERARCHY), this.getTags());
        } catch (e) {
            return {};
        }
    }

    /**
     * Set the tag hierarchy.
     * @param {Object} hierarchy - Map of childUuid -> parentUuid
     */
    static async setTagHierarchy(hierarchy) {
        hierarchy = normalizeHierarchy(hierarchy, this.getTags());
        const current = game.settings.get(MODULE_ID, SETTING_TAG_HIERARCHY) || {};
        if (sameHierarchy(current, hierarchy)) return;
        await game.settings.set(MODULE_ID, SETTING_TAG_HIERARCHY, hierarchy);
        this.requestRender();
        log("Audio Tagger | Tag hierarchy updated");
    }

    /**
     * Set a tag's parent folder.
     * @param {string} childUuid - UUID of the child tag
     * @param {string|null} parentUuid - UUID of the parent folder tag (null to unparent)
     */
    static async setTagParent(childUuid, parentUuid) {
        const hierarchy = foundry.utils.deepClone(this.getTagHierarchy());

        if (parentUuid) {
            hierarchy[childUuid] = parentUuid;
        } else {
            delete hierarchy[childUuid];
        }

        await this.setTagHierarchy(hierarchy);
    }

    /**
     * Get all children of a folder tag.
     * @param {string} parentUuid - UUID of the parent folder
     * @returns {string[]} Array of child tag UUIDs
     */
    static getTagChildren(parentUuid) {
        return childrenOf(parentUuid, this.getTagHierarchy(), this.getTags()).map(tag => tag.uuid);
    }

    /**
     * Get the parent of a tag.
     * @param {string} childUuid - UUID of the child tag
     * @returns {string|null} UUID of the parent or null if top-level
     */
    static getTagParent(childUuid) {
        return this.getTagHierarchy()[childUuid] || null;
    }

    /** Save one completed drag; never read a live DOM after an await. */
    static saveLayout({ hierarchy, groups }, expectedRevision) {
        return this._enqueue(async () => {
            if (expectedRevision !== undefined && expectedRevision !== this.revision) {
                throw new Error("Tag layout changed during drag. Please try again.");
            }
            const tags = foundry.utils.deepClone(this.getTags());
            let changed = false;
            for (const [parent, uuids] of Object.entries(groups)) {
                const field = parent ? "siblingOrder" : "order";
                uuids.forEach((uuid, index) => {
                    if (!tags[uuid] || tags[uuid][field] === index) return;
                    tags[uuid][field] = index;
                    changed = true;
                });
            }
            // World settings are separate documents, not an atomic transaction.
            // Render from their actual values on failure rather than keep a
            // visual layout that was never saved.
            if (changed) await this._writeTags(tags);
            await this.setTagHierarchy(hierarchy);
        });
    }

    static async _releaseChildren(uuid, tags, remove = false) {
        const hierarchy = this.getTagHierarchy();
        const parent = hierarchy[uuid];
        const children = childrenOf(uuid, hierarchy, tags);
        const siblings = parent
            ? childrenOf(parent, hierarchy, tags)
            : this.getSortedTags("order").filter(tag => !hierarchy[tag.uuid]);
        const position = siblings.findIndex(tag => tag.uuid === uuid);
        if (position >= 0) siblings.splice(position + 1, 0, ...children);
        for (const child of children) {
            if (parent) hierarchy[child.uuid] = parent;
            else delete hierarchy[child.uuid];
        }
        if (remove) delete hierarchy[uuid];
        siblings.filter(tag => !remove || tag.uuid !== uuid).forEach((tag, index) => {
            tags[tag.uuid][parent ? "siblingOrder" : "order"] = index;
        });
        await this.setTagHierarchy(hierarchy);
    }
}
