// force-prompting-static/js/interactive_line_drag.js

const LINE_DEMO_MAX_DRAG_PROPORTION_OF_WIDTH = 0.25;
const LINE_DEMO_DEBUG_SHOW_FILENAME = false; // Set to true for debugging video filenames
const LINE_DEMO_CLICK_TOLERANCE_RADIUS = 200;
const BEAD_RADIUS = 11;

document.addEventListener('DOMContentLoaded', () => {
    const demoContainerElements = document.querySelectorAll('.js-line-drag-demo');
    demoContainerElements.forEach(containerElement => {
        containerElement.isFullyInitialized = false;
        containerElement.setupRetryTimeout = null;
        initLineDragInstance(containerElement);
    });
});

function initLineDragInstance(containerElement) {
    let LINE_DEMO_INITIAL_IMAGE_PATH;
    let LINE_DEMO_VIDEOS_BASE_PATH;
    let LINE_DEMO_VIDEO_DATA_PATH;
    let LINE_DEMO_PREDEFINED_FORCES = [];

    const staticImage = containerElement.querySelector('.line-static-image');
    const canvas = containerElement.querySelector('.line-canvas-overlay');
    const videoPlayer = containerElement.querySelector('.line-video-player');
    const debugFilenameDisplay = containerElement.closest('.line-drag-gallery-item, section[id^="lineDragDemoSection"]')?.querySelector('.line-debug-filename-display');

    if (!staticImage || !canvas || !videoPlayer) {
        console.error(`Line Drag Demo (${containerElement.id || 'Unknown ID'}): Core child elements missing.`);
        if (debugFilenameDisplay && LINE_DEMO_DEBUG_SHOW_FILENAME) {
             debugFilenameDisplay.textContent = "Error: Core HTML elements missing.";
        }
        return;
    }

    const rootDir = containerElement.dataset.rootDir;
    if (!rootDir) {
        console.error(`Line Drag Demo (${containerElement.id || 'Unknown ID'}): data-root-dir attribute missing.`);
        if (debugFilenameDisplay && LINE_DEMO_DEBUG_SHOW_FILENAME) {
            debugFilenameDisplay.textContent = "Error: data-root-dir missing.";
        }
        return;
    }

    const effectiveRootDir = rootDir.endsWith('/') ? rootDir : rootDir + '/';
    LINE_DEMO_INITIAL_IMAGE_PATH = effectiveRootDir + "initial_frame.png";
    LINE_DEMO_VIDEOS_BASE_PATH = effectiveRootDir + "videos/";
    LINE_DEMO_VIDEO_DATA_PATH = effectiveRootDir + "video_specs.json";

    let videoData = {};
    let singleCoordKey = null;
    let interactionPointNorm = null;
    let interactionPointPx = null;
    let jsonAllowedAngles = [];
    let lastProjectedDx = 0, lastProjectedDy = 0;
    let isDragging = false;
    let dragOriginX, dragOriginY;
    let imageWidth = 0, imageHeight = 0, maxPixelDragLength = 0;
    const ctx = canvas.getContext('2d');

    function updateDebugFilename(text) {
        if (LINE_DEMO_DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
            debugFilenameDisplay.textContent = `(${containerElement.id}) ${text}`;
        }
    }

    function attemptFullSetup(isRetry = false) {
        clearTimeout(containerElement.setupRetryTimeout);

        if (containerElement.isFullyInitialized && !isRetry) {
            console.log(`Line Drag Demo (${containerElement.id}): Already initialized. Re-running setup for potential resize.`);
            setupImageAndCanvas();
            return;
        }
        
        if (staticImage.offsetParent === null) {
            console.warn(`Line Drag Demo (${containerElement.id}): AttemptSetup - Element not visible. Setup deferred.`);
            updateDebugFilename("Setup deferred: Not visible.");
            return;
        }

        if (!(staticImage.naturalWidth > 0 && staticImage.naturalHeight > 0)) {
            console.warn(`Line Drag Demo (${containerElement.id}): AttemptSetup - Image natural dimensions not available. Setup deferred.`);
            updateDebugFilename("Setup deferred: Image data not ready.");
            return;
        }

        if (staticImage.offsetWidth > 0) {
            console.log(`Line Drag Demo (${containerElement.id}): AttemptSetup - Visible and image ready. Running setupImageAndCanvas.`);
            updateDebugFilename("Performing setup...");
            setupImageAndCanvas();
        } else {
            if (!isRetry) {
                console.warn(`Line Drag Demo (${containerElement.id}): AttemptSetup - Visible, image data loaded, but offsetWidth is 0. Retrying once.`);
                updateDebugFilename("offsetWidth is 0. Retrying setup...");
                containerElement.setupRetryTimeout = setTimeout(() => attemptFullSetup(true), 150);
            } else {
                console.error(`Line Drag Demo (${containerElement.id}): AttemptSetup - Failed to get offsetWidth even after retry.`);
                updateDebugFilename("Error: Failed to get offsetWidth.");
                containerElement.isFullyInitialized = false;
                switchToStaticImage();
            }
        }
    }

    function setupImageAndCanvas() {
        if (staticImage.offsetParent === null || !(staticImage.naturalWidth > 0) || !(staticImage.offsetHeight > 0)) {
            console.warn(`Line Drag Demo (${containerElement.id}): setupImageAndCanvas - Pre-conditions failed. Aborting. Visible: ${staticImage.offsetParent !== null}, naturalW: ${staticImage.naturalWidth}, offsetH: ${staticImage.offsetHeight}`);
            containerElement.isFullyInitialized = false;
            updateDebugFilename("Setup aborted: Pre-conditions failed.");
            switchToStaticImage();
            return;
        }

        imageWidth = staticImage.offsetWidth;
        imageHeight = staticImage.offsetHeight;

        if (imageWidth > 0 && imageHeight > 0) {
            canvas.width = imageWidth;
            canvas.height = imageHeight;
            maxPixelDragLength = imageWidth * LINE_DEMO_MAX_DRAG_PROPORTION_OF_WIDTH;
            if (interactionPointNorm) {
                interactionPointPx = {
                    x: interactionPointNorm.x * imageWidth,
                    y: interactionPointNorm.y_from_top * imageHeight
                };
            }
            console.log(`Line Drag Demo (${containerElement.id}): Setup Canvas. Dimensions: ${imageWidth}x${imageHeight}. Max Drag: ${maxPixelDragLength}`);
            updateDebugFilename(`Canvas: ${imageWidth}x${imageHeight}. MaxDrag: ${maxPixelDragLength.toFixed(0)}px`);
            containerElement.isFullyInitialized = true;
        } else {
            console.error(`Line Drag Demo (${containerElement.id}): Failed to get valid dimensions in setupImageAndCanvas. Path: ${LINE_DEMO_INITIAL_IMAGE_PATH}. OffsetW: ${staticImage.offsetWidth}, OffsetH: ${staticImage.offsetHeight}.`);
            containerElement.isFullyInitialized = false;
            updateDebugFilename("Error: Invalid dimensions in setup.");
            switchToStaticImage();
            return;
        }
        switchToStaticImage(false);
    }
    
    function initializeInteractiveDemo() {
        updateDebugFilename("Initializing demo...");
        // Ensure src is set to the initial path before attaching onload
        if (staticImage.getAttribute('src') !== LINE_DEMO_INITIAL_IMAGE_PATH) {
            staticImage.src = LINE_DEMO_INITIAL_IMAGE_PATH;
        }

        const newOnload = () => {
            // staticImage.onload = null; // Keep it if forceRefreshDimensions might re-trigger by setting src
            console.log(`Line Drag Demo (${containerElement.id}): Image data loaded (${staticImage.naturalWidth}x${staticImage.naturalHeight}).`);
            updateDebugFilename(`Image data loaded (${staticImage.naturalWidth}x${staticImage.naturalHeight})`);
            if (staticImage.naturalWidth > 0 && staticImage.naturalHeight > 0) {
                attemptFullSetup();
            } else {
                console.error(`Line Drag Demo (${containerElement.id}): Image loaded but naturalWidth/Height is zero. Path: ${LINE_DEMO_INITIAL_IMAGE_PATH}`);
                updateDebugFilename("Error: Image data invalid.");
            }
        };
        // Detach any previous onload before attaching a new one
        staticImage.onload = null;
        staticImage.onload = newOnload;


        staticImage.onerror = () => {
            staticImage.onerror = null;
            console.error(`Line Drag Demo (${containerElement.id}): Image failed to load: ${LINE_DEMO_INITIAL_IMAGE_PATH}`);
            updateDebugFilename("Error: Image load failed.");
            switchToStaticImage();
        };

        // Check if image is already loaded (e.g. from cache)
        if (staticImage.complete && staticImage.getAttribute('src') === LINE_DEMO_INITIAL_IMAGE_PATH) {
             console.log(`Line Drag Demo (${containerElement.id}): Image already complete on init. Simulating onload. NaturalW: ${staticImage.naturalWidth}`);
            if (staticImage.naturalWidth > 0 && staticImage.naturalHeight > 0) {
                setTimeout(newOnload, 0); // Use timeout to ensure consistency with async onload
            } else if (staticImage.getAttribute('src')) { 
                 console.warn(`Line Drag Demo (${containerElement.id}): Image already complete but natural dimensions are zero. May be broken.`);
                 updateDebugFilename("Warning: Cached image might be broken.");
            }
        } else if (staticImage.getAttribute('src') !== LINE_DEMO_INITIAL_IMAGE_PATH) {
            // If src is not the initial path, set it to trigger load.
            staticImage.src = LINE_DEMO_INITIAL_IMAGE_PATH;
        }


        containerElement.removeEventListener('mousedown', handleDragStart);
        containerElement.addEventListener('mousedown', handleDragStart);
        containerElement.removeEventListener('touchstart', handleDragStart, { passive: false });
        containerElement.addEventListener('touchstart', handleDragStart, { passive: false });

        videoPlayer.addEventListener('ended', () => {
            updateDebugFilename("Video ended.");
            switchToStaticImage();
        });
        videoPlayer.addEventListener('error', (e) => {
            console.error(`Line Drag Demo (${containerElement.id}): Video player error.`, e);
            updateDebugFilename("Error: Video playback failed.");
            switchToStaticImage();
        });
    }

    containerElement.forceRefreshDimensions = function() {
        console.log(`Line Drag Demo (${containerElement.id}): forceRefreshDimensions called. Is visible: ${containerElement.offsetParent !== null}`);
        updateDebugFilename("forceRefreshDimensions called.");
        clearTimeout(containerElement.setupRetryTimeout); 

        // Ensure the onload handler from initializeInteractiveDemo is correctly set up.
        // If src isn't set, or is different, initializeInteractiveDemo will set it and the onload.
        if (!staticImage.getAttribute('src') || staticImage.getAttribute('src') !== LINE_DEMO_INITIAL_IMAGE_PATH) {
            console.log(`Line Drag Demo (${containerElement.id}): Setting/resetting image src in forceRefreshDimensions.`);
            updateDebugFilename("Setting image src...");
            containerElement.isFullyInitialized = false; 
            initializeInteractiveDemo(); // This will set src and new onload handler
        } else if (staticImage.complete && staticImage.naturalWidth > 0) {
            console.log(`Line Drag Demo (${containerElement.id}): Image loaded and src correct in forceRefreshDimensions. Attempting full setup.`);
            updateDebugFilename("Image loaded, attempting setup...");
            attemptFullSetup();
        } else if (!staticImage.complete && staticImage.getAttribute('src') === LINE_DEMO_INITIAL_IMAGE_PATH) {
            console.log(`Line Drag Demo (${containerElement.id}): Image is currently loading, src is correct. Onload will handle setup.`);
            updateDebugFilename("Image loading, onload will handle.");
            // Ensure onload is attached if somehow lost
            if (!staticImage.onload) initializeInteractiveDemo();
        } else {
             console.warn(`Line Drag Demo (${containerElement.id}): forceRefreshDimensions - Unhandled image state. Src: ${staticImage.getAttribute('src')}, Complete: ${staticImage.complete}, NaturalW: ${staticImage.naturalWidth}`);
             updateDebugFilename("Warning: Unhandled image state in refresh.");
             initializeInteractiveDemo(); // Try to re-initialize to fix state
        }
    };
    
    function findClosestNumericValue(target, values) {
        if (!values || values.length === 0) return null;
        return values.reduce((prev, curr) =>
            Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
        );
    }

    function parseCoordString(coordStr) {
        try {
            const parts = coordStr.slice(1, -1).split(',');
            return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
        } catch (e) {
            console.error(`Line Drag Demo (${containerElement.id}): Error parsing coordinate string:`, coordStr, e);
            return null;
        }
    }

    function shortestAngleDistRad(a0, a1) {
        const max = Math.PI * 2;
        const da = (a1 - a0) % max;
        return (2 * da % max) - da;
    }

    function drawGuidanceSliderAndBead() {
        if (!containerElement.isFullyInitialized || !interactionPointPx || jsonAllowedAngles.length === 0 || canvas.width === 0 || canvas.height === 0) {
            if (canvas.width > 0 && canvas.height > 0) ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear if possible
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const centerX = interactionPointPx.x;
        const centerY = interactionPointPx.y;
        const angleRad = jsonAllowedAngles[0] * Math.PI / 180; 
        const lineDx = Math.cos(angleRad) * maxPixelDragLength;
        const lineDy = -Math.sin(angleRad) * maxPixelDragLength; 
        
        ctx.beginPath();
        ctx.moveTo(centerX - lineDx, centerY - lineDy);
        ctx.lineTo(centerX + lineDx, centerY + lineDy);
        ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]); 
        ctx.stroke();
        ctx.setLineDash([]); 

        ctx.beginPath();
        ctx.arc(centerX, centerY, BEAD_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; 
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 200, 200, 1)'; 
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Helper to draw arrow on a given context
    function drawArrowOnContext(targetContext, x1, y1, x2, y2, beadRadius = 0, beadX = 0, beadY = 0) {
        if (targetContext.canvas.width === 0 || targetContext.canvas.height === 0) return;
        const headLength = 25;
        const arrowLineWidth = 8;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const wingAngle = Math.PI / 6;
        const arrowheadDepth = headLength * Math.cos(wingAngle);
        const totalLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        if (totalLength > arrowheadDepth) {
            const shaftEndX = x2 - arrowheadDepth * Math.cos(angle);
            const shaftEndY = y2 - arrowheadDepth * Math.sin(angle);
            targetContext.beginPath();
            targetContext.moveTo(x1, y1);
            targetContext.lineTo(shaftEndX, shaftEndY);
            targetContext.strokeStyle = 'rgba(255, 255, 0, 0.9)';
            targetContext.lineWidth = arrowLineWidth;
            targetContext.lineCap = 'butt';
            targetContext.stroke();
        }
        targetContext.beginPath();
        targetContext.moveTo(x2, y2);
        const baseCorner1X = x2 - headLength * Math.cos(angle - wingAngle);
        const baseCorner1Y = y2 - headLength * Math.sin(angle - wingAngle);
        targetContext.lineTo(baseCorner1X, baseCorner1Y);
        const baseCorner2X = x2 - headLength * Math.cos(angle + wingAngle);
        const baseCorner2Y = y2 - headLength * Math.sin(angle + wingAngle);
        targetContext.lineTo(baseCorner2X, baseCorner2Y);
        targetContext.closePath();
        targetContext.fillStyle = 'rgba(255, 255, 0, 0.9)';
        targetContext.fill();

        // Optionally draw bead
        if (beadRadius > 0) {
            targetContext.beginPath();
            targetContext.arc(beadX, beadY, beadRadius, 0, 2 * Math.PI);
            targetContext.fillStyle = 'rgba(255, 255, 255, 0.9)';
            targetContext.fill();
            targetContext.strokeStyle = 'rgba(200, 200, 200, 1)';
            targetContext.lineWidth = 1;
            targetContext.stroke();
        }
    }
    
    function switchToStaticImage(clearDebugText = true) {
        videoPlayer.style.display = 'none';
        if (!videoPlayer.paused) videoPlayer.pause();
        
        // Reset to the original pristine image if not already showing it.
        // This clears any "baked-in" arrows from previous interactions.
        if (staticImage.getAttribute('src') !== LINE_DEMO_INITIAL_IMAGE_PATH) {
            console.log(`Line Drag Demo (${containerElement.id}): switchToStaticImage - Resetting to initial image: ${LINE_DEMO_INITIAL_IMAGE_PATH}`);
            staticImage.src = LINE_DEMO_INITIAL_IMAGE_PATH;
            // The onload handler (set in initializeInteractiveDemo) should trigger attemptFullSetup,
            // which will then call setupImageAndCanvas, which calls this function again (but with src already set to initial).
            // This eventually leads to drawGuidanceSliderAndBead on a clean canvas.
        }
        staticImage.style.display = 'block';

        if (containerElement.isFullyInitialized && imageWidth > 0 && imageHeight > 0) {
            canvas.style.display = 'block';
            if (interactionPointPx) {
                drawGuidanceSliderAndBead(); // This clears the main canvas and draws bead/slider
            } else {
                if(canvas.width > 0 && canvas.height > 0) ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        } else {
            canvas.style.display = 'none';
        }

        if (clearDebugText) {
            updateDebugFilename(containerElement.isFullyInitialized ? "Showing static image." : "Switched to static (not initialized).");
        }
    }
    
    function handleDragStart(e) {
        if (!containerElement.isFullyInitialized || !interactionPointPx || !imageWidth || imageWidth === 0 || !maxPixelDragLength || maxPixelDragLength === 0) {
            console.warn(`Line Drag Demo (${containerElement.id}): Drag start ignored, setup incomplete. Initialized: ${containerElement.isFullyInitialized}`);
            updateDebugFilename("Drag ignored: setup incomplete.");
            if (containerElement.offsetParent !== null && typeof containerElement.forceRefreshDimensions === 'function') {
                 console.warn(`Line Drag Demo (${containerElement.id}): Attempting emergency refresh from handleDragStart.`);
                 updateDebugFilename("Attempting emergency refresh...");
                 containerElement.forceRefreshDimensions(); 
            }
            return; 
        }

        if (videoPlayer.style.display === 'block' && !videoPlayer.paused) {
            switchToStaticImage(); // This will also reset staticImage.src to initial
        } else if (staticImage.getAttribute('src') !== LINE_DEMO_INITIAL_IMAGE_PATH) {
            // If static image isn't the initial one (e.g. has a baked arrow from a previous onVideoReadyToPlay), reset it.
            staticImage.src = LINE_DEMO_INITIAL_IMAGE_PATH;
             // The onload for this will eventually call drawGuidanceSliderAndBead via attemptFullSetup.
        } else {
            // Ensure canvas is clean and bead is drawn if starting a new drag from pristine state
            drawGuidanceSliderAndBead();
        }
        
        isDragging = true;
        dragOriginX = interactionPointPx.x;
        dragOriginY = interactionPointPx.y;
        lastProjectedDx = 0;
        lastProjectedDy = 0;

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('touchcancel', handleDragEnd);
        
        e.preventDefault();
        updateDebugFilename("Drag started.");
    }

    // These constants should ideally match the internal visual properties of your arrowhead
    // as defined within drawArrowOnContext. Assuming headLength = 25 and wingAngle = Math.PI / 6
    // are used in drawArrowOnContext to define the arrowhead shape.
    const ARROW_VISUAL_HEAD_SLANT_LENGTH = 25; // Corresponds to 'headLength' in drawArrowOnContext
    const ARROW_VISUAL_WING_ANGLE = Math.PI / 6; // Corresponds to 'wingAngle' in drawArrowOnContext
    const ARROW_VISUAL_HEAD_DEPTH = ARROW_VISUAL_HEAD_SLANT_LENGTH * Math.cos(ARROW_VISUAL_WING_ANGLE);

    function handleDragMove(e) {
        if (!isDragging || !interactionPointPx || jsonAllowedAngles.length < 2) return;

        const rect = containerElement.getBoundingClientRect();
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
            e.preventDefault();
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        let currentX = clientX - rect.left;
        let currentY = clientY - rect.top;
        let rawDx = currentX - dragOriginX;
        let rawDy = currentY - dragOriginY;

        if (rawDx === 0 && rawDy === 0 && lastProjectedDx === 0 && lastProjectedDy === 0) return;

        const mouseAngleRad = Math.atan2(-rawDy, rawDx);
        const angle1Rad = jsonAllowedAngles[0] * Math.PI / 180;
        const angle2Rad = jsonAllowedAngles[1] * Math.PI / 180;
        const diffToAngle1 = Math.abs(shortestAngleDistRad(mouseAngleRad, angle1Rad));
        const diffToAngle2 = Math.abs(shortestAngleDistRad(mouseAngleRad, angle2Rad));
        const chosenAxisAngleRad = (diffToAngle1 < diffToAngle2) ? angle1Rad : angle2Rad;
        const axisUnitDx = Math.cos(chosenAxisAngleRad);
        const axisUnitDy = -Math.sin(chosenAxisAngleRad);
        const projectedScalar = rawDx * axisUnitDx + rawDy * axisUnitDy;
        let projectedDx = projectedScalar * axisUnitDx;
        let projectedDy = projectedScalar * axisUnitDy;
        let dragDistance = Math.sqrt(projectedDx * projectedDx + projectedDy * projectedDy);

        if (dragDistance > maxPixelDragLength) {
            const ratio = maxPixelDragLength / dragDistance;
            projectedDx *= ratio;
            projectedDy *= ratio;
            dragDistance = maxPixelDragLength;
        }
        lastProjectedDx = projectedDx;
        lastProjectedDy = projectedDy;

        drawGuidanceSliderAndBead();

        if (dragDistance > 0.1) { // Only draw if there's a meaningful drag vector
            const tailX = dragOriginX; // Arrow shaft starts at the bead
            const tailY = dragOriginY;

            // Current mouse position (projected) where the base of the arrowhead should be
            const headBaseX = dragOriginX + projectedDx;
            const headBaseY = dragOriginY + projectedDy;

            // Unit vector in the direction of the drag
            const unitVecX = projectedDx / dragDistance;
            const unitVecY = projectedDy / dragDistance;

            // Calculate the actual tip of the arrowhead
            // It's ARROW_VISUAL_HEAD_DEPTH beyond the headBaseX/Y
            const finalTipX = headBaseX + unitVecX * ARROW_VISUAL_HEAD_DEPTH;
            const finalTipY = headBaseY + unitVecY * ARROW_VISUAL_HEAD_DEPTH;

            drawArrowOnContext(ctx, tailX, tailY, finalTipX, finalTipY);
        } else {
            // If drag is very short, you might still want to clear or draw a default state
            // For now, no arrow is drawn if dragDistance is too small.
            // drawGuidanceSliderAndBead() would have cleared the canvas.
        }
    }

    function handleDragEnd() {
        if (!isDragging) return;
        isDragging = false;

        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDragMove, { passive: false });
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('touchcancel', handleDragEnd);

        if (!containerElement.isFullyInitialized || !interactionPointPx || Object.keys(videoData).length === 0 || !singleCoordKey || !imageWidth || !maxPixelDragLength) {
            switchToStaticImage();
            return;
        }

        const pixelLength = Math.sqrt(lastProjectedDx * lastProjectedDx + lastProjectedDy * lastProjectedDy);

        // The bead is always drawn at interactionPointPx for the baked image
        const beadCenterX = interactionPointPx.x;
        const beadCenterY = interactionPointPx.y;

        if (pixelLength < 5) { // Threshold for playing a video; arrow might still be drawn if > 0.1 for visual feedback
            updateDebugFilename("Drag too short, no video.");
            // If an arrow was drawn for feedback (pixelLength > 0.1 but < 5),
            // we might want to bake it or clear it.
            // For simplicity, let's only bake a significant arrow.
            // If we need to ensure the bead is on the baked image even without a significant arrow:
            if (staticImage.getAttribute('src') === LINE_DEMO_INITIAL_IMAGE_PATH) { // Only if showing pristine image
                const originalImageToDrawOn = new Image();
                originalImageToDrawOn.onload = () => {
                    const tempCompositeCanvas = document.createElement('canvas');
                    tempCompositeCanvas.width = imageWidth; tempCompositeCanvas.height = imageHeight;
                    const tempCompositeCtx = tempCompositeCanvas.getContext('2d');
                    tempCompositeCtx.drawImage(originalImageToDrawOn, 0, 0, imageWidth, imageHeight);
                    // Draw just the bead
                    if (BEAD_RADIUS > 0) {
                        drawArrowOnContext(tempCompositeCtx, beadCenterX, beadCenterY, beadCenterX, beadCenterY, BEAD_RADIUS, beadCenterX, beadCenterY);
                    }
                    staticImage.src = tempCompositeCanvas.toDataURL();
                    switchToStaticImage(false); // Show the (potentially) updated static image
                };
                originalImageToDrawOn.onerror = () => switchToStaticImage();
                originalImageToDrawOn.src = LINE_DEMO_INITIAL_IMAGE_PATH;
                return; // Don't proceed to video logic
            } else {
                switchToStaticImage(); // Already showing some baked arrow, just switch
                return;
            }
        }

        const coordData = videoData[singleCoordKey];
        let actualAngleDeg = Math.atan2(-lastProjectedDy, lastProjectedDx) * (180 / Math.PI);
        if (actualAngleDeg < 0) actualAngleDeg += 360;
        const angle1 = jsonAllowedAngles[0]; const angle2 = jsonAllowedAngles[1];
        let diff1 = Math.abs(actualAngleDeg - angle1); if (diff1 > 180) diff1 = 360 - diff1;
        let diff2 = Math.abs(actualAngleDeg - angle2); if (diff2 > 180) diff2 = 360 - diff2;
        const chosenAngleForVideo = (diff1 < diff2) ? angle1 : angle2;
        const closestAngleKey = chosenAngleForVideo.toFixed(2);
        const normalizedForce = pixelLength / maxPixelDragLength;
        const targetNumericForce = findClosestNumericValue(normalizedForce, LINE_DEMO_PREDEFINED_FORCES);
        if (targetNumericForce === null) { switchToStaticImage(); return; }
        const targetForceKey = targetNumericForce.toFixed(3);
        const angleData = coordData?.[closestAngleKey];
        if (!angleData) { switchToStaticImage(); return; }
        const videoFileArray = angleData[targetForceKey];

        if (videoFileArray && videoFileArray.length > 0) {
            const videoFilename = videoFileArray[0];

            const dragPercentage = (pixelLength / maxPixelDragLength) * 100;
            console.log(`Drag distance along line: ${dragPercentage.toFixed(2)}%`);
            console.log(`Serving video: ${videoFilename}`);

            const originalImageToDrawOn = new Image();
            originalImageToDrawOn.onload = () => {
                const tempCompositeCanvas = document.createElement('canvas');
                tempCompositeCanvas.width = imageWidth;
                tempCompositeCanvas.height = imageHeight;
                const tempCompositeCtx = tempCompositeCanvas.getContext('2d');

                tempCompositeCtx.drawImage(originalImageToDrawOn, 0, 0, imageWidth, imageHeight);

                if (pixelLength > 0.1) { // Only draw arrow if drag was somewhat meaningful
                    const tailX = beadCenterX; // Arrow shaft starts at the bead
                    const tailY = beadCenterY;

                    const headBaseX = beadCenterX + lastProjectedDx;
                    const headBaseY = beadCenterY + lastProjectedDy;

                    const unitVecX = lastProjectedDx / pixelLength;
                    const unitVecY = lastProjectedDy / pixelLength;

                    const finalTipX = headBaseX + unitVecX * ARROW_VISUAL_HEAD_DEPTH;
                    const finalTipY = headBaseY + unitVecY * ARROW_VISUAL_HEAD_DEPTH;

                    drawArrowOnContext(tempCompositeCtx, tailX, tailY, finalTipX, finalTipY, BEAD_RADIUS, beadCenterX, beadCenterY);
                } else if (BEAD_RADIUS > 0) { // Draw only bead if no significant arrow
                    drawArrowOnContext(tempCompositeCtx, beadCenterX, beadCenterY, beadCenterX, beadCenterY, BEAD_RADIUS, beadCenterX, beadCenterY);
                }


                staticImage.src = tempCompositeCanvas.toDataURL();
                // ... (rest of video playing logic remains the same) ...
                console.log(`Line Drag Demo (${containerElement.id}): Playing video: ${videoFilename}`);
                updateDebugFilename(`Playing: ${videoFilename}`);

                videoPlayer.style.display = 'none';
                if (!videoPlayer.paused) videoPlayer.pause();
                videoPlayer.src = LINE_DEMO_VIDEOS_BASE_PATH + videoFilename;

                const onVideoReadyToPlay = () => {
                    videoPlayer.removeEventListener('loadeddata', onVideoReadyToPlay);
                    videoPlayer.removeEventListener('error', onVideoLoadError);
                    videoPlayer.style.width = imageWidth + 'px'; videoPlayer.style.height = imageHeight + 'px';
                    staticImage.style.display = 'none'; canvas.style.display = 'none';
                    videoPlayer.style.display = 'block';
                    videoPlayer.play().catch(err => {
                        console.error(`Line Drag Demo (${containerElement.id}): Video play failed.`, err);
                        updateDebugFilename("Error: Video play() rejected.");
                        switchToStaticImage();
                    });
                };
                const onVideoLoadError = (e) => {
                    videoPlayer.removeEventListener('loadeddata', onVideoReadyToPlay);
                    videoPlayer.removeEventListener('error', onVideoLoadError);
                    console.error(`Line Drag Demo (${containerElement.id}): Video load error.`, e);
                    updateDebugFilename("Error: Video file load failed.");
                    switchToStaticImage();
                };
                videoPlayer.addEventListener('loadeddata', onVideoReadyToPlay);
                videoPlayer.addEventListener('error', onVideoLoadError);
                videoPlayer.load();
            };
            originalImageToDrawOn.onerror = () => {
                console.error(`Line Drag Demo (${containerElement.id}): Failed to load initial image for drawing arrow overlay.`);
                updateDebugFilename("Error: Initial image reload failed for overlay.");
                switchToStaticImage();
            };
            originalImageToDrawOn.src = LINE_DEMO_INITIAL_IMAGE_PATH;
        } else {
            updateDebugFilename(`No video for angle ${closestAngleKey}, force ${targetForceKey}.`);
            switchToStaticImage();
        }
    }

    updateDebugFilename("Fetching video specs...");
    fetch(LINE_DEMO_VIDEO_DATA_PATH)
        .then(response => { /* ... as before ... */ 
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${LINE_DEMO_VIDEO_DATA_PATH}`);
            return response.json();
        })
        .then(data => { /* ... as before, parse data ... */ 
            videoData = data;
            const coordKeys = Object.keys(videoData);
            if (coordKeys.length !== 1) throw new Error(`video_specs.json must contain exactly one coordinate key. Found: ${coordKeys.length}`);
            singleCoordKey = coordKeys[0];
            const parsedCoords = parseCoordString(singleCoordKey);
            if (!parsedCoords) throw new Error(`Could not parse coordinate key: ${singleCoordKey}`);
            interactionPointNorm = { x: parsedCoords.x, y_from_top: 1.0 - parsedCoords.y };
            const angleDataForForceExtraction = videoData[singleCoordKey];
            if (!angleDataForForceExtraction) throw new Error(`No data for coord key: ${singleCoordKey}`);
            const angleKeys = Object.keys(angleDataForForceExtraction);
            if (angleKeys.length !== 2) throw new Error(`Expected 2 angles, found ${angleKeys.length}`);
            jsonAllowedAngles = angleKeys.map(parseFloat).sort((a, b) => a - b);
            const firstAngleKey = angleKeys[0]; 
            const forcesData = angleDataForForceExtraction[firstAngleKey];
            if (!forcesData || Object.keys(forcesData).length === 0) throw new Error(`No force data for angle ${firstAngleKey}.`);
            LINE_DEMO_PREDEFINED_FORCES = Object.keys(forcesData).map(f => parseFloat(f)).sort((a, b) => a - b);
            if (LINE_DEMO_PREDEFINED_FORCES.length === 0) throw new Error(`No forces extracted.`);
            updateDebugFilename("Video specs loaded. Initializing UI.");
            initializeInteractiveDemo();
        })
        .catch(error => {
            console.error(`Line Drag Demo (${containerElement.id}): Fatal Error:`, error);
            updateDebugFilename(`Fatal Error: ${error.message.substring(0,100)}`);
        });
}