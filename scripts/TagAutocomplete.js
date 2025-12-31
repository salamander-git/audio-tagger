import { TagManager } from "./TagManager.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";
import { DirectoryTagRenderer } from "./DirectoryTagRenderer.js";

/**
 * TagAutocomplete - A tag selector component for the Tag Wizard.
 * Attaches to a button element and manages a dropdown with search and multi-select.
 */
export class TagAutocomplete {
    /**
     * @param {Document} document - The Playlist or PlaylistSound document.
     * @param {HTMLElement} buttonElement - The button that triggers the dropdown.
     */
    constructor(document, buttonElement) {
        this.document = document;
        this.button = buttonElement;
        this.selectedUuids = new Set(TagAssignmentManager.getAssignedTags(this.document).map(a => a.uuid));
        this.isOpen = false;
        this.searchQuery = "";

        this._createDropdown();
        this._attachListeners();
    }

    /**
     * Creates the dropdown element and appends it to body.
     * @private
     */
    _createDropdown() {
        const dropdown = document.createElement("div");
        dropdown.className = "at-ac-dropdown";
        dropdown.style.display = "none";
        dropdown.dataset.documentUuid = this.document.uuid;

        // Search input
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "at-ac-search";
        searchInput.placeholder = game.i18n.localize("AUDIO_TAGGER.SearchTags");
        dropdown.appendChild(searchInput);

        // Options container
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "at-ac-options";
        dropdown.appendChild(optionsContainer);

        document.body.appendChild(dropdown);

        this.dropdown = dropdown;
        this.searchInput = searchInput;
        this.optionsContainer = optionsContainer;
    }

    /**
     * Renders the dropdown options based on current search query.
     * @private
     */
    _renderOptions() {
        this.optionsContainer.innerHTML = "";
        const tags = TagManager.getSortedTags();
        const query = this.searchQuery.toLowerCase().trim();

        // Filter tags by search query
        const filteredTags = query
            ? tags.filter(tag => tag.name.toLowerCase().includes(query))
            : tags;

        if (filteredTags.length === 0) {
            const noResults = document.createElement("div");
            noResults.className = "at-ac-no-results";
            noResults.textContent = game.i18n.localize("AUDIO_TAGGER.NoTags");
            this.optionsContainer.appendChild(noResults);
            return;
        }

        const fragment = document.createDocumentFragment();

        for (const tag of filteredTags) {
            const option = document.createElement("div");
            option.className = "at-ac-option";
            option.dataset.uuid = tag.uuid;

            const isSelected = this.selectedUuids.has(tag.uuid);
            if (isSelected) option.classList.add("selected");

            const check = document.createElement("i");
            check.className = isSelected ? "fas fa-check-circle at-ac-check" : "far fa-circle at-ac-check";
            check.style.color = tag.backgroundColor;

            const colorBox = document.createElement("span");
            colorBox.className = "at-ac-color";
            colorBox.style.backgroundColor = tag.backgroundColor;

            const label = document.createElement("span");
            label.className = "at-ac-label";
            label.textContent = tag.name;

            option.append(check, colorBox, label);
            fragment.appendChild(option);
        }

        this.optionsContainer.appendChild(fragment);
    }

    /**
     * Attaches event listeners.
     * @private
     */
    _attachListeners() {
        // Toggle dropdown on button click
        this.button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleDropdown();
        });

        // Handle option selection - do NOT close dropdown
        this.optionsContainer.addEventListener("click", (e) => {
            const option = e.target.closest(".at-ac-option");
            if (option && !option.classList.contains("disabled")) {
                e.stopPropagation();
                this._toggleTag(option.dataset.uuid);
            }
        });

        // Search input handling with debounce
        let searchTimeout;
        this.searchInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value;
                this._renderOptions();
            }, 150);
        });

        // Prevent dropdown close when clicking inside dropdown
        this.dropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        // Close dropdown when clicking outside
        this._outsideClickHandler = (e) => {
            if (!this.dropdown.contains(e.target) && !this.button.contains(e.target)) {
                this._closeDropdown();
            }
        };
        document.addEventListener("click", this._outsideClickHandler);
    }

    /**
     * Toggles the dropdown visibility.
     * @private
     */
    _toggleDropdown() {
        this.isOpen ? this._closeDropdown() : this._openDropdown();
    }

    /**
     * Opens the dropdown.
     * @private
     */
    _openDropdown() {
        this._renderOptions();

        // Position dropdown using fixed positioning
        const rect = this.button.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const dropdownHeight = Math.min(350, 200); // Estimate initial height

        // Position below button, but flip to above if not enough space
        let top = rect.bottom + 4;
        if (top + dropdownHeight > viewportHeight - 10) {
            top = Math.max(10, rect.top - dropdownHeight - 4);
        }

        this.dropdown.style.top = `${top}px`;
        this.dropdown.style.left = `${Math.max(10, rect.left - 100)}px`;
        this.dropdown.style.display = "block";
        this.isOpen = true;

        // Focus search input
        this.searchInput.value = "";
        this.searchQuery = "";
        this.searchInput.focus();
    }

    /**
     * Closes the dropdown.
     * @private
     */
    _closeDropdown() {
        this.dropdown.style.display = "none";
        this.isOpen = false;
    }

    /**
     * Toggles the selection state of a tag.
     * @param {string} uuid - The UUID of the tag to toggle.
     * @private
     */
    _toggleTag(uuid) {
        if (this.selectedUuids.has(uuid)) {
            this.selectedUuids.delete(uuid);
        } else {
            this.selectedUuids.add(uuid);
        }
        // Re-render dropdown to update checkmarks
        this._renderOptions();
        // Update visual tags immediately
        this._updateVisualTags(uuid);
    }

    /**
     * Updates the visual representation of tags in the document header.
     * @param {string} tagUuid - The UUID of the changed tag.
     * @private
     */
    _updateVisualTags(tagUuid) {
        // Find or create the tag container
        let container = this.document.uuid ?
            document.querySelector(`.audio-tagger-assigned-tags[data-document-uuid="${this.document.uuid}"]`) : null;

        if (!container && this.selectedUuids.has(tagUuid)) {
            // Container doesn't exist but we adding a tag, so create it
            // We need to find where to insert it. 
            // The button is in the header, so we can use that context.
            const header = this.button.closest("header");
            if (header) {
                container = document.createElement("div");
                container.className = "audio-tagger-assigned-tags";

                // Try to determine target type from class
                const isSound = header.parentElement.classList.contains("sound");
                container.dataset.target = isSound ? "sound" : "playlist";
                container.dataset.documentUuid = this.document.uuid;

                header.insertAdjacentElement("afterend", container);
            }
        }

        if (!container) return;

        // If tag is selected, ensure it's in the DOM
        if (this.selectedUuids.has(tagUuid)) {
            // Check if already there
            if (!container.querySelector(`[data-tag-uuid="${tagUuid}"]`)) {
                const assignment = { uuid: tagUuid, snapshot: null };
                const tagEl = DirectoryTagRenderer._createTagElement(assignment, this.document);
                if (tagEl) {
                    container.appendChild(tagEl);
                }
            }
        } else {
            // If tag is deselected, remove from DOM
            const existing = container.querySelector(`[data-tag-uuid="${tagUuid}"]`);
            if (existing) existing.remove();

            // If container empty, remove it
            if (container.children.length === 0) {
                container.remove();
            }
        }
    }

    /**
     * Saves the current tag selections to the document flags.
     * @returns {Promise<void>}
     */
    async save() {
        const currentUuids = new Set(TagAssignmentManager.getAssignedTags(this.document).map(a => a.uuid));

        const toAdd = [...this.selectedUuids].filter(uuid => !currentUuids.has(uuid));
        const toRemove = [...currentUuids].filter(uuid => !this.selectedUuids.has(uuid));

        for (const uuid of toRemove) {
            await TagAssignmentManager.unassignTag(this.document, uuid);
        }
        for (const uuid of toAdd) {
            await TagAssignmentManager.assignTag(this.document, uuid);
        }

        if (toAdd.length > 0 || toRemove.length > 0) {
            console.log(`Audio Tagger | Saved tags for '${this.document.name}'. Added: ${toAdd.length}, Removed: ${toRemove.length}`);
        }
    }

    /**
     * Destroys the component and removes its elements from the DOM.
     */
    destroy() {
        this._closeDropdown();
        document.removeEventListener("click", this._outsideClickHandler);
        this.dropdown?.remove();
        this.button?.remove();
    }
}