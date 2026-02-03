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
    DEFAULT_BG_COLOR,
    DEFAULT_TEXT_COLOR,
    normalizeHexColor,
    log
} from "./constants.js";

/**
 * TagManager - Central management class for tag operations
 * Handles CRUD operations, storage, and events for the Tag Palette module
 */
export class TagManager {

    static _cache = null;
    static _sortCache = new Map(); // mode -> { tags: [], hash: string }

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
                ui.playlists?.render();
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
                ui.playlists?.render();
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
                this._updateDefaultTagsIcons(showIcons);
            }
        });

        // Reset settings - visible in Module Settings
        game.settings.registerMenu(MODULE_ID, "resetTags", {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.ResetTags"),
            label: game.i18n.localize("AUDIO_TAGGER.Settings.ResetTagsBtn"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.ResetTagsHint"),
            icon: "fas fa-undo",
            type: class extends FormApplication {
                async render() { TagManager._showResetTagsDialog(); }
                async _updateObject() { }
            },
            restricted: true
        });

        game.settings.registerMenu(MODULE_ID, "resetPresets", {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresets"),
            label: game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresetsBtn"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.ResetPresetsHint"),
            icon: "fas fa-palette",
            type: class extends FormApplication {
                async render() { TagManager._showResetPresetsDialog(); }
                async _updateObject() { }
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
            await game.settings.set(MODULE_ID, SETTING_TAGS, tags);
            this._invalidateCache();
            ui.playlists?.render();

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
                this._cache = game.settings.get(MODULE_ID, SETTING_TAGS) || {};
                // Precalculate brightness for sorting performance
                Object.values(this._cache).forEach(tag => {
                    if (!tag._brightness) {
                        tag._brightness = this._getBrightness(tag.backgroundColor);
                    }
                });
            } catch (e) {
                return {};
            }
        }
        return this._cache;
    }

    static _invalidateCache() {
        this._cache = null;
        this._sortCache.clear();
    }

    /**
     * Get a hash of current tags for cache invalidation.
     * @returns {string}
     * @private
     */
    static _getTagsHash() {
        const tags = this.getTags();
        const keys = Object.keys(tags).sort();
        const updates = keys.map(k => tags[k].updatedAt || 0);
        return `${keys.length}:${updates.join(',')}`;
    }

    static getTag(uuid) {
        return this.getTags()[uuid] || null;
    }


    static _getBrightness(hex) {
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);
        return (r * 299 + g * 587 + b * 114) / 1000;
    }

    static getSortedTags(mode = 'order') {
        // Check cache first
        const hash = this._getTagsHash();
        const cached = this._sortCache.get(mode);
        if (cached && cached.hash === hash) {
            return cached.tags;
        }

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
                result = tags.sort((a, b) => (a._brightness || this._getBrightness(a.backgroundColor)) - (b._brightness || this._getBrightness(b.backgroundColor)));
                break;
            case 'color-brightness':
                // Light to Dark
                result = tags.sort((a, b) => (b._brightness || this._getBrightness(b.backgroundColor)) - (a._brightness || this._getBrightness(a.backgroundColor)));
                break;
            case 'order':
            default:
                result = tags.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        // Cache the result
        this._sortCache.set(mode, { tags: result, hash });
        return result;
    }

    static async createTag(tagData) {
        const tags = foundry.utils.deepClone(this.getTags());
        const uuid = tagData.uuid || `Tag.${foundry.utils.randomID()}`;
        const now = Date.now();

        const newTag = {
            uuid,
            name: tagData.name,
            icon: tagData.icon || "",
            backgroundColor: tagData.backgroundColor || "#6c757d",
            textColor: tagData.textColor || "#ffffff",
            order: Object.keys(tags).length,
            createdAt: now,
            updatedAt: now
        };

        tags[uuid] = newTag;
        await game.settings.set(MODULE_ID, SETTING_TAGS, tags);
        Hooks.callAll("audioTaggerTagCreated", newTag);
        log(`Audio Tagger | Created tag: ${newTag.name}`);
        return newTag;
    }

    static async updateTag(uuid, updates) {
        const tags = foundry.utils.deepClone(this.getTags());
        const tag = tags[uuid];
        if (!tag) throw new Error(`Tag with UUID ${uuid} not found`);

        const updatedTag = { ...tag, ...updates, uuid, updatedAt: Date.now() };
        tags[uuid] = updatedTag;
        await game.settings.set(MODULE_ID, SETTING_TAGS, tags);
        Hooks.callAll("audioTaggerTagUpdated", updatedTag);
        log(`Audio Tagger | Updated tag: ${updatedTag.name}`);
        return updatedTag;
    }

    static async deleteTag(uuid) {
        const tags = foundry.utils.deepClone(this.getTags());
        if (!tags[uuid]) return false;

        const deletedTag = tags[uuid];
        delete tags[uuid];

        await game.settings.set(MODULE_ID, SETTING_TAGS, tags);
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

        uuids.forEach((uuid, index) => {
            if (tags[uuid]) {
                tags[uuid].order = index;
                tags[uuid].updatedAt = Date.now();
            }
        });

        await game.settings.set(MODULE_ID, SETTING_TAGS, tags);
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
        await game.settings.set(MODULE_ID, SETTING_TAGS, {});
        log("Audio Tagger | Cleared all tags, creating defaults...");

        // Check if icons should be shown on default tags
        const showIcons = game.settings.get(MODULE_ID, SETTING_DEFAULT_TAG_ICONS);

        for (const tagData of this.DEFAULT_TAGS) {
            const data = showIcons ? tagData : { ...tagData, icon: "" };
            await this.createTag(data);
        }

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

            log("Audio Tagger | Initializing default tags...");
            for (const tagData of this.DEFAULT_TAGS) {
                await this.createTag(tagData);
            }
            log(`Audio Tagger | Created ${this.DEFAULT_TAGS.length} default tags`);
        } catch (error) {
            console.error("Audio Tagger | Error during initialization:", error);
            // Fallback: clear and recreate
            try {
                await game.settings.set(MODULE_ID, SETTING_TAGS, {});
                this._invalidateCache();
                for (const tagData of this.DEFAULT_TAGS) {
                    await this.createTag(tagData);
                }
            } catch (fallbackError) {
                console.error("Audio Tagger | Fallback initialization failed:", fallbackError);
            }
        }
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
                backgroundColor: tag.backgroundColor || tag.bg || "#6c757d",
                textColor: tag.textColor || tag.color || "#ffffff",
                order: tag.order ?? index,
                createdAt: tag.createdAt || Date.now(),
                updatedAt: Date.now()
            };
        });

        await game.settings.set(MODULE_ID, SETTING_TAGS, newTags);
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
            return game.settings.get(MODULE_ID, SETTING_TAG_HIERARCHY) || {};
        } catch (e) {
            return {};
        }
    }

    /**
     * Set the tag hierarchy.
     * @param {Object} hierarchy - Map of childUuid -> parentUuid
     */
    static async setTagHierarchy(hierarchy) {
        await game.settings.set(MODULE_ID, SETTING_TAG_HIERARCHY, hierarchy);
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
        const hierarchy = this.getTagHierarchy();
        return Object.entries(hierarchy)
            .filter(([_, parent]) => parent === parentUuid)
            .map(([child, _]) => child);
    }

    /**
     * Get the parent of a tag.
     * @param {string} childUuid - UUID of the child tag
     * @returns {string|null} UUID of the parent or null if top-level
     */
    static getTagParent(childUuid) {
        return this.getTagHierarchy()[childUuid] || null;
    }
}