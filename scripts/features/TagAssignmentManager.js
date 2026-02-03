import { TagManager } from "../core/TagManager.js";
import { MODULE_ID, FLAG_TAGS, FLAG_SEARCH, log } from "../core/constants.js";

/**
 * Manages tag assignments to Playlist and PlaylistSound documents.
 * Stores assignments in document flags and maintains search index.
 */
export class TagAssignmentManager {
    // Tag index: tagUuid -> Set<documentUuid>
    static _tagIndex = new Map();
    static _indexBuilt = false;

    /**
     * Rebuild the tag index by scanning all playlists and sounds.
     * Called lazily on first getDocumentsWithTag call.
     */
    static rebuildIndex() {
        this._tagIndex.clear();

        for (const playlist of game.playlists) {
            for (const assignment of this.getAssignedTags(playlist)) {
                this._addToIndex(assignment.uuid, playlist.uuid);
            }
            for (const sound of playlist.sounds) {
                for (const assignment of this.getAssignedTags(sound)) {
                    this._addToIndex(assignment.uuid, sound.uuid);
                }
            }
        }

        this._indexBuilt = true;
    }

    /**
     * Add a document to the tag index.
     * @param {string} tagUuid 
     * @param {string} documentUuid 
     * @private
     */
    static _addToIndex(tagUuid, documentUuid) {
        if (!this._tagIndex.has(tagUuid)) {
            this._tagIndex.set(tagUuid, new Set());
        }
        this._tagIndex.get(tagUuid).add(documentUuid);
    }

    /**
     * Remove a document from the tag index.
     * @param {string} tagUuid 
     * @param {string} documentUuid 
     * @private
     */
    static _removeFromIndex(tagUuid, documentUuid) {
        const set = this._tagIndex.get(tagUuid);
        if (set) {
            set.delete(documentUuid);
            if (set.size === 0) {
                this._tagIndex.delete(tagUuid);
            }
        }
    }

    /**
     * Assign a tag to a document.
     * @param {Document} document - Playlist or PlaylistSound
     * @param {string} tagUuid - Tag UUID
     * @returns {Promise<Document|void>}
     */
    static async assignTag(document, tagUuid) {
        if (!document || !tagUuid) return;

        const tag = TagManager.getTag(tagUuid);
        if (!tag) {
            console.warn(`Audio Tagger | Tag ${tagUuid} not found`);
            return;
        }

        const assignments = this.getAssignedTags(document);
        if (assignments.some(a => a.uuid === tagUuid)) {
            if (TagManager.areNotificationsEnabled()) {
                ui.notifications.warn(game.i18n.localize("AUDIO_TAGGER.TagAlreadyAssigned"));
            }
            return document;
        }

        const newAssignments = [
            ...assignments,
            {
                uuid: tagUuid,
                assignedAt: Date.now(),
                snapshot: {
                    name: tag.name,
                    backgroundColor: tag.backgroundColor,
                    textColor: tag.textColor
                }
            }
        ];

        await document.setFlag(MODULE_ID, FLAG_TAGS, newAssignments);
        await this.updateSearchFlag(document);

        // Update index
        this._addToIndex(tagUuid, document.uuid);

        Hooks.callAll("audioTaggerTagAssigned", document, tag);
        return document;
    }

    /**
     * Unassign a tag from a document.
     * @param {Document} document - Playlist or PlaylistSound
     * @param {string} tagUuid - Tag UUID
     * @param {boolean} [skipRender=false] - Skip UI refresh
     * @returns {Promise<Document>}
     */
    static async unassignTag(document, tagUuid, skipRender = false) {
        if (!document || !tagUuid) return document;

        const assignments = this.getAssignedTags(document);
        const newAssignments = assignments.filter(a => a.uuid !== tagUuid);

        if (assignments.length === newAssignments.length) return document;

        if (newAssignments.length > 0) {
            await document.setFlag(MODULE_ID, FLAG_TAGS, newAssignments);
        } else {
            await document.unsetFlag(MODULE_ID, FLAG_TAGS);
        }

        await this.updateSearchFlag(document);

        // Update index
        this._removeFromIndex(tagUuid, document.uuid);

        if (!skipRender) {
            Hooks.callAll("audioTaggerTagUnassigned", document, tagUuid);
        }

        return document;
    }

    /**
     * Get all tags assigned to a document.
     * @param {Document} document
     * @returns {Array}
     */
    static getAssignedTags(document) {
        if (!document) return [];
        return document.getFlag(MODULE_ID, FLAG_TAGS) || [];
    }

    /**
     * Get all documents with a specific tag.
     * Uses index for O(1) lookup instead of scanning all documents.
     * @param {string} tagUuid
     * @returns {Array<Document>}
     */
    static getDocumentsWithTag(tagUuid) {
        // Lazy index build
        if (!this._indexBuilt) {
            this.rebuildIndex();
        }

        const documentUuids = this._tagIndex.get(tagUuid);
        if (!documentUuids || documentUuids.size === 0) {
            return [];
        }

        const results = [];
        for (const uuid of documentUuids) {
            const doc = fromUuidSync(uuid);
            if (doc) results.push(doc);
        }
        return results;
    }

    /**
     * Update the search flag for native Foundry search.
     * Stores normalized lowercase tag names as space-separated string.
     * @param {Document} document
     */
    static async updateSearchFlag(document) {
        const assignments = this.getAssignedTags(document);

        if (assignments.length === 0) {
            const current = document.getFlag(MODULE_ID, FLAG_SEARCH);
            if (current) {
                await document.unsetFlag(MODULE_ID, FLAG_SEARCH);
            }
            return;
        }

        const searchString = assignments
            .map(a => {
                const tag = TagManager.getTag(a.uuid);
                return (tag?.name || a.snapshot?.name || "").toLowerCase();
            })
            .filter(Boolean)
            .join(" ");

        await document.setFlag(MODULE_ID, FLAG_SEARCH, searchString);
    }

    /**
     * Sync tag snapshots when a tag is updated.
     * @param {string} tagUuid
     */
    static async syncTagSnapshots(tagUuid) {
        const tag = TagManager.getTag(tagUuid);
        if (!tag) return;

        const snapshot = {
            name: tag.name,
            backgroundColor: tag.backgroundColor,
            textColor: tag.textColor
        };

        const documents = this.getDocumentsWithTag(tagUuid);

        for (const doc of documents) {
            const assignments = this.getAssignedTags(doc);
            const idx = assignments.findIndex(a => a.uuid === tagUuid);

            if (idx !== -1) {
                assignments[idx].snapshot = snapshot;
                await doc.setFlag(MODULE_ID, FLAG_TAGS, assignments);
                await this.updateSearchFlag(doc);
            }
        }
    }

    /**
     * Recover tags from imported documents.
     * @param {Document} document
     */
    static async recoverTags(document) {
        const assignments = this.getAssignedTags(document);
        if (assignments.length === 0) return;

        const allTags = TagManager.getTags();
        let changed = false;
        const newAssignments = [];

        for (const assignment of assignments) {
            if (allTags[assignment.uuid]) {
                newAssignments.push(assignment);
                continue;
            }

            const snapshot = assignment.snapshot;
            if (!snapshot) {
                changed = true;
                continue;
            }

            const existingTag = Object.values(allTags).find(
                t => t.name.toLowerCase() === snapshot.name.toLowerCase()
            );

            if (existingTag) {
                log(`Audio Tagger | Merging tag '${snapshot.name}' to existing '${existingTag.name}'`);
                newAssignments.push({
                    uuid: existingTag.uuid,
                    assignedAt: assignment.assignedAt,
                    snapshot: {
                        name: existingTag.name,
                        backgroundColor: existingTag.backgroundColor,
                        textColor: existingTag.textColor
                    }
                });
                changed = true;
            } else {
                log(`Audio Tagger | Importing new tag '${snapshot.name}'`);
                try {
                    const newTag = await TagManager.createTag({
                        uuid: assignment.uuid,
                        name: snapshot.name,
                        backgroundColor: snapshot.backgroundColor,
                        textColor: snapshot.textColor
                    });
                    allTags[newTag.uuid] = newTag;
                    newAssignments.push(assignment);
                } catch (error) {
                    console.error(`Audio Tagger | Failed to import tag '${snapshot.name}':`, error);
                    // Keep original assignment with snapshot for display fallback
                    newAssignments.push(assignment);
                }
            }
        }

        if (changed) {
            await document.setFlag(MODULE_ID, FLAG_TAGS, newAssignments);
            await this.updateSearchFlag(document);
        }
    }
}
