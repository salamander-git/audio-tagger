import { TagManager } from "./TagManager.js";
import { TagEditorDialog } from "./TagEditorDialog.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";
import { TagWizard } from "./TagWizard.js";

/**
 * Handles rendering and interaction for the Tag Palette UI
 */
export class PaletteRenderer {
    constructor(html) {
        this.html = html;
        this.currentSortMode = "name-asc"; // order, name-asc, name-desc, color-hue, color-brightness
    }

    /**
     * Render the palette into the Playlist Directory
     */
    render() {
        // Remove existing palette to prevent duplication
        const existing = this.html.querySelector("#audio-tagger-palette");
        if (existing) existing.remove();

        const globalVolume = this.html.querySelector(".global-volume");
        if (!globalVolume) {
            console.warn("Audio Tagger | Could not find insertion point in Playlist Directory");
            return;
        }

        const paletteHTML = this._buildPaletteHTML();
        globalVolume.insertAdjacentHTML("afterend", paletteHTML);

        // Cache elements
        this.palette = this.html.querySelector("#audio-tagger-palette");
        this.list = this.palette.querySelector("#at-list");
        this.counter = this.palette.querySelector("#at-count");
        this.spoiler = this.palette.querySelector("#at-spoiler");
        this.header = this.palette.querySelector("#at-header");
        this.toggleIcon = this.palette.querySelector("#at-toggle-icon");
        this.addBtn = this.palette.querySelector("#at-add-btn");
        this.wizardBtn = this.palette.querySelector("#at-wizard-btn");
        this.sortBtn = this.palette.querySelector("#at-sort-btn");
        this.refreshBtn = this.palette.querySelector("#at-rest-btn");

        this._renderTags();
        this._attachListeners();

        TagWizard.init(this.html);
    }

    /**
     * Build the palette HTML structure
     * @returns {string}
     * @private
     */
    _buildPaletteHTML() {
        const isCollapsed = TagManager.isCollapsed();
        const tags = TagManager.getSortedTags();

        return `
            <div class="audio-tagger-container" id="audio-tagger-palette">
                <header class="audio-tagger-header" id="at-header">
                    <span>${game.i18n.localize("AUDIO_TAGGER.Title")}</span>
                    <i class="fas fa-chevron-up audio-tagger-toggle-icon ${isCollapsed ? 'collapsed' : ''}" id="at-toggle-icon"></i>
                </header>
                
                <section class="audio-tagger-spoiler ${isCollapsed ? 'collapsed' : ''}" id="at-spoiler">
                    <div class="audio-tagger-list" id="at-list"></div>
                    <div class="audio-tagger-add-wrapper">
                        <button class="audio-tagger-add-button at-rest-button" id="at-rest-btn" title="${game.i18n.localize("AUDIO_TAGGER.RefreshTags")}">
                            <i class="fas fa-sync"></i>
                        </button>
                        <button class="audio-tagger-add-button" id="at-wizard-btn" title="${game.i18n.localize("AUDIO_TAGGER.TagWizard")}">
                            <i class="fas fa-wand-magic-sparkles"></i>
                            ${game.i18n.localize("AUDIO_TAGGER.TagWizard")}
                        </button>
                        <button class="audio-tagger-add-button" id="at-add-btn" title="${game.i18n.localize("AUDIO_TAGGER.AddTag")}">
                            <i class="fas fa-plus"></i>
                            ${game.i18n.localize("AUDIO_TAGGER.CreateTag")}
                        </button>
                        <button class="audio-tagger-add-button at-sort-button" id="at-sort-btn" title="${game.i18n.localize("AUDIO_TAGGER.SortTags")}">
                            <i class="fas fa-sort-alpha-down"></i>
                        </button>
                    </div>
                    <footer class="audio-tagger-counter">
                        ${game.i18n.localize("AUDIO_TAGGER.TagCount")}: <span id="at-count">${tags.length}</span>
                    </footer>
                </section>
            </div>
        `;
    }

    /**
     * Render tags into the list based on the current sort mode
     * @private
     */
    _renderTags() {
        const tags = TagManager.getSortedTags(this.currentSortMode);
        this.list.innerHTML = ""; // Clear existing tags

        const fragment = document.createDocumentFragment();
        tags.forEach(tag => {
            const tagEl = document.createElement("div");
            tagEl.className = "audio-tagger-item";
            tagEl.dataset.uuid = tag.uuid;
            tagEl.dataset.tagName = tag.name;
            tagEl.style.backgroundColor = tag.backgroundColor;
            tagEl.style.color = tag.textColor;
            tagEl.innerHTML = `
                <span>${foundry.utils.escapeHTML(tag.name)}</span>
                <div class="audio-tagger-btn edit-btn" data-action="editTag" title="${game.i18n.localize("AUDIO_TAGGER.EditTag")}">
                    <i class="fas fa-pencil"></i>
                </div>
                <div class="audio-tagger-btn delete-btn" data-action="deleteTag" title="${game.i18n.localize("AUDIO_TAGGER.DeleteTag")}">
                    <i class="fas fa-times"></i>
                </div>
            `;
            fragment.appendChild(tagEl);
        });

        this.list.appendChild(fragment);
        this.counter.textContent = tags.length;
    }

    /**
     * Cycle through sort modes and re-render tags
     * @private
     */
    _cycleSortMode() {
        const modes = ["order", "name-asc", "name-desc", "color-hue", "color-brightness"];
        const currentIndex = modes.indexOf(this.currentSortMode);
        this.currentSortMode = modes[(currentIndex + 1) % modes.length];

        const icons = {
            "order": "fa-grip-vertical",
            "name-asc": "fa-sort-alpha-down",
            "name-desc": "fa-sort-alpha-up",
            "color-hue": "fa-palette",
            "color-brightness": "fa-lightbulb"
        };
        this.sortBtn.querySelector("i").className = `fas ${icons[this.currentSortMode]}`;

        this._renderTags();

        const modeNames = {
            "order": "AUDIO_TAGGER.SortByOrder",
            "name-asc": "AUDIO_TAGGER.SortByNameAsc",
            "name-desc": "AUDIO_TAGGER.SortByNameDesc",
            "color-hue": "AUDIO_TAGGER.SortByColorHue",
            "color-brightness": "AUDIO_TAGGER.SortByBrightness"
        };
        if (TagManager.areNotificationsEnabled()) {
            ui.notifications.info(game.i18n.localize(modeNames[this.currentSortMode]));
        }
    }

    /**
     * Attach event listeners to the palette UI
     * @private
     */
    _attachListeners() {
        this.header.addEventListener("click", () => {
            const isCollapsed = this.spoiler.classList.toggle("collapsed");
            this.toggleIcon.classList.toggle("collapsed");
            TagManager.setCollapsed(isCollapsed);
        });

        this.wizardBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            TagWizard.toggle();
        });

        this.addBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const newTag = await TagEditorDialog.open();
            if (newTag) this._renderTags();
        });

        this.refreshBtn.addEventListener("click", async (e) => {
             e.stopPropagation();
             this.refreshBtn.querySelector("i").classList.add("fa-spin");
             
             try {
                // Batch recover
                for (const playlist of game.playlists) {
                    await TagAssignmentManager.recoverTags(playlist);
                    for (const sound of playlist.sounds) {
                         await TagAssignmentManager.recoverTags(sound);
                    }
                }
                
                this._renderTags();
                if (TagManager.areNotificationsEnabled()) {
                    ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.TagsRefreshed"));
                }
             } finally {
                this.refreshBtn.querySelector("i").classList.remove("fa-spin");
             }
        });

        this.sortBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._cycleSortMode();
        });

        this.list.addEventListener("click", async (e) => {
            const item = e.target.closest(".audio-tagger-item");
            if (!item) return;

            const editBtn = e.target.closest(".edit-btn");
            const deleteBtn = e.target.closest(".delete-btn");
            const tag = TagManager.getTag(item.dataset.uuid);
            if (!tag) return;

            if (editBtn) {
                e.stopPropagation();
                const updated = await TagEditorDialog.open(tag);
                if (updated) this._renderTags();
            } else if (deleteBtn) {
                e.stopPropagation();
                await this._handleDelete(tag);
            } else {
                // Click on tag itself - add to search
                e.stopPropagation();
                this._searchByTag(tag.name);
            }
        });
    }

    /**
     * Set search input to tag name and trigger search.
     * @param {string} tagName - Tag name to search for
     * @private
     */
    _searchByTag(tagName) {
        const searchInput = this.html.querySelector("input[name='search']");
        if (!searchInput) return;

        searchInput.value = tagName;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        
        // Also trigger Foundry's search filter
        searchInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }

    /**
     * Handle the tag deletion confirmation and process
     * @param {object} tag - The tag to delete
     * @private
     */
    async _handleDelete(tag) {
         // IMPORTANT: Check notifications setting immediately to determine if we skip dialog
        const notificationsEnabled = TagManager.areNotificationsEnabled();
        
        // If notifications are disabled, delete immediately regardless of usage
        // The user explicitly requested: "When notifications are off, this dialog should not exist. It is considered that the user always agrees."
        if (!notificationsEnabled) {
            await TagManager.deleteTag(tag.uuid);
            this._renderTags();
            return;
        }

        const documents = TagAssignmentManager.getDocumentsWithTag(tag.uuid);
        let content = `<p>${game.i18n.format("AUDIO_TAGGER.DeleteConfirmContent", { name: tag.name })}</p>`;
        
        if (documents.length > 0) {
            // Count playlists and sounds separately for clarity
            const playlists = documents.filter(d => d.documentName === "Playlist").length;
            const sounds = documents.filter(d => d.documentName === "PlaylistSound").length;
            
            content += `
                <div class="audio-tagger-alert warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>${game.i18n.localize("AUDIO_TAGGER.TagInUseWarning")}</strong>
                        <p>${game.i18n.format("AUDIO_TAGGER.TagInUseDetails", { playlists, sounds })}</p>
                    </div>
                </div>
            `;
        }

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: {
                title: game.i18n.localize("AUDIO_TAGGER.DeleteConfirmTitle"),
                icon: "fas fa-trash"
            },
            content,
            modal: false,
            classes: ["audio-tagger-dialog"]
        });

        if (confirmed) {
            await TagManager.deleteTag(tag.uuid);
            ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.TagDeleted"));
            this._renderTags();
        }
    }
}
