import { TagAssignmentManager } from "../features/TagAssignmentManager.js";
import { TagManager } from "../core/TagManager.js";
import { TagWizard } from "../features/TagWizard.js";
import { toElement } from "../core/constants.js";

/**
 * Renders assigned tags for playlists and sounds in PlaylistDirectory.
 * Uses simple clear + append strategy within the render hook.
 */
export class DirectoryTagRenderer {
    /**
     * Render tags for all playlists and sounds.
     * Called from renderPlaylistDirectory hook.
     * @param {HTMLElement} html - Directory container
     */
    static render(html) {
        const element = toElement(html);

        // Render tags in playlist directory
        for (const playlistEl of element.querySelectorAll(".playlist")) {
            const playlistId = playlistEl.dataset.entryId;
            const playlist = game.playlists.get(playlistId);
            if (!playlist) continue;

            this._renderTags(playlistEl, playlist, ".playlist-header");

            for (const soundEl of playlistEl.querySelectorAll(".sound")) {
                const soundId = soundEl.dataset.soundId;
                const sound = playlist.sounds.get(soundId);
                if (sound) {
                    this._renderTags(soundEl, sound, "header");
                }
            }
        }

        // Render tags in currently-playing section
        this._renderPlayingSection(element);
    }

    /**
     * Render tags for currently playing sounds.
     * Shows both sound tags and parent playlist tags.
     * @param {HTMLElement} element - Directory container
     * @private
     */
    static _renderPlayingSection(element) {
        const playingSection = element.querySelector(".currently-playing");
        if (!playingSection) return;

        for (const soundEl of playingSection.querySelectorAll(".sound")) {
            const soundUuid = soundEl.dataset.soundUuid;
            if (!soundUuid) continue;

            const sound = fromUuidSync(soundUuid);
            if (!sound) continue;

            // Get tags from both sound and parent playlist
            const soundTags = TagAssignmentManager.getAssignedTags(sound);
            const playlistTags = TagAssignmentManager.getAssignedTags(sound.parent);
            const allTags = [...playlistTags, ...soundTags];

            // Remove duplicates by UUID
            const uniqueTags = allTags.filter((tag, idx, arr) =>
                arr.findIndex(t => t.uuid === tag.uuid) === idx
            );

            // Try .sound-playback first (Foundry v13), fallback to .sound-name
            this._renderTagsSimple(soundEl, uniqueTags, ".sound-playback");
        }
    }

    /**
     * Render tags for a single document.
     * Uses differential updates to minimize DOM operations.
     * @param {HTMLElement} element - DOM element
     * @param {Document} doc - Playlist or PlaylistSound
     * @param {string} anchorSelector - Where to insert
     * @private
     */
    static _renderTags(element, doc, anchorSelector) {
        const assignments = TagAssignmentManager.getAssignedTags(doc);
        let container = element.querySelector(".audio-tagger-assigned-tags");

        // Skip containers managed by Tag Wizard (have document-uuid attribute)
        // They will be handled by TagAutocomplete
        if (container && container.dataset.documentUuid) {
            return;
        }

        // If no assignments, remove container and exit
        if (assignments.length === 0) {
            if (container) container.remove();
            return;
        }

        const anchor = element.querySelector(anchorSelector);
        if (!anchor) return;

        // Create container if it doesn't exist
        if (!container) {
            container = document.createElement("div");
            container.className = "audio-tagger-assigned-tags";
            anchor.insertAdjacentElement("afterend", container);
        }

        // Build sets for differential update
        const existingUuids = new Set(
            [...container.querySelectorAll(".audio-tagger-assigned-tag")].map(el => el.dataset.tagUuid)
        );
        const newUuids = new Set(assignments.map(a => a.uuid));

        // Remove tags no longer assigned
        for (const child of [...container.querySelectorAll(".audio-tagger-assigned-tag")]) {
            if (!newUuids.has(child.dataset.tagUuid)) {
                child.remove();
            }
        }

        // Add new tags (that don't already exist)
        for (const assignment of assignments) {
            if (existingUuids.has(assignment.uuid)) continue;

            const tagEl = this._createTagElement(assignment, doc);
            if (tagEl) {
                container.appendChild(tagEl);
            }
        }
    }

    /**
     * Render tags without remove buttons (for currently-playing section).
     * @param {HTMLElement} element - DOM element
     * @param {Array} assignments - Tag assignments
     * @param {string} anchorSelector - Where to insert
     * @private
     */
    static _renderTagsSimple(element, assignments, anchorSelector) {
        // Remove existing container
        const existing = element.querySelector(".audio-tagger-assigned-tags");
        if (existing) existing.remove();

        if (!assignments?.length) return;

        const anchor = element.querySelector(anchorSelector);
        if (!anchor) return;

        const container = document.createElement("div");
        container.className = "audio-tagger-assigned-tags";

        for (const assignment of assignments) {
            const tag = TagManager.getTag(assignment.uuid);
            const data = tag || assignment.snapshot;
            if (!data) continue;

            const span = document.createElement("span");
            span.className = "audio-tagger-assigned-tag";
            span.style.backgroundColor = data.backgroundColor;
            span.style.color = data.textColor;
            span.title = data.name;

            // Add icon if present
            if (data.icon) {
                const iconSpan = document.createElement("span");
                iconSpan.className = "at-tag-icon";
                iconSpan.textContent = data.icon;
                span.appendChild(iconSpan);
            }

            const nameSpan = document.createElement("span");
            nameSpan.textContent = data.name;
            span.appendChild(nameSpan);

            container.appendChild(span);
        }

        anchor.insertAdjacentElement("afterend", container);
    }

    /**
     * Create a single tag element (for use by TagAutocomplete).
     * @param {object} assignment - Tag assignment with uuid
     * @param {Document} [doc] - Optional document for remove button
     * @returns {HTMLElement|null}
     */
    static _createTagElement(assignment, doc = null) {
        const tag = TagManager.getTag(assignment.uuid);
        const data = tag || assignment.snapshot;
        if (!data) return null;

        const span = document.createElement("span");
        span.className = "audio-tagger-assigned-tag";
        span.style.backgroundColor = data.backgroundColor;
        span.style.color = data.textColor;
        span.title = data.name;
        span.dataset.tagUuid = assignment.uuid;

        // Add icon if present
        if (data.icon) {
            const iconSpan = document.createElement("span");
            iconSpan.className = "at-tag-icon";
            iconSpan.textContent = data.icon;
            span.appendChild(iconSpan);
        }

        const nameSpan = document.createElement("span");
        nameSpan.textContent = data.name;
        span.appendChild(nameSpan);

        // Remove button (GM only, if document provided)
        if (doc && game.user.isGM) {
            const btn = document.createElement("i");
            btn.className = "fas fa-times remove-tag";
            btn.title = game.i18n.localize("AUDIO_TAGGER.RemoveAssignment");
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                // If Tag Wizard is active, use its method to avoid re-render
                if (TagWizard.isWizardActive()) {
                    TagWizard.removeTagFromDocument(doc.uuid, assignment.uuid);
                } else {
                    await TagAssignmentManager.unassignTag(doc, assignment.uuid);
                }
                // Show notification
                if (TagManager.areNotificationsEnabled()) {
                    ui.notifications.info(game.i18n.format("AUDIO_TAGGER.TagRemovedFromDocument", {
                        tag: data.name,
                        document: doc.name
                    }));
                }
            });
            span.appendChild(btn);
        }

        return span;
    }
}
