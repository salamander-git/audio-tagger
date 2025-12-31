import { TagAutocomplete } from "./TagAutocomplete.js";
import { TagManager } from "./TagManager.js";

/**
 * Manages the "Tag Wizard" mode for bulk tag assignments.
 * Injects add buttons directly into playlist/sound headers.
 */
export class TagWizard {
    static isActive = false;
    static autocompletes = new Map(); // documentUuid -> TagAutocomplete instance
    static html = null;

    /**
     * Initializes the wizard with the playlist directory element.
     * @param {HTMLElement} html - The playlist directory element.
     */
    static init(html) {
        this.html = html instanceof jQuery ? html[0] : html;
    }

    /**
     * Toggles the wizard mode on or off.
     */
    static async toggle() {
        this.isActive ? await this.deactivate() : this.activate();
    }

    /**
     * Activates wizard mode.
     */
    static activate() {
        if (this.isActive) return;
        this.isActive = true;
        console.log("Audio Tagger | Tag Wizard activated");

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

        this.html = html instanceof jQuery ? html[0] : html;

        // Clean up stale autocompletes for elements no longer in DOM
        for (const [uuid, ac] of this.autocompletes) {
            const stillExists = this.html.querySelector(`[data-entry-id="${uuid.split('.')[1]}"], [data-sound-id="${uuid.split('.')[3]}"]`);
            if (!stillExists) {
                ac.destroy();
                this.autocompletes.delete(uuid);
            }
        }

        this._updateWizardButton(true);
        this._injectAddButtons();
    }

    /**
     * Deactivates wizard mode and saves all changes.
     */
    static async deactivate() {
        if (!this.isActive) return;
        console.log("Audio Tagger | Tag Wizard deactivating and saving changes...");

        if (TagManager.areNotificationsEnabled()) {
            ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.WizardSaving"), { permanent: true });
        }

        // Save all autocomplete instances
        const savePromises = Array.from(this.autocompletes.values()).map(ac => ac.save());
        await Promise.all(savePromises);

        // Clean up all instances
        this.autocompletes.forEach(ac => ac.destroy());
        this.autocompletes.clear();

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
        // addBtn.setAttribute("inert", "");

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
}