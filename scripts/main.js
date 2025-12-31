
import Sortable from "./sortable.esm.js";

const MODULE_ID = "audio-tagger";
const SETTING_TAGS = "tags";
const SETTING_PRESETS = "presets";

// Helper to generate UUID for a tag
function generateTagUuid() {
    const id = foundry.utils.randomID();
    // Using "Tag" as the documentName to create a UUID like "Tag.<ID>"
    // This satisfies the user requirement to use buildUuid
    return foundry.utils.buildUuid({ id, documentName: "Tag" });
}

const DEFAULT_TAGS = [
    { uuid: "Tag.tag1default", text: "Мрачняк", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag2default", text: "Героика", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag3default", text: "Таверна", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag4default", text: "Мистика", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag5default", text: "Магия", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag6default", text: "Боевая", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag7default", text: "ТПК", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag8default", text: "Пиратская", bg: "#6c757d", color: "#ffffff" },
    { uuid: "Tag.tag9default", text: "Величественная", bg: "#6c757d", color: "#ffffff" }
];

const DEFAULT_PRESETS = [
    "#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#ff924c",
    "#e76f51", "#2a9d8f", "#264653", "#f4a261", "#e9c46a", "#a8dadc"
];

Hooks.once("init", () => {
    game.settings.register(MODULE_ID, SETTING_TAGS, {
        name: "Tags",
        scope: "world",
        config: false,
        type: Object,
        default: DEFAULT_TAGS,
        onChange: () => {
             ui.playlists.render();
        }
    });

    game.settings.register(MODULE_ID, SETTING_PRESETS, {
        name: "Color Presets",
        scope: "world",
        config: false,
        type: Object,
        default: DEFAULT_PRESETS
    });

    game.settings.register(MODULE_ID, "paletteCollapsed", {
        name: "Palette Collapsed State",
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });
});

Hooks.on("renderPlaylistDirectory", (app, html, context) => {
    injectTagPalette(html);
    setupSearch(html);
});

function getTags() {
    return game.settings.get(MODULE_ID, SETTING_TAGS) || [];
}

async function saveTags(tags) {
    await game.settings.set(MODULE_ID, SETTING_TAGS, tags);
}

function getPresets() {
    return game.settings.get(MODULE_ID, SETTING_PRESETS) || [];
}

async function savePresets(presets) {
    await game.settings.set(MODULE_ID, SETTING_PRESETS, presets);
}

function injectTagPalette(html) {
    html = $(html);
    
    // Remove existing palette to prevent duplicates
    html.find("#audio-tagger-palette").remove();

    const globalVolume = html.find(".global-volume");
    const directoryList = html.find(".directory-list");
    
    if (globalVolume.length === 0 || directoryList.length === 0) return;

    const tags = getTags();
    // Retrieve collapsed state from settings or local storage if needed, 
    // but for now we'll default to false or try to read from DOM if we hadn't removed it?
    // Since we remove it, we lose state. Let's use a module setting for collapsed state or just keep it simple for now.
    // The user didn't explicitly ask for state persistence, but complained about duplicates.
    const isCollapsed = game.settings.get(MODULE_ID, "paletteCollapsed") ?? false; 

    const paletteHtml = `
    <div class="audio-tagger-container" id="audio-tagger-palette">
        <header class="audio-tagger-header" id="at-header">
            <span>Палитра тэгов</span>
            <i class="fas fa-chevron-up audio-tagger-toggle-icon ${isCollapsed ? 'collapsed' : ''}" id="at-toggle-icon"></i>
        </header>

        <section class="audio-tagger-spoiler ${isCollapsed ? 'collapsed' : ''}" id="at-spoiler">
            <div class="audio-tagger-list" id="at-list">
                ${tags.map((tag, index) => renderTag(tag, index)).join("")}
            </div>
            <button class="audio-tagger-add-button" id="at-add-btn" title="Добавить тэг">
                <i class="fas fa-plus-circle"></i>
                <span>Создать тэг</span>
            </button>
            <footer class="audio-tagger-counter">
                Количество тэгов: <span id="at-count">${tags.length}</span>
            </footer>
        </section>
    </div>
    `;

    globalVolume.after(paletteHtml);

    const palette = html.find("#audio-tagger-palette");
    
    palette.find("#at-header").click(async (e) => {
        const spoiler = palette.find("#at-spoiler");
        const icon = palette.find("#at-toggle-icon");
        spoiler.toggleClass("collapsed");
        icon.toggleClass("collapsed");
        await game.settings.set(MODULE_ID, "paletteCollapsed", spoiler.hasClass("collapsed"));
    });

    palette.find("#at-add-btn").click((e) => {
        e.preventDefault();
        e.stopPropagation();
        openTagEditor();
    });

    palette.find("#at-list").on("click", ".edit-btn", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tagUuid = $(e.currentTarget).closest(".audio-tagger-item").data("uuid");
        const tag = getTags().find(t => t.uuid === tagUuid);
        if (tag) openTagEditor(tag);
    });

    palette.find("#at-list").on("click", ".delete-btn", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tagUuid = $(e.currentTarget).closest(".audio-tagger-item").data("uuid");
        if (confirm("Удалить тэг?")) {
            const newTags = getTags().filter(t => t.uuid !== tagUuid);
            saveTags(newTags);
        }
    });

    // SortableJS Initialization
    const list = palette.find("#at-list")[0];
    new Sortable(list, {
        animation: 150,
        handle: ".drag-handle",
        ghostClass: "sortable-ghost",
        onEnd: (evt) => {
            const newTags = [];
            const currentTags = getTags();
            
            $(list).find('.audio-tagger-item').each((i, el) => {
                const uuid = $(el).data('uuid');
                const tag = currentTags.find(t => t.uuid === uuid);
                if (tag) newTags.push(tag);
            });
            
            saveTags(newTags);
        }
    });
}

function renderTag(tag, index) {
    return `
    <div class="audio-tagger-item" data-uuid="${tag.uuid}" data-index="${index}" style="background-color: ${tag.bg}; color: ${tag.color};">
        <i class="fas fa-grip-vertical drag-handle"></i>
        <span>${tag.text}</span>
        <div class="audio-tagger-btn edit-btn"><i class="fas fa-pencil"></i></div>
        <div class="audio-tagger-btn delete-btn"><i class="fas fa-times"></i></div>
    </div>
    `;
}

async function openTagEditor(tag = null) {
    const isCreating = !tag;
    let presets = getPresets();

    const renderContent = () => `
    <div class="audio-tagger-dialog-content">
        <div class="audio-tagger-form-row">
            <label>Название тэга</label>
            <input type="text" name="text" value="${tag ? tag.text : ''}" placeholder="Введите название" autocomplete="off"/>
        </div>
        <div class="audio-tagger-form-row">
            <label>Предпросмотр</label>
            <span class="audio-tagger-preview" id="at-preview" style="background-color: ${tag ? tag.bg : '#6c757d'}; color: ${tag ? tag.color : '#ffffff'}">
                ${tag ? tag.text : 'Пример'}
            </span>
        </div>
        <div class="audio-tagger-form-row">
            <label>
                Цветовая схема
                <i class="fas fa-cog audio-tagger-preset-cog" id="at-preset-cog" title="Настроить палитру"></i>
            </label>
            <div class="audio-tagger-palette-grid" id="at-palette-grid">
                ${renderPresets(presets)}
            </div>
        </div>
        <div class="audio-tagger-form-row">
            <label>Цвет фона</label>
            <div class="audio-tagger-color-controls">
                <input type="color" name="bg" value="${tag ? tag.bg : '#6c757d'}">
                <input type="text" name="bgHex" value="${tag ? tag.bg : '#6c757d'}" maxlength="7">
            </div>
        </div>
        <div class="audio-tagger-form-row">
            <label>Цвет текста</label>
            <div class="audio-tagger-color-controls">
                <input type="color" name="color" value="${tag ? tag.color : '#ffffff'}">
                <input type="text" name="colorHex" value="${tag ? tag.color : '#ffffff'}" maxlength="7">
            </div>
        </div>
    </div>`;

    return new Promise((resolve) => {
        const dialog = new foundry.applications.api.DialogV2({
            window: { title: isCreating ? "Создать тэг" : "Редактировать тэг" },
            content: renderContent(),
            buttons: [
                { 
                    action: "save", 
                    label: "Сохранить", 
                    icon: "fas fa-save",
                    callback: (event, button, dialog) => {
                        const html = button.form || dialog.element; 
                        const text = html.querySelector("input[name='text']").value;
                        const bg = html.querySelector("input[name='bg']").value;
                        const color = html.querySelector("input[name='color']").value;
                        
                        if (!text.trim()) {
                            ui.notifications.warn("Введите название тэга");
                            return; 
                        }

                        const newTag = {
                            uuid: tag ? tag.uuid : generateTagUuid(),
                            text,
                            bg,
                            color
                        };

                        const currentTags = getTags();
                        if (isCreating) {
                            currentTags.push(newTag);
                        } else {
                            const idx = currentTags.findIndex(t => t.uuid === tag.uuid);
                            if (idx !== -1) currentTags[idx] = newTag;
                        }
                        saveTags(currentTags);
                        resolve(newTag);
                    }
                },
                { 
                    action: "cancel", 
                    label: "Отмена", 
                    icon: "fas fa-times",
                    callback: () => resolve(null)
                }
            ],
            submit: (result) => {
            }
        });

        dialog.render(true).then(d => {
            const html = $(d.element);
            
            const preview = html.find("#at-preview");
            const textInput = html.find("input[name='text']");
            const bgInput = html.find("input[name='bg']");
            const bgHex = html.find("input[name='bgHex']");
            const colorInput = html.find("input[name='color']");
            const colorHex = html.find("input[name='colorHex']");
            
            const updatePreview = () => {
                preview.text(textInput.val() || "Пример");
                preview.css("background-color", bgInput.val());
                preview.css("color", colorInput.val());
            };

            textInput.on("input", updatePreview);
            bgInput.on("input", () => { bgHex.val(bgInput.val()); updatePreview(); });
            bgHex.on("input", () => { bgInput.val(bgHex.val()); updatePreview(); });
            colorInput.on("input", () => { colorHex.val(colorInput.val()); updatePreview(); });
            colorHex.on("input", () => { colorInput.val(colorHex.val()); updatePreview(); });

            html.find(".audio-tagger-color-preset").click((e) => {
                const color = $(e.currentTarget).data("color");
                bgInput.val(color);
                bgHex.val(color);
                updatePreview();
            });

            html.find("#at-preset-cog").click(async (e) => {
                await openPaletteEditor();
                presets = getPresets();
                html.find("#at-palette-grid").html(renderPresets(presets));
                html.find(".audio-tagger-color-preset").click((e) => {
                    const color = $(e.currentTarget).data("color");
                    bgInput.val(color);
                    bgHex.val(color);
                    updatePreview();
                });
            });
        });
    });
}

function renderPresets(presets) {
    return presets.map(c => `
        <div class="audio-tagger-color-preset" style="background-color: ${c}" data-color="${c}"></div>
    `).join("");
}

async function openPaletteEditor() {
    let presets = getPresets();
    
    const renderList = () => presets.map((c, i) => `
        <div class="audio-tagger-palette-item" data-index="${i}">
            <input type="color" value="${c}">
            <input type="text" value="${c}" maxlength="7">
            <button class="delete-preset"><i class="fas fa-times"></i></button>
        </div>
    `).join("");

    const content = `
    <div class="audio-tagger-dialog-content">
        <h3>Настройка цветовой палитры</h3>
        <div class="audio-tagger-palette-list" id="at-palette-list">
            ${renderList()}
        </div>
        <button id="at-add-color"><i class="fas fa-plus"></i> Добавить цвет</button>
    </div>
    `;

    return new Promise((resolve) => {
        const dialog = new foundry.applications.api.DialogV2({
            window: { title: "Настройка палитры" },
            content: content,
            buttons: [
                { 
                    action: "save", 
                    label: "Сохранить", 
                    icon: "fas fa-save",
                    callback: () => {
                        savePresets(presets);
                        resolve();
                    }
                },
                { 
                    action: "cancel", 
                    label: "Отмена", 
                    icon: "fas fa-times",
                    callback: () => resolve()
                }
            ]
        });

        dialog.render(true).then(d => {
            const html = $(d.element);
            const list = html.find("#at-palette-list");

            const refresh = () => {
                list.html(renderList());
                bindEvents();
            };

            const bindEvents = () => {
                list.find("input[type='color']").on("input", (e) => {
                    const idx = $(e.target).closest(".audio-tagger-palette-item").data("index");
                    presets[idx] = e.target.value;
                    $(e.target).next().val(e.target.value);
                });
                list.find("input[type='text']").on("change", (e) => {
                    const idx = $(e.target).closest(".audio-tagger-palette-item").data("index");
                    presets[idx] = e.target.value;
                    $(e.target).prev().val(e.target.value);
                });
                list.find(".delete-preset").click((e) => {
                    const idx = $(e.target).closest(".audio-tagger-palette-item").data("index");
                    if (presets.length <= 1) return ui.notifications.warn("Должен остаться хотя бы один цвет");
                    presets.splice(idx, 1);
                    refresh();
                });
            };

            html.find("#at-add-color").click(() => {
                presets.push("#000000");
                refresh();
            });

            bindEvents();
        });
    });
}

function setupSearch(html) {
    html = $(html);
    const searchInput = html.find("input[name='search']");
    
    searchInput.on("input", (e) => {
        const query = e.target.value.toLowerCase();
        const palette = html.find("#audio-tagger-palette");
        const tags = palette.find(".audio-tagger-item");
        
        tags.each((i, el) => {
            const text = $(el).find("span").text().toLowerCase();
            if (text.includes(query)) {
                $(el).show();
            } else {
                $(el).hide();
            }
        });
    });
}
