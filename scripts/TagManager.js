import {
    MODULE_ID,
    SETTING_TAGS,
    SETTING_PRESETS,
    SETTING_COLLAPSED,
    DEFAULT_BG_COLOR,
    DEFAULT_TEXT_COLOR,
    normalizeHexColor
} from "./constants.js";

/**
 * TagManager - Central management class for tag operations
 * Handles CRUD operations, storage, and events for the Tag Palette module
 */
export class TagManager {

    static MODULE_ID = MODULE_ID;
    static SETTING_TAGS = SETTING_TAGS;
    static SETTING_PRESETS = SETTING_PRESETS;
    static SETTING_COLLAPSED = SETTING_COLLAPSED;

    static _cache = null;
    static _sortCache = new Map(); // mode -> { tags: [], hash: string }

    static DEFAULT_PRESETS = [
        "#ff595e", "#ffca3a", "#8ac926", "#1982c4",
        "#6a4c93", "#ff924c", "#e76f51", "#2a9d8f",
        "#264653", "#f4a261", "#e9c46a", "#a8dadc"
    ];

    static DEFAULT_TAGS = [
        { name: "Ambient", backgroundColor: "#E1E7EF", textColor: "#1A1F26" },
        { name: "Exploration", backgroundColor: "#D9E8C8", textColor: "#2B3D1F" },
        { name: "Tension", backgroundColor: "#F6D9C5", textColor: "#3A1C14" },
        { name: "Danger", backgroundColor: "#B83E3E", textColor: "#FFFFFF" },
        { name: "Mystery", backgroundColor: "#5C5A7A", textColor: "#F4F1FA" },
        { name: "Dark", backgroundColor: "#1B1B1B", textColor: "#E5E5E5" },
        { name: "Battle", backgroundColor: "#8B1A1A", textColor: "#FFFFFF" },
        { name: "Chase", backgroundColor: "#F0B429", textColor: "#2C1A00" },
        { name: "Stealth", backgroundColor: "#2E3A3F", textColor: "#D7E5EA" },
        { name: "Investigation", backgroundColor: "#C9D3E7", textColor: "#1C2633" },
        { name: "Ritual", backgroundColor: "#6A2E6A", textColor: "#F9EAFE" },
        { name: "Epic", backgroundColor: "#F7E7A1", textColor: "#3C3300" },
        { name: "Forest", backgroundColor: "#3E6B47", textColor: "#E6F5E9" },
        { name: "Dungeon", backgroundColor: "#2A2A33", textColor: "#CFCFE1" },
        { name: "City", backgroundColor: "#D6CEC2", textColor: "#2C2622" },
        { name: "Tavern", backgroundColor: "#A57A52", textColor: "#F3EDE6" },
        { name: "Wilderness", backgroundColor: "#6E8F4C", textColor: "#F0F7E8" },
        { name: "Ruins", backgroundColor: "#7A7169", textColor: "#F3F1EE" },
        { name: "Mountains", backgroundColor: "#8DA3B8", textColor: "#1F2A33" },
        { name: "Desert", backgroundColor: "#E4C289", textColor: "#3C2D14" },
        { name: "Ocean", backgroundColor: "#2C587C", textColor: "#D4EAF8" },
        { name: "Arcane", backgroundColor: "#5F4DA8", textColor: "#EFEAFE" },
        { name: "Divine", backgroundColor: "#FFF2D9", textColor: "#3C3010" },
        { name: "Eldritch", backgroundColor: "#1A2632", textColor: "#BFD6E8" },
        { name: "Dream", backgroundColor: "#B9A9E6", textColor: "#2A1F47" },
        { name: "Calm", backgroundColor: "#DFF4F2", textColor: "#153C39" },
        { name: "Hopeful", backgroundColor: "#F5F0C6", textColor: "#3A3A10" },
        { name: "Sad", backgroundColor: "#93A2B8", textColor: "#1F272F" },
        { name: "Suspense", backgroundColor: "#EFE3B8", textColor: "#332B0F" },
        { name: "Heroic", backgroundColor: "#FFD66B", textColor: "#3C2E00" },
        { name: "Horror", backgroundColor: "#1A0D0D", textColor: "#FBEAEA" }
    ];

    /* -------------------------------------------- */
    /*  Settings Registration                       */
    /* -------------------------------------------- */

    static _settingsRegistered = false;

    static registerSettings() {
        if (this._settingsRegistered) return;

        console.log("Audio Tagger | Registering settings...");

        // Hidden storage settings
        game.settings.register(this.MODULE_ID, this.SETTING_TAGS, {
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

        game.settings.register(this.MODULE_ID, this.SETTING_PRESETS, {
            scope: "world",
            config: false,
            type: Array,
            default: this.DEFAULT_PRESETS,
            onChange: () => {
                this._invalidateCache();
            }
        });

        game.settings.register(this.MODULE_ID, this.SETTING_COLLAPSED, {
            scope: "client",
            config: false,
            type: Boolean,
            default: true
        });

        // Limit playlist header height setting
        game.settings.register(this.MODULE_ID, "limitPlaylistHeaderHeight", {
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
        game.settings.register(this.MODULE_ID, "enableNotifications", {
            name: game.i18n.localize("AUDIO_TAGGER.Settings.EnableNotifications"),
            hint: game.i18n.localize("AUDIO_TAGGER.Settings.EnableNotificationsHint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true
        });

        // Reset settings - visible in Module Settings
        game.settings.registerMenu(this.MODULE_ID, "resetTags", {
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

        game.settings.registerMenu(this.MODULE_ID, "resetPresets", {
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
        console.log("Audio Tagger | Settings registered successfully");
    }

    /**
     * Apply initial settings that need DOM manipulation.
     */
    static applyInitialSettings() {
        // Apply playlist header height limit if enabled
        const limitHeader = game.settings.get(this.MODULE_ID, "limitPlaylistHeaderHeight");
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
            await game.settings.set(TagManager.MODULE_ID, TagManager.SETTING_PRESETS, TagManager.DEFAULT_PRESETS);
            ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.Settings.PresetsReset"));
        }
    }

    /* -------------------------------------------- */
    /*  Tag CRUD Operations                         */
    /* -------------------------------------------- */

    static getTags() {
        if (!this._cache) {
            try {
                this._cache = game.settings.get(this.MODULE_ID, this.SETTING_TAGS) || {};
                // Precalculate color properties for performance
                Object.values(this._cache).forEach(tag => {
                    if (!tag._lch) {
                        tag._lch = this._hexToLCH(tag.backgroundColor);
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

    /**
     * Convert hex color to LCH color space for improved color sorting.
     * LCH = Luminance, Chroma, Hue - perceptually uniform color space.
     * @param {string} hex - Hex color string (#RRGGBB)
     * @returns {{l: number, c: number, h: number}} LCH values
     * @private
     */
    static _hexToLCH(hex) {
        // 1. Parse hex to RGB (0-1 range)
        const r = parseInt(hex.substr(1, 2), 16) / 255;
        const g = parseInt(hex.substr(3, 2), 16) / 255;
        const b = parseInt(hex.substr(5, 2), 16) / 255;

        // 2. Convert sRGB to Linear RGB
        const linearize = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        const rL = linearize(r), gL = linearize(g), bL = linearize(b);

        // 3. Linear RGB to XYZ (D65 illuminant)
        const x = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375;
        const y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750;
        const z = rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041;

        // 4. XYZ to LAB
        const xn = 0.95047, yn = 1.0, zn = 1.08883;
        const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
        const L = 116 * f(y / yn) - 16;
        const A = 500 * (f(x / xn) - f(y / yn));
        const B = 200 * (f(y / yn) - f(z / zn));

        // 5. LAB to LCH
        const C = Math.sqrt(A * A + B * B);
        let H = Math.atan2(B, A) * (180 / Math.PI);
        if (H < 0) H += 360;

        return { l: L, c: C, h: H };
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
            case 'color-hue':
                result = tags.sort((a, b) => {
                    const aLch = a._lch || this._hexToLCH(a.backgroundColor);
                    const bLch = b._lch || this._hexToLCH(b.backgroundColor);

                    const aIsGray = aLch.c < 5;
                    const bIsGray = bLch.c < 5;
                    if (aIsGray !== bIsGray) return aIsGray ? -1 : 1;
                    if (aIsGray && bIsGray) return bLch.l - aLch.l;

                    const aHueRounded = Math.round(aLch.h / 20) * 20;
                    const bHueRounded = Math.round(bLch.h / 20) * 20;
                    if (aHueRounded !== bHueRounded) return aHueRounded - bHueRounded;

                    const aLumRounded = Math.round(aLch.l / 15) * 15;
                    const bLumRounded = Math.round(bLch.l / 15) * 15;
                    if (aLumRounded !== bLumRounded) return bLumRounded - aLumRounded;

                    return aLch.c - bLch.c;
                });
                break;
            case 'color-brightness':
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
            backgroundColor: tagData.backgroundColor || "#6c757d",
            textColor: tagData.textColor || "#ffffff",
            order: Object.keys(tags).length,
            createdAt: now,
            updatedAt: now
        };

        tags[uuid] = newTag;
        await game.settings.set(this.MODULE_ID, this.SETTING_TAGS, tags);
        Hooks.callAll("audioTaggerTagCreated", newTag);
        console.log(`Audio Tagger | Created tag: ${newTag.name}`);
        return newTag;
    }

    static async updateTag(uuid, updates) {
        const tags = foundry.utils.deepClone(this.getTags());
        const tag = tags[uuid];
        if (!tag) throw new Error(`Tag with UUID ${uuid} not found`);

        const updatedTag = { ...tag, ...updates, uuid, updatedAt: Date.now() };
        tags[uuid] = updatedTag;
        await game.settings.set(this.MODULE_ID, this.SETTING_TAGS, tags);
        Hooks.callAll("audioTaggerTagUpdated", updatedTag);
        console.log(`Audio Tagger | Updated tag: ${updatedTag.name}`);
        return updatedTag;
    }

    static async deleteTag(uuid) {
        const tags = foundry.utils.deepClone(this.getTags());
        if (!tags[uuid]) return false;

        const deletedTag = tags[uuid];
        delete tags[uuid];

        await game.settings.set(this.MODULE_ID, this.SETTING_TAGS, tags);
        Hooks.callAll("audioTaggerTagDeleted", deletedTag);
        console.log(`Audio Tagger | Deleted tag: ${deletedTag.name}`);
        return true;
    }

    /* -------------------------------------------- */
    /*  Color Preset Operations                     */
    /* -------------------------------------------- */

    static getColorPresets() {
        const presets = game.settings.get(this.MODULE_ID, this.SETTING_PRESETS);
        // Ensure we always return an array (handle migration from Object to Array)
        if (Array.isArray(presets)) return presets;
        return this.DEFAULT_PRESETS;
    }

    static async saveColorPresets(presets) {
        await game.settings.set(this.MODULE_ID, this.SETTING_PRESETS, presets);
        console.log(`Audio Tagger | Saved ${presets.length} color presets`);
    }

    /* -------------------------------------------- */
    /*  Collapsed State                             */
    /* -------------------------------------------- */

    static isCollapsed() {
        try {
            return game.settings.get(this.MODULE_ID, this.SETTING_COLLAPSED);
        } catch (e) {
            // Setting not yet registered, return default
            return true;
        }
    }

    static async setCollapsed(collapsed) {
        await game.settings.set(this.MODULE_ID, this.SETTING_COLLAPSED, collapsed);
    }

    /* -------------------------------------------- */
    /*  Reset & Initialization                       */
    /* -------------------------------------------- */

    static async resetToDefaults() {
        await game.settings.set(this.MODULE_ID, this.SETTING_TAGS, {});
        console.log("Audio Tagger | Cleared all tags, creating defaults...");

        for (const tagData of this.DEFAULT_TAGS) {
            await this.createTag(tagData);
        }

        const msg = `Audio Tagger: Reset to ${this.DEFAULT_TAGS.length} default tags`;
        console.log(msg);
        ui.notifications.info(msg);
    }

    static async initializeDefaultTags() {
        if (!this._settingsRegistered) {
            console.warn("Audio Tagger | Settings not registered, registering now...");
            this.registerSettings();
        }

        try {
            let tags = this.getTags();
            if (this._needsMigration(tags)) {
                console.log("Audio Tagger | Migrating tags...");
                await this._migrate(tags);
                return;
            }

            if (Object.keys(tags).length > 0) return;

            console.log("Audio Tagger | Initializing default tags...");
            for (const tagData of this.DEFAULT_TAGS) {
                await this.createTag(tagData);
            }
            console.log(`Audio Tagger | Created ${this.DEFAULT_TAGS.length} default tags`);
        } catch (error) {
            console.error("Audio Tagger | Error during initialization:", error);
            // Fallback: clear and recreate
            try {
                await game.settings.set(this.MODULE_ID, this.SETTING_TAGS, {});
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
            return game.settings.get(this.MODULE_ID, "enableNotifications");
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
                backgroundColor: tag.backgroundColor || tag.bg || "#6c757d",
                textColor: tag.textColor || tag.color || "#ffffff",
                order: tag.order ?? index,
                createdAt: tag.createdAt || Date.now(),
                updatedAt: Date.now()
            };
        });

        await game.settings.set(this.MODULE_ID, this.SETTING_TAGS, newTags);
        console.log(`Audio Tagger | Migrated ${Object.keys(newTags).length} tags`);
    }
}