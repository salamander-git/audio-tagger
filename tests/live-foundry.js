/**
 * Opt-in integration checks in a running GM client, invoked from a script macro:
 * await (await import("/modules/audio-tagger/qa-live.js")).run();
 * Deploy this file temporarily as qa-live.js; it is not a runtime module.
 * Creates disposable tags/playlists and restores client preferences in finally.
 */
export async function run() {
    const base = "/modules/audio-tagger/scripts/";
    const { TagManager: tags } = await import(base + "core/TagManager.js");
    const { TagAssignmentManager: assignments } = await import(base + "features/TagAssignmentManager.js");
    const { TagWizard: wizard } = await import(base + "features/TagWizard.js");
    const { PaletteRenderer: palettes } = await import(base + "ui/PaletteRenderer.js");
    const { default: Sortable } = await import(base + "vendor/sortable.complete.esm.js");
    if (!game.user.isGM || wizard.isActive) throw new Error("Requires a GM with no active Wizard draft.");
    const report = { version: game.version, checks: [], errors: [], cleaned: false };
    const check = (name, condition) => {
        report.checks.push({ name, passed: !!condition });
        if (!condition) throw new Error(name);
    };
    const tick = () => new Promise(resolve => setTimeout(resolve, 200));
    const prefs = Object.fromEntries(["clearWizardSearch", "sortMode", "paletteCollapsed"]
        .map(key => [key, game.settings.get("audio-tagger", key)]));
    const originalTags = foundry.utils.deepClone(tags.getTags());
    const originalHierarchy = foundry.utils.deepClone(tags.getTagHierarchy());
    const originalPlaying = game.playlists.contents.flatMap(p => p.sounds.filter(s => s.playing).map(s => s.uuid));
    const created = [];
    let playlist, popout;
    try {
        check("reset is opt-in client setting", game.settings.settings.get("audio-tagger.clearWizardSearch").default === false
            && game.settings.settings.get("audio-tagger.clearWizardSearch").scope === "client");
        for (const [name, isFolder] of [["AT QA Folder", true], ["AT QA Alpha", false], ["AT QA Beta", false]]) {
            created.push(await tags.createTag({ name, isFolder }));
        }
        const [folder, alpha, beta] = created;
        await tags.setTagParent(alpha.uuid, folder.uuid);
        await tags.setTagParent(beta.uuid, folder.uuid);
        playlist = await Playlist.create({
            name: "AT QA disposable playlist", mode: -1,
            sounds: [{ name: "AT QA track", path: "sounds/notify.wav", volume: 0, playing: false }],
            flags: { "audio-tagger": { qaSentinel: "preserve" } }
        });
        const sound = playlist.sounds.contents[0];
        await Promise.all([assignments.assignTag(playlist, alpha.uuid), assignments.assignTag(playlist, beta.uuid)]);
        check("concurrent assignments persist", assignments.getAssignedTags(playlist).length === 2);
        check("unrelated flags preserved", playlist.getFlag("audio-tagger", "qaSentinel") === "preserve");
        await assignments.assignTag(sound, alpha.uuid);
        check("embedded PlaylistSound flags persist", assignments.getAssignedTags(sound)[0]?.uuid === alpha.uuid);
        await assignments.unassignTag(sound, alpha.uuid);
        check("last assignment removed with Foundry deletion keys", assignments.getAssignedTags(sound).length === 0);
        await game.settings.set("audio-tagger", "sortMode", "order");
        await game.settings.set("audio-tagger", "paletteCollapsed", false);
        await ui.playlists.render({ force: true });
        await ui.playlists.activate();
        await tick();
        let view = palettes.instances.get(ui.playlists);
        check("v14 directory receives one palette", ui.playlists.element.querySelectorAll("#audio-tagger-palette").length === 1);
        const expectedSortables = 1 + view._elements.list.querySelectorAll(".at-folder-children").length;
        check("root and folder own bundled Sortables", view._sortables.size === expectedSortables
            && [...view._sortables].every(s => s instanceof Sortable && s.option("forceFallback")));
        for (let i = 0; i < 4; i++) {
            const old = [...view._sortables];
            view._renderTags(true);
            check(`rebuild ${i + 1} destroys old Sortables`, old.every(s => !s.el) && view._sortables.size === expectedSortables);
        }
        const layout = view._readLayout();
        layout.groups[folder.uuid].reverse();
        await tags.saveLayout(layout, tags.revision);
        check("nested order persists in world settings", tags.getTagChildren(folder.uuid).join() === [beta.uuid, alpha.uuid].join());
        await ui.playlists.render({ force: true });
        await tick();
        view = palettes.instances.get(ui.playlists);
        check("nested order restored after core render", view._readLayout().groups[folder.uuid].join() === [beta.uuid, alpha.uuid].join());
        wizard.activate();
        let ac = [...wizard.autocompletes.values()].find(a => a.document.uuid === playlist.uuid);
        check("v14 playlist header receives Wizard control", !!ac);
        check("v14 sound header receives Wizard control",
            [...wizard.autocompletes.values()].some(a => a.document.uuid === sound.uuid));
        ac.button.click();
        await game.settings.set("audio-tagger", "clearWizardSearch", false);
        ac.searchInput.value = "AT QA";
        ac.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        await tick();
        ac.optionsContainer.querySelector(`[data-uuid="${folder.uuid}"]`).click();
        check("disabled preference preserves query", ac.searchInput.value === "AT QA");
        ac.optionsContainer.querySelector(`[data-uuid="${folder.uuid}"]`).click();
        await game.settings.set("audio-tagger", "clearWizardSearch", true);
        ac.optionsContainer.querySelector(`[data-uuid="${folder.uuid}"]`).click();
        check("enabled preference clears query and focuses input", ac.searchInput.value === ""
            && ac.searchQuery === "" && document.activeElement === ac.searchInput);
        await tick();
        check("debounce cannot restore old query", ac.searchInput.value === "" && ac.optionsContainer.children.length === Object.keys(tags.getTags()).length);
        const oldButton = ac.button;
        await ui.playlists.render({ force: true });
        await tick();
        ac = [...wizard.autocompletes.values()].find(a => a.document.uuid === playlist.uuid);
        check("draft survives Foundry full render", ac.selectedUuids.has(folder.uuid));
        check("one add button per playlist", ac.button.parentElement.querySelectorAll(".at-header-add-btn").length === 1);
        report.replacedHeader = oldButton !== ac.button;
        popout = await ui.playlists.renderPopout();
        await tick();
        const popview = palettes.instances.get(popout);
        check("sidebar popout owns independent palette", !!popview && popview !== palettes.instances.get(ui.playlists));
        const root = [...view._sortables][0];
        const other = [...popview._sortables][0];
        check("cross-view tag transfer rejected", !other.option("group").checkPut(other, root, view._elements.list.firstElementChild));
        await popout.close();
        check("closing popout cleans its Sortables", !palettes.instances.has(popout) && popview._sortables.size === 0);
        popout = null;
        await wizard.deactivate();
        check("Wizard saves draft to real document", !wizard.isActive
            && assignments.getAssignedTags(playlist).some(a => a.uuid === folder.uuid));
        await tick();
        const row = ui.playlists.element.querySelector(`[data-entry-id="${playlist.id}"]`);
        check("assigned tags remain after Wizard exits", !!row?.querySelector(":scope > .audio-tagger-assigned-tags"));
        check("core volume controls remain", !!ui.playlists.element.querySelector(".global-volume input"));
    } catch (error) {
        report.errors.push(error.stack || String(error));
    } finally {
        try {
            if (popout) await popout.close();
            if (wizard.isActive) await wizard.deactivate();
            if (playlist) await playlist.delete();
            // Delete children before parent to avoid promoting test children.
            for (const tag of [...created].reverse()) await tags.deleteTag(tag.uuid);
            for (const [key, value] of Object.entries(prefs)) await game.settings.set("audio-tagger", key, value);
            await tick();
            report.originalTagsUnchanged = JSON.stringify(tags.getTags()) === JSON.stringify(originalTags);
            report.originalHierarchyUnchanged = JSON.stringify(tags.getTagHierarchy()) === JSON.stringify(originalHierarchy);
            report.audioUnchanged = JSON.stringify(game.playlists.contents.flatMap(p => p.sounds.filter(s => s.playing).map(s => s.uuid)))
                === JSON.stringify(originalPlaying);
            report.cleaned = !game.playlists.has(playlist?.id) && created.every(tag => !tags.getTag(tag.uuid));
        } catch (error) { report.errors.push("cleanup: " + error.stack); }
        console.log("AT-QA REPORT", JSON.stringify(report));
    }
    return report;
}

let dragFixture;
const dragStorageKey = () => `audio-tagger-qa-drag-${game.world.id}-${game.user.id}`;

/** Leave only disposable fixtures for an actual mouse drag, then call finishDrag. */
export async function prepareDrag() {
    if (dragFixture || sessionStorage.getItem(dragStorageKey())) throw new Error("Clean up the previous drag fixture first.");
    const { TagManager: tags } = await import("/modules/audio-tagger/scripts/core/TagManager.js");
    const { PaletteRenderer: palettes } = await import("/modules/audio-tagger/scripts/ui/PaletteRenderer.js");
    const state = dragFixture = {
        tags, palettes, created: [], originalTags: JSON.stringify(tags.getTags()),
        hierarchy: JSON.stringify(tags.getTagHierarchy()),
        prefs: Object.fromEntries(["sortMode", "paletteCollapsed"].map(k => [k, game.settings.get("audio-tagger", k)]))
    };
    const remember = () => {
        const { tags: _tags, palettes: _palettes, ...snapshot } = state;
        sessionStorage.setItem(dragStorageKey(), JSON.stringify(snapshot));
    };
    remember();
    for (const [name, isFolder] of [["AT QA Drag Folder", true], ["AT QA Drag Alpha", false], ["AT QA Drag Beta", false]]) {
        state.created.push(await tags.createTag({ name, isFolder }));
        remember();
    }
    const [folder, alpha, beta] = state.created;
    await tags.setTagParent(alpha.uuid, folder.uuid);
    await tags.setTagParent(beta.uuid, folder.uuid);
    await game.settings.set("audio-tagger", "sortMode", "order");
    await game.settings.set("audio-tagger", "paletteCollapsed", false);
    await ui.playlists.activate();
    await ui.playlists.render({ force: true });
    console.log("AT-QA DRAG READY", JSON.stringify(state.created.map(t => ({ name: t.name, uuid: t.uuid }))));
}

export async function finishDrag() {
    if (!dragFixture) {
        const saved = sessionStorage.getItem(dragStorageKey());
        if (!saved) throw new Error("No drag fixture.");
        const { TagManager: tags } = await import("/modules/audio-tagger/scripts/core/TagManager.js");
        const { PaletteRenderer: palettes } = await import("/modules/audio-tagger/scripts/ui/PaletteRenderer.js");
        dragFixture = { ...JSON.parse(saved), tags, palettes };
    }
    const state = dragFixture;
    const [folder, alpha, beta] = state.created;
    const order = state.tags.getTagChildren(folder.uuid);
    const view = state.palettes.instances.get(ui.playlists);
    const report = {
        order, reordered: order.join() === [beta.uuid, alpha.uuid].join(),
        cleanDragState: !view._dragContext && !view._isSaving,
        noGhosts: !document.querySelector(".audio-tagger-fallback"),
        sortablesEnabled: [...view._sortables].every(s => !s.option("disabled"))
    };
    await ui.playlists.render({ force: true });
    report.persistedAfterRender = state.palettes.instances.get(ui.playlists)._readLayout()
        .groups[folder.uuid]?.join() === order.join();
    for (const tag of [...state.created].reverse()) await state.tags.deleteTag(tag.uuid);
    for (const [key, value] of Object.entries(state.prefs)) await game.settings.set("audio-tagger", key, value);
    report.originalTagsUnchanged = JSON.stringify(state.tags.getTags()) === state.originalTags;
    report.originalHierarchyUnchanged = JSON.stringify(state.tags.getTagHierarchy()) === state.hierarchy;
    sessionStorage.removeItem(dragStorageKey());
    dragFixture = null;
    console.log("AT-QA DRAG REPORT", JSON.stringify(report));
    return report;
}
