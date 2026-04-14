import { TagManager } from "../core/TagManager.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";
import { log, toElement } from "../core/constants.js";

/**
 * SmartPlaylistInjector - Injects Smart Playlist UI into PlaylistConfig dialog.
 * Allows populating playlists with sounds based on tag selection.
 */
export class SmartPlaylistInjector {
    static _selectedTags = new Set();
    static _currentPlaylistId = null;

    /**
     * Initialize by registering the renderPlaylistConfig hook.
     */
    static init() {
        Hooks.on("renderPlaylistConfig", (app, html, data) => {
            this._injectUI(app, html, data);
        });
        log("Audio Tagger | SmartPlaylistInjector initialized");
    }

    /**
     * Inject the Smart Playlist UI into the PlaylistConfig dialog.
     * @param {Application} app - The PlaylistConfig application
     * @param {jQuery|HTMLElement} html - The rendered HTML
     * @param {object} data - The render data
     * @private
     */
    static _injectUI(app, html, data) {
        // Only GMs can use Smart Playlist feature
        if (!game.user.isGM) return;

        const element = toElement(html);
        const playlist = app.document ?? app.object;
        if (!playlist) return;

        // Reset selection when opening new playlist
        if (this._currentPlaylistId !== playlist.id) {
            this._selectedTags.clear();
            this._currentPlaylistId = playlist.id;
        }

        // Find insertion point - support legacy (.form-group.slim) and v14 ApplicationV2 layouts
        const slimGroup = element.querySelector(".form-group.slim")
            ?? element.querySelector("form > .form-group:last-of-type")
            ?? element.querySelector(".form-footer");
        if (!slimGroup) return;

        // Don't inject if already exists
        if (element.querySelector(".at-smart-playlist")) return;

        // Build the Smart Playlist section
        const section = document.createElement("div");
        section.className = "at-smart-playlist form-group stacked";
        section.innerHTML = this._buildSectionHTML();

        // Insert after slim group
        slimGroup.insertAdjacentElement("afterend", section);

        // Attach event listeners
        this._attachListeners(section, playlist, app);
    }

    /**
     * Build the HTML for the Smart Playlist section.
     * @returns {string}
     * @private
     */
    static _buildSectionHTML() {
        const tags = Object.values(TagManager.getTags());
        const sortedTags = tags.sort((a, b) => a.name.localeCompare(b.name));

        const tagsHTML = sortedTags.map(tag => {
            const isSelected = this._selectedTags.has(tag.uuid);
            const iconHTML = tag.icon ? `<span class="at-tag-icon">${tag.icon}</span>` : "";
            return `
                <span class="at-smart-tag${isSelected ? " selected" : ""}" 
                      data-uuid="${tag.uuid}"
                      style="background-color: ${tag.backgroundColor}; color: ${tag.textColor};"
                      title="${tag.name}">
                    ${iconHTML}<span class="at-tag-name">${tag.name}</span>
                </span>
            `;
        }).join("");

        return `
            <label>${game.i18n.localize("AUDIO_TAGGER.SmartPlaylist")}</label>
            <p class="hint">${game.i18n.localize("AUDIO_TAGGER.SmartPlaylistHint")}</p>
            <div class="at-smart-tags-list">
                ${tagsHTML || `<em>${game.i18n.localize("AUDIO_TAGGER.NoTagsAvailable")}</em>`}
            </div>
            <div class="at-smart-options">
                <label class="at-smart-option">
                    <input type="radio" name="at-smart-mode" value="inclusive" checked>
                    <span>${game.i18n.localize("AUDIO_TAGGER.AddInclusive")}</span>
                </label>
                <label class="at-smart-option">
                    <input type="radio" name="at-smart-mode" value="exclusive">
                    <span>${game.i18n.localize("AUDIO_TAGGER.AddExclusive")}</span>
                </label>
            </div>
            <button type="button" class="at-smart-populate">
                <i class="fas fa-magic"></i>
                ${game.i18n.localize("AUDIO_TAGGER.PopulateSounds")}
            </button>
        `;
    }

    /**
     * Attach event listeners to the Smart Playlist section.
     * @param {HTMLElement} section - The section element
     * @param {Playlist} playlist - The playlist document
     * @param {Application} app - The PlaylistConfig application
     * @private
     */
    static _attachListeners(section, playlist, app) {
        // Tag selection
        section.querySelectorAll(".at-smart-tag").forEach(tagEl => {
            tagEl.addEventListener("click", (e) => {
                e.preventDefault();
                const uuid = tagEl.dataset.uuid;

                if (this._selectedTags.has(uuid)) {
                    this._selectedTags.delete(uuid);
                    tagEl.classList.remove("selected");
                } else {
                    this._selectedTags.add(uuid);
                    tagEl.classList.add("selected");
                }
            });
        });

        // Populate button
        const populateBtn = section.querySelector(".at-smart-populate");
        populateBtn?.addEventListener("click", async (e) => {
            e.preventDefault();

            if (this._selectedTags.size === 0) {
                if (TagManager.areNotificationsEnabled()) {
                    ui.notifications.warn(game.i18n.localize("AUDIO_TAGGER.SelectTagsFirst"));
                }
                return;
            }

            const mode = section.querySelector('input[name="at-smart-mode"]:checked')?.value || "inclusive";
            const exclusive = mode === "exclusive";

            await this._populatePlaylist(playlist, exclusive);
        });
    }

    /**
     * Populate the playlist with sounds matching the selected tags.
     * @param {Playlist} playlist - The playlist to populate
     * @param {boolean} exclusive - If true, only sounds with EXACT tags match
     * @private
     */
    static async _populatePlaylist(playlist, exclusive) {
        const selectedUuids = [...this._selectedTags];
        const matchingSounds = this._findMatchingSounds(selectedUuids, exclusive);

        if (matchingSounds.length === 0) {
            if (TagManager.areNotificationsEnabled()) {
                ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.NoMatchingSounds"));
            }
            return;
        }

        // Get existing sound paths in playlist
        const existingPaths = new Set(playlist.sounds.map(s => s.path));

        // Filter out sounds already in playlist
        const newSounds = matchingSounds.filter(s => !existingPaths.has(s.path));

        if (newSounds.length === 0) {
            if (TagManager.areNotificationsEnabled()) {
                ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.AllSoundsAlreadyAdded"));
            }
            return;
        }

        // Create sound data for the playlist - copy ALL properties from source sounds
        const soundData = newSounds.map(sound => ({
            name: sound.name,
            path: sound.path,
            volume: sound.volume,
            repeat: sound.repeat,
            fade: sound.fade,
            description: sound.description || "",
            // Copy flags including tags
            flags: foundry.utils.deepClone(sound.flags) || {}
        }));

        // Add sounds to playlist
        const createdSounds = await playlist.createEmbeddedDocuments("PlaylistSound", soundData);

        if (TagManager.areNotificationsEnabled()) {
            const msg = game.i18n.format("AUDIO_TAGGER.SoundsAdded", { count: createdSounds.length });
            ui.notifications.info(msg);
        }

        // Clear selection
        this._selectedTags.clear();

        // Re-render the config to update the UI
        ui.playlists?.render();
    }

    /**
     * Find all sounds matching the selected tags.
     * @param {string[]} tagUuids - Array of selected tag UUIDs
     * @param {boolean} exclusive - If true, sound must have ONLY these tags
     * @returns {PlaylistSound[]}
     * @private
     */
    static _findMatchingSounds(tagUuids, exclusive) {
        const results = [];
        const selectedSet = new Set(tagUuids);

        for (const playlist of game.playlists) {
            for (const sound of playlist.sounds) {
                const assignments = TagAssignmentManager.getAssignedTags(sound);
                const soundTagUuids = new Set(assignments.map(a => a.uuid));

                if (exclusive) {
                    // Exclusive: sound must have EXACTLY the selected tags
                    if (soundTagUuids.size !== selectedSet.size) continue;
                    const allMatch = [...selectedSet].every(uuid => soundTagUuids.has(uuid));
                    if (allMatch) results.push(sound);
                } else {
                    // Inclusive: sound must have ALL selected tags (can have more)
                    const hasAll = [...selectedSet].every(uuid => soundTagUuids.has(uuid));
                    if (hasAll) results.push(sound);
                }
            }
        }

        return results;
    }
}
