import { TagManager } from "./TagManager.js";
import { TagEditorDialog } from "./TagEditorDialog.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";
import { TagWizard } from "./TagWizard.js";

/**
 * Handles rendering and interaction for the Tag Palette UI.
 * Uses static methods to avoid unnecessary object creation on each render.
 */
export class PaletteRenderer {
    // Static state - persists across renders
    static _currentSortMode = "name-asc";
    static _elements = null;

    /**
     * Render the palette into the Playlist Directory.
     * Called from renderPlaylistDirectory hook.
     * @param {HTMLElement} html - The playlist directory element
     */
    static render(html) {
        const element = html instanceof jQuery ? html[0] : html;

        // Remove existing palette to prevent duplication
        const existing = element.querySelector("#audio-tagger-palette");
        if (existing) existing.remove();

        const globalVolume = element.querySelector(".global-volume");
        if (!globalVolume) {
            console.warn("Audio Tagger | Could not find insertion point in Playlist Directory");
            return;
        }

        const paletteHTML = this._buildPaletteHTML();
        globalVolume.insertAdjacentHTML("afterend", paletteHTML);

        // Cache elements
        this._elements = {
            html: element,
            palette: element.querySelector("#audio-tagger-palette"),
            list: element.querySelector("#at-list"),
            counter: element.querySelector("#at-count"),
            spoiler: element.querySelector("#at-spoiler"),
            header: element.querySelector("#at-header"),
            toggleIcon: element.querySelector("#at-toggle-icon"),
            addBtn: element.querySelector("#at-add-btn"),
            wizardBtn: element.querySelector("#at-wizard-btn"),
            sortBtn: element.querySelector("#at-sort-btn"),
            refreshBtn: element.querySelector("#at-rest-btn")
        };

        this._renderTags();
        this._attachListeners();
        this._initSortable();

        TagWizard.init(element);
    }

    /**
     * Initialize SortableJS for drag-and-drop tag reordering.
     * @private
     */
    static _initSortable() {
        const list = this._elements.list;
        if (!list || typeof Sortable === "undefined") return;

        // Destroy existing instance if any
        if (list._sortable) {
            list._sortable.destroy();
        }

        list._sortable = Sortable.create(list, {
            animation: 150,
            ghostClass: "audio-tagger-ghost",
            chosenClass: "audio-tagger-chosen",
            dragClass: "audio-tagger-drag",
            
            onStart: () => {
                list.classList.add("is-dragging");
            },
            
            onEnd: async (evt) => {
                list.classList.remove("is-dragging");
                
                // Get new order from DOM
                const uuids = Array.from(list.querySelectorAll(".audio-tagger-item"))
                    .map(el => el.dataset.uuid);
                await TagManager.reorderTags(uuids);
            }
        });
    }

    /**
     * Build the palette HTML structure.
     * @returns {string}
     * @private
     */
    static _buildPaletteHTML() {
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
     * Render tags into the list based on the current sort mode.
     * @private
     */
    static _renderTags() {
        const { list, counter } = this._elements;
        if (!list) return;

        const tags = TagManager.getSortedTags(this._currentSortMode);
        list.innerHTML = "";

        const fragment = document.createDocumentFragment();
        for (const tag of tags) {
            const tagEl = document.createElement("div");
            tagEl.className = "audio-tagger-item";
            tagEl.dataset.uuid = tag.uuid;
            tagEl.dataset.tagName = tag.name;
            tagEl.style.backgroundColor = tag.backgroundColor;
            tagEl.style.color = tag.textColor;
            tagEl.innerHTML = `
                ${tag.icon ? `<span class="at-tag-icon">${tag.icon}</span>` : ""}
                <span class="at-tag-name">${foundry.utils.escapeHTML(tag.name)}</span>
                <div class="audio-tagger-btn edit-btn" data-action="editTag" title="${game.i18n.localize("AUDIO_TAGGER.EditTag")}">
                    <i class="fas fa-pencil"></i>
                </div>
                <div class="audio-tagger-btn delete-btn" data-action="deleteTag" title="${game.i18n.localize("AUDIO_TAGGER.DeleteTag")}">
                    <i class="fas fa-times"></i>
                </div>
            `;
            fragment.appendChild(tagEl);
        }

        list.appendChild(fragment);
        if (counter) counter.textContent = tags.length;
    }

    /**
     * Cycle through sort modes and re-render tags.
     * @private
     */
    static _cycleSortMode() {
        const modes = ["order", "name-asc", "name-desc", "color-brightness-dark", "color-brightness"];
        const currentIndex = modes.indexOf(this._currentSortMode);
        this._currentSortMode = modes[(currentIndex + 1) % modes.length];

        const icons = {
            "order": "fa-grip-vertical",
            "name-asc": "fa-sort-alpha-down",
            "name-desc": "fa-sort-alpha-up",
            "color-brightness-dark": "fa-moon",
            "color-brightness": "fa-sun"
        };

        const { sortBtn } = this._elements;
        if (sortBtn) {
            sortBtn.querySelector("i").className = `fas ${icons[this._currentSortMode]}`;
        }

        this._renderTags();

        const modeNames = {
            "order": "AUDIO_TAGGER.SortByOrder",
            "name-asc": "AUDIO_TAGGER.SortByNameAsc",
            "name-desc": "AUDIO_TAGGER.SortByNameDesc",
            "color-brightness-dark": "AUDIO_TAGGER.SortByBrightnessDark",
            "color-brightness": "AUDIO_TAGGER.SortByBrightnessLight"
        };
        if (TagManager.areNotificationsEnabled()) {
            ui.notifications.info(game.i18n.localize(modeNames[this._currentSortMode]));
        }
    }

    /**
     * Attach event listeners to the palette UI.
     * @private
     */
    static _attachListeners() {
        const { html, header, spoiler, toggleIcon, wizardBtn, addBtn, refreshBtn, sortBtn, list } = this._elements;

        header.addEventListener("click", () => {
            const isCollapsed = spoiler.classList.toggle("collapsed");
            toggleIcon.classList.toggle("collapsed");
            TagManager.setCollapsed(isCollapsed);
        });

        wizardBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            TagWizard.toggle();
        });

        addBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const newTag = await TagEditorDialog.open();
            if (newTag) this._renderTags();
        });

        refreshBtn.addEventListener("click", async (e) => {
             e.stopPropagation();
             refreshBtn.querySelector("i").classList.add("fa-spin");
             
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
                refreshBtn.querySelector("i").classList.remove("fa-spin");
             }
        });

        sortBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._cycleSortMode();
        });

        list.addEventListener("click", async (e) => {
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
     * Add tag name to search input and trigger search.
     * @param {string} tagName - Tag name to search for
     * @private
     */
    static _searchByTag(tagName) {
        const searchInput = this._elements.html.querySelector("input[name='search']");
        if (!searchInput) return;

        const currentValue = searchInput.value.trim();
        const newValue = currentValue ? `${currentValue} ${tagName}` : tagName;
        
        searchInput.value = newValue;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        
        // Also trigger Foundry's search filter
        searchInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }

    /**
     * Handle the tag deletion confirmation and process.
     * @param {object} tag - The tag to delete
     * @private
     */
    static async _handleDelete(tag) {
         // IMPORTANT: Check notifications setting immediately to determine if we skip dialog
        const notificationsEnabled = TagManager.areNotificationsEnabled();
        
        // If notifications are disabled, delete immediately regardless of usage
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
            if (TagManager.areNotificationsEnabled()) {
                ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.TagDeleted"));
            }
            this._renderTags();
        }
    }
}
