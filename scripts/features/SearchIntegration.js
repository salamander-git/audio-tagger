import { TagManager } from "../core/TagManager.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";
import { log } from "../core/constants.js";

/**
 * SearchIntegration - Hooks into Foundry's native search mechanism.
 * Patches PlaylistDirectory._matchSearchEntries to include tag-based matching
 * with multi-word AND logic and partial matching support.
 */
export class SearchIntegration {
    static _initialized = false;
    static _documents = new WeakMap();
    static _cleanFallback = value => value.toLowerCase().trim();

    static invalidateDocument(doc) {
        this._documents.delete(doc);
        if (doc.sounds) for (const sound of doc.sounds) this._documents.delete(sound);
    }

    /**
     * Initialize by patching PlaylistDirectory's search method.
     */
    static init() {
        if (this._initialized) return;

        log("Audio Tagger | Patching PlaylistDirectory search");

        // Wait for setup hook when PlaylistDirectory is available
        Hooks.once("setup", () => {
            this._patchSearch();
        });

        this._initialized = true;
    }

    /**
     * Patch the PlaylistDirectory._matchSearchEntries method.
     * @private
     */
    static _patchSearch() {
        const PlaylistDirectory = foundry.applications.sidebar.tabs.PlaylistDirectory;
        const original = PlaylistDirectory?.prototype._matchSearchEntries;
        if (typeof original !== "function") {
            console.warn("Audio Tagger | Playlist search extension unavailable");
            return;
        }

        PlaylistDirectory.prototype._matchSearchEntries = function (query, entryIds, folderIds, autoExpandIds, options = {}) {
            // Call original method first
            original.call(this, query, entryIds, folderIds, autoExpandIds, options);

            // If no query, nothing to do
            if (!query) return;

            const soundIds = options.soundIds ??= new Set();
            const plNameHits = options.plNameHits ??= new Set();

            // Resolve SearchFilter.cleanQuery across API versions (v13: ux, v14: may move)
            const clean = foundry.applications.ux?.SearchFilter?.cleanQuery
                ?? foundry.utils.SearchFilter?.cleanQuery
                ?? SearchIntegration._cleanFallback;

            // Get raw search query from input field
            const searchInput = this.element?.querySelector('input[name="search"]');
            const rawQuery = searchInput?.value?.trim() || "";

            if (!rawQuery) return;

            // Split into individual search terms
            const searchTerms = rawQuery.toLowerCase().split(/\s+/).filter(t => t);

            if (!searchTerms.length) return;

            // Check playlists and sounds for matches
            for (const pl of this.collection) {
                // Check if playlist matches ALL search terms
                const plMatches = SearchIntegration._documentMatchesAllTerms(pl, searchTerms, clean);
                if (plMatches) {
                    plNameHits.add(pl.id);
                    entryIds.add(pl.id);

                    // Add all sounds from matching playlist
                    pl.sounds.forEach(s => soundIds.add(s.id));

                    // Expand parent folders
                    for (let f = pl.folder; f; f = f.folder) {
                        folderIds.add(f.id);
                        autoExpandIds.add(f.id);
                    }
                    continue;
                }

                // Check individual sounds
                let soundTagHit = false;
                for (const s of pl.sounds) {
                    if (SearchIntegration._documentMatchesAllTerms(s, searchTerms, clean)) {
                        soundIds.add(s.id);
                        soundTagHit = true;
                    }
                }

                // If any sound matched by tag, show the playlist
                if (soundTagHit && !entryIds.has(pl.id)) {
                    entryIds.add(pl.id);
                    for (let f = pl.folder; f; f = f.folder) {
                        folderIds.add(f.id);
                        autoExpandIds.add(f.id);
                    }
                }
            }
        };
    }

    /**
     * Check if a document matches ALL search terms.
     * Each term can match either in the document name or in its tags.
     * Supports partial matching (e.g., "bear prayer" matches "Bear Mccreary A Giants Prayer").
     * @param {Document} doc - Playlist or PlaylistSound
     * @param {string[]} searchTerms - Array of search terms (all lowercase)
     * @param {Function} clean - The query cleaning function
     * @returns {boolean}
     * @private
     */
    static _documentMatchesAllTerms(doc, searchTerms, clean) {
        let cached = this._documents.get(doc);
        const assignments = TagAssignmentManager.getAssignedTags(doc);
        if (!cached || cached.name !== doc.name || cached.assignments !== assignments
            || cached.revision !== TagManager.revision || cached.clean !== clean
            || cached.assignmentRevision !== TagAssignmentManager.revision) {
            const docName = clean(doc.name || "").toLowerCase();
            const tagNames = assignments.map(assignment => {
                const tag = TagManager.getTag(assignment.uuid);
                const name = tag?.name || assignment.snapshot?.name || "";
                return clean(name).toLowerCase();
            }).filter(Boolean);
            cached = { name: doc.name, assignments, revision: TagManager.revision, clean,
                assignmentRevision: TagAssignmentManager.revision, docName, tagNames };
            this._documents.set(doc, cached);
        }

        // Check if ALL search terms match (in name OR tags)
        return searchTerms.every(term => {
            // Check if term is in document name
            if (cached.docName.includes(term)) return true;

            // Check if term matches any tag
            return cached.tagNames.some(tagName => tagName.includes(term));
        });
    }
}
