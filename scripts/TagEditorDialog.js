import { TagManager } from "./TagManager.js";
import { normalizeHexColor, DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR } from "./constants.js";

/**
 * TagEditorDialog - Dialog for creating and editing tags using DialogV2.
 */
export class TagEditorDialog {
    
    /**
     * Opens the tag editor dialog.
     * @param {object|null} tag - Existing tag to edit, or null for a new tag.
     * @returns {Promise<object|null>} The created/updated tag object or null if cancelled.
     */
    static async open(tag = null) {
        const isCreating = !tag;
        const presets = TagManager.getColorPresets();
        const tagData = {
            name: tag?.name || "",
            backgroundColor: tag?.backgroundColor || DEFAULT_BG_COLOR,
            textColor: tag?.textColor || DEFAULT_TEXT_COLOR
        };
        
        const content = await this._buildContent(tagData, presets);
        
        return new Promise((resolve) => {
            let dialogInstance = null;
            let resolved = false;
            
            const dialogConfig = {
                window: {
                    title: game.i18n.localize(isCreating ? "AUDIO_TAGGER.CreateTag" : "AUDIO_TAGGER.EditTag"),
                    icon: "fas fa-tag"
                },
                position: { width: 420 },
                content: content,
                buttons: [
                    {
                        action: "save",
                        label: game.i18n.localize("AUDIO_TAGGER.Save"),
                        icon: "fas fa-save",
                        default: true,
                        callback: async () => {
                            const element = dialogInstance.element;
                            const result = await this._handleSave(element, tag);
                            if (result) {
                                resolved = true;
                                resolve(result);
                            }
                            return result !== null; // Return false to prevent closing on error
                        }
                    },
                    {
                        action: "cancel",
                        label: game.i18n.localize("AUDIO_TAGGER.Cancel"),
                        icon: "fas fa-times",
                        callback: () => {
                            if (!resolved) resolve(null);
                        }
                    }
                ],
                close: () => {
                    if (!resolved) resolve(null);
                }
            };
            
            dialogInstance = new foundry.applications.api.DialogV2(dialogConfig);
            
            // Attach listeners after render
            dialogInstance.addEventListener("render", (event) => {
                const element = dialogInstance.element;
                if (element) {
                    this._attachEventListeners(element);
                    element.querySelector("#tagName")?.focus();
                }
            });
            
            dialogInstance.render({ force: true });
        });
    }
    
    /**
     * Builds the dialog's HTML content.
     * @private
     */
    static _buildContent(tagData, presets) {
        const presetsHTML = presets.map(color => 
            `<div class="audio-tagger-color-preset" style="background-color: ${color}" data-color="${color}"></div>`
        ).join("");
        
        return `
            <div class="audio-tagger-dialog-content">
                <div class="audio-tagger-form-row">
                    <label for="tagName">${game.i18n.localize("AUDIO_TAGGER.TagName")}</label>
                    <input type="text" id="tagName" name="name" value="${tagData.name}" autocomplete="off" placeholder="${game.i18n.localize("AUDIO_TAGGER.EnterName")}">
                </div>
                <div class="audio-tagger-form-row">
                    <label>${game.i18n.localize("AUDIO_TAGGER.Preview")}</label>
                    <span class="audio-tagger-preview" id="tagPreview" style="background-color: ${tagData.backgroundColor}; color: ${tagData.textColor};">
                        ${tagData.name || game.i18n.localize("AUDIO_TAGGER.Example")}
                    </span>
                </div>
                <div class="audio-tagger-form-row">
                    <label>
                        ${game.i18n.localize("AUDIO_TAGGER.ColorScheme")}
                        <i class="fas fa-cog audio-tagger-preset-cog" id="presetCog" title="${game.i18n.localize("AUDIO_TAGGER.ConfigurePalette")}"></i>
                    </label>
                    <div class="audio-tagger-palette-grid" id="colorPalette">${presetsHTML}</div>
                </div>
                ${this._renderColorPickerRow("bgPicker", "backgroundColor", tagData.backgroundColor, "AUDIO_TAGGER.BackgroundColor", "bgHex")}
                ${this._renderColorPickerRow("textPicker", "textColor", tagData.textColor, "AUDIO_TAGGER.TextColor", "textHex")}
            </div>
        `;
    }

    /**
     * Helper to render a color picker row.
     * @private
     */
    static _renderColorPickerRow(id, name, value, labelKey, hexId) {
        return `
            <div class="audio-tagger-form-row">
                <label for="${id}">${game.i18n.localize(labelKey)}</label>
                <div class="audio-tagger-color-controls">
                    <input type="color" id="${id}" name="${name}" value="${value}">
                    <input type="text" id="${hexId}" value="${value.toUpperCase()}" maxlength="7" placeholder="#RRGGBB">
                </div>
            </div>
        `;
    }
    
    /**
     * Attaches event listeners to the dialog elements.
     * @private
     */
    static _attachEventListeners(element) {
        const nameInput = element.querySelector("#tagName");
        const preview = element.querySelector("#tagPreview");
        const bgPicker = element.querySelector("#bgPicker");
        const textPicker = element.querySelector("#textPicker");
        
        let activeField = "bg";

        const updatePreview = () => {
            preview.textContent = nameInput.value || game.i18n.localize("AUDIO_TAGGER.Example");
            preview.style.backgroundColor = bgPicker.value;
            preview.style.color = textPicker.value;
        };

        element.addEventListener("input", (e) => {
            if (e.target.matches("#tagName")) updatePreview();
            if (e.target.matches("#bgPicker, #textPicker")) {
                const hexInput = e.target.id === "bgPicker" ? "#bgHex" : "#textHex";
                element.querySelector(hexInput).value = e.target.value.toUpperCase();
                updatePreview();
            }
            if (e.target.matches("#bgHex, #textHex")) {
                if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    const picker = e.target.id === "bgHex" ? "#bgPicker" : "#textPicker";
                    element.querySelector(picker).value = e.target.value;
                    updatePreview();
                }
            }
        });

        element.addEventListener("focusin", (e) => {
            if (e.target.closest("#bgPicker, #bgHex")) activeField = "bg";
            if (e.target.closest("#textPicker, #textHex")) activeField = "text";
        });

        element.querySelector("#colorPalette").addEventListener("click", (e) => {
            const preset = e.target.closest(".audio-tagger-color-preset");
            if (!preset) return;
            
            const color = preset.dataset.color;
            const picker = activeField === "bg" ? bgPicker : textPicker;
            picker.value = color;
            picker.dispatchEvent(new Event("input", { bubbles: true }));
        });
        
        element.querySelector("#presetCog")?.addEventListener("click", async () => {
            const { PaletteEditorDialog } = await import("./PaletteEditorDialog.js");
            const newPresets = await PaletteEditorDialog.open();
            if (newPresets) {
                const presetsHTML = newPresets.map(c => `<div class="audio-tagger-color-preset" style="background-color: ${c}" data-color="${c}"></div>`).join("");
                element.querySelector("#colorPalette").innerHTML = presetsHTML;
            }
        });
    }
    
    /**
     * Handles the save operation.
     * @private
     */
    static async _handleSave(element, existingTag) {
        const name = element.querySelector("#tagName").value.trim();
        if (!name) {
            ui.notifications.warn(game.i18n.localize("AUDIO_TAGGER.ErrorEmptyName"));
            return null;
        }
        
        const tagData = {
            name,
            backgroundColor: normalizeHexColor(element.querySelector("#bgPicker").value, DEFAULT_BG_COLOR),
            textColor: normalizeHexColor(element.querySelector("#textPicker").value, DEFAULT_TEXT_COLOR)
        };
        
        try {
            const result = existingTag 
                ? await TagManager.updateTag(existingTag.uuid, tagData)
                : await TagManager.createTag(tagData);
            
            if (TagManager.areNotificationsEnabled()) {
                ui.notifications.info(game.i18n.localize(existingTag ? "AUDIO_TAGGER.TagUpdated" : "AUDIO_TAGGER.TagCreated"));
            }
            return result;
        } catch (error) {
            console.error("Audio Tagger | Error saving tag:", error);
            ui.notifications.error(game.i18n.localize("AUDIO_TAGGER.ErrorSaving"));
            return null;
        }
    }
}