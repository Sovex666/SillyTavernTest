// Script for gallery_iframe.js
(function () {
    'use strict';

    let currentGalleryUrlForUpload = ''; // Variable to store the gallery URL for uploads
    console.log('[Gallery Iframe] Script loaded.');

    // Helper function to load a script dynamically into the iframe's document
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
            document.head.appendChild(script);
        });
    }

    // Helper function to load a stylesheet dynamically into the iframe's document
    function loadStyle(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = resolve;
            link.onerror = () => reject(new Error(`Failed to load style: ${url}`));
            document.head.appendChild(link);
        });
    }

    function handleThumbnailOpen(item) {
        if (item && typeof item.responsiveURL === 'function') {
            const imageUrl = item.responsiveURL();
            if (window.parentApi && typeof window.parentApi.sendMessage === 'function') {
                performance.mark('galleryImageClickStart');
                window.parentApi.sendMessage({
                    type: 'galleryImageClicked',
                    imageUrl: imageUrl,
                    // extensionName is already added by parentApi.sendMessage in extension_iframe_loader.html
                });
            } else {
                console.error('[Gallery Iframe] parentApi or sendMessage not available.');
            }
        } else {
            console.error('[Gallery Iframe] Invalid item passed to handleThumbnailOpen or item.responsiveURL is not a function', item);
        }
    }

    // Listen for messages from the parent window
    window.addEventListener('message', async (event) => {
        console.log('[Gallery Iframe] Message received from parent:', event.data);

        if (event.data && event.data.type === 'initGallery') {
            performance.mark('galleryInternalInitStart');
            const { items, url } = event.data;
            const galleryTargetId = 'nanogallery_target_in_iframe'; // Matches the div in extension_iframe_loader.html

            try {
                console.log('[Gallery Iframe] Loading jQuery...');
                await loadScript('/lib/jquery-3.5.1.min.js'); // Adjusted path based on ls output
                console.log('[Gallery Iframe] jQuery loaded. $ type:', typeof $);

                console.log('[Gallery Iframe] Loading nanogallery2 CSS...');
                await loadStyle('/scripts/extensions/gallery/nanogallery2.woff.min.css');
                console.log('[Gallery Iframe] nanogallery2 CSS loaded.');

                console.log('[Gallery Iframe] Loading nanogallery2 JS...');
                await loadScript('/scripts/extensions/gallery/jquery.nanogallery2.min.js');
                console.log('[Gallery Iframe] nanogallery2 JS loaded. $.fn.nanogallery2 type:', typeof $.fn.nanogallery2);

                if (typeof $ === 'undefined' || typeof $.fn.nanogallery2 === 'undefined') {
                    throw new Error('jQuery or nanogallery2 not available after loading.');
                }

                const galleryElement = document.getElementById(galleryTargetId);
                if (!galleryElement) {
                    throw new Error(`Gallery target element #${galleryTargetId} not found in iframe.`);
                }

                // Ensure the target element is empty before initializing
                $(galleryElement).empty();

                console.log('[Gallery Iframe] Initializing nanogallery2 with items:', items);
                $(galleryElement).nanogallery2({
                    items: items,
                    thumbnailHeight: 150,
                    thumbnailWidth: 'auto',
                    paginationVisiblePages: 5,
                    galleryMaxRows: 3,
                    galleryDisplayMode: 'pagination', // Or other modes like 'rows', 'moreButton'
                    gallerySorting: 'random',
                    thumbnailAlignment: 'center',
                    thumbnailLabel: {
                        display: false,
                    },
                    thumbnailHoverEffect2: 'imageScaleIn80',
                    viewerToolbar: {
                        display: true,
                        standard: 'minimizeButton, zoomButton, rotateLeft, rotateRight, downloadButton, infoButton, closeButton',
                    },
                    viewerTools: {
                        topRight: 'minimizeButton, zoomButton, rotateLeft, rotateRight, downloadButton, infoButton, closeButton',
                    },
                    fnThumbnailOpen: handleThumbnailOpen,
                    // Add more options as needed for basic functionality
                });
                console.log('[Gallery Iframe] nanogallery2 initialized.');
                currentGalleryUrlForUpload = url; // Store the URL for D&D uploads

                performance.mark('galleryInternalInitEnd');
                performance.measure('Gallery Iframe Init', 'galleryInternalInitStart', 'galleryInternalInitEnd');
                const measureIframeInit = performance.getEntriesByName('Gallery Iframe Init').pop();
                if (measureIframeInit) {
                    console.debug(`Gallery Iframe Init took: ${measureIframeInit.duration.toFixed(2)} ms`);
                }
                performance.clearMarks('galleryInternalInitStart');
                performance.clearMarks('galleryInternalInitEnd');
                performance.clearMeasures('Gallery Iframe Init');

                if (window.parentApi && typeof window.parentApi.sendMessage === 'function') {
                    window.parentApi.sendMessage({ type: 'galleryRendered', name: 'gallery', status: 'success' });
                } else {
                    console.error('[Gallery Iframe] parentApi not available to send galleryRendered message.');
                }

            } catch (e) {
                console.error('[Gallery Iframe] Error initializing gallery:', e);
                if (window.parentApi && typeof window.parentApi.sendMessage === 'function') {
                    window.parentApi.sendMessage({ type: 'galleryError', name: 'gallery', error: e.message, status: 'error' });
                } else {
                    console.error('[Gallery Iframe] parentApi not available to send galleryError message.');
                }
            }
        }
    });

    // Signal to parent that the iframe script itself has loaded and is ready for messages.
    // This is different from the extension (nanogallery2) being fully rendered.
    // The parent will receive 'extensionLoaded' from extension_iframe_loader.html when this script (gallery_iframe.js) is imported.
    // Then parent sends 'initGallery', and this script sends 'galleryRendered' or 'galleryError'.
    console.log('[Gallery Iframe] Ready to receive messages.');

    // Setup Drag and Drop for file uploads
    const galleryTarget = document.getElementById('nanogallery_target_in_iframe');
    if (galleryTarget) {
        galleryTarget.addEventListener('dragover', (event) => {
            event.preventDefault(); // Necessary to allow drop
            galleryTarget.style.border = '2px dashed #007bff'; // Optional: visual cue
        });
        galleryTarget.addEventListener('dragleave', (event) => {
            galleryTarget.style.border = 'none'; // Optional: remove visual cue
        });
        galleryTarget.addEventListener('drop', async (event) => {
            event.preventDefault();
            galleryTarget.style.border = 'none'; // Reset visual cue
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                const filesArray = Array.from(files); // Convert FileList to array
                if (window.parentApi && typeof window.parentApi.sendMessage === 'function') {
                    performance.mark('galleryFileDropStart');
                    window.parentApi.sendMessage({
                        type: 'galleryFilesDropped',
                        files: filesArray, // Sending File objects
                        galleryUrl: currentGalleryUrlForUpload
                    });
                    // Optional: Show "Uploading..." message in iframe
                    // const feedback = document.createElement('p');
                    // feedback.textContent = 'Uploading ' + files.length + ' file(s)...';
                    // galleryTarget.prepend(feedback);
                } else {
                    console.error('[Gallery Iframe] parentApi not available for sending dropped files.');
                }
            }
        });
        console.log('[Gallery Iframe] D&D listeners set up for #nanogallery_target_in_iframe');
    } else {
        console.error('[Gallery Iframe] #nanogallery_target_in_iframe not found for D&D setup.');
    }
})();
