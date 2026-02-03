import { TagManager } from "../core/TagManager.js";
import { normalizeHexColor, DEFAULT_BG_COLOR } from "../core/constants.js";

/**
 * PaletteEditorDialog - Dialog for managing color presets using DialogV2.
 */
export class PaletteEditorDialog {

    /**
     * Opens the palette editor dialog.
     * @returns {Promise<string[]|null>} Updated presets array or null if cancelled.
     */
    static async open() {
        const workingPresets = foundry.utils.deepClone(TagManager.getColorPresets());
        const content = this._buildContent(workingPresets);

        return new Promise((resolve) => {
            let dialogInstance = null;
            let resolved = false;

            const dialogConfig = {
                window: {
                    title: game.i18n.localize("AUDIO_TAGGER.PaletteEditor"),
                    icon: "fas fa-palette"
                },
                position: { width: 400 },
                content: content,
                buttons: [
                    {
                        action: "save",
                        label: game.i18n.localize("AUDIO_TAGGER.Save"),
                        icon: "fas fa-save",
                        default: true,
                        callback: async () => {
                            const element = dialogInstance.element;
                            const presets = this._collectPresets(element);
                            await TagManager.saveColorPresets(presets);
                            if (TagManager.areNotificationsEnabled()) {
                                ui.notifications.info(game.i18n.localize("AUDIO_TAGGER.PaletteSaved"));
                            }
                            resolved = true;
                            resolve(presets);
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
                    this._attachEventListeners(element, workingPresets);
                }
            });

            dialogInstance.render({ force: true });
        });
    }

    /**
     * Builds the dialog's HTML content.
     * @param {string[]} presets - Current color presets.
     * @returns {string} HTML content.
     * @private
     */
    static _buildContent(presets) {
        return `
            <div class="audio-tagger-dialog-content">
                <h3>${game.i18n.localize("AUDIO_TAGGER.ColorPaletteConfig")}</h3>
                <div class="audio-tagger-palette-list" id="paletteList">
                    ${this._buildPresetItems(presets)}
                </div>
                <div class="audio-tagger-palette-actions">
                    <button type="button" id="addColorBtn" class="audio-tagger-add-color-btn">
                        <i class="fas fa-plus"></i> ${game.i18n.localize("AUDIO_TAGGER.AddColor")}
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Builds HTML for the list of preset items.
     * @param {string[]} presets - Color presets.
     * @returns {string} HTML string.
     * @private
     */
    static _buildPresetItems(presets) {
        return presets.map((color, index) => `
            <div class="audio-tagger-palette-item" data-index="${index}">
                <input type="color" class="palette-color-picker" value="${color}">
                <input type="text" class="palette-hex-input" value="${color.toUpperCase()}" maxlength="7">
                <button type="button" class="palette-delete-btn" title="${game.i18n.localize("AUDIO_TAGGER.DeleteColor")}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join("");
    }

    /**
     * Attaches event listeners to the dialog's elements.
     * @param {HTMLElement} element - The dialog's DOM element.
     * @param {string[]} workingPresets - The working copy of presets.
     * @private
     */
    static _attachEventListeners(element, workingPresets) {
        const list = element.querySelector("#paletteList");

        const refreshList = () => {
            list.innerHTML = this._buildPresetItems(workingPresets);
        };

        // Event delegation for item-specific events
        list.addEventListener("input", (e) => {
            const item = e.target.closest(".audio-tagger-palette-item");
            if (!item) return;
            const index = parseInt(item.dataset.index);

            if (e.target.matches(".palette-color-picker")) {
                const color = e.target.value;
                workingPresets[index] = color;
                item.querySelector(".palette-hex-input").value = color.toUpperCase();
            } else if (e.target.matches(".palette-hex-input")) {
                const val = e.target.value;
                if (/^#[0-9A-F]{6}$/i.test(val)) {
                    workingPresets[index] = val;
                    item.querySelector(".palette-color-picker").value = val;
                }
            }
        });

        list.addEventListener("click", (e) => {
            const deleteBtn = e.target.closest(".palette-delete-btn");
            if (!deleteBtn) return;

            if (workingPresets.length <= 1) {
                ui.notifications.warn(game.i18n.localize("AUDIO_TAGGER.MinimumOneColor"));
                return;
            }

            const item = deleteBtn.closest(".audio-tagger-palette-item");
            const index = parseInt(item.dataset.index);
            workingPresets.splice(index, 1);
            refreshList();
        });

        element.querySelector("#addColorBtn").addEventListener("click", () => {
            workingPresets.push("#000000");
            refreshList();
        });
    }

    /**
     * Collects the current preset values from the form.
     * @param {HTMLElement} element - Dialog DOM element.
     * @returns {string[]} Array of hex colors.
     * @private
     */
    static _collectPresets(element) {
        const items = element.querySelectorAll(".audio-tagger-palette-item .palette-hex-input");
        return Array.from(items).map(input => normalizeHexColor(input.value, DEFAULT_BG_COLOR));
    }
}