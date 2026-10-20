import { TagManager } from "../core/TagManager.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";

/**
 * Manages audio playback through tag-based selection.
 * Handles finding sounds by tag hierarchy and playback control.
 */
export class AudioPlaybackManager {
    // Reference to currently playing sound for stop functionality
    static _currentSound = null;
    static _playbackQueue = Promise.resolve();

    /**
     * Stop any currently playing sound that was started by this manager.
     */
    static async stopCurrent() {
        if (this._currentSound && this._currentSound.playing) {
            await this._currentSound.update({ playing: false });
        }
        this._currentSound = null;
    }

    /**
     * Get all ancestor tag UUIDs for a given tag (including itself).
     * Walks up the hierarchy chain.
     * @param {string} tagUuid - Starting tag UUID
     * @returns {string[]} Array of tag UUIDs from child to root
     */
    static getTagHierarchyChain(tagUuid) {
        const chain = [tagUuid];
        const hierarchy = TagManager.getTagHierarchy();

        let currentUuid = tagUuid;
        let maxIterations = 100; // Prevent infinite loops

        while (maxIterations-- > 0) {
            const parentUuid = hierarchy[currentUuid];
            if (!parentUuid) break;
            chain.push(parentUuid);
            currentUuid = parentUuid;
        }

        return chain;
    }

    /**
     * Check if a sound (with its playlist) has all required tags.
     * Playlist tags are inherited by sounds within them.
     * @param {PlaylistSound} sound - The sound document
     * @param {string[]} requiredTagUuids - Tags that must all be present
     * @returns {boolean}
     */
    static soundMatchesTags(sound, requiredTagUuids) {
        // Get tags directly on the sound
        const soundTags = TagAssignmentManager.getAssignedTags(sound)
            .map(a => a.uuid);

        // Get tags on the parent playlist (inherited by sound)
        const playlist = sound.parent;
        const playlistTags = playlist
            ? TagAssignmentManager.getAssignedTags(playlist).map(a => a.uuid)
            : [];

        // Combined effective tags for this sound
        const effectiveTags = new Set([...soundTags, ...playlistTags]);

        // Check if all required tags are present
        return requiredTagUuids.every(uuid => effectiveTags.has(uuid));
    }

    /**
     * Find all sounds matching a tag hierarchy.
     * @param {string} tagUuid - The clicked tag UUID
     * @returns {PlaylistSound[]} Array of matching sounds
     */
    static getSoundsMatchingTagHierarchy(tagUuid) {
        const requiredTags = this.getTagHierarchyChain(tagUuid);
        const matchingSounds = [];

        for (const playlist of game.playlists) {
            const inherited = new Set(TagAssignmentManager.getAssignedTags(playlist).map(a => a.uuid));
            const remaining = requiredTags.filter(uuid => !inherited.has(uuid));
            for (const sound of playlist.sounds) {
                const assigned = new Set(TagAssignmentManager.getAssignedTags(sound).map(a => a.uuid));
                if (remaining.every(uuid => assigned.has(uuid))) {
                    matchingSounds.push(sound);
                }
            }
        }

        return matchingSounds;
    }

    /**
     * Play a sound based on selection mode.
     * @param {string} tagUuid - The clicked tag UUID
     * @param {'first'|'last'|'random'} mode - Selection mode
     */
    static async playByMode(tagUuid, mode = 'first') {
        const sounds = this.getSoundsMatchingTagHierarchy(tagUuid);

        if (sounds.length === 0) {
            if (TagManager.areNotificationsEnabled()) {
                ui.notifications.warn(game.i18n.localize("AUDIO_TAGGER.NoMatchingSoundsToPlay"));
            }
            return;
        }

        let targetSound;
        switch (mode) {
            case 'first':
                targetSound = sounds[0];
                break;
            case 'last':
                targetSound = sounds[sounds.length - 1];
                break;
            case 'random':
                targetSound = sounds[Math.floor(Math.random() * sounds.length)];
                break;
            default:
                targetSound = sounds[0];
        }

        await this.playSound(targetSound);
    }

    /**
     * Play a specific sound, stopping any currently playing sound first.
     * @param {PlaylistSound} sound - The sound to play
     */
    static playSound(sound) {
        const result = this._playbackQueue.catch(() => {}).then(() => this._playSound(sound));
        this._playbackQueue = result;
        return result;
    }

    static async _playSound(sound) {
        // Stop current sound first
        await this.stopCurrent();

        // Start playing the new sound
        await sound.update({ playing: true });
        this._currentSound = sound;

        // Show notification
        if (TagManager.areNotificationsEnabled()) {
            ui.notifications.info(game.i18n.format("AUDIO_TAGGER.PlayingSound", {
                name: sound.name
            }));
        }
    }
}
