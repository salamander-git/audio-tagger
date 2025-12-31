/**
 * Audio Tagger - Centralized Constants
 * All module-wide constants and selectors
 */

export const MODULE_ID = "audio-tagger";

// Setting Keys
export const SETTING_TAGS = "tags";
export const SETTING_PRESETS = "colorPresets";
export const SETTING_COLLAPSED = "paletteCollapsed";
export const SETTING_LIMIT_HEADER = "limitPlaylistHeaderHeight";
export const SETTING_NOTIFICATIONS = "enableNotifications";

// Flag Keys
export const FLAG_TAGS = "assigned-tags";
export const FLAG_SEARCH = "search";

// CSS Selectors
export const SELECTORS = {
    PALETTE: "#audio-tagger-palette",
    TAG_LIST: "#at-list",
    ASSIGNED_TAGS: ".audio-tagger-assigned-tags",
    ASSIGNED_TAG: ".audio-tagger-assigned-tag",
    PLAYLIST: ".playlist",
    SOUND: ".sound",
    PLAYLIST_HEADER: ".playlist-header",
    GLOBAL_VOLUME: ".global-volume",
    CURRENTLY_PLAYING: ".currently-playing",
    WIZARD_BTN: "#at-wizard-btn",
    ADD_BTN: "#at-add-btn",
    SORT_BTN: "#at-sort-btn"
};

// CSS Classes
export const CLASSES = {
    COLLAPSED: "collapsed",
    ACTIVE: "active",
    SELECTED: "selected",
    LIMIT_HEADER: "audio-tagger-limit-header-height"
};

// Default Colors
export const DEFAULT_BG_COLOR = "#6c757d";
export const DEFAULT_TEXT_COLOR = "#ffffff";

// Hex Color Validation
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Validates if a string is a valid hex color.
 * @param {string} hex - The hex color string to validate.
 * @returns {boolean}
 */
export function isValidHexColor(hex) {
    return HEX_COLOR_REGEX.test(hex);
}

/**
 * Normalizes a hex color to uppercase, returning default if invalid.
 * @param {string} hex - The hex color to normalize.
 * @param {string} fallback - Fallback color if invalid.
 * @returns {string}
 */
export function normalizeHexColor(hex, fallback = DEFAULT_BG_COLOR) {
    if (!isValidHexColor(hex)) return fallback;
    return hex.toUpperCase();
}
