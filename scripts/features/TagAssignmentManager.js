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
    static _emptyAssignments = Object.freeze([]);

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
    static _documentWrites = new Map();
    static revision = 0;

    static invalidateIndex() {
        this._indexBuilt = false;
        this.revision++;
    }

    static _enqueueDocument(document, operation) {
        const previous = this._documentWrites.get(document.uuid) || Promise.resolve();
        const result = previous.catch(() => {}).then(operation);
        this._documentWrites.set(document.uuid, result);
        const cleanup = () => {
            if (this._documentWrites.get(document.uuid) === result) this._documentWrites.delete(document.uuid);
        };
        result.then(cleanup, cleanup);
        return result;
    }

    static _snapshot(tag) {
        return { name: tag.name, icon: tag.icon || "", isFolder: Boolean(tag.isFolder),
            backgroundColor: tag.backgroundColor, textColor: tag.textColor };
    }

    static async _writeAssignments(document, assignments) {
        const current = this.getAssignedTags(document);
        const search = assignments.map(a => (TagManager.getTag(a.uuid)?.name || a.snapshot?.name || "").toLowerCase())
            .filter(Boolean).join(" ");
        const changes = {};
        const prefix = "flags." + MODULE_ID + ".";
        if (JSON.stringify(current) !== JSON.stringify(assignments)) {
            changes[prefix + (assignments.length ? FLAG_TAGS : "-=" + FLAG_TAGS)] = assignments.length ? assignments : null;
        }
        if (document.getFlag(MODULE_ID, FLAG_SEARCH) !== (search || undefined)) {
            changes[prefix + (search ? FLAG_SEARCH : "-=" + FLAG_SEARCH)] = search || null;
        }
        if (Object.keys(changes).length) {
            await document.update(changes);
            this.invalidateIndex();
            TagManager.requestRender();
        }
        return document;
    }

    /** Merge only the user's changes into the latest flags. */
    static applySelection(document, selected, baseline, { emitRemoved = true } = {}) {
        const desired = new Set(selected);
        const initial = new Set(baseline);
        return this._enqueueDocument(document, async () => {
            const current = this.getAssignedTags(document);
            const remove = new Set([...initial].filter(uuid => !desired.has(uuid)));
            const next = current.filter(a => !remove.has(a.uuid));
            const added = [];
            for (const uuid of desired) {
                if (initial.has(uuid) || next.some(a => a.uuid === uuid)) continue;
                const tag = TagManager.getTag(uuid);
                if (!tag) continue;
                next.push({ uuid, assignedAt: Date.now(), snapshot: this._snapshot(tag) });
                added.push(tag);
            }
            await this._writeAssignments(document, next);
            if (emitRemoved) for (const assignment of current) {
                if (remove.has(assignment.uuid)) Hooks.callAll("audioTaggerTagUnassigned", document, assignment.uuid);
            }
            for (const tag of added) Hooks.callAll("audioTaggerTagAssigned", document, tag);
            return document;
        });
    }

    static async assignTag(document, tagUuid) {
        if (!document || !tagUuid || !TagManager.getTag(tagUuid)) return;
        if (this.getAssignedTags(document).some(a => a.uuid === tagUuid) && TagManager.areNotificationsEnabled()) {
            ui.notifications.warn(game.i18n.localize("AUDIO_TAGGER.TagAlreadyAssigned"));
        }
        return this.applySelection(document, [tagUuid], []);
    }

    static async unassignTag(document, tagUuid, skipRender = false) {
        if (!document || !tagUuid) return document;
        return this.applySelection(document, [], [tagUuid], { emitRemoved: !skipRender });
    }

    /**
     * Get all tags assigned to a document.
     * @param {Document} document
     * @returns {Array}
     */
    static getAssignedTags(document) {
        if (!document) return this._emptyAssignments;
        return document.getFlag(MODULE_ID, FLAG_TAGS) || this._emptyAssignments;
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
    static updateSearchFlag(document) {
        return this._enqueueDocument(document, () => this._writeAssignments(document, this.getAssignedTags(document)));
    }

    static async syncTagSnapshots(tagUuid) {
        const documents = this.getDocumentsWithTag(tagUuid);
        for (const doc of documents) {
            await this._enqueueDocument(doc, async () => {
                const tag = TagManager.getTag(tagUuid);
                if (!tag) return;
                const assignments = foundry.utils.deepClone(this.getAssignedTags(doc));
                for (const assignment of assignments) {
                    if (assignment.uuid === tagUuid) assignment.snapshot = this._snapshot(tag);
                }
                await this._writeAssignments(doc, assignments);
            });
        }
    }

    /**
     * Recover tags from imported documents.
     * @param {Document} document
     */
    static recoverTags(document) {
        this.invalidateIndex();
        return this._enqueueDocument(document, () => this._recoverTags(document));
    }

    static async _recoverTags(document) {
        const assignments = this.getAssignedTags(document);
        if (assignments.length === 0) return;

        let changed = false;
        const newAssignments = [];

        for (const assignment of assignments) {
            const allTags = TagManager.getTags();
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
                    snapshot: this._snapshot(existingTag)
                });
                changed = true;
            } else {
                log(`Audio Tagger | Importing new tag '${snapshot.name}'`);
                try {
                    await TagManager.createTag({
                        uuid: assignment.uuid,
                        name: snapshot.name,
                        icon: snapshot.icon,
                        isFolder: snapshot.isFolder,
                        backgroundColor: snapshot.backgroundColor,
                        textColor: snapshot.textColor
                    });
                    changed = true;
                    newAssignments.push(assignment);
                } catch (error) {
                    console.error(`Audio Tagger | Failed to import tag '${snapshot.name}':`, error);
                    // Keep original assignment with snapshot for display fallback
                    newAssignments.push(assignment);
                }
            }
        }

        if (changed) {
            const unique = [...new Map(newAssignments.map(a => [a.uuid, a])).values()];
            await this._writeAssignments(document, unique);
        }
    }
}
