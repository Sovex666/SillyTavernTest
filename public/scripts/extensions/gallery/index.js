import {
    eventSource,
    this_chid,
    characters,
    getRequestHeaders,
    event_types,
    EXTENSION_UI_PANELS, // Assuming this is how it would be accessed if defined in script.js and exported
} from '../../../script.js';
import { groups, selected_group } from '../../group-chats.js';
import { delay, getBase64Async, getSanitizedFilename } from '../../utils.js'; // Removed loadFileToDocument as it's no longer used here
import { loadMovingUIState } from '../../power-user.js';
import { dragElement } from '../../RossAscends-mods.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
// DragAndDropHandler is removed from here as the iframe will handle its own D&D
import { commonEnumProviders } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { t, translate } from '../../i18n.js';

const extensionName = 'gallery';
// const extensionFolderPath = `scripts/extensions/${extensionName}/`; // No longer needed for local asset loading

// Exposed defaults for future tweaking (can be kept if makeMovable or other functions use them)
let thumbnailHeight = 150;
let paginationVisiblePages = 10;
let paginationMaxLinesPerPage = 2;
let galleryMaxRows = 3;


// Remove all draggables associated with the gallery
$('#movingDivs').on('click', '.dragClose', function () {
    const relatedId = $(this).data('related-id');
    if (!relatedId) return;
    $(`#movingDivs > .draggable[id="${relatedId}"]`).remove();
});

const CUSTOM_GALLERY_REMOVED_EVENT = 'galleryRemoved';

const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.tagName === 'DIV' && node.id === 'gallery') {
                eventSource.emit(CUSTOM_GALLERY_REMOVED_EVENT);
            }
        });
    });
});

mutationObserver.observe(document.body, {
    childList: true,
    subtree: false,
});

const SORT = Object.freeze({
    NAME_ASC: { value: 'nameAsc', field: 'name', order: 'asc', label: t`Sort By: Name (A-Z)` },
    NAME_DESC: { value: 'nameDesc', field: 'name', order: 'desc', label: t`Sort By: Name (Z-A)` },
    DATE_ASC: { value: 'dateAsc', field: 'date', order: 'asc', label: t`Sort By: Date (Oldest First)` },
    DATE_DESC: { value: 'dateDesc', field: 'date', order: 'desc', label: t`Sort By: Date (Newest First)` },
});

const defaultSettings = Object.freeze({
    folders: {},
    sort: SORT.DATE_ASC.value,
});

function initSettings() {
    let shouldSave = false;
    const context = SillyTavern.getContext();
    if (!context.extensionSettings.gallery) {
        context.extensionSettings.gallery = structuredClone(defaultSettings);
        shouldSave = true;
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(context.extensionSettings.gallery, key)) {
            context.extensionSettings.gallery[key] = structuredClone(defaultSettings[key]);
            shouldSave = true;
        }
    }
    if (shouldSave) {
        context.saveSettingsDebounced();
    }
}

function getGalleryFolder(char) {
    return SillyTavern.getContext().extensionSettings.gallery.folders[char?.avatar] ?? char?.name;
}

async function getGalleryItems(url) {
    const sortValue = getSortOrder();
    const sortObj = Object.values(SORT).find(it => it.value === sortValue) ?? SORT.DATE_ASC;
    const response = await fetch('/api/images/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            folder: url,
            sortField: sortObj.field,
            sortOrder: sortObj.order,
        }),
    });

    url = await getSanitizedFilename(url);

    const data = await response.json();
    const items = data.map((file) => ({
        src: `user/images/${url}/${file}`,
        srct: `user/images/${url}/${file}`,
        title: '',
    }));

    return items;
}

async function getGalleryFolders() {
    try {
        const response = await fetch('/api/images/folders', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error(`HTTP error. Status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch gallery folders:', error);
        return [];
    }
}

function setSortOrder(order) {
    const context = SillyTavern.getContext();
    context.extensionSettings.gallery.sort = order;
    context.saveSettingsDebounced();
}

function getSortOrder() {
    return SillyTavern.getContext().extensionSettings.gallery.sort ?? defaultSettings.sort;
}

// Old initGallery, no longer directly used for iframe gallery
async function initGallery_OLD(items, url) {
    // const nonce = `nonce-${Math.random().toString(36).substring(2, 15)}`;
    // const gallery = $('#dragGallery');
    // gallery.addClass(nonce);
    // gallery.nanogallery2({
    //     'items': items,
    //     thumbnailWidth: 'auto',
    //     thumbnailHeight: thumbnailHeight,
    //     // ... other options ...
    //     fnThumbnailOpen: viewWithDragbox,
    //     fnThumbnailInit: function ($thumbnail, item) {
    //         if (!item?.src) return;
    //         $thumbnail.attr('title', String(item.src).split('/').pop());
    //     },
    // });

    // const dragDropHandler = new DragAndDropHandler(`#dragGallery.${nonce}`, async (files) => {
    //     // ... old D&D logic ...
    // });

    // const resizeHandler = function () {
    //     gallery.nanogallery2('resize');
    // };
    // eventSource.on('resizeUI', resizeHandler);
    // eventSource.once(event_types.CHAT_CHANGED, function () {
    //     gallery.closest('#gallery').remove();
    // });
    // eventSource.once(CUSTOM_GALLERY_REMOVED_EVENT, function () {
    //     gallery.nanogallery2('destroy');
    //     // dragDropHandler.destroy(); // dragDropHandler is local, would be GC'd
    //     eventSource.removeListener('resizeUI', resizeHandler);
    // });
    // gallery.css('height', gallery.parent().css('height'));
    // await delay(100);
    // gallery.css('height', 'unset');
}


async function showCharGallery(urlOverride) {
    try {
        let url;
        if (urlOverride) {
            url = urlOverride;
        } else {
            url = selected_group || this_chid;
            if (!selected_group && typeof this_chid !== 'undefined' && characters[this_chid]) {
                 url = getGalleryFolder(characters[this_chid]);
            } else if (selected_group) {
                url = selected_group;
            } else {
                console.warn('Gallery URL could not be determined.');
                toastr.warning('Could not determine gallery folder.');
                return;
            }
        }

        if (!url) {
            console.error("Gallery URL is undefined. Cannot show gallery.");
            toastr.error("Gallery folder context is missing.");
            return;
        }

        console.log(`[Parent] Showing gallery for URL: ${url}`);
        const items = await getGalleryItems(url);

        const galleryPanelSelector = EXTENSION_UI_PANELS && EXTENSION_UI_PANELS['gallery'] ? EXTENSION_UI_PANELS['gallery'] : '#gallery';
        let galleryPanel = document.querySelector(galleryPanelSelector);

        if (!galleryPanel) {
             await makeMovable(url);
             galleryPanel = document.querySelector(galleryPanelSelector);
        } else {
            // If panel exists, we might need to update its title or other URL-dependent parts.
            // For now, makeMovable is called to handle this. It should be idempotent or updatable.
            await makeMovable(url);
        }

        if (galleryPanel) {
            const iframe = galleryPanel.querySelector('iframe');
            if (iframe && iframe.contentWindow) {
                console.log('[Parent] Posting initGallery message to iframe with items:', items.length);
                iframe.contentWindow.postMessage({ type: 'initGallery', items: items, url: url }, '*');
            } else {
                console.error('[Parent] Gallery iframe not found or not ready in panel:', galleryPanelSelector);
            }
        } else {
             console.error('[Parent] Gallery panel container not found:', galleryPanelSelector);
        }

    } catch (err) {
        console.trace();
        console.error('[Parent] Error in showCharGallery:', err);
        toastr.error('Failed to display gallery.');
    }
}

async function uploadFile(file, url) {
    try {
        const base64Data = await getBase64Async(file);
        const payload = { image: base64Data, ch_name: url };
        const response = await fetch('/api/images/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        // toastr.success(t`File uploaded successfully. Saved at: ${result.path}`); // Done by parent
        return result; // Return result for Promise.all
    } catch (error) {
        console.error('[Parent] There was an issue uploading the file:', error);
        toastr.error(t`Failed to upload the file: ${file.name}`);
        throw error; // Re-throw to be caught by Promise.all
    }
}

async function makeMovable(url) {
    console.debug('[Parent] makeMovable called with URL:', url);
    const id = 'gallery'; // This is the ID for EXTENSION_UI_PANELS['gallery']

    let newElement = $(`#${id}`);
    if (!newElement.length) {
        const template = $('#generic_draggable_template').html();
        newElement = $(template);
        newElement.attr('id', id);
        newElement.find('.drag-grabber').attr('id', `${id}header`);
        // Add no-scrollbar class to this element for iframe host
        newElement.addClass('no-scrollbar');
        $('#movingDivs').append(newElement);
        dragElement(newElement);
    }

    // Update title and folder input regardless of whether it's new or existing
    newElement.css('background-color', 'var(--SmartThemeBlurTintColor)');
    newElement.attr('forChar', id); // Keep this for consistency if other logic uses it

    const dragTitle = newElement.find('.dragTitle');
    if (!dragTitle.length) { // Should not happen if template is correct
        console.error("Drag title not found in makeMovable");
        return;
    }
    dragTitle.empty().addClass('flex-container justifySpaceBetween alignItemsBaseline');

    const titleText = document.createElement('span');
    titleText.textContent = t`Image Gallery`;
    dragTitle.append(titleText);

    const sortSelect = document.createElement('select');
    sortSelect.classList.add('gallery-sort-select');
    for (const sort of Object.values(SORT)) {
        const option = document.createElement('option');
        option.value = sort.value;
        option.textContent = sort.label;
        sortSelect.appendChild(option);
    }
    sortSelect.value = getSortOrder();
    sortSelect.addEventListener('change', async () => {
        const selectedOption = sortSelect.options[sortSelect.selectedIndex].value;
        setSortOrder(selectedOption);
        // Refresh gallery via iframe
        const galleryContainer = document.querySelector(`#${id}`);
        if (galleryContainer) {
            const iframe = galleryContainer.querySelector('iframe');
            if (iframe && iframe.contentWindow) {
                const currentGalleryUrl = galleryContainer.querySelector('.gallery-folder-input')?.value || url;
                const items = await getGalleryItems(currentGalleryUrl);
                iframe.contentWindow.postMessage({ type: 'initGallery', items: items, url: currentGalleryUrl }, '*');
            }
        }
    });
    dragTitle.append(sortSelect);

    const closeButton = newElement.find('.dragClose');
    closeButton.attr('id', `${id}close`);
    closeButton.attr('data-related-id', `${id}`);

    let topBarElement = newElement.find('.gallery-topbar');
    if (!topBarElement.length) {
        topBarElement = $('<div>').addClass('gallery-topbar flex-container alignItemsCenter');
        newElement.find('.drag-grabber').after(topBarElement); // Insert after header
    }
    topBarElement.empty();

    const galleryFolderInput = $('<input type="text" class="text_pole gallery-folder-input flex1">')
        .attr('placeholder', t`Folder Name`)
        .attr('title', t`Enter a folder name to change the gallery folder`)
        .val(url);

    const onChangeFolder = async (e) => {
        if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.type !== 'click') {
            return;
        }
        try {
            const newUrl = await getSanitizedFilename(galleryFolderInput.val());
            updateGalleryFolder(newUrl);
            // Refresh gallery via iframe
            const galleryContainer = document.querySelector(`#${id}`);
            if (galleryContainer) {
                const iframe = galleryContainer.querySelector('iframe');
                if (iframe && iframe.contentWindow) {
                    const items = await getGalleryItems(newUrl);
                    iframe.contentWindow.postMessage({ type: 'initGallery', items: items, url: newUrl }, '*');
                }
            }
            toastr.info(t`Gallery folder changed to ${newUrl}`);
            galleryFolderInput.val(newUrl);
        } catch (error) {
            console.error('Failed to change gallery folder:', error);
            toastr.error(error?.message || t`Unknown error`, t`Failed to change gallery folder`);
        }
    };
    galleryFolderInput.on('keyup', onChangeFolder);

    const galleryFolderAccept = $('<div>').addClass('right_menu_button fa-solid fa-check fa-fw')
        .attr('title', t`Change gallery folder`)
        .on('click', onChangeFolder);

    const galleryFolderRestore = $('<div>').addClass('right_menu_button fa-solid fa-recycle fa-fw')
        .attr('title', t`Restore gallery folder`)
        .on('click', async () => {
            try {
                restoreGalleryFolder();
                const defaultFolder = getGalleryFolder(characters[this_chid]); // Re-fetch default after restore
                 // Refresh gallery via iframe
                const galleryContainer = document.querySelector(`#${id}`);
                if (galleryContainer) {
                    const iframe = galleryContainer.querySelector('iframe');
                    if (iframe && iframe.contentWindow) {
                        const items = await getGalleryItems(defaultFolder);
                        iframe.contentWindow.postMessage({ type: 'initGallery', items: items, url: defaultFolder }, '*');
                    }
                }
                galleryFolderInput.val(defaultFolder);
            } catch (error) {
                console.error('Failed to restore gallery folder:', error);
                toastr.error(error?.message || t`Unknown error`, t`Failed to restore gallery folder`);
            }
        });

    topBarElement.append(galleryFolderInput, galleryFolderAccept, galleryFolderRestore);

    const folders = await getGalleryFolders();
    galleryFolderInput.autocomplete({
        source: (i, o) => {
            const term = i.term.toLowerCase();
            const filtered = folders.filter(f => f.toLowerCase().includes(term));
            o(filtered);
        },
        select: (e, u) => {
            galleryFolderInput.val(u.item.value);
            onChangeFolder(e);
        },
        minLength: 0,
    }).on('focus', () => galleryFolderInput.autocomplete('search', ''));

    // The div for nanogallery2 instance is now inside the iframe.
    // This function only creates the parent draggable window.
    // Ensure the iframe container part of the draggable window is ready if it's not already part of the template.
    if (!newElement.find(`#${id}_iframe_content_wrapper`).length) {
         newElement.append(`<div id="${id}_iframe_content_wrapper" style="width:100%; height:calc(100% - 60px); overflow:hidden;"></div>`);
    }


    loadMovingUIState();
    $(`.draggable[forChar="${id}"]`).css('display', 'block');
}


function updateGalleryFolder(newUrl) {
    if (!newUrl) {
        throw new Error('Folder name cannot be empty');
    }
    const context = SillyTavern.getContext();
    if (context.groupId) {
        throw new Error('Cannot change gallery folder in group chat');
    }
    if (context.characterId === undefined) {
        throw new Error('Character is not selected');
    }
    const avatar = context.characters[context.characterId]?.avatar;
    const name = context.characters[context.characterId]?.name;
    if (!avatar) {
        throw new Error('Character PNG ID is not found');
    }
    if (newUrl === name) {
        delete context.extensionSettings.gallery.folders[avatar];
    } else {
        context.extensionSettings.gallery.folders[avatar] = newUrl;
    }
    context.saveSettingsDebounced();
}

function restoreGalleryFolder() {
    const context = SillyTavern.getContext();
    if (context.groupId) {
        throw new Error('Cannot change gallery folder in group chat');
    }
    if (context.characterId === undefined) {
        throw new Error('Character is not selected');
    }
    const avatar = context.characters[context.characterId]?.avatar;
    if (!avatar) {
        throw new Error('Character PNG ID is not found');
    }
    const existingOverride = context.extensionSettings.gallery.folders[avatar];
    if (!existingOverride) {
        throw new Error('No folder override found');
    }
    delete context.extensionSettings.gallery.folders[avatar];
    context.saveSettingsDebounced();
}

function makeDragImg(id, url) {
    const template = document.getElementById('generic_draggable_template');
    if (!(template instanceof HTMLTemplateElement)) {
        console.error('The element is not a <template> tag');
        return;
    }
    const newElementNode = document.importNode(template.content, true);
    const newElement = $(newElementNode.children[0]); // Get the first child, which is the draggable div

    const imgElem = document.createElement('img');
    imgElem.src = url;
    let uniqueId = `draggable_${id}`;
    let counter = 1;
    while (document.getElementById(uniqueId)) {
        uniqueId = `draggable_${id}_${counter}`;
        counter++;
    }
    newElement.attr('id', uniqueId);
    newElement.append(imgElem);
    newElement.css('display', 'block').css('padding', '0');
    newElement.find('.dragClose').attr({ 'id': `${uniqueId}close`, 'data-related-id': uniqueId });
    newElement.find('.drag-grabber').attr('id', `${uniqueId}header`);

    $('#movingDivs').append(newElement);
    loadMovingUIState();
    dragElement(newElement);
    newElement.find('img').on('dragstart', (e) => { e.preventDefault(); return false; });
}

function sanitizeHTMLId(id) {
    id = id.replace(/\s+/g, '-').replace(/[^\x00-\x7F]/g, '-').replace(/\W/g, '');
    return id;
}

function viewWithDragbox(items) {
    if (items && items.length > 0) {
        const url = items[0].responsiveURL();
        const id = sanitizeHTMLId(url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.')));
        makeDragImg(id, url);
    }
}

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'show-gallery',
    aliases: ['sg'],
    callback: () => {
        showCharGallery();
        return '';
    },
    helpString: 'Shows the gallery.',
}));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'list-gallery',
    aliases: ['lg'],
    callback: listGalleryCommand,
    returns: 'list of images',
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
            name: 'char',
            description: 'character name',
            typeList: [ARGUMENT_TYPE.STRING],
            enumProvider: commonEnumProviders.characters('character'),
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'group',
            description: 'group name',
            typeList: [ARGUMENT_TYPE.STRING],
            enumProvider: commonEnumProviders.characters('group'),
        }),
    ],
    helpString: 'List images in the gallery of the current char / group or a specified char / group.',
}));

async function listGalleryCommand(args) {
    try {
        let url = args.char ?? (args.group ? groups.find(it => it.name == args.group)?.id : null) ?? (selected_group || this_chid);
        if (!args.char && !args.group && !selected_group && this_chid !== undefined) {
            url = getGalleryFolder(characters[this_chid]);
        }
        const items = await getGalleryItems(url);
        return JSON.stringify(items.map(it => it.src));
    } catch (err) {
        console.trace();
        console.error(err);
    }
    return JSON.stringify([]);
}

(function () {
    initSettings();
    eventSource.on(event_types.CHARACTER_RENAMED, (oldAvatar, newAvatar) => {
        const context = SillyTavern.getContext();
        const galleryFolder = context.extensionSettings.gallery.folders[oldAvatar];
        if (galleryFolder) {
            context.extensionSettings.gallery.folders[newAvatar] = galleryFolder;
            delete context.extensionSettings.gallery.folders[oldAvatar];
            context.saveSettingsDebounced();
        }
    });
    eventSource.on(event_types.CHARACTER_DELETED, (data) => {
        const avatar = data?.character?.avatar;
        if (!avatar) return;
        const context = SillyTavern.getContext();
        delete context.extensionSettings.gallery.folders[avatar];
        context.saveSettingsDebounced();
    });
    eventSource.on(event_types.CHARACTER_MANAGEMENT_DROPDOWN, (selectedOptionId) => {
        if (selectedOptionId === 'show_char_gallery') {
            showCharGallery();
        }
    });

    $('#char-management-dropdown').append(
        $('<option>', {
            id: 'show_char_gallery',
            text: translate('Show Gallery'),
        }),
    );
})();

// window.galleryViewWithDragbox = viewWithDragbox; // No longer needed, will be exported
// window.galleryUploadFile = uploadFile; // No longer needed, will be exported
// window.galleryShowCharGallery = showCharGallery; // No longer needed, will be exported

export { viewWithDragbox, uploadFile, showCharGallery };
