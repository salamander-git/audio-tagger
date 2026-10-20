import { TagManager } from "../core/TagManager.js";
import { TagEditorDialog } from "./TagEditorDialog.js";
import { TagAssignmentManager } from "../features/TagAssignmentManager.js";
import { TagWizard } from "../features/TagWizard.js";
import { AudioPlaybackManager } from "../features/AudioPlaybackManager.js";
import Sortable from "../vendor/sortable.complete.esm.js";
import { toElement } from "../core/constants.js";

/**
 * Handles rendering and interaction for the Tag Palette UI.
 * Each directory application owns its DOM, Sortables and drag lifecycle.
 */
export class PaletteRenderer {
    static instances = new Map();

    static render(html, app = html) {
        let view = this.instances.get(app);
        if (!view) {
            view = new PaletteRenderer();
            this.instances.set(app, view);
        }
        view._render(html);
    }

    static close(app) {
        const view = this.instances.get(app);
        view?.destroy();
        this.instances.delete(app);
    }

    // View state persists across Foundry's partial renders.
    _currentSortMode = null; // Will be loaded from settings
    _elements = null;
    _containerSizes = new Map(); // For anti-shift mechanism
    static _activePlaybackMode = null; // Set by keybindings: "first", "last", "random"
    _isSaving = false; // Flag to prevent re-renders during drag-drop save
    _dragContext = null; // Spatial zone tracking during drag
    _sortables = new Set();
    _pendingRender = null;
    _destroying = false;
    _dragController = null;
    _renderedRevision = -1;

    /**
     * Render the palette into the Playlist Directory.
     * Called from renderPlaylistDirectory hook.
     * @param {HTMLElement} html - The playlist directory element
     */
    _render(html) {
        // Only GMs can see the palette
        if (!game.user.isGM) return;

        const element = toElement(html);
        // Foundry owns the directory DOM. Never cancel its renders. If it
        // replaced the palette, cancel our drag and initialize the new DOM.
        if ((this._isSaving || this._dragContext) && this._elements?.palette?.isConnected
            && element.contains(this._elements.palette)) {
            this._pendingRender = element;
            return;
        }
        if (this._elements?.palette?.isConnected && element.contains(this._elements.palette)
            && this._renderedRevision === TagManager.revision
            && this._currentSortMode === TagManager.getSortMode()) return;
        this._destroySortables();

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

        // Sort mode is shared by this client's directory views.
        this._currentSortMode = TagManager.getSortMode();

        this._renderTags(true);
        this._attachListeners();
        this._updateSortIcon(); // Sync icon with current mode
        this._renderedRevision = TagManager.revision;


    }

    /**
     * Update the sort button icon to reflect current mode.
     * @private
     */
    _updateSortIcon() {
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
    _initSortable() {
        // Only GMs can reorder tags
        if (!game.user.isGM) return;

        const list = this._elements.list;
        if (!list || typeof Sortable === "undefined") return;

        this._destroySortables();

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
    _createSortable(container, isRoot) {
        const config = {
            animation: 150,
            fallbackOnBody: true,
            forceFallback: true, // Keep tag drags out of Foundry's native document DnD.
            fallbackTolerance: 4,
            group: {
                name: "audio-tagger-tags",
                // A sidebar and its popout have separate, equivalent views.
                // Do not physically move their DOM elements between views.
                put: (to, from, item) => this._elements.list.contains(from.el)
                    && !item.contains(to.el)
            },
            draggable: ".audio-tagger-item",
            filter: ".audio-tagger-btn",
            preventOnFilter: false,
            ghostClass: "audio-tagger-ghost",
            chosenClass: "audio-tagger-chosen",
            dragClass: "audio-tagger-drag",
            fallbackClass: "audio-tagger-fallback",
            invertedSwapThreshold: 1,
            invertSwap: true,
            disabled: this._isSaving,
            // Avoid native Foundry document drag data.
            setData: dataTransfer => dataTransfer.setData("application/x-audio-tagger", "tag"),

            onStart: (evt) => {
                const list = this._elements.list;
                list.classList.add("is-dragging");

                // Anti-shift mechanism: freeze container sizes
                this._toggleContainerSizes(true);

                // Spatial zone tracking: remember the parent folder if dragging from one
                this._dragContext = {
                    item: evt.item,
                    fromFolder: evt.from.closest(".at-folder"),
                    originalParent: evt.from,
                    lastMousePos: null,
                    before: this._readLayout(),
                    revision: TagManager.revision
                };

                const ownerDocument = list.ownerDocument;
                this._dragController = new ownerDocument.defaultView.AbortController();
                for (const type of ["dragover", "pointermove", "mousemove", "touchmove"]) {
                    ownerDocument.addEventListener(type, e => this._trackDragPosition(e),
                        { capture: true, passive: true, signal: this._dragController.signal });
                }
                ownerDocument.addEventListener("keydown", e => {
                    if (e.key !== "Escape") return;
                    e.stopPropagation();
                    this._cancelDrag();
                }, { capture: true, signal: this._dragController.signal });
                ownerDocument.addEventListener("pointercancel", () => this._cancelDrag(),
                    { capture: true, signal: this._dragController.signal });
            },

            onEnd: async (evt) => {
                if (this._destroying || !this._dragContext) return;
                const context = this._dragContext;
                try {
                    if (evt.originalEvent?.type === "touchcancel") {
                        this._renderedRevision = -1;
                        return;
                    }
                    this._trackDragPosition(evt.originalEvent);
                    this._applySpatialZonePosition(evt);
                    const after = this._readLayout();
                    if (JSON.stringify(context.before) === JSON.stringify(after)) return;
                    this._isSaving = true;
                    this._sortables.forEach(sortable => sortable.option("disabled", true));
                    await TagManager.saveLayout(after, context.revision);
                } catch (error) {
                    console.error("Audio Tagger | Could not save tag layout", error);
                    ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
                    this._renderedRevision = -1;
                } finally {
                    this._isSaving = false;
                    this._cleanupDrag();
                    this._sortables.forEach(sortable => sortable.option("disabled", false));
                    const pending = this._pendingRender;
                    this._pendingRender = null;
                    const html = pending || this._elements?.html;
                    // Sortable's onEnd callback isn't awaited by the library.
                    // Let it finish its own drop cleanup before replacing DOM.
                    queueMicrotask(() => {
                        if (this._elements && html?.isConnected) this._render(html);
                    });
                }
            }
        };

        config.onMove = (evt, originalEvent) => {
                this._trackDragPosition(originalEvent);
                if (evt.dragged.contains(evt.to)) return false;
                const related = evt.related;
                // If moving over a folder
                if (related && related.classList.contains("at-folder")) {
                    const header = related.querySelector(".at-item-content");
                    if (header) {
                        const headerRect = header.getBoundingClientRect();
                        const mouseY = this._dragContext?.lastMousePos?.y;

                        // If mouse is below the header, we are targeting the children area.
                        // Prevent the folder swap to allow nested sortable to handle insertion.
                        if (mouseY > headerRect.bottom) {
                            return false;
                        }
                    }
                }
                return true;
        };
        if (!isRoot) {
            // Folder children: easier empty insertion
            config.emptyInsertThreshold = 8;
        }

        this._sortables.add(Sortable.create(container, config));
    }

    _cleanupDrag() {
        this._dragController?.abort();
        this._dragController = null;
        this._elements?.list?.classList.remove("is-dragging");
        this._toggleContainerSizes(false);
        this._dragContext = null;
    }

    _cancelDrag() {
        const html = this._elements?.html;
        this._destroySortables();
        this._renderedRevision = -1;
        if (html?.isConnected) this._render(html);
    }

    _destroySortables() {
        this._destroying = true;
        try {
            this._cleanupDrag();
            for (const sortable of this._sortables) sortable.destroy();
            this._sortables.clear();
        } finally {
            this._destroying = false;
        }
    }

    destroy() {
        this._destroySortables();
        this._elements?.palette?.remove();
        this._elements = null;
        this._pendingRender = null;
    }

    /**
     * Toggle container sizes to freeze/unfreeze during drag.
     * @param {boolean} freeze - Whether to freeze (true) or unfreeze (false)
     * @private
     */
    _toggleContainerSizes(freeze) {
        if (freeze) {
            const containers = [this._elements.list, ...this._elements.list.querySelectorAll(".at-folder-children")];
            const measurements = containers.map(container => ({ container, rect: container.getBoundingClientRect() }));
            this._containerSizes.clear();
            measurements.forEach(({ container, rect }) => {
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
    _trackDragPosition(e) {
        if (!this._dragContext || !e) return;
        const pointer = e.touches?.[0] || e.changedTouches?.[0] || e;
        if (!Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)) return;
        // Some native dragend events report a synthetic (0,0).
        if (e.type === "dragend" && !pointer.clientX && !pointer.clientY) return;
        this._dragContext.lastMousePos = { x: pointer.clientX, y: pointer.clientY };
    }

    /**
     * Apply spatial zone positioning when element is dropped outside its parent folder.
     * Determines which zone (left/right/top/bottom) the element was dropped in
     * relative to the parent folder and repositions accordingly.
     * @param {Object} evt - SortableJS end event
     * @returns {Object|null} - Repositioning result or null if not applicable
     * @private
     */
    _applySpatialZonePosition(evt) {
        const ctx = this._dragContext;
        if (!ctx || !ctx.fromFolder) return null;

        const draggedItem = evt.item;
        const parentFolder = ctx.fromFolder;
        const mousePos = ctx.lastMousePos;
        if (!mousePos) return null;

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
        const rootItems = Array.from(list.querySelectorAll(":scope > .audio-tagger-item"))
            .filter(item => item !== draggedItem);
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
    _determineSpatialZone(mousePos, folderRect) {
        const { x, y } = mousePos;

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
    _findBestHorizontalPosition(mouseX, rootItems, baseIndex, direction, parentFolder) {
        const folderIndex = rootItems.indexOf(parentFolder);
        const neighborIndex = direction === "before" ? folderIndex - 1 : folderIndex + 1;
        const neighbor = rootItems[neighborIndex];
        if (!neighbor || neighbor.classList.contains("at-folder")) return baseIndex;
        const rowTop = neighbor.getBoundingClientRect().top;
        const targetItems = [];
        const step = direction === "before" ? -1 : 1;
        for (let i = neighborIndex; i >= 0 && i < rootItems.length; i += step) {
            const item = rootItems[i];
            const rect = item.getBoundingClientRect();
            if (item.classList.contains("at-folder") || Math.abs(rect.top - rowTop) >= 20) break;
            targetItems.push({ item, rect, index: i });
        }
        targetItems.sort((a, b) => a.index - b.index);

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
    _readLayout() {
        const hierarchy = {};
        const groups = {};
        const list = this._elements.list;
        for (const container of [list, ...list.querySelectorAll(".at-folder-children")]) {
            const parent = container === list ? "" : container.closest(".at-folder").dataset.uuid;
            groups[parent] = Array.from(container.children)
                .filter(child => child.classList.contains("audio-tagger-item"))
                .map(child => child.dataset.uuid);
            if (parent) for (const uuid of groups[parent]) hierarchy[uuid] = parent;
        }
        return { hierarchy, groups };
    }

    /**
     * Build the palette HTML structure.
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
    _renderTags(force = false) {
        if (!this._elements) return;
        if (!force && (this._isSaving || this._dragContext)) {
            this._pendingRender = this._elements.html;
            this._renderedRevision = -1;
            return;
        }
        const { list, counter } = this._elements;
        if (!list) return;

        const allTags = TagManager.getSortedTags(this._currentSortMode);
        const hierarchy = TagManager.getTagHierarchy();
        const tagsMap = new Map(allTags.map(t => [t.uuid, t]));

        // Find root-level tags (not inside any folder)
        const rootTags = allTags.filter(tag => !hierarchy[tag.uuid]);

        this._destroySortables();
        this._childrenByParent = new Map();
        for (const [child, parent] of Object.entries(hierarchy)) {
            if (!this._childrenByParent.has(parent)) this._childrenByParent.set(parent, []);
            const tag = tagsMap.get(child);
            if (tag) this._childrenByParent.get(parent).push(tag);
        }
        for (const children of this._childrenByParent.values()) {
            children.sort((a, b) => Number.isFinite(a.siblingOrder) && Number.isFinite(b.siblingOrder)
                ? a.siblingOrder - b.siblingOrder : 0);
        }
        list.innerHTML = "";
        const fragment = this._elements.html.ownerDocument.createDocumentFragment();
        const isGM = game.user.isGM;

        for (const tag of rootTags) {
            const tagEl = this._createTagElement(tag, hierarchy, tagsMap, isGM);
            fragment.appendChild(tagEl);
        }

        list.appendChild(fragment);
        if (counter) counter.textContent = allTags.length;
        this._initSortable();
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
    _createTagElement(tag, hierarchy, tagsMap, isGM) {
        const tagEl = this._elements.html.ownerDocument.createElement("div");
        tagEl.className = "audio-tagger-item";
        tagEl.dataset.uuid = tag.uuid;
        tagEl.dataset.tagName = tag.name;

        if (tag.isFolder) {
            tagEl.classList.add("at-folder");
        }

        tagEl.style.backgroundColor = tag.backgroundColor;
        tagEl.style.color = tag.textColor;

        // Build content wrapper
        const contentEl = this._elements.html.ownerDocument.createElement("div");
        contentEl.className = "at-item-content";
        contentEl.innerHTML = `
            ${tag.isFolder ? `<span class="at-folder-icon"><i class="fas fa-folder"></i></span>` : ""}
            ${tag.icon ? `<span class="at-tag-icon">${foundry.utils.escapeHTML(tag.icon)}</span>` : ""}
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
            const childrenContainer = this._elements.html.ownerDocument.createElement("div");
            childrenContainer.className = "at-folder-children";

            // Find children of this folder
            const children = this._childrenByParent.get(tag.uuid) || [];

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
    async _cycleSortMode() {
        const modes = ["order", "name-asc", "name-desc", "color-brightness-dark", "color-brightness"];
        const currentIndex = modes.indexOf(this._currentSortMode);
        this._currentSortMode = modes[(currentIndex + 1) % modes.length];

        // Save sort mode to settings
        await TagManager.setSortMode(this._currentSortMode);
        TagManager.requestRender();

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
    _attachListeners() {
        const { header, spoiler, toggleIcon, wizardBtn, addBtn, refreshBtn, sortBtn, list } = this._elements;

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
                await TagEditorDialog.open();
            });

            refreshBtn?.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (refreshBtn.disabled) return;
                refreshBtn.disabled = true;
                refreshBtn.querySelector("i").classList.add("fa-spin");

                try {
                    // Batch recover
                    for (const playlist of game.playlists) {
                        await TagAssignmentManager.recoverTags(playlist);
                        for (const sound of playlist.sounds) {
                            await TagAssignmentManager.recoverTags(sound);
                        }
                    }

                    TagManager.requestRender();
                    if (TagManager.areNotificationsEnabled()) {
                        ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.TagsRefreshed"));
                    }
                } catch (error) {
                    console.error("Audio Tagger | Tag recovery failed", error);
                    ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
                } finally {
                    refreshBtn.disabled = false;
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
                    await TagEditorDialog.open(tag);
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
            if (PaletteRenderer._activePlaybackMode) {
                // Trigger audio playback with the active mode
                try {
                    await AudioPlaybackManager.playByMode(tag.uuid, PaletteRenderer._activePlaybackMode);
                } catch (error) {
                    console.error("Audio Tagger | Playback failed", error);
                    ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorPlayback"));
                }
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
    _searchByTag(tagName) {
        const searchInput = this._elements.html.querySelector("input[name='search']");
        if (!searchInput) return;

        const currentValue = searchInput.value.trim();
        const newValue = currentValue ? `${currentValue} ${tagName}` : tagName;

        searchInput.value = newValue;
        const InputEvent = searchInput.ownerDocument.defaultView.Event;
        searchInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    /**
     * Handle the tag deletion confirmation and process.
     * @param {object} tag - The tag to delete
     * @private
     */
    async _handleDelete(tag) {
        // IMPORTANT: Check notifications setting immediately to determine if we skip dialog
        const notificationsEnabled = TagManager.areNotificationsEnabled();

        // If notifications are disabled, delete immediately regardless of usage
        if (!notificationsEnabled) {
            await TagManager.deleteTag(tag.uuid);
            return;
        }

        const documents = TagAssignmentManager.getDocumentsWithTag(tag.uuid);
        let content = `<p>${game.i18n.format("AUDIO_TAGGER.DeleteConfirmContent", {
            name: foundry.utils.escapeHTML(tag.name)
        })}</p>`;

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
        }
    }
}
