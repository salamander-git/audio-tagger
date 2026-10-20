import { TagAutocomplete } from "../ui/TagAutocomplete.js";
import { TagManager } from "../core/TagManager.js";
import { TagAssignmentManager } from "./TagAssignmentManager.js";
import { toElement } from "../core/constants.js";

/** Drafts belong to documents, not to ephemeral Foundry directory elements. */
export class TagWizard {
    static isActive = false;
    static isSaving = false;
    static roots = new Map();
    static autocompletes = new Map(); // header element -> component
    static drafts = new Map(); // document UUID -> shared editable state
    static viewStates = new Map(); // directory key -> dropdown state by UUID

    static init(html, key = html) { this.roots.set(key, toElement(html)); }

    static close(key) {
        for (const [header, ac] of this.autocompletes) {
            if (ac.viewKey !== key) continue;
            ac.destroy();
            this.autocompletes.delete(header);
        }
        this.roots.delete(key);
        this.viewStates.delete(key);
    }

    static async toggle() {
        if (!game.user.isGM || this.isSaving) return;
        if (this.isActive) await this.deactivate();
        else this.activate();
    }

    static activate() {
        if (!game.user.isGM || this.isActive) return;
        this.isActive = true;
        for (const [key, root] of this.roots) this.refresh(root, key);
        if (TagManager.areNotificationsEnabled()) ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.WizardActivated"));
    }

    static _getDraft(doc) {
        let draft = this.drafts.get(doc.uuid);
        const current = new Set(TagAssignmentManager.getAssignedTags(doc).map(a => a.uuid));
        if (!draft) {
            draft = { baseline: current, selectedUuids: new Set(current) };
            this.drafts.set(doc.uuid, draft);
        } else if (!this.isSaving) {
            // Preserve local edits, accepting unrelated remote assignments.
            const added = [...draft.selectedUuids].filter(id => !draft.baseline.has(id));
            const removed = [...draft.baseline].filter(id => !draft.selectedUuids.has(id));
            draft.selectedUuids.clear();
            current.forEach(id => draft.selectedUuids.add(id));
            added.filter(id => TagManager.getTag(id)).forEach(id => draft.selectedUuids.add(id));
            removed.forEach(id => draft.selectedUuids.delete(id));
            draft.baseline = current;
        }
        return draft;
    }

    static refresh(html, key = html) {
        this.init(html, key);
        if (!this.isActive) return;
        const root = toElement(html);
        const states = this.viewStates.get(key) || new Map();
        this.viewStates.set(key, states);
        for (const [header, ac] of this.autocompletes) {
            if (ac.viewKey !== key) continue;
            if (header.isConnected && root.contains(header) && header.contains(ac.button)) continue;
            states.set(ac.document.uuid, ac.getViewState());
            ac.destroy();
            this.autocompletes.delete(header);
        }
        const add = (element, doc, selector) => {
            const header = element.querySelector(selector);
            if (!header) return;
            const draft = this._getDraft(doc);
            let ac = this.autocompletes.get(header);
            if (!ac) {
                const button = root.ownerDocument.createElement("i");
                button.className = "fas fa-plus at-header-add-btn";
                button.dataset.documentUuid = doc.uuid;
                button.title = game.i18n.localize("AUDIO_TAGGER.AddTag");
                header.prepend(button);
                ac = new TagAutocomplete(doc, button, draft, () => this._refreshDocument(doc.uuid), () => this.isSaving);
                ac.viewKey = key;
                this.autocompletes.set(header, ac);
                const state = states.get(doc.uuid);
                if (state) ac.restoreViewState(state);
                states.delete(doc.uuid);
            }
            ac._renderVisualTags();
            if (ac.isOpen) ac._renderOptions();
        };
        for (const playlistEl of root.querySelectorAll(".playlist")) {
            const playlist = game.playlists.get(playlistEl.dataset.entryId);
            if (!playlist) continue;
            add(playlistEl, playlist, ":scope > .playlist-header");
            for (const soundEl of playlistEl.querySelectorAll(".sound")) {
                const sound = playlist.sounds.get(soundEl.dataset.soundId);
                if (sound) add(soundEl, sound, ":scope > header");
            }
        }
        this._updateWizardButtons();
    }

    static _refreshDocument(uuid) {
        for (const ac of this.autocompletes.values()) {
            if (ac.document.uuid !== uuid) continue;
            ac._renderVisualTags();
            if (ac.isOpen) ac._renderOptions();
        }
    }

    static async deactivate() {
        if (!this.isActive || this.isSaving) return;
        this.isSaving = true;
        this._updateWizardButtons();
        let notification;
        if (TagManager.areNotificationsEnabled()) notification = ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.WizardSaving"), { permanent: true });
        try {
            const pending = [...this.drafts];
            const failures = [];
            // Bound writes and wait for every worker before cleanup or retry.
            await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
                while (pending.length) {
                    const [uuid, draft] = pending.shift();
                    const doc = fromUuidSync(uuid);
                    if (!doc) continue;
                    try {
                        await TagAssignmentManager.applySelection(doc, draft.selectedUuids, draft.baseline);
                        draft.baseline = new Set(TagAssignmentManager.getAssignedTags(doc).map(a => a.uuid));
                        draft.selectedUuids.clear();
                        draft.baseline.forEach(id => draft.selectedUuids.add(id));
                    } catch (error) { failures.push(error); }
                }
            }));
            if (failures.length) throw failures[0];
            this.isActive = false;
            for (const ac of this.autocompletes.values()) ac.destroy();
            this.autocompletes.clear();
            this.drafts.clear();
            this.viewStates.clear();
            for (const root of this.roots.values()) root.querySelectorAll(".audio-tagger-assigned-tags[data-document-uuid]").forEach(el => el.remove());
            if (TagManager.areNotificationsEnabled()) ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.WizardDeactivated"));
        } catch (error) {
            console.error("Audio Tagger | Wizard save failed; drafts retained", error);
            ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
        } finally {
            this.isSaving = false;
            if (notification !== undefined) ui.notifications.remove(notification);
            this._updateWizardButtons();
            TagManager.requestRender();
        }
    }

    static _updateWizardButtons() {
        for (const root of this.roots.values()) {
            const button = root.querySelector("#at-wizard-btn");
            if (!button) continue;
            button.disabled = this.isSaving;
            button.classList.toggle("active", this.isActive);
            button.querySelector("i").className = this.isActive ? "fas fa-save" : "fas fa-wand-magic-sparkles";
            button.title = game.i18n.localize(this.isActive ? "AUDIO_TAGGER.Save" : "AUDIO_TAGGER.TagWizard");
        }
    }

    static isWizardActive() { return this.isActive; }

    static removeTagFromDocument(uuid, tagUuid) {
        if (this.isSaving) return false;
        const draft = this.drafts.get(uuid);
        if (!draft?.selectedUuids.delete(tagUuid)) return false;
        this._refreshDocument(uuid);
        return true;
    }
}
