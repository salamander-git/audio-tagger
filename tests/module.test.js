import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { randomUUID } from "node:crypto";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true, url: "http://localhost" });
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "CustomEvent", "Event", "MouseEvent"]) {
    globalThis[key] = key === "window" ? dom.window : dom.window[key];
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const callbacks = new Map();
globalThis.Hooks = {
    on(name, fn) { if (!callbacks.has(name)) callbacks.set(name, []); callbacks.get(name).push(fn); },
    once(name, fn) { this.on(name, fn); },
    callAll(name, ...args) { for (const fn of callbacks.get(name) || []) fn(...args); }
};
const { TagManager } = await import("../scripts/core/TagManager.js");
const { normalizeHierarchy } = await import("../scripts/core/TagLayout.js");
const { PaletteRenderer } = await import("../scripts/ui/PaletteRenderer.js");
const { TagAutocomplete } = await import("../scripts/ui/TagAutocomplete.js");
const { TagWizard } = await import("../scripts/features/TagWizard.js");
const { TagAssignmentManager } = await import("../scripts/features/TagAssignmentManager.js");
const { DirectoryTagRenderer } = await import("../scripts/ui/DirectoryTagRenderer.js");
const { SearchIntegration } = await import("../scripts/features/SearchIntegration.js");
const { AudioPlaybackManager } = await import("../scripts/features/AudioPlaybackManager.js");
const { SmartPlaylistInjector } = await import("../scripts/features/SmartPlaylistInjector.js");
const { default: Sortable } = await import("../scripts/vendor/sortable.complete.esm.js");
await import("../scripts/main.js");

let settings, registrations, writes, docs, notifications, apps;
class Collection extends Map {
    [Symbol.iterator]() { return this.values(); }
}
function tag(uuid, extra = {}) {
    return { uuid, name: uuid, order: 0, backgroundColor: "#808080", textColor: "#ffffff", ...extra };
}
function seed(tags, hierarchy = {}) {
    settings.set("tags", Object.fromEntries(tags.map(t => [t.uuid, t])));
    settings.set("tagHierarchy", hierarchy);
    TagManager._invalidateCache();
}
function makeDoc(uuid, assignments = [], parent = null) {
    const doc = {
        uuid, id: uuid.split(".").at(-1), name: uuid, parent,
        documentName: parent ? "PlaylistSound" : "Playlist",
        flags: { "assigned-tags": structuredClone(assignments) }, updates: [],
        getFlag(_module, key) { return this.flags[key]; },
        async update(changes) {
            this.updates.push(structuredClone(changes));
            for (const [key, value] of Object.entries(changes)) {
                if (key.startsWith("flags.audio-tagger.")) {
                    const flag = key.slice("flags.audio-tagger.".length);
                    if (flag.startsWith("-=")) delete this.flags[flag.slice(2)];
                    else this.flags[flag] = structuredClone(value);
                } else this[key] = value;
            }
            Hooks.callAll("update" + this.documentName, this, changes);
            return this;
        }
    };
    if (!parent) {
        doc.sounds = new Collection();
        game.playlists.set(doc.id, doc);
    } else parent.sounds.set(doc.id, doc);
    docs.set(uuid, doc);
    return doc;
}
function directory(markup = "") {
    const element = document.createElement("section");
    element.innerHTML = `<input name="search"><div class="global-volume"></div>${markup}`;
    document.body.append(element);
    const app = { element };
    apps.push(app);
    return app;
}
function render(app) { Hooks.callAll("renderPlaylistDirectory", app, app.element); }
function playlistMarkup(playlist, sound) {
    return `<div class="playlist" data-entry-id="${playlist.id}"><header class="playlist-header">Playlist</header>
      ${sound ? `<div class="sound" data-sound-id="${sound.id}"><header>Sound</header></div>` : ""}</div>`;
}

beforeEach(async () => {
    await TagManager._writes.catch(() => {});
    settings = new Map(); registrations = new Map(); writes = []; docs = new Map(); notifications = []; apps = [];
    document.body.replaceChildren();
    globalThis.ui = { notifications: {
        info: (...args) => notifications.push(args), warn: (...args) => notifications.push(args),
        error: (...args) => notifications.push(args), remove() {}
    }};
    globalThis.foundry = {
        utils: { deepClone: structuredClone, randomID: () => randomUUID(),
            escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;") },
        applications: { api: { ApplicationV2: class {} }, sidebar: { tabs: {} }, ux: {} }
    };
    globalThis.game = {
        user: { isGM: true, id: "gm" }, users: { activeGM: { id: "gm" } },
        i18n: { localize: key => key, format: key => key },
        playlists: new Collection(),
        settings: {
            register(_module, key, config) { registrations.set(key, config); settings.set(key, structuredClone(config.default)); },
            registerMenu() {},
            get(_module, key) { return settings.get(key); },
            async set(_module, key, value) {
                writes.push({ key, value: structuredClone(value) });
                settings.set(key, structuredClone(value));
                registrations.get(key)?.onChange?.(value);
                return value;
            }
        }
    };
    globalThis.fromUuidSync = uuid => docs.get(uuid);
    TagManager._settingsRegistered = false;
    TagManager._renderPending = false;
    TagManager._invalidateCache();
    TagManager.registerSettings();
    settings.set("enableNotifications", false);
    TagAssignmentManager.invalidateIndex();
    TagAssignmentManager._documentWrites.clear();
    TagWizard.isActive = false;
    TagWizard.isSaving = false;
    TagWizard.drafts.clear();
    AudioPlaybackManager._currentSound = null;
});
afterEach(async () => {
    await TagManager._writes.catch(() => {});
    await Promise.allSettled([...TagAssignmentManager._documentWrites.values()]);
    for (const app of apps) Hooks.callAll("closePlaylistDirectory", app);
    for (const ac of TagWizard.autocompletes.values()) ac.destroy();
    TagWizard.autocompletes.clear();
    TagWizard.roots.clear();
    TagWizard.viewStates.clear();
    await new Promise(resolve => setTimeout(resolve, 0));
});

test("wizard search reset is a separate client setting, disabled by default", () => {
    const config = registrations.get("clearWizardSearch");
    assert.equal(config.scope, "client");
    assert.equal(config.config, true);
    assert.equal(config.default, false);
});

test("new tags retain folder type; concurrent tag creation preserves both records", async () => {
    seed([]);
    await Promise.all([TagManager.createTag({ uuid: "F", name: "Folder", isFolder: true }),
        TagManager.createTag({ uuid: "A", name: "A" })]);
    assert.equal(TagManager.getTag("F").isFolder, true);
    assert.deepEqual(Object.keys(TagManager.getTags()), ["F", "A"]);
});

test("deleting a folder promotes children in order without deleting assignments", async () => {
    seed([tag("F", { isFolder: true }), tag("C", { order: 2 }), tag("A", { order: 1 })], { C: "F" });
    const doc = makeDoc("Playlist.p", [{ uuid: "C" }]);
    await TagManager.deleteTag("F");
    assert.deepEqual(TagManager.getTagHierarchy(), {});
    assert.deepEqual(TagManager.getSortedTags().map(t => t.uuid), ["C", "A"]);
    assert.deepEqual(doc.flags["assigned-tags"], [{ uuid: "C" }]);
});

test("turning a nested folder into a tag releases children to its parent", async () => {
    seed([tag("P", { isFolder: true }), tag("F", { isFolder: true }), tag("C"), tag("D")],
        { F: "P", C: "F", D: "P" });
    await TagManager.updateTag("F", { isFolder: false });
    assert.deepEqual(TagManager.getTagHierarchy(), { F: "P", C: "P", D: "P" });
    assert.deepEqual(TagManager.getTagChildren("P"), ["F", "C", "D"]);
});

test("folder conversion preserves its position even with non-contiguous sibling orders", async () => {
    seed([tag("P", { isFolder: true }), tag("F", { isFolder: true, siblingOrder: 10 }),
        tag("C", { siblingOrder: 7 }), tag("D", { siblingOrder: 0 })],
        { F: "P", C: "F", D: "P" });
    await TagManager.updateTag("F", { isFolder: false });
    assert.deepEqual(TagManager.getTagChildren("P"), ["D", "F", "C"]);
});

test("invalid parents and cycles leave all tags reachable", () => {
    const tags = { A: tag("A", { isFolder: true }), B: tag("B", { isFolder: true }), C: tag("C") };
    assert.deepEqual(normalizeHierarchy({ A: "B", B: "A", C: "missing" }, tags), {});
});

test("brightness cache follows edits and never persists computed values", async () => {
    seed([tag("A", { backgroundColor: "#ffffff", _brightness: 255 }), tag("B")]);
    assert.equal(TagManager.getSortedTags("color-brightness-dark")[0].uuid, "B");
    await TagManager.updateTag("A", { backgroundColor: "#000000" });
    assert.equal(TagManager.getSortedTags("color-brightness-dark")[0].uuid, "A");
    assert.ok(Object.values(settings.get("tags")).every(t => !("_brightness" in t)));
});

test("default tags use one tag write", async () => {
    seed([]);
    await TagManager.initializeDefaultTags();
    assert.equal(writes.filter(w => w.key === "tags").length, 1);
    assert.equal(Object.keys(TagManager.getTags()).length, 31);
});

test("sort mode changes destroy old nested Sortables and initialize replacements", async () => {
    seed([tag("F", { isFolder: true }), tag("C")], { C: "F" });
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app);
    const old = [...view._sortables];
    const oldChild = view._elements.list.querySelector(".at-folder-children");
    await view._cycleSortMode();
    assert.equal(view._sortables.size, 2);
    assert.ok(old.every(sortable => sortable.el === null));
    const child = view._elements.list.querySelector(".at-folder-children");
    assert.notEqual(child, oldChild);
    assert.ok(Sortable.get(child));
    assert.equal(Sortable.get(child).option("forceFallback"), true);
});

test("Foundry partial renders preserve existing Sortables; full replacement cleans them", () => {
    seed([tag("A")]);
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app);
    const first = [...view._sortables][0];
    render(app);
    assert.equal([...view._sortables][0], first);
    app.element.innerHTML = '<div class="global-volume"></div>';
    render(app);
    assert.equal(first.el, null);
    assert.equal(view._sortables.size, 1);
});

test("sidebar and popout retain independent palettes and refuse cross-view moves", () => {
    seed([tag("A")]);
    const a = directory(), b = directory(); render(a); render(b);
    const va = PaletteRenderer.instances.get(a), vb = PaletteRenderer.instances.get(b);
    assert.notEqual(va._elements.list, vb._elements.list);
    const sa = [...va._sortables][0], sb = [...vb._sortables][0];
    assert.equal(sb.option("group").checkPut(sb, sa, va._elements.list.firstElementChild), false);
    Hooks.callAll("closePlaylistDirectory", a);
    assert.equal(sa.el, null);
    assert.ok(sb.el.isConnected);
});

test("unchanged drag performs no world setting writes", async () => {
    seed([tag("A")]);
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app), sortable = [...view._sortables][0];
    const list = view._elements.list;
    sortable.option("onStart")({ item: list.firstElementChild, from: list });
    await sortable.option("onEnd")({ item: list.firstElementChild, from: list, to: list });
    assert.equal(writes.length, 0);
    assert.equal(view._dragContext, null);
    assert.equal(view._containerSizes.size, 0);
});

test("right-zone insertion excludes the dragged item from index calculation", () => {
    seed([tag("F", { isFolder: true }), tag("A"), tag("B")]);
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app), list = view._elements.list;
    const folder = list.querySelector('[data-uuid="F"]'), item = list.querySelector('[data-uuid="A"]');
    list.prepend(item);
    folder.getBoundingClientRect = () => ({ left: 10, right: 100, top: 10, bottom: 100 });
    view._dragContext = { fromFolder: folder, lastMousePos: { x: 150, y: 50 } };
    view._applySpatialZonePosition({ item });
    assert.deepEqual([...list.children].map(el => el.dataset.uuid), ["F", "A", "B"]);
    view._cleanupDrag();
});

test("explicit nested ordering survives serialization of hierarchy with different key order", async () => {
    seed([tag("F", { isFolder: true }), tag("A"), tag("B")], { A: "F", B: "F" });
    await TagManager.saveLayout({ hierarchy: { B: "F", A: "F" }, groups: { "": ["F"], F: ["B", "A"] } });
    settings.set("tagHierarchy", { A: "F", B: "F" });
    TagManager._invalidateCache();
    assert.deepEqual(TagManager.getTagChildren("F"), ["B", "A"]);
});

test("layout refuses a stale drag snapshot without overwriting newer tags", async () => {
    seed([tag("A")]);
    const revision = TagManager.revision;
    await TagManager.createTag({ uuid: "B", name: "B" });
    writes.length = 0;
    await assert.rejects(TagManager.saveLayout({ hierarchy: {}, groups: { "": ["A"] } }, revision));
    assert.equal(writes.length, 0);
    assert.ok(TagManager.getTag("B"));
});

test("assignment batch uses one update and preserves untouched assignment metadata", async () => {
    seed([tag("A"), tag("B"), tag("C")]);
    const existing = { uuid: "A", assignedAt: 123, snapshot: { name: "Old A" } };
    const doc = makeDoc("Playlist.p", [existing]);
    await TagAssignmentManager.applySelection(doc, ["A", "B", "C"], ["A"]);
    assert.equal(doc.updates.length, 1);
    assert.deepEqual(doc.flags["assigned-tags"][0], existing);
    assert.equal(doc.flags.search, "a b c");
});

test("assignment deltas preserve concurrent remote additions and serialize local edits", async () => {
    seed([tag("A"), tag("B"), tag("C"), tag("D")]);
    const doc = makeDoc("Playlist.p", [{ uuid: "A" }, { uuid: "C" }]);
    await Promise.all([
        TagAssignmentManager.applySelection(doc, ["B"], ["A"]),
        TagAssignmentManager.assignTag(doc, "D")
    ]);
    assert.deepEqual(doc.flags["assigned-tags"].map(a => a.uuid), ["C", "B", "D"]);
});

test("recovery and external update hooks invalidate an already-built index", async () => {
    seed([tag("A")]);
    TagAssignmentManager.rebuildIndex();
    const doc = makeDoc("Playlist.p", [{ uuid: "A" }]);
    await TagAssignmentManager.recoverTags(doc);
    assert.deepEqual(TagAssignmentManager.getDocumentsWithTag("A"), [doc]);
    await doc.update({ "flags.audio-tagger.-=assigned-tags": null });
    assert.deepEqual(TagAssignmentManager.getDocumentsWithTag("A"), []);
});

function autocomplete() {
    seed([tag("B", { name: "Battle" }), tag("F", { name: "Forest" })]);
    const doc = makeDoc("Playlist.p");
    const app = directory(playlistMarkup(doc));
    const header = app.element.querySelector("header");
    const button = document.createElement("i"); header.append(button);
    const ac = new TagAutocomplete(doc, button);
    return { ac, doc, app };
}

test("autocomplete is lazy; disabled reset preserves query after selection", () => {
    const { ac } = autocomplete();
    assert.equal(document.querySelector(".at-ac-dropdown"), null);
    ac._openDropdown();
    ac.searchInput.value = ac.searchQuery = "Ba";
    ac._renderOptions();
    ac.optionsContainer.firstElementChild.click();
    assert.equal(ac.searchInput.value, "Ba");
    assert.equal(ac.searchQuery, "Ba");
    assert.equal(ac.isOpen, true);
    ac.destroy();
});

test("enabled reset clears query, cancels debounce, restores all options and focus", async () => {
    const { ac, doc } = autocomplete();
    settings.set("clearWizardSearch", true);
    ac._openDropdown();
    ac.searchInput.value = "Ba";
    ac.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    ac._renderOptions();
    ac.optionsContainer.firstElementChild.click();
    assert.equal(ac.searchInput.value, "");
    assert.equal(ac.searchQuery, "");
    assert.equal(ac.optionsContainer.children.length, 2);
    assert.equal(document.activeElement, ac.searchInput);
    assert.equal(ac.isOpen, true);
    assert.equal(doc.updates.length, 0);
    await new Promise(resolve => setTimeout(resolve, 170));
    assert.equal(ac.searchQuery, "");
    ac.searchInput.value = ac.searchQuery = "Ba";
    ac._toggleTag("B"); // Removal via a chip must not clear the query.
    assert.equal(ac.searchQuery, "Ba");
    ac.destroy();
    assert.equal(TagAutocomplete._outsideRegistries.has(document), false);
});

test("reopening and restoring a dropdown render the same query shown in its input", () => {
    const { ac } = autocomplete();
    ac.restoreViewState({ isOpen: true, searchQuery: "Ba", focused: false });
    assert.equal(ac.searchInput.value, "Ba");
    assert.equal(ac.optionsContainer.children.length, 1);
    ac._closeDropdown(); ac._openDropdown();
    assert.equal(ac.searchInput.value, "");
    assert.equal(ac.optionsContainer.children.length, 2);
    ac.destroy();
});

test("wizard saves drafts for rows removed by a Foundry render", async () => {
    seed([tag("A")]);
    const playlist = makeDoc("Playlist.p"), sound = makeDoc("Playlist.p.PlaylistSound.s", [], playlist);
    const app = directory(playlistMarkup(playlist, sound)); render(app);
    TagWizard.activate();
    const ac = [...TagWizard.autocompletes.values()].find(a => a.document === sound);
    ac._toggleTag("A");
    app.element.querySelector(".sound").remove();
    render(app);
    await TagWizard.deactivate();
    assert.deepEqual(sound.flags["assigned-tags"].map(a => a.uuid), ["A"]);
    assert.equal(sound.updates.length, 1);
    assert.equal(TagWizard.isActive, false);
});

test("wizard partial render does not duplicate plus buttons or lose a search", () => {
    seed([tag("A")]);
    const playlist = makeDoc("Playlist.p");
    const app = directory(playlistMarkup(playlist)); render(app);
    TagWizard.activate();
    const ac = [...TagWizard.autocompletes.values()][0];
    ac.restoreViewState({ isOpen: true, searchQuery: "A", focused: true });
    render(app); render(app);
    assert.equal(app.element.querySelectorAll(".at-header-add-btn").length, 1);
    assert.equal([...TagWizard.autocompletes.values()][0], ac);
    assert.equal(ac.searchInput.value, "A");
});

test("playlist rendering never edits a descendant sound's tag container", () => {
    seed([tag("A")]);
    const playlist = makeDoc("Playlist.p");
    const sound = makeDoc("Playlist.p.PlaylistSound.s", [{ uuid: "A" }], playlist);
    const app = directory(playlistMarkup(playlist, sound));
    DirectoryTagRenderer.render(app.element);
    const container = app.element.querySelector(".sound .audio-tagger-assigned-tags");
    DirectoryTagRenderer.render(app.element);
    assert.equal(container.isConnected, true);
    assert.equal(container.children.length, 1);
    assert.equal(app.element.querySelector(".playlist > .audio-tagger-assigned-tags"), null);
});

test("search cache retains AND/partial matching and follows renamed tags", async () => {
    seed([tag("A", { name: "Battle" })]);
    const doc = makeDoc("Playlist.p", [{ uuid: "A" }]);
    doc.name = "Forest drums";
    const clean = s => s.toLowerCase();
    assert.equal(SearchIntegration._documentMatchesAllTerms(doc, ["for", "ba"], clean), true);
    assert.equal(SearchIntegration._documentMatchesAllTerms(doc, ["ocean", "ba"], clean), false);
    await TagManager.updateTag("A", { name: "Calm" });
    assert.equal(SearchIntegration._documentMatchesAllTerms(doc, ["ba"], clean), false);
});

test("rapid playback requests stop the previous sound before starting the next", async () => {
    const events = [];
    const sound = id => ({ playing: false, name: id, async update({ playing }) {
        await new Promise(resolve => setTimeout(resolve, 2));
        this.playing = playing; events.push(`${id}:${playing}`);
    }});
    const a = sound("A"), b = sound("B");
    await Promise.all([AudioPlaybackManager.playSound(a), AudioPlaybackManager.playSound(b)]);
    assert.deepEqual(events, ["A:true", "A:false", "B:true"]);
});

test("Escape cancels a drag and restores saved order without a write", () => {
    seed([tag("A"), tag("B", { order: 1 })]);
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app), sortable = [...view._sortables][0];
    const list = view._elements.list, item = list.firstElementChild;
    sortable.option("onStart")({ item, from: list });
    list.append(item);
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.deepEqual([...view._elements.list.children].map(el => el.dataset.uuid), ["A", "B"]);
    assert.equal(writes.length, 0);
    assert.equal(view._dragContext, null);
    assert.equal(view._containerSizes.size, 0);
});

test("a Foundry full render cancels an active drag without saving detached DOM", async () => {
    seed([tag("A"), tag("B", { order: 1 })]);
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app), sortable = [...view._sortables][0];
    const oldList = view._elements.list, item = oldList.firstElementChild;
    const end = sortable.option("onEnd");
    sortable.option("onStart")({ item, from: oldList });
    oldList.append(item);
    app.element.innerHTML = '<div class="global-volume"></div>';
    render(app);
    await end({ item, from: oldList });
    assert.equal(writes.length, 0);
    assert.deepEqual([...view._elements.list.children].map(el => el.dataset.uuid), ["A", "B"]);
});

test("Foundry can replace the DOM during an in-flight drag save", async () => {
    seed([tag("A"), tag("B", { order: 1 })]);
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app), sortable = [...view._sortables][0];
    const list = view._elements.list, item = list.firstElementChild;
    const originalSet = game.settings.set;
    let release, started;
    const began = new Promise(resolve => { started = resolve; });
    game.settings.set = async (...args) => {
        started();
        await new Promise(resolve => { release = resolve; });
        return originalSet(...args);
    };
    sortable.option("onStart")({ item, from: list });
    list.append(item);
    const saving = sortable.option("onEnd")({ item, from: list });
    await began;
    app.element.innerHTML = '<div class="global-volume"></div>';
    render(app);
    assert.ok(app.element.querySelector("#audio-tagger-palette"));
    release();
    await saving;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(view._isSaving, false);
    assert.deepEqual([...view._elements.list.children].map(el => el.dataset.uuid), ["B", "A"]);
});

test("failed drag save cleans up and restores the persisted layout", async t => {
    seed([tag("A"), tag("B", { order: 1 })]);
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app), sortable = [...view._sortables][0];
    const list = view._elements.list, item = list.firstElementChild;
    t.mock.method(console, "error", () => {});
    game.settings.set = async () => { throw new Error("Disconnected"); };
    sortable.option("onStart")({ item, from: list });
    list.append(item);
    await sortable.option("onEnd")({ item, from: list });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual([...view._elements.list.children].map(el => el.dataset.uuid), ["A", "B"]);
    assert.equal(view._isSaving, false);
    assert.equal(view._dragController, null);
    assert.equal(view._containerSizes.size, 0);
    assert.equal(notifications.length, 1);
});

test("failed Wizard writes retain drafts, re-enable controls and can be retried", async t => {
    seed([tag("A")]);
    const playlist = makeDoc("Playlist.p");
    const app = directory(playlistMarkup(playlist)); render(app);
    TagWizard.activate();
    [...TagWizard.autocompletes.values()][0]._toggleTag("A");
    const update = playlist.update.bind(playlist);
    playlist.update = async () => { throw new Error("Disconnected"); };
    t.mock.method(console, "error", () => {});
    await TagWizard.deactivate();
    assert.equal(TagWizard.isActive, true);
    assert.equal(TagWizard.isSaving, false);
    assert.equal(TagWizard.drafts.get(playlist.uuid).selectedUuids.has("A"), true);
    playlist.update = update;
    await TagWizard.deactivate();
    assert.equal(TagWizard.isActive, false);
    assert.deepEqual(playlist.flags["assigned-tags"].map(a => a.uuid), ["A"]);
});

test("top and bottom spatial drops choose the row neighboring the source folder", () => {
    const view = new PaletteRenderer();
    const item = (top, folder = false) => ({
        classList: { contains: () => folder },
        getBoundingClientRect: () => ({ left: 10, right: 30, top })
    });
    const folder = item(100, true);
    const items = [item(0), item(80), folder, item(160), item(200)];
    assert.equal(view._findBestHorizontalPosition(10, items, 2, "before", folder), 1);
    assert.equal(view._findBestHorizontalPosition(30, items, 3, "after", folder), 4);
});

test("search extension uses the calling directory and retains native name hits", () => {
    seed([tag("A", { name: "Battle" })]);
    const playlist = makeDoc("Playlist.p", [{ uuid: "A" }]);
    class Directory {
        _matchSearchEntries(_query, entries) { entries.add("native-hit"); }
    }
    foundry.applications.sidebar.tabs.PlaylistDirectory = Directory;
    SearchIntegration._patchSearch();
    const first = directory(), second = directory();
    first.element.querySelector("input").value = "Ocean";
    second.element.querySelector("input").value = "Ba";
    const view = new Directory();
    view.element = second.element;
    view.collection = game.playlists;
    const entries = new Set();
    view._matchSearchEntries(/ba/i, entries, new Set(), new Set(), {});
    assert.equal(entries.has("native-hit"), true);
    assert.equal(entries.has(playlist.id), true);
});

test("Smart Playlist selections belong to their own config application", () => {
    seed([tag("A"), tag("B")]);
    const first = directory('<div class="form-group slim"></div>');
    const second = directory('<div class="form-group slim"></div>');
    first.document = makeDoc("Playlist.one");
    second.document = makeDoc("Playlist.two");
    SmartPlaylistInjector._injectUI(first, first.element);
    first.element.querySelector('[data-uuid="A"]').click();
    SmartPlaylistInjector._injectUI(second, second.element);
    second.element.querySelector('[data-uuid="B"]').click();
    assert.deepEqual([...SmartPlaylistInjector._selections.get(first)], ["A"]);
    assert.deepEqual([...SmartPlaylistInjector._selections.get(second)], ["B"]);
});

test("module refresh preserves native controls, input focus and document drag events", async () => {
    seed([tag("A")]);
    const playlist = makeDoc("Playlist.p");
    const app = directory(playlistMarkup(playlist));
    const nativeButton = document.createElement("button");
    nativeButton.textContent = "Native play";
    app.element.querySelector(".playlist-header").append(nativeButton);
    let clicks = 0, drags = 0, renders = 0;
    nativeButton.addEventListener("click", () => clicks++);
    app.element.addEventListener("dragstart", () => drags++);
    app.render = () => renders++;
    render(app);
    const input = app.element.querySelector("input");
    input.focus();
    input.value = "Ba";
    await TagManager.updateTag("A", { name: "Battle" });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(nativeButton.isConnected, true);
    assert.equal(document.activeElement, input);
    assert.equal(input.value, "Ba");
    nativeButton.click();
    nativeButton.dispatchEvent(new Event("dragstart", { bubbles: true }));
    assert.equal(clicks, 1);
    assert.equal(drags, 1);
    assert.equal(renders, 0);
});

test("repeated palette rebuilds release every replaced Sortable", () => {
    seed([tag("F", { isFolder: true }), tag("A")], { A: "F" });
    const app = directory(); render(app);
    const view = PaletteRenderer.instances.get(app), retired = [];
    for (let i = 0; i < 20; i++) {
        retired.push(...view._sortables);
        view._renderTags();
        assert.equal(view._sortables.size, 2);
    }
    assert.ok(retired.every(sortable => sortable.el === null));
    assert.equal(app.element.querySelectorAll("#audio-tagger-palette").length, 1);
});

test("hierarchy playback retains playlist inheritance and full ancestor matching", () => {
    seed([tag("F", { isFolder: true }), tag("A"), tag("B")], { A: "F" });
    const playlist = makeDoc("Playlist.p", [{ uuid: "F" }]);
    const matches = makeDoc("Playlist.p.PlaylistSound.one", [{ uuid: "A" }], playlist);
    makeDoc("Playlist.p.PlaylistSound.two", [{ uuid: "B" }], playlist);
    const other = makeDoc("Playlist.other");
    makeDoc("Playlist.other.PlaylistSound.three", [{ uuid: "A" }], other);
    assert.deepEqual(AudioPlaybackManager.getSoundsMatchingTagHierarchy("A"), [matches]);
});

test("Smart Playlist inclusive/exclusive matching keeps its existing direct-tag semantics", () => {
    seed([tag("A"), tag("B")]);
    const playlist = makeDoc("Playlist.p", [{ uuid: "B" }]);
    const exact = makeDoc("Playlist.p.PlaylistSound.one", [{ uuid: "A" }], playlist);
    const both = makeDoc("Playlist.p.PlaylistSound.two", [{ uuid: "A" }, { uuid: "B" }], playlist);
    assert.deepEqual(SmartPlaylistInjector._findMatchingSounds(["A"], false), [exact, both]);
    assert.deepEqual(SmartPlaylistInjector._findMatchingSounds(["A"], true), [exact]);
});

test("shared Wizard drafts survive closing one directory view", async () => {
    seed([tag("A")]);
    const playlist = makeDoc("Playlist.p");
    const first = directory(playlistMarkup(playlist)), second = directory(playlistMarkup(playlist));
    render(first); render(second); TagWizard.activate();
    const ac = [...TagWizard.autocompletes.values()][0];
    ac._toggleTag("A");
    assert.equal(second.element.querySelectorAll(".at-pending-tag").length, 1);
    Hooks.callAll("closePlaylistDirectory", first);
    await TagWizard.deactivate();
    assert.deepEqual(playlist.flags["assigned-tags"].map(a => a.uuid), ["A"]);
    assert.equal(playlist.updates.length, 1);
});
