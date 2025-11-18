// --- Configuration ---
const INITIAL_IMAGE_PATH = "force-prompting-static/rose5-grid/rosegrid5.png"; // 🌟 REPLACE with your image path (e.g., "force-prompting-static/images/your-interactive-image.png")
const VIDEOS_BASE_PATH = "force-prompting-static/rose5-grid/videos/"; // 🌟 REPLACE with path to your videos folder (e.g., "force-prompting-static/videos/poke_demo_videos/")
const MAX_DRAG_PROPORTION_OF_WIDTH = 0.25; // User arrow max length is 1/2 of frame width
const DEBUG_SHOW_FILENAME = true; // 🌟 NEW FLAG: Set to true to show filename, false to hide
const VIDEO_DATA_PATH = "force-prompting-static/rose5-grid/video_specs.json";
const PREDEFINED_FORCES = [0.050, 0.500, 0.950];
// --- End Configuration ---

let videoData = {}; // Initialize as an empty object; will be populated by fetching the JSON file

document.addEventListener('DOMContentLoaded', () => {
    // Get references to all necessary HTML elements
    const container = document.getElementById('demoContainer');
    const staticImage = document.getElementById('staticImage');
    const canvas = document.getElementById('canvasOverlay');
    const videoPlayer = document.getElementById('videoPlayer');
    const debugFilenameDisplay = document.getElementById('debugFilenameDisplay');

    // Basic check for core elements needed before even trying to fetch
    if (!container || !staticImage || !canvas || !videoPlayer) {
        console.error("Core interactive demo elements not found! Cannot initialize.");
        if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
            debugFilenameDisplay.textContent = "Error: Core demo HTML elements missing. Cannot initialize.";
            debugFilenameDisplay.style.display = 'block';
        }
        return; // Stop if essential elements are missing
    }
    if (DEBUG_SHOW_FILENAME && !debugFilenameDisplay) {
        console.warn("Debug filename display element ('debugFilenameDisplay') not found in HTML, but DEBUG_SHOW_FILENAME is true.");
    }

    // Set poster for video player initially
    videoPlayer.poster = INITIAL_IMAGE_PATH;
    const ctx = canvas.getContext('2d');

    // Variables for drag interaction and image dimensions
    let isDragging = false;
    let startX, startY;
    let imageWidth = 0, imageHeight = 0, maxPixelDragLength = 0; // Initialize to 0

    // --- Utility Functions ---
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
            console.error("Error parsing coordinate string:", coordStr, e);
            return null;
        }
    }

    function drawArrow(x1, y1, x2, y2) {
        if (canvas.width === 0 || canvas.height === 0) return; // Don't draw on an uninitialized canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.lineWidth = 3;
        ctx.stroke();

        const headLength = 10;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.fill();
    }

    function switchToStaticImage(clearDebug = true) {
        videoPlayer.style.display = 'none';
        if (!videoPlayer.paused) {
            videoPlayer.pause();
        }
        // Only display static image and canvas if the image has valid dimensions
        if (imageWidth > 0 && imageHeight > 0) {
            staticImage.style.display = 'block';
            canvas.style.display = 'block';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            // If image dimensions are not set, it implies an error or image not loaded
            staticImage.style.display = 'block'; // Still try to show it, might show alt text or broken icon
            canvas.style.display = 'none'; // Hide canvas if base image isn't properly sized
            console.warn("switchToStaticImage called, but image dimensions are not valid. Static image might not display correctly.");
        }


        if (DEBUG_SHOW_FILENAME && debugFilenameDisplay && clearDebug) {
            if (debugFilenameDisplay.textContent &&
                !debugFilenameDisplay.textContent.toLowerCase().includes("error") &&
                !debugFilenameDisplay.textContent.toLowerCase().includes("not found") &&
                !debugFilenameDisplay.textContent.toLowerCase().includes("loading")) {
                debugFilenameDisplay.textContent = '';
                debugFilenameDisplay.style.display = 'none';
            }
        }
    }

    function setupImageAndCanvas() {
        // This function should only be called if staticImage.naturalWidth > 0
        imageWidth = staticImage.offsetWidth; // Get dimensions from the rendered element
        imageHeight = staticImage.offsetHeight;

        if (imageWidth === 0 || imageHeight === 0) {
            // If offsetWidth/Height are still 0 even if naturalWidth/Height were > 0,
            // it might be a brief layout issue. We'll use naturalWidth/Height as a fallback for canvas sizing.
            console.warn("offsetWidth/Height are 0 for staticImage, using naturalWidth/Height for canvas. Image path:", INITIAL_IMAGE_PATH);
            imageWidth = staticImage.naturalWidth;
            imageHeight = staticImage.naturalHeight;
        }

        if (imageWidth > 0 && imageHeight > 0) {
            canvas.width = imageWidth;
            canvas.height = imageHeight;
            videoPlayer.width = imageWidth;
            videoPlayer.height = imageHeight;
            maxPixelDragLength = imageWidth * MAX_DRAG_PROPORTION_OF_WIDTH;
            console.log(`Interactive demo image setup: ${imageWidth}x${imageHeight}, Max drag: ${maxPixelDragLength}px`);
        } else {
            console.error("Failed to get valid dimensions for the static image. Canvas and video player will not be sized correctly.", INITIAL_IMAGE_PATH);
            // Keep canvas hidden if we can't size it
            canvas.style.display = 'none';
        }
        switchToStaticImage(); // Display the static image and clear canvas
    }

    // This function contains all the logic that depends on videoData being loaded.
    function initializeInteractiveDemo() {
        // --- Image and Canvas Setup ---
        // Set the src first to initiate loading. This is crucial.
        staticImage.src = INITIAL_IMAGE_PATH;

        staticImage.onload = () => {
            console.log("Static image loaded successfully via onload event. Path:", INITIAL_IMAGE_PATH);
            if (staticImage.naturalWidth > 0 && staticImage.naturalHeight > 0) {
                // Image has intrinsic dimensions, now proceed to set up canvas and other elements based on its rendered size.
                setupImageAndCanvas();
            } else {
                console.error("Static image 'onload' fired, but naturalWidth/Height is 0. The image file might be corrupted, an empty image, or the path is still incorrect despite onload.", INITIAL_IMAGE_PATH);
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = "Error: Static image loaded but reports no dimensions. Check image file and path.";
                    debugFilenameDisplay.style.display = 'block';
                    debugFilenameDisplay.style.color = 'red';
                }
                // Attempt to show static image (likely broken icon/alt text)
                // and ensure canvas is hidden as it can't be sized.
                staticImage.style.display = 'block';
                canvas.style.display = 'none';
            }
        };

        staticImage.onerror = () => {
            console.error("Failed to load the static image (onerror event). Path:", INITIAL_IMAGE_PATH);
            if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                debugFilenameDisplay.textContent = `Error: Failed to load static image: ${INITIAL_IMAGE_PATH}. Check path & that server can access it.`;
                debugFilenameDisplay.style.display = 'block';
                debugFilenameDisplay.style.color = 'red';
            }
            staticImage.style.display = 'block'; // Show alt text
            canvas.style.display = 'none';
            videoPlayer.style.display = 'none';
            container.innerHTML = `<p style="color: red; text-align: center; border: 1px solid red; padding: 10px;">Could not load the interactive demo's base image (${INITIAL_IMAGE_PATH}). Please verify the file path and ensure your local server is serving the file correctly.</p>`;
        };

        // Handle cases where the image might be cached and 'complete' very quickly
        // This check is secondary if 'src' is set before 'onload' handler attachment.
        if (staticImage.complete && staticImage.getAttribute('src') === INITIAL_IMAGE_PATH) {
            console.log("Static image was already complete (cached).");
            // Use a minimal timeout to allow the browser to potentially calculate dimensions
            // if it was rendered from cache before this script part ran.
            setTimeout(() => {
                if (staticImage.naturalWidth > 0 && staticImage.naturalHeight > 0) {
                    // If setupImageAndCanvas hasn't run effectively (e.g., imageWidth is still 0)
                    if (!imageWidth || imageWidth === 0) {
                        console.log("Image complete with dimensions, running setupImageAndCanvas.");
                        setupImageAndCanvas();
                    }
                } else if (staticImage.naturalWidth === 0) {
                    // If 'complete' but no natural dimensions, it's likely an error.
                    console.warn("Static image 'complete' but has 0 natural dimensions (cached scenario). Path might be wrong or image invalid:", INITIAL_IMAGE_PATH);
                    // Manually trigger error display if it hasn't already shown.
                    if (!debugFilenameDisplay || !debugFilenameDisplay.textContent.includes("Error:")) {
                         staticImage.onerror();
                    }
                }
            }, 50); // Small delay
        }


        // --- Event Listeners ---
        container.addEventListener('mousedown', (e) => {
            if (videoPlayer.style.display === 'block' && !videoPlayer.paused) {
                switchToStaticImage();
            }

            if (!imageWidth || imageWidth === 0) {
                console.warn("Image/Canvas dimensions not properly set on mousedown. Dragging might be unreliable.");
                // Attempting a re-setup if image seems loaded but dimensions were missed
                if(staticImage.naturalWidth > 0 && staticImage.naturalHeight > 0) {
                    console.log("Attempting to re-run setupImageAndCanvas on mousedown.");
                    setupImageAndCanvas();
                }
                if (!imageWidth || imageWidth === 0) {
                     console.error("Still failed to get image dimensions on mousedown. Aborting drag start.");
                     isDragging = false; // Ensure dragging doesn't start
                     return;
                }
            }

            isDragging = true;
            const rect = container.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            if (!imageWidth || imageWidth === 0) return;

            const rect = container.getBoundingClientRect();
            let currentX = e.clientX - rect.left;
            let currentY = e.clientY - rect.top;

            let dx = currentX - startX;
            let dy = currentY - startY;
            let dragDistance = Math.sqrt(dx * dx + dy * dy);

            if (dragDistance > maxPixelDragLength) {
                const ratio = maxPixelDragLength / dragDistance;
                dx *= ratio;
                dy *= ratio;
                currentX = startX + dx;
                currentY = startY + dy;
            }
            drawArrow(startX, startY, currentX, currentY);
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;

            if (Object.keys(videoData).length === 0) {
                console.warn("videoData is not loaded yet. Mouseup event cannot be processed.");
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = "Debug: videoData not loaded. Cannot process interaction.";
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }
             if (!imageWidth || imageWidth === 0 || !maxPixelDragLength) {
                console.error("Image dimensions or maxPixelDragLength not available on mouseup. Cannot process interaction.");
                switchToStaticImage();
                return;
            }

            const rect = container.getBoundingClientRect();
            let endX = e.clientX - rect.left;
            let endY = e.clientY - rect.top;

            let dx = endX - startX;
            let dy = endY - startY;
            let pixelLength = Math.sqrt(dx * dx + dy * dy);

            if (pixelLength < 1) {
                if (canvas.width > 0 && canvas.height > 0) ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }

            if (pixelLength > maxPixelDragLength) {
                const ratio = maxPixelDragLength / pixelLength;
                dx *= ratio;
                dy *= ratio;
                pixelLength = maxPixelDragLength;
            }

            const normStartX = startX / imageWidth;
            const normStartY = startY / imageHeight;

            const availableJsonCoordKeys = Object.keys(videoData);
            let closestCoordKey = null;
            let minCoordDist = Infinity;

            availableJsonCoordKeys.forEach(keyStr => {
                const jsonCoord = parseCoordString(keyStr);
                if (jsonCoord) {
                    const jsonY_equivalent_from_top = 1.0 - jsonCoord.y;
                    const dist = Math.sqrt(Math.pow(normStartX - jsonCoord.x, 2) + Math.pow(normStartY - jsonY_equivalent_from_top, 2));
                    if (dist < minCoordDist) {
                        minCoordDist = dist;
                        closestCoordKey = keyStr;
                    }
                }
            });

            if (!closestCoordKey) {
                console.error("Could not find a closest coordinate point in JSON.");
                 if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = "Debug: Closest coordinate point not found in JSON data.";
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }

            const MAX_ALLOWED_PIXEL_DISTANCE_TO_INTERACTIVE_POINT = 100;
            const closestJsonCoordData = parseCoordString(closestCoordKey);

            if (!closestJsonCoordData) {
                console.error("Error parsing the identified closestCoordKey:", closestCoordKey);
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = "Debug: Error parsing closestCoordKey string from JSON.";
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }

            const cjx_norm = closestJsonCoordData.x;
            const cjy_from_json_bottom = closestJsonCoordData.y;
            const cjy_norm_from_top = 1.0 - cjy_from_json_bottom;
            const deltaX_norm = normStartX - cjx_norm;
            const deltaY_norm = normStartY - cjy_norm_from_top;
            const actualPixelDistance = Math.sqrt(Math.pow(deltaX_norm * imageWidth, 2) + Math.pow(deltaY_norm * imageHeight, 2));

            if (actualPixelDistance > MAX_ALLOWED_PIXEL_DISTANCE_TO_INTERACTIVE_POINT) {
                console.log(`Clicked too far from any interactive point. Actual distance: ${actualPixelDistance.toFixed(1)}px (Max allowed: ${MAX_ALLOWED_PIXEL_DISTANCE_TO_INTERACTIVE_POINT}px).`);
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = `Debug: Click too far (${actualPixelDistance.toFixed(1)}px > ${MAX_ALLOWED_PIXEL_DISTANCE_TO_INTERACTIVE_POINT}px). No video.`;
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }

            let angleDeg = Math.atan2(-dy, dx) * (180 / Math.PI);
            if (angleDeg < 0) angleDeg += 360;

            const coordData = videoData[closestCoordKey];
            if (!coordData) {
                console.error("No data for coordinate:", closestCoordKey);
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = `Debug: No data for coordinate ${closestCoordKey}.`;
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }

            const availableAngleStrings = Object.keys(coordData);
            const availableAnglesNumeric = availableAngleStrings.map(s => parseFloat(s));
            const closestNumericAngle = findClosestNumericValue(angleDeg, availableAnglesNumeric);

            if (closestNumericAngle === null) {
                console.error("Could not find a closest angle for:", closestCoordKey, angleDeg);
                 if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = `Debug: No closest angle for ${closestCoordKey}, ${angleDeg.toFixed(1)}°.`;
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }
            const closestAngleKey = availableAngleStrings.find(key => parseFloat(key) === closestNumericAngle);

            const normalizedForce = pixelLength / maxPixelDragLength; // maxPixelDragLength could be 0 if image didn't load
            const targetNumericForce = findClosestNumericValue(normalizedForce, PREDEFINED_FORCES);

            if (targetNumericForce === null) {
                console.error("Could not determine target force category for normalized force:", normalizedForce);
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = `Debug: Could not determine target force category.`;
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }
            const targetForceKey = targetNumericForce.toFixed(3);

            const angleData = coordData[closestAngleKey];
            if (!angleData) {
                console.error("No angle data for:", closestCoordKey, closestAngleKey);
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = `Debug: No data for ${closestCoordKey} -> ${closestAngleKey}.`;
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
                return;
            }

            const videoFileArray = angleData[targetForceKey];

            if (videoFileArray && videoFileArray.length > 0) {
                const videoFilename = videoFileArray[0];
                console.log(`Preparing: Coord ${closestCoordKey}, Angle ${closestAngleKey} (${angleDeg.toFixed(1)}°), Force ${targetForceKey} (norm: ${normalizedForce.toFixed(2)}), File: ${videoFilename}`);

                if (imageWidth > 0 && imageHeight > 0) { // Only draw arrow if canvas is properly sized
                    staticImage.style.display = 'block';
                    canvas.style.display = 'block';
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    drawArrow(startX, startY, startX + dx, startY + dy);
                } else {
                    staticImage.style.display = 'block'; // Show static image (or alt)
                    canvas.style.display = 'none'; // Keep canvas hidden
                }


                videoPlayer.style.display = 'none';
                if (!videoPlayer.paused) videoPlayer.pause();

                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = `Loading: ${videoFilename}`;
                    debugFilenameDisplay.style.display = 'block';
                }

                videoPlayer.src = VIDEOS_BASE_PATH + videoFilename;

                const onVideoReadyToPlay = () => {
                    videoPlayer.removeEventListener('loadeddata', onVideoReadyToPlay);
                    videoPlayer.removeEventListener('error', onVideoLoadError);
                    if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                        debugFilenameDisplay.textContent = `Playing: ${videoFilename}`;
                    }
                    staticImage.style.display = 'none';
                    canvas.style.display = 'none';
                    videoPlayer.style.display = 'block';
                    videoPlayer.play().catch(err => {
                        console.error("Error playing video:", err);
                        if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                            debugFilenameDisplay.textContent = `Error playing: ${videoFilename}`;
                        }
                        switchToStaticImage();
                    });
                };

                const onVideoLoadError = (e) => {
                    videoPlayer.removeEventListener('loadeddata', onVideoReadyToPlay);
                    videoPlayer.removeEventListener('error', onVideoLoadError);
                    console.error(`Error loading video data for ${videoFilename}:`, e);
                    if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                        debugFilenameDisplay.textContent = `Error loading: ${videoFilename}`;
                    }
                    switchToStaticImage();
                };

                videoPlayer.addEventListener('loadeddata', onVideoReadyToPlay);
                videoPlayer.addEventListener('error', onVideoLoadError);
                videoPlayer.load();

            } else {
                console.warn(`Video not found for: Coord ${closestCoordKey}, Angle ${closestAngleKey}, Force ${targetForceKey}`);
                if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                    debugFilenameDisplay.textContent = `Video not found for: ${closestCoordKey} / ${closestAngleKey}° / ${targetForceKey} force`;
                    debugFilenameDisplay.style.display = 'block';
                }
                switchToStaticImage();
            }
        });

        videoPlayer.addEventListener('ended', () => {
            switchToStaticImage();
        });

        videoPlayer.addEventListener('error', (e) => { // General video playback errors
            console.error("Video player error:", e);
            const currentVideoSrc = videoPlayer.currentSrc || "unknown video";
            if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                debugFilenameDisplay.textContent = `Video player error for: ${currentVideoSrc.split('/').pop()}`;
                debugFilenameDisplay.style.display = 'block';
            }
            switchToStaticImage();
        });

    } // End of initializeInteractiveDemo

    // --- Main execution flow on DOMContentLoaded ---
    if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
        debugFilenameDisplay.textContent = "Loading video data...";
        debugFilenameDisplay.style.display = 'block';
    }

    fetch(VIDEO_DATA_PATH)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} when fetching ${VIDEO_DATA_PATH}. Check if the file exists and the path is correct.`);
            }
            return response.json();
        })
        .then(data => {
            videoData = data;
            console.log("Video data loaded successfully.");
            if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                // Wait for image to attempt loading before changing this message further
            }
            initializeInteractiveDemo(); // Now that data is loaded, initialize the interactive parts
        })
        .catch(error => {
            console.error("Fatal Error: Could not load video data. Interactive features will be disabled.", error);
            if (DEBUG_SHOW_FILENAME && debugFilenameDisplay) {
                debugFilenameDisplay.textContent = `FATAL ERROR: Cannot load video data from ${VIDEO_DATA_PATH}. ${error.message}`;
                debugFilenameDisplay.style.color = 'red';
                debugFilenameDisplay.style.display = 'block';
            }
            // Even if JSON fails, attempt to set up the static image (it might also fail if path is wrong)
            staticImage.src = INITIAL_IMAGE_PATH;
            staticImage.onerror = () => {
                 console.error("Failed to load the static image (onerror event during JSON load fallback). Path:", INITIAL_IMAGE_PATH);
                 if (debugFilenameDisplay) {
                     debugFilenameDisplay.textContent += ` | Also failed to load static image: ${INITIAL_IMAGE_PATH}.`;
                 }
                 container.innerHTML = `<p style="color: red; text-align: center; border: 1px solid red; padding: 10px;">Could not load critical resources (JSON data and/or base image). Please check file paths and server configuration.</p>`;
            };
            staticImage.onload = () => { // If static image loads despite JSON error
                if(staticImage.naturalWidth > 0) setupImageAndCanvas(); else staticImage.onerror();
            };
             if (staticImage.complete && staticImage.getAttribute('src') === INITIAL_IMAGE_PATH) {
                if(staticImage.naturalWidth > 0) setupImageAndCanvas(); else staticImage.onerror();
            }

        });
});