import { TagManager } from "../core/TagManager.js";
import { TagEditorDialog } from "./TagEditorDialog.js";
import { TagAssignmentManager } from "../features/TagAssignmentManager.js";
import { TagWizard } from "../features/TagWizard.js";
import { AudioPlaybackManager } from "../features/AudioPlaybackManager.js";
import { toElement } from "../core/constants.js";

/**
 * Handles rendering and interaction for the Tag Palette UI.
 * Uses static methods to avoid unnecessary object creation on each render.
 */
export class PaletteRenderer {
    // Static state - persists across renders
    static _currentSortMode = null; // Will be loaded from settings
    static _elements = null;
    static _containerSizes = new Map(); // For anti-shift mechanism
    static _activePlaybackMode = null; // Set by keybindings: "first", "last", "random"
    static _isSaving = false; // Flag to prevent re-renders during drag-drop save
    static _dragContext = null; // Spatial zone tracking during drag
    static _onDragMouseMove = null; // Mouse move handler reference

    /**
     * Render the palette into the Playlist Directory.
     * Called from renderPlaylistDirectory hook.
     * @param {HTMLElement} html - The playlist directory element
     */
    static render(html) {
        // Only GMs can see the palette
        if (!game.user.isGM) return;

        // Skip re-render if currently saving drag-drop changes
        if (this._isSaving) return;

        const element = toElement(html);

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

        // Load sort mode from settings if not already loaded
        if (!this._currentSortMode) {
            this._currentSortMode = TagManager.getSortMode();
        }

        this._renderTags();
        this._attachListeners();
        this._initSortable();
        this._updateSortIcon(); // Sync icon with current mode

        TagWizard.init(element);
    }

    /**
     * Update the sort button icon to reflect current mode.
     * @private
     */
    static _updateSortIcon() {
        const icons = {
            "order": "fa-grip-vertical",
            "name-asc": "fa-sort-alpha-down",
            "name-desc": "fa-sort-alpha-up",
            "color-brightness-dark": "fa-moon",
            "color-brightness": "fa-sun"
        };
        const { sortBtn } = this._elements;
        if (sortBtn) {
            sortBtn.querySelector("i").className = `fas ${icons[this._currentSortMode] || "fa-sort-alpha-down"}`;
        }
    }

    /**
     * Initialize SortableJS for drag-and-drop tag reordering.
     * @private
     */
    static _initSortable() {
        // Only GMs can reorder tags
        if (!game.user.isGM) return;

        const list = this._elements.list;
        if (!list || typeof Sortable === "undefined") return;

        // Destroy existing instances
        if (list._sortable) {
            list._sortable.destroy();
        }

        // Initialize main list sortable
        this._createSortable(list, true);

        // Initialize sortables for all folder children containers
        list.querySelectorAll(".at-folder-children").forEach(container => {
            this._createSortable(container, false);
        });
    }

    /**
     * Create a Sortable instance for a container.
     * @param {HTMLElement} container - The container element
     * @param {boolean} isRoot - Whether this is the root list
     * @private
     */
    static _createSortable(container, isRoot) {
        const config = {
            animation: 150,
            fallbackOnBody: true,
            group: "at-tags", // Allow dragging between groups
            ghostClass: "sortable-ghost",
            chosenClass: "audio-tagger-chosen",
            dragClass: "sortable-drag",
            invertswapThreshold: 1,
            invertSwap: true,

            onStart: (evt) => {
                const list = this._elements.list;
                list.classList.add("is-dragging");
                document.body.classList.add("dragging");

                // Anti-shift mechanism: freeze container sizes
                this._toggleContainerSizes(true);

                // Spatial zone tracking: remember the parent folder if dragging from one
                this._dragContext = {
                    item: evt.item,
                    fromFolder: evt.from.closest(".at-folder"),
                    originalParent: evt.from,
                    lastMousePos: { x: 0, y: 0 }
                };

                // Set up mouse tracking for spatial zone detection
                this._onDragMouseMove = (e) => this._trackDragPosition(e);
                document.addEventListener("mousemove", this._onDragMouseMove);
            },

            onEnd: async (evt) => {
                const list = this._elements.list;
                list.classList.remove("is-dragging");
                document.body.classList.remove("dragging");

                // Clean up mouse tracking
                if (this._onDragMouseMove) {
                    document.removeEventListener("mousemove", this._onDragMouseMove);
                    this._onDragMouseMove = null;
                }

                // Apply spatial zone positioning if applicable
                const spatialResult = this._applySpatialZonePosition(evt);

                // Keep element in place visually during save
                // Set flag to prevent re-renders from disrupting position
                this._isSaving = true;

                try {
                    // Update hierarchy based on new DOM structure
                    await this._saveHierarchyFromDOM();

                    // Reorder tags at root level
                    const uuids = Array.from(list.querySelectorAll(":scope > .audio-tagger-item"))
                        .map(el => el.dataset.uuid);
                    await TagManager.reorderTags(uuids);
                } finally {
                    this._isSaving = false;
                    // Reset frozen sizes only after save completes
                    this._toggleContainerSizes(false);
                    // Clear drag context
                    this._dragContext = null;
                }
            }
        };

        if (isRoot) {
            // Root list: robust folder protection logic
            config.onMove = (evt) => {
                const related = evt.related;
                // If moving over a folder
                if (related && related.classList.contains("at-folder")) {
                    const header = related.querySelector(".at-item-content");
                    if (header) {
                        const headerRect = header.getBoundingClientRect();
                        const mouseY = evt.originalEvent?.clientY || 0;

                        // If mouse is below the header, we are targeting the children area.
                        // Prevent the folder swap to allow nested sortable to handle insertion.
                        if (mouseY > headerRect.bottom) {
                            return false;
                        }
                    }
                }
                return true;
            };
        } else {
            // Folder children: easier empty insertion
            config.emptyInsertThreshold = 8;
        }

        container._sortable = Sortable.create(container, config);
    }

    /**
     * Toggle container sizes to freeze/unfreeze during drag.
     * @param {boolean} freeze - Whether to freeze (true) or unfreeze (false)
     * @private
     */
    static _toggleContainerSizes(freeze) {
        const containers = [this._elements.list, ...this._elements.list.querySelectorAll(".at-folder-children")];

        if (freeze) {
            this._containerSizes.clear();
            containers.forEach(container => {
                const rect = container.getBoundingClientRect();
                this._containerSizes.set(container, {
                    minWidth: container.style.minWidth,
                    minHeight: container.style.minHeight
                });
                container.style.minWidth = `${rect.width}px`;
                container.style.minHeight = `${rect.height}px`;
            });
        } else {
            this._containerSizes.forEach((original, container) => {
                container.style.minWidth = original.minWidth || "";
                container.style.minHeight = original.minHeight || "";
            });
            this._containerSizes.clear();
        }
    }

    /**
     * Track mouse position during drag for spatial zone detection.
     * @param {MouseEvent} e - Mouse event
     * @private
     */
    static _trackDragPosition(e) {
        if (!this._dragContext) return;
        this._dragContext.lastMousePos = { x: e.clientX, y: e.clientY };
    }

    /**
     * Apply spatial zone positioning when element is dropped outside its parent folder.
     * Determines which zone (left/right/top/bottom) the element was dropped in
     * relative to the parent folder and repositions accordingly.
     * @param {Object} evt - SortableJS end event
     * @returns {Object|null} - Repositioning result or null if not applicable
     * @private
     */
    static _applySpatialZonePosition(evt) {
        const ctx = this._dragContext;
        if (!ctx || !ctx.fromFolder) return null;

        const draggedItem = evt.item;
        const parentFolder = ctx.fromFolder;
        const mousePos = ctx.lastMousePos;

        // Check if the item was dropped to the root level (outside folder)
        const currentParent = draggedItem.parentElement;
        const isNowInRoot = currentParent === this._elements.list;

        // Only apply spatial positioning if element moved from folder to root
        if (!isNowInRoot) return null;

        const folderRect = parentFolder.getBoundingClientRect();

        // Determine spatial zone based on mouse position relative to folder
        const zone = this._determineSpatialZone(mousePos, folderRect);

        if (!zone) return null;

        // Get root list for repositioning
        const list = this._elements.list;

        // Find position of parent folder in root list
        const rootItems = Array.from(list.querySelectorAll(":scope > .audio-tagger-item"));
        const folderIndex = rootItems.indexOf(parentFolder);

        if (folderIndex === -1) return null;

        let targetPosition;

        switch (zone) {
            case "left":
            case "top":
                // Insert before parent folder
                targetPosition = folderIndex;
                break;
            case "right":
            case "bottom":
                // Insert after parent folder
                targetPosition = folderIndex + 1;
                break;
        }

        // For top/bottom zones, refine position based on horizontal alignment
        if (zone === "top" || zone === "bottom") {
            targetPosition = this._findBestHorizontalPosition(
                mousePos.x,
                rootItems,
                zone === "top" ? folderIndex : folderIndex + 1,
                zone === "top" ? "before" : "after",
                parentFolder
            );
        }

        // Move the element to the calculated position
        const currentIndex = rootItems.indexOf(draggedItem);

        // Adjust target if dragged item is before target (it will shift)
        if (currentIndex !== -1 && currentIndex < targetPosition) {
            targetPosition--;
        }

        // Perform the DOM move
        if (targetPosition >= rootItems.length) {
            list.appendChild(draggedItem);
        } else {
            const targetElement = rootItems[targetPosition];
            if (targetElement && targetElement !== draggedItem) {
                list.insertBefore(draggedItem, targetElement);
            }
        }

        return { zone, targetPosition };
    }

    /**
     * Determine which spatial zone the mouse is in relative to a folder.
     * @param {Object} mousePos - { x, y } mouse position
     * @param {DOMRect} folderRect - Folder bounding rect
     * @returns {string|null} - "left", "right", "top", "bottom", or null
     * @private
     */
    static _determineSpatialZone(mousePos, folderRect) {
        const { x, y } = mousePos;
        const margin = 20; // Zone detection margin in pixels

        // Check if mouse is inside the folder (no spatial zone applies)
        if (x >= folderRect.left && x <= folderRect.right &&
            y >= folderRect.top && y <= folderRect.bottom) {
            return null;
        }

        // Calculate distances to each edge
        const distLeft = folderRect.left - x;
        const distRight = x - folderRect.right;
        const distTop = folderRect.top - y;
        const distBottom = y - folderRect.bottom;

        // Determine dominant direction
        const maxHorizontal = Math.max(distLeft, distRight);
        const maxVertical = Math.max(distTop, distBottom);

        if (maxHorizontal > maxVertical) {
            // Horizontal dominates
            return distLeft > distRight ? "left" : "right";
        } else {
            // Vertical dominates
            return distTop > distBottom ? "top" : "bottom";
        }
    }

    /**
     * Find the best horizontal position for top/bottom zone drops.
     * Looks at elements in the row and finds the closest gap.
     * @param {number} mouseX - Mouse X position
     * @param {Array} rootItems - Array of root level items
     * @param {number} baseIndex - Starting index based on before/after parent
     * @param {string} direction - "before" or "after" parent folder
     * @param {HTMLElement} parentFolder - The parent folder being exited
     * @returns {number} - Target index for insertion
     * @private
     */
    static _findBestHorizontalPosition(mouseX, rootItems, baseIndex, direction, parentFolder) {
        // Get the row of items at the base index position
        // Find items that are in approximately the same vertical position
        const targetItems = [];
        let rowTop = null;

        for (let i = 0; i < rootItems.length; i++) {
            if (rootItems[i] === parentFolder) continue; // Skip the parent folder

            const rect = rootItems[i].getBoundingClientRect();

            if (rowTop === null) {
                // First item sets the row baseline
                rowTop = rect.top;
                targetItems.push({ item: rootItems[i], rect, index: i });
            } else if (Math.abs(rect.top - rowTop) < 20) {
                // Same row (within 20px tolerance)
                targetItems.push({ item: rootItems[i], rect, index: i });
            } else if (rect.top > rowTop + 20) {
                // Next row - stop if we're looking for "before" items
                if (direction === "before") break;
                // Reset for new row
                rowTop = rect.top;
                targetItems.length = 0;
                targetItems.push({ item: rootItems[i], rect, index: i });
            }
        }

        if (targetItems.length === 0) return baseIndex;

        // Find the gap closest to mouseX
        let bestIndex = baseIndex;
        let minDistance = Infinity;

        for (let i = 0; i <= targetItems.length; i++) {
            let gapX;
            if (i === 0) {
                // Before first item
                gapX = targetItems[0].rect.left;
            } else if (i === targetItems.length) {
                // After last item
                gapX = targetItems[targetItems.length - 1].rect.right;
            } else {
                // Between items
                gapX = (targetItems[i - 1].rect.right + targetItems[i].rect.left) / 2;
            }

            const distance = Math.abs(mouseX - gapX);
            if (distance < minDistance) {
                minDistance = distance;
                if (i === 0) {
                    bestIndex = targetItems[0].index;
                } else {
                    bestIndex = targetItems[i - 1].index + 1;
                }
            }
        }

        // Ensure we respect the direction constraint
        const folderIndex = rootItems.indexOf(parentFolder);
        if (direction === "before" && bestIndex > folderIndex) {
            bestIndex = folderIndex;
        } else if (direction === "after" && bestIndex <= folderIndex) {
            bestIndex = folderIndex + 1;
        }

        return bestIndex;
    }

    /**
     * Save the current DOM hierarchy to settings.
     * @private
     */
    static async _saveHierarchyFromDOM() {
        const hierarchy = {};
        const list = this._elements.list;

        // Find all folder containers and their children
        list.querySelectorAll(".at-folder-children").forEach(container => {
            const parentItem = container.closest(".audio-tagger-item.at-folder");
            if (!parentItem) return;

            const parentUuid = parentItem.dataset.uuid;
            container.querySelectorAll(":scope > .audio-tagger-item").forEach(child => {
                hierarchy[child.dataset.uuid] = parentUuid;
            });
        });

        await TagManager.setTagHierarchy(hierarchy);
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
                    ${game.user.isGM ? `
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
                    ` : ''}
                    <footer class="audio-tagger-counter">
                        ${game.i18n.localize("AUDIO_TAGGER.TagCount")}: <span id="at-count">${tags.length}</span>
                    </footer>
                </section>
            </div>
        `;
    }

    /**
     * Render tags into the list based on the current sort mode.
     * Supports hierarchical folder structure.
     * @private
     */
    static _renderTags() {
        const { list, counter } = this._elements;
        if (!list) return;

        const allTags = TagManager.getSortedTags(this._currentSortMode);
        const hierarchy = TagManager.getTagHierarchy();
        const tagsMap = new Map(allTags.map(t => [t.uuid, t]));

        // Find root-level tags (not inside any folder)
        const rootTags = allTags.filter(tag => !hierarchy[tag.uuid]);

        list.innerHTML = "";
        const fragment = document.createDocumentFragment();
        const isGM = game.user.isGM;

        for (const tag of rootTags) {
            const tagEl = this._createTagElement(tag, hierarchy, tagsMap, isGM);
            fragment.appendChild(tagEl);
        }

        list.appendChild(fragment);
        if (counter) counter.textContent = allTags.length;
    }

    /**
     * Create a tag element, including nested children if it's a folder.
     * @param {Object} tag - The tag data
     * @param {Object} hierarchy - The hierarchy map
     * @param {Map} tagsMap - Map of uuid to tag
     * @param {boolean} isGM - Whether user is GM
     * @returns {HTMLElement}
     * @private
     */
    static _createTagElement(tag, hierarchy, tagsMap, isGM) {
        const tagEl = document.createElement("div");
        tagEl.className = "audio-tagger-item";
        tagEl.dataset.uuid = tag.uuid;
        tagEl.dataset.tagName = tag.name;

        if (tag.isFolder) {
            tagEl.classList.add("at-folder");
        }

        tagEl.style.backgroundColor = tag.backgroundColor;
        tagEl.style.color = tag.textColor;

        // Build content wrapper
        const contentEl = document.createElement("div");
        contentEl.className = "at-item-content";
        contentEl.innerHTML = `
            ${tag.isFolder ? `<span class="at-folder-icon"><i class="fas fa-folder"></i></span>` : ""}
            ${tag.icon ? `<span class="at-tag-icon">${tag.icon}</span>` : ""}
            <span class="at-tag-name">${foundry.utils.escapeHTML(tag.name)}</span>
            ${isGM ? `
            <div class="audio-tagger-btn edit-btn" data-action="editTag" title="${game.i18n.localize("AUDIO_TAGGER.EditTag")}">
                <i class="fas fa-pencil"></i>
            </div>
            <div class="audio-tagger-btn delete-btn" data-action="deleteTag" title="${game.i18n.localize("AUDIO_TAGGER.DeleteTag")}">
                <i class="fas fa-times"></i>
            </div>
            ` : ""}
        `;
        tagEl.appendChild(contentEl);

        // If it's a folder, create children container and populate
        if (tag.isFolder) {
            const childrenContainer = document.createElement("div");
            childrenContainer.className = "at-folder-children";

            // Find children of this folder
            const children = Object.entries(hierarchy)
                .filter(([_, parentUuid]) => parentUuid === tag.uuid)
                .map(([childUuid, _]) => tagsMap.get(childUuid))
                .filter(Boolean);

            for (const childTag of children) {
                const childEl = this._createTagElement(childTag, hierarchy, tagsMap, isGM);
                childrenContainer.appendChild(childEl);
            }

            tagEl.appendChild(childrenContainer);
        }

        return tagEl;
    }

    /**
     * Cycle through sort modes and re-render tags.
     * @private
     */
    static async _cycleSortMode() {
        const modes = ["order", "name-asc", "name-desc", "color-brightness-dark", "color-brightness"];
        const currentIndex = modes.indexOf(this._currentSortMode);
        this._currentSortMode = modes[(currentIndex + 1) % modes.length];

        // Save sort mode to settings
        await TagManager.setSortMode(this._currentSortMode);

        this._updateSortIcon();
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

        // GM-only buttons
        if (game.user.isGM) {
            wizardBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                TagWizard.toggle();
            });

            addBtn?.addEventListener("click", async (e) => {
                e.stopPropagation();
                const newTag = await TagEditorDialog.open();
                if (newTag) this._renderTags();
            });

            refreshBtn?.addEventListener("click", async (e) => {
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

            sortBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                this._cycleSortMode();
            });
        }

        list.addEventListener("click", async (e) => {
            const item = e.target.closest(".audio-tagger-item");
            if (!item) return;

            const tag = TagManager.getTag(item.dataset.uuid);
            if (!tag) return;

            // GM-only: edit and delete buttons
            if (game.user.isGM) {
                const editBtn = e.target.closest(".edit-btn");
                const deleteBtn = e.target.closest(".delete-btn");

                if (editBtn) {
                    e.stopPropagation();
                    const updated = await TagEditorDialog.open(tag);
                    if (updated) this._renderTags();
                    return;
                } else if (deleteBtn) {
                    e.stopPropagation();
                    await this._handleDelete(tag);
                    return;
                }
            }

            // Click on tag itself
            e.stopPropagation();

            // Check if a playback hotkey is active
            if (this._activePlaybackMode) {
                // Trigger audio playback with the active mode
                AudioPlaybackManager.playByMode(tag.uuid, this._activePlaybackMode);
                return;
            }

            // Default behavior: add to search (available for all users)
            this._searchByTag(tag.name);
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
