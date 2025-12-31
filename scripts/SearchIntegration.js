import { TagManager } from "./TagManager.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";

/**
 * SearchIntegration - Hooks into Foundry's native search mechanism.
 * Patches PlaylistDirectory._matchSearchEntries to include tag-based matching.
 */
export class SearchIntegration {
    static _initialized = false;

    /**
     * Initialize by patching PlaylistDirectory's search method.
     */
    static init() {
        if (this._initialized) return;

        console.log("Audio Tagger | Patching PlaylistDirectory search");

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
        const original = PlaylistDirectory.prototype._matchSearchEntries;

        PlaylistDirectory.prototype._matchSearchEntries = function(query, entryIds, folderIds, autoExpandIds, options = {}) {
            // Call original method first
            original.call(this, query, entryIds, folderIds, autoExpandIds, options);

            // If no query, nothing to do
            if (!query) return;

            const soundIds = options.soundIds ??= new Set();
            const plNameHits = options.plNameHits ??= new Set();
            const clean = foundry.applications.ux.SearchFilter.cleanQuery;

            // Check playlists and sounds for tag matches
            for (const pl of this.collection) {
                // Check playlist tags
                const plTagMatch = SearchIntegration._documentMatchesTags(pl, query, clean);
                if (plTagMatch) {
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

                // Check individual sound tags
                let soundTagHit = false;
                for (const s of pl.sounds) {
                    if (SearchIntegration._documentMatchesTags(s, query, clean)) {
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
     * Check if a document's assigned tags match the search query.
     * @param {Document} doc - Playlist or PlaylistSound
     * @param {RegExp} query - The search regex
     * @param {Function} clean - The query cleaning function
     * @returns {boolean}
     * @private
     */
    static _documentMatchesTags(doc, query, clean) {
        const assignments = TagAssignmentManager.getAssignedTags(doc);
        if (!assignments?.length) return false;

        for (const assignment of assignments) {
            const tag = TagManager.getTag(assignment.uuid);
            
            // Check current tag name
            if (tag?.name && query.test(clean(tag.name))) {
                return true;
            }
            
            // Check snapshot name (fallback)
            if (assignment.snapshot?.name && query.test(clean(assignment.snapshot.name))) {
                return true;
            }
        }

        return false;
    }
}
