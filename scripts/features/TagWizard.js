import { TagAutocomplete } from "../ui/TagAutocomplete.js";
import { TagManager } from "../core/TagManager.js";
import { log, toElement } from "../core/constants.js";

/**
 * Manages the "Tag Wizard" mode for bulk tag assignments.
 * Injects add buttons directly into playlist/sound headers.
 */
export class TagWizard {
    static isActive = false;
    static autocompletes = new Map(); // documentUuid -> TagAutocomplete instance
    static html = null;
    static _savedStates = new Map(); // documentUuid -> { selectedUuids, isOpen, searchQuery }

    /**
     * Initializes the wizard with the playlist directory element.
     * @param {HTMLElement} html - The playlist directory element.
     */
    static init(html) {
        this.html = toElement(html);
    }

    /**
     * Toggles the wizard mode on or off.
     * Only available for GMs.
     */
    static async toggle() {
        if (!game.user.isGM) {
            ui.notifications.warn(game.i18n.localize("AUDIO_TAGGER.GMOnly"));
            return;
        }
        this.isActive ? await this.deactivate() : this.activate();
    }

    /**
     * Activates wizard mode.
     * Only available for GMs.
     */
    static activate() {
        if (!game.user.isGM) return;
        if (this.isActive) return;
        this.isActive = true;
        log("Audio Tagger | Tag Wizard activated");

        this.refresh(this.html);

        // Show notification only on initial activation, not re-renders
        if (TagManager.areNotificationsEnabled()) {
            ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.WizardActivated"));
        }
    }

    /**
     * Re-applies wizard UI to the new HTML (called on re-render).
     * @param {HTMLElement} html - The new playlist directory HTML.
     */
    static refresh(html) {
        if (!this.isActive) return;

        this.html = toElement(html);

        // Save state of all autocompletes before cleanup
        this._saveAllStates();

        // Destroy ALL autocompletes - their DOM elements are gone after Foundry re-render
        for (const [uuid, ac] of this.autocompletes) {
            ac.destroy();
        }
        this.autocompletes.clear();

        this._updateWizardButton(true);
        this._injectAddButtons();

        // Restore saved states to new autocomplete instances
        this._restoreAllStates();
    }

    /**
     * Saves the state of all autocomplete instances.
     * @private
     */
    static _saveAllStates() {
        for (const [uuid, ac] of this.autocompletes) {
            this._savedStates.set(uuid, {
                selectedUuids: new Set(ac.selectedUuids),
                isOpen: ac.isOpen,
                searchQuery: ac.searchQuery || ""
            });
        }
    }

    /**
     * Restores saved states to autocomplete instances.
     * @private
     */
    static _restoreAllStates() {
        for (const [uuid, state] of this._savedStates) {
            const ac = this.autocompletes.get(uuid);
            if (ac && state) {
                // Restore selected UUIDs
                ac.selectedUuids = new Set(state.selectedUuids);
                ac.searchQuery = state.searchQuery;

                // Rebuild visual tags for restored state
                this._rebuildVisualTags(ac);

                // Re-render the dropdown options with restored state
                if (state.isOpen) {
                    ac._openDropdown();
                    if (state.searchQuery) {
                        ac.searchInput.value = state.searchQuery;
                    }
                }
            }
        }
    }

    /**
     * Rebuilds visual tags for an autocomplete after state restore.
     * @param {TagAutocomplete} ac - The autocomplete instance.
     * @private
     */
    static _rebuildVisualTags(ac) {
        // Create container for visual tags
        const header = ac.button.closest("header");
        if (!header) return;

        // Find or create container (any container, not just with data-document-uuid)
        let container = header.parentElement.querySelector(".audio-tagger-assigned-tags");

        if (!container && ac.selectedUuids.size > 0) {
            container = document.createElement("div");
            container.className = "audio-tagger-assigned-tags";
            container.dataset.documentUuid = ac.document.uuid;
            const isSound = header.parentElement.classList.contains("sound");
            container.dataset.target = isSound ? "sound" : "playlist";
            header.insertAdjacentElement("afterend", container);
        }

        if (!container) return;

        // Mark as managed by Tag Wizard
        if (!container.dataset.documentUuid) {
            container.dataset.documentUuid = ac.document.uuid;
        }

        // Clear and rebuild
        container.innerHTML = "";
        for (const tagUuid of ac.selectedUuids) {
            const tagEl = ac._createPendingTagElement(tagUuid);
            if (tagEl) {
                container.appendChild(tagEl);
            }
        }

        // Remove empty container
        if (container.children.length === 0) {
            container.remove();
        }
    }

    /**
     * Deactivates wizard mode and saves all changes.
     */
    static async deactivate() {
        if (!this.isActive) return;
        log("Audio Tagger | Tag Wizard deactivating and saving changes...");

        if (TagManager.areNotificationsEnabled()) {
            ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.WizardSaving"), { permanent: true });
        }

        // Save all autocomplete instances
        const savePromises = Array.from(this.autocompletes.values()).map(ac => ac.save());
        await Promise.all(savePromises);

        // Clean up all instances
        this.autocompletes.forEach(ac => ac.destroy());
        this.autocompletes.clear();
        this._savedStates.clear();

        this.isActive = false;
        this._updateWizardButton(false);

        // Re-render the directory to show updated tags
        if (ui.playlists) {
            await ui.playlists.render();
        }

        if (TagManager.areNotificationsEnabled()) {
            ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.WizardDeactivated"));
        }
    }

    /**
     * Updates the appearance and state of the wizard toggle button.
     * @param {boolean} active - The new active state.
     * @private
     */
    static _updateWizardButton(active) {
        const wizardBtn = this.html?.querySelector("#at-wizard-btn");
        if (!wizardBtn) return;

        wizardBtn.classList.toggle("active", active);
        const icon = wizardBtn.querySelector("i");
        if (icon) {
            icon.className = active ? "fas fa-save" : "fas fa-wand-magic-sparkles";
        }
        wizardBtn.title = game.i18n.localize(active ? "AUDIO_TAGGER.Save" : "AUDIO_TAGGER.TagWizard");
    }

    /**
     * Injects add buttons into all playlist and sound headers.
     * @private
     */
    static _injectAddButtons() {
        const playlists = this.html.querySelectorAll(".playlist");

        for (const playlistEl of playlists) {
            const playlist = game.playlists.get(playlistEl.dataset.entryId);
            if (!playlist) continue;

            // Add button to playlist header
            this._addButtonToHeader(playlistEl, playlist, ".playlist-header");

            // Add buttons to sound headers
            const sounds = playlistEl.querySelectorAll(".sound");
            for (const soundEl of sounds) {
                const sound = playlist.sounds.get(soundEl.dataset.soundId);
                if (sound) {
                    this._addButtonToHeader(soundEl, sound, "header");
                }
            }
        }
    }

    /**
     * Adds an add button to a specific header element.
     * @param {HTMLElement} element - The DOM element for the document.
     * @param {Document} doc - The Playlist or PlaylistSound document.
     * @param {string} headerSelector - CSS selector for the header.
     * @private
     */
    static _addButtonToHeader(element, doc, headerSelector) {
        if (this.autocompletes.has(doc.uuid)) return;

        const header = element.querySelector(headerSelector);
        if (!header) return;

        // Create the add button
        const addBtn = document.createElement("i");
        addBtn.className = "fas fa-plus at-header-add-btn";
        addBtn.dataset.documentUuid = doc.uuid;
        addBtn.title = game.i18n.localize("AUDIO_TAGGER.AddTag");


        // Insert as first child of header
        header.insertBefore(addBtn, header.firstChild);

        // Create autocomplete attached to the button
        const autocomplete = new TagAutocomplete(doc, addBtn);
        this.autocompletes.set(doc.uuid, autocomplete);
    }

    /**
     * Checks if the wizard is currently active.
     * @returns {boolean}
     */
    static isWizardActive() {
        return this.isActive;
    }

    /**
     * Removes a tag from a document via the autocomplete (without triggering re-render).
     * Used when Remove tag button is clicked while Tag Wizard is active.
     * @param {string} documentUuid - The UUID of the document.
     * @param {string} tagUuid - The UUID of the tag to remove.
     * @returns {boolean} True if the tag was removed, false if not found.
     */
    static removeTagFromDocument(documentUuid, tagUuid) {
        const autocomplete = this.autocompletes.get(documentUuid);
        if (!autocomplete) return false;

        if (autocomplete.selectedUuids.has(tagUuid)) {
            autocomplete._toggleTag(tagUuid);
            return true;
        }
        return false;
    }
}