import { TagManager } from "./TagManager.js";
import { normalizeHexColor, DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR, EMOJI_CATEGORIES } from "./constants.js";

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
            icon: tag?.icon || "",
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
        
        const iconPickerHTML = this._buildEmojiPickerHTML(tagData.icon);
        
        return `
            <div class="audio-tagger-dialog-content">
                <div class="audio-tagger-form-row">
                    <label for="tagName">${game.i18n.localize("AUDIO_TAGGER.TagName")}</label>
                    <input type="text" id="tagName" name="name" value="${tagData.name}" autocomplete="off" placeholder="${game.i18n.localize("AUDIO_TAGGER.EnterName")}">
                </div>
                <div class="audio-tagger-form-row">
                    <label for="tagIcon">${game.i18n.localize("AUDIO_TAGGER.TagIcon")}</label>
                    ${iconPickerHTML}
                </div>
                <div class="audio-tagger-form-row">
                    <label>${game.i18n.localize("AUDIO_TAGGER.Preview")}</label>
                    <span class="audio-tagger-preview" id="tagPreview" style="background-color: ${tagData.backgroundColor}; color: ${tagData.textColor};">
                        <span id="iconPreview">${tagData.icon || ""}</span>
                        <span id="namePreview">${tagData.name || game.i18n.localize("AUDIO_TAGGER.Example")}</span>
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
     * Build emoji picker HTML.
     * @private
     */
    static _buildEmojiPickerHTML(currentIcon) {
        let categoriesHTML = "";
        for (const [category, emojis] of Object.entries(EMOJI_CATEGORIES)) {
            const emojisHTML = emojis.map(item => 
                `<span class="at-emoji-option" data-emoji="${item.e}" data-keywords="${item.k}" data-category="${category.toLowerCase()}">${item.e}</span>`
            ).join("");
            categoriesHTML += `
                <div class="at-emoji-category" data-category="${category.toLowerCase()}">
                    <div class="at-emoji-category-name">${category}</div>
                    <div class="at-emoji-grid">${emojisHTML}</div>
                </div>
            `;
        }
        
        return `
            <div class="at-icon-picker">
                <button type="button" class="at-icon-toggle" id="iconToggle">
                    <span id="iconDisplay">${currentIcon || "➕"}</span>
                </button>
                <button type="button" class="at-icon-clear" id="iconClear" title="${game.i18n.localize("AUDIO_TAGGER.ClearIcon")}">
                    <i class="fas fa-times"></i>
                </button>
                <div class="at-icon-dropdown" id="iconDropdown">
                    <input type="text" class="at-icon-search" id="iconSearch" placeholder="${game.i18n.localize("AUDIO_TAGGER.SearchIcons")}" autocomplete="off">
                    <div class="at-icon-categories">
                        ${categoriesHTML}
                    </div>
                </div>
                <input type="hidden" id="tagIcon" name="icon" value="${currentIcon}">
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
        const iconInput = element.querySelector("#tagIcon");
        const iconDisplay = element.querySelector("#iconDisplay");
        const iconPreview = element.querySelector("#iconPreview");
        const namePreview = element.querySelector("#namePreview");
        const preview = element.querySelector("#tagPreview");
        const bgPicker = element.querySelector("#bgPicker");
        const textPicker = element.querySelector("#textPicker");
        const iconToggle = element.querySelector("#iconToggle");
        const iconDropdown = element.querySelector("#iconDropdown");
        const iconClear = element.querySelector("#iconClear");
        const iconSearch = element.querySelector("#iconSearch");
        
        let activeField = "bg";

        const updatePreview = () => {
            if (namePreview) namePreview.textContent = nameInput.value || game.i18n.localize("AUDIO_TAGGER.Example");
            preview.style.backgroundColor = bgPicker.value;
            preview.style.color = textPicker.value;
        };

        const updateIcon = (emoji) => {
            iconInput.value = emoji;
            iconDisplay.textContent = emoji || "➕";
            if (iconPreview) iconPreview.textContent = emoji;
        };

        // Icon search filter - searches by category name and emoji keywords
        iconSearch?.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const categories = iconDropdown.querySelectorAll(".at-emoji-category");
            
            categories.forEach(category => {
                const categoryName = category.dataset.category || "";
                const options = category.querySelectorAll(".at-emoji-option");
                let hasVisibleEmoji = false;
                
                if (!query) {
                    // Show all when no query
                    category.style.display = "";
                    options.forEach(opt => opt.style.display = "");
                } else if (categoryName.includes(query)) {
                    // Category name matches - show entire category
                    category.style.display = "";
                    options.forEach(opt => opt.style.display = "");
                    hasVisibleEmoji = true;
                } else {
                    // Search by emoji keywords
                    options.forEach(opt => {
                        const keywords = opt.dataset.keywords || "";
                        if (keywords.includes(query)) {
                            opt.style.display = "";
                            hasVisibleEmoji = true;
                        } else {
                            opt.style.display = "none";
                        }
                    });
                    
                    // Show category only if it has visible emojis
                    category.style.display = hasVisibleEmoji ? "" : "none";
                }
            });
        });

        // Helper to show dropdown - moves to body for proper z-index
        const showDropdown = () => {
            const rect = iconToggle.getBoundingClientRect();
            
            // Move to body for proper layering
            document.body.appendChild(iconDropdown);
            iconDropdown.classList.add("open");
            
            // Position below button, ensure stays in viewport
            const dropHeight = 400;
            const spaceBelow = window.innerHeight - rect.bottom;
            const top = spaceBelow > dropHeight ? rect.bottom + 4 : rect.top - dropHeight - 4;
            
            iconDropdown.style.top = `${Math.max(4, top)}px`;
            iconDropdown.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
            
            setTimeout(() => iconSearch?.focus(), 50);
        };

        // Helper to hide dropdown - moves back to original position
        const hideDropdown = () => {
            iconDropdown.classList.remove("open");
            if (iconSearch) iconSearch.value = "";
            // Reset filter
            const categories = iconDropdown.querySelectorAll(".at-emoji-category");
            categories.forEach(cat => {
                cat.style.display = "";
                cat.querySelectorAll(".at-emoji-option").forEach(opt => opt.style.display = "");
            });
            // Move back to picker if in body
            const picker = element.querySelector(".at-icon-picker");
            if (iconDropdown.parentElement === document.body && picker) {
                picker.appendChild(iconDropdown);
            }
        };

        // Icon picker toggle
        iconToggle?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (iconDropdown.classList.contains("open")) {
                hideDropdown();
            } else {
                showDropdown();
            }
        });

        // Icon selection
        iconDropdown?.addEventListener("click", (e) => {
            const emoji = e.target.closest(".at-emoji-option");
            if (emoji) {
                updateIcon(emoji.dataset.emoji);
                hideDropdown();
            }
        });

        // Clear icon
        iconClear?.addEventListener("click", (e) => {
            e.preventDefault();
            updateIcon("");
        });

        // Close dropdown when clicking anywhere
        const closeOnClick = (e) => {
            if (!e.target.closest(".at-icon-dropdown") && !e.target.closest("#iconToggle")) {
                hideDropdown();
            }
        };
        document.addEventListener("click", closeOnClick);
        
        // Cleanup on dialog close
        element.closest(".application")?.addEventListener("close", () => {
            document.removeEventListener("click", closeOnClick);
            if (iconDropdown.parentElement === document.body) {
                iconDropdown.remove();
            }
        }, { once: true });

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
            icon: element.querySelector("#tagIcon")?.value || "",
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