import { TagManager } from "../core/TagManager.js";
import { TagAssignmentManager } from "../features/TagAssignmentManager.js";
import { MODULE_ID, SETTING_CLEAR_WIZARD_SEARCH } from "../core/constants.js";


/**
 * TagAutocomplete - A tag selector component for the Tag Wizard.
 * Attaches to a button element and manages a dropdown with search and multi-select.
 */
export class TagAutocomplete {
    /**
     * @param {Document} document - The Playlist or PlaylistSound document.
     * @param {HTMLElement} buttonElement - The button that triggers the dropdown.
     */
    static _outsideRegistries = new WeakMap();

    constructor(document, buttonElement, draft = null, onChange = null, isLocked = () => false) {
        this.document = document;
        this.button = buttonElement;
        this.ownerDocument = buttonElement.ownerDocument;
        this.draft = draft || { selectedUuids: new Set(TagAssignmentManager.getAssignedTags(document).map(a => a.uuid)) };
        this.selectedUuids = this.draft.selectedUuids;
        this.onChange = onChange;
        this.isLocked = isLocked;
        this._searchTimeout = null;
        this._controller = new this.ownerDocument.defaultView.AbortController();
        this.isOpen = false;
        this.searchQuery = "";

        this.button.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.isLocked()) this._toggleDropdown();
        }, { signal: this._controller.signal });
    }

    /**
     * Creates the dropdown element and appends it to body.
     * @private
     */
    _createDropdown() {
        const dropdown = this.ownerDocument.createElement("div");
        dropdown.className = "at-ac-dropdown";
        dropdown.style.display = "none";
        dropdown.dataset.documentUuid = this.document.uuid;

        // Search input
        const searchInput = this.ownerDocument.createElement("input");
        searchInput.type = "text";
        searchInput.className = "at-ac-search";
        searchInput.placeholder = game.i18n.localize("AUDIO_TAGGER.SearchTags");
        dropdown.appendChild(searchInput);

        // Options container
        const optionsContainer = this.ownerDocument.createElement("div");
        optionsContainer.className = "at-ac-options";
        dropdown.appendChild(optionsContainer);

        this.ownerDocument.body.appendChild(dropdown);

        this.dropdown = dropdown;
        this.searchInput = searchInput;
        this.optionsContainer = optionsContainer;
        this._attachListeners();
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
            const noResults = this.ownerDocument.createElement("div");
            noResults.className = "at-ac-no-results";
            noResults.textContent = game.i18n.localize("AUDIO_TAGGER.NoTags");
            this.optionsContainer.appendChild(noResults);
            return;
        }

        const fragment = this.ownerDocument.createDocumentFragment();

        for (const tag of filteredTags) {
            const option = this.ownerDocument.createElement("div");
            option.className = "at-ac-option";
            option.dataset.uuid = tag.uuid;

            const isSelected = this.selectedUuids.has(tag.uuid);
            if (isSelected) option.classList.add("selected");

            const check = this.ownerDocument.createElement("i");
            check.className = isSelected ? "fas fa-check-circle at-ac-check" : "far fa-circle at-ac-check";
            check.style.color = tag.backgroundColor;

            const colorBox = this.ownerDocument.createElement("span");
            colorBox.className = "at-ac-color";
            colorBox.style.backgroundColor = tag.backgroundColor;

            const label = this.ownerDocument.createElement("span");
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
        // Handle option selection - do NOT close dropdown
        this.optionsContainer.addEventListener("click", (e) => {
            const option = e.target.closest(".at-ac-option");
            if (option && !option.classList.contains("disabled")) {
                e.stopPropagation();
                this._toggleTag(option.dataset.uuid, { fromOption: true });
            }
        });

        // Search input handling with debounce
        this.searchInput.addEventListener("input", (e) => {
            clearTimeout(this._searchTimeout);
            this.searchQuery = e.target.value;
            this._searchTimeout = setTimeout(() => {
                this._renderOptions();
            }, 150);
        });

        // Prevent dropdown close when clicking inside dropdown
        this.dropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });

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
    _openDropdown({ restore = false, focus = true } = {}) {
        if (!this.dropdown) this._createDropdown();
        clearTimeout(this._searchTimeout);
        if (!restore) this.searchQuery = "";
        this.searchInput.value = this.searchQuery;
        this._renderOptions();

        // Position dropdown using fixed positioning
        const rect = this.button.getBoundingClientRect();
        const viewportHeight = this.ownerDocument.defaultView.innerHeight;
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

        this._registerOutsideClick();
        if (focus) this.searchInput.focus();
    }

    /**
     * Closes the dropdown.
     * @private
     */
    _closeDropdown() {
        clearTimeout(this._searchTimeout);
        if (this.dropdown) this.dropdown.style.display = "none";
        this.isOpen = false;
        const registry = TagAutocomplete._outsideRegistries.get(this.ownerDocument);
        if (registry) {
            registry.instances.delete(this);
            if (!registry.instances.size) {
                this.ownerDocument.removeEventListener("click", registry.handler);
                TagAutocomplete._outsideRegistries.delete(this.ownerDocument);
            }
        }
    }

    /**
     * Toggles the selection state of a tag.
     * @param {string} uuid - The UUID of the tag to toggle.
     * @private
     */
    _toggleTag(uuid, { fromOption = false } = {}) {
        if (this.isLocked()) return;
        const adding = !this.selectedUuids.has(uuid);
        if (this.selectedUuids.has(uuid)) {
            this.selectedUuids.delete(uuid);
        } else {
            this.selectedUuids.add(uuid);
        }
        const clear = fromOption && adding && game.settings.get(MODULE_ID, SETTING_CLEAR_WIZARD_SEARCH);
        if (clear) {
            clearTimeout(this._searchTimeout);
            this.searchQuery = "";
            this.searchInput.value = "";
        }
        if (this.onChange) this.onChange();
        else {
            if (this.isOpen) this._renderOptions();
            this._renderVisualTags();
        }
        if (clear) this.searchInput.focus();
    }

    /**
     * Updates the visual representation of tags in the document header.
     * @param {string} tagUuid - The UUID of the changed tag.
     * @private
     */
    _renderVisualTags() {
        const header = this.button.parentElement;
        if (!header) return;
        let container = header.parentElement.querySelector(":scope > .audio-tagger-assigned-tags");
        if (!this.selectedUuids.size) { container?.remove(); return; }
        if (!container) {
            container = this.ownerDocument.createElement("div");
            container.className = "audio-tagger-assigned-tags";
            header.insertAdjacentElement("afterend", container);
        }
        container.dataset.documentUuid = this.document.uuid;
        container.dataset.target = header.parentElement.classList.contains("sound") ? "sound" : "playlist";
        const signature = "wizard:" + JSON.stringify([...this.selectedUuids].map(uuid => {
            const tag = TagManager.getTag(uuid);
            return [uuid, tag?.name, tag?.icon, tag?.backgroundColor, tag?.textColor];
        }));
        if (container.dataset.signature === signature) return;
        container.dataset.signature = signature;
        container.replaceChildren();
        for (const uuid of this.selectedUuids) {
            const tag = this._createPendingTagElement(uuid);
            if (tag) container.appendChild(tag);
        }
    }

    _registerOutsideClick() {
        let registry = TagAutocomplete._outsideRegistries.get(this.ownerDocument);
        if (!registry) {
            registry = { instances: new Set() };
            registry.handler = event => {
                for (const ac of [...registry.instances]) {
                    if (!ac.dropdown.contains(event.target) && !ac.button.contains(event.target)) ac._closeDropdown();
                }
            };
            TagAutocomplete._outsideRegistries.set(this.ownerDocument, registry);
            this.ownerDocument.addEventListener("click", registry.handler);
        }
        registry.instances.add(this);
    }

    getViewState() {
        return { isOpen: this.isOpen, searchQuery: this.searchQuery,
            focused: this.ownerDocument.activeElement === this.searchInput,
            scrollTop: this.optionsContainer?.scrollTop || 0 };
    }

    restoreViewState(state) {
        this.searchQuery = state.searchQuery || "";
        if (state.isOpen) {
            this._openDropdown({ restore: true, focus: state.focused });
            this.optionsContainer.scrollTop = state.scrollTop || 0;
        }
    }

    /**
     * Creates a tag element for pending (unsaved) tags with a working Remove button.
     * @param {string} tagUuid - The UUID of the tag.
     * @returns {HTMLElement|null}
     * @private
     */
    _createPendingTagElement(tagUuid) {
        const tag = TagManager.getTag(tagUuid);
        if (!tag) return null;

        const span = this.ownerDocument.createElement("span");
        span.className = "audio-tagger-assigned-tag at-pending-tag";
        span.style.backgroundColor = tag.backgroundColor;
        span.style.color = tag.textColor;
        span.title = tag.name;
        span.dataset.tagUuid = tagUuid;

        // Add icon if present
        if (tag.icon) {
            const iconSpan = this.ownerDocument.createElement("span");
            iconSpan.className = "at-tag-icon";
            iconSpan.textContent = tag.icon;
            span.appendChild(iconSpan);
        }

        const nameSpan = this.ownerDocument.createElement("span");
        nameSpan.textContent = tag.name;
        span.appendChild(nameSpan);

        // Remove button - calls _toggleTag to update selectedUuids
        if (game.user.isGM) {
            const btn = this.ownerDocument.createElement("i");
            btn.className = "fas fa-times remove-tag";
            btn.title = game.i18n.localize("AUDIO_TAGGER.RemoveAssignment");
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Remove from pending selections
                this._toggleTag(tagUuid);
            });
            span.appendChild(btn);
        }

        return span;
    }

    /**
     * Saves the current tag selections to the document flags.
     * @returns {Promise<void>}
     */
    async save() {
        const baseline = this.draft.baseline || new Set(TagAssignmentManager.getAssignedTags(this.document).map(a => a.uuid));
        return TagAssignmentManager.applySelection(this.document, this.selectedUuids, baseline);
    }

    /**
     * Destroys the component and removes its elements from the DOM.
     */
    destroy() {
        this._closeDropdown();
        this._controller.abort();
        this.dropdown?.remove();
        this.button?.remove();
    }
}
