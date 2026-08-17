// ============================================================
// 3DG Map Tools — Feature Module 2: Smart Drawer (Vẽ Đường / Vẽ Sông)
// - Interactive Polyline & Parallel Line Drawer
// - Fast Double-Click & End-Vertex Click Finish
// - Supports DGT, DTL, MNC, LUA, CLN land types & custom stroke colors
// - Synchronizes with OpenLayers map sources & 3DG React State
// ============================================================

(function () {
    'use strict';

    function log(...args) {
        console.log('[SmartDrawFeature]', ...args);
    }

    // ===== STATE MANAGEMENT =====
    let isSmartDrawing = false;
    let activePoints = [];
    let currentMouseCoord = null;
    let canvasOverlay = null;

    let currentDistance = 5.0; // meters
    let currentSide = 'right'; // 'right', 'left', 'both'
    let currentLandType = 'DGT';
    let currentColor = '#ffaa32';

    let lastClickInfo = { time: 0, pos: null };
    let mouseDownPos = null;

    function setLandTypeAndColor(type, color) {
        if (type) currentLandType = type;
        if (color) currentColor = color;
        renderSmartDrawCanvas();
        log(`Updated SmartDrawer LandType: ${currentLandType}, Color: ${currentColor}`);
    }

    // ===== GEOMETRY UTILITIES =====
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'feat-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    }

    function getMeterScaleFactor(point) {
        if (!point) return 1.0;
        const lat = point[1];
        if (lat > -90 && lat < 90 && Math.abs(lat) < 85 && (point[0] > -180 && point[0] < 180)) {
            return 1.0 / (111320.0 * Math.cos(lat * Math.PI / 180.0));
        }
        return 1.0; // EPSG:3857 planar meters
    }

    function getNormal(p1, p2) {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) return [0, 0];
        return [-dy / len, dx / len];
    }

    function computeParallelOffset(coords, distance) {
        if (!coords || coords.length < 2) return [];

        const offsetCoords = [];
        const n = coords.length;

        for (let i = 0; i < n; i++) {
            if (i === 0) {
                const norm = getNormal(coords[0], coords[1]);
                offsetCoords.push([coords[0][0] + norm[0] * distance, coords[0][1] + norm[1] * distance]);
            } else if (i === n - 1) {
                const norm = getNormal(coords[n - 2], coords[n - 1]);
                offsetCoords.push([coords[n - 1][0] + norm[0] * distance, coords[n - 1][1] + norm[1] * distance]);
            } else {
                const n1 = getNormal(coords[i - 1], coords[i]);
                const n2 = getNormal(coords[i], coords[i + 1]);
                const mx = n1[0] + n2[0];
                const my = n1[1] + n2[1];
                const mLen = Math.sqrt(mx * mx + my * my);

                if (mLen < 1e-6) {
                    offsetCoords.push([coords[i][0] + n1[0] * distance, coords[i][1] + n1[1] * distance]);
                } else {
                    const mNorm = [mx / mLen, my / mLen];
                    const dot = n1[0] * mNorm[0] + n1[1] * mNorm[1];
                    const scale = distance / Math.max(0.15, dot);
                    const clampedScale = Math.min(Math.abs(distance * 2.5), Math.abs(scale)) * Math.sign(distance);

                    offsetCoords.push([coords[i][0] + mNorm[0] * clampedScale, coords[i][1] + mNorm[1] * clampedScale]);
                }
            }
        }
        return offsetCoords;
    }

    function sanitizeCoords(pts) {
        if (!pts || pts.length < 2) return pts || [];
        const cleaned = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const prev = cleaned[cleaned.length - 1];
            const curr = pts[i];
            if (Math.abs(curr[0] - prev[0]) > 1e-5 || Math.abs(curr[1] - prev[1]) > 1e-5) {
                cleaned.push(curr);
            }
        }
        return cleaned;
    }

    // ===== CANVAS OVERLAY FOR LIVE PREVIEW =====
    function getOrCreateCanvasOverlay() {
        if (canvasOverlay && document.body.contains(canvasOverlay)) {
            return canvasOverlay;
        }

        const viewport = document.querySelector('.ol-viewport');
        if (!viewport) return null;

        let canvas = document.getElementById('topo-smart-draw-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'topo-smart-draw-canvas';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '999';
            viewport.appendChild(canvas);
        }

        const rect = viewport.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        canvasOverlay = canvas;
        return canvas;
    }

    function clearCanvas() {
        const canvas = getOrCreateCanvasOverlay();
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    // ===== RENDER LIVE CANVAS PREVIEW =====
    function renderSmartDrawCanvas() {
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        const canvas = getOrCreateCanvasOverlay();
        if (!canvas || !map) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (activePoints.length === 0) return;

        const fullCoords = [...activePoints];
        if (currentMouseCoord) {
            fullCoords.push(currentMouseCoord);
        }

        const cleanFull = sanitizeCoords(fullCoords);
        if (cleanFull.length < 1) return;

        const pixels = cleanFull.map(pt => map.getPixelFromCoordinate(pt)).filter(p => p && !isNaN(p[0]) && !isNaN(p[1]));
        if (pixels.length === 0) return;

        ctx.save();

        // 1. Draw Original Line 1 (Dynamic land color)
        if (pixels.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(pixels[0][0], pixels[0][1]);
            for (let i = 1; i < pixels.length; i++) {
                ctx.lineTo(pixels[i][0], pixels[i][1]);
            }
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = currentColor || '#ffaa32';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        // Draw original vertex dots
        pixels.forEach(p => {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
            ctx.fillStyle = currentColor || '#ffaa32';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // 2. Compute & Draw Parallel Offset Line 2
        if (cleanFull.length >= 2) {
            const scale = getMeterScaleFactor(cleanFull[0]);
            const scaledDist = currentDistance * scale;

            const renderSides = currentSide === 'both' ? ['right', 'left'] : [currentSide];

            renderSides.forEach(side => {
                const dist = side === 'left' ? -scaledDist : scaledDist;
                let offsetCoords = computeParallelOffset(cleanFull, dist);
                const cleanOffset = sanitizeCoords(offsetCoords);
                const offsetPixels = cleanOffset.map(pt => map.getPixelFromCoordinate(pt)).filter(p => p && !isNaN(p[0]) && !isNaN(p[1]));

                if (offsetPixels.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(offsetPixels[0][0], offsetPixels[0][1]);
                    for (let i = 1; i < offsetPixels.length; i++) {
                        ctx.lineTo(offsetPixels[i][0], offsetPixels[i][1]);
                    }
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = currentColor || '#ffaa32';
                    ctx.shadowColor = '#ef4444';
                    ctx.shadowBlur = 8;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.setLineDash([8, 5]);
                    ctx.stroke();

                    // Core line
                    ctx.lineWidth = 2.5;
                    ctx.strokeStyle = '#ffff00';
                    ctx.shadowBlur = 0;
                    ctx.setLineDash([]);
                    ctx.stroke();

                    // Offset vertex dots
                    offsetPixels.forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
                        ctx.fillStyle = '#ffff00';
                        ctx.fill();
                        ctx.strokeStyle = currentColor || '#ffaa32';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    });
                }
            });
        }
        ctx.restore();
    }

    // ===== DISABLE / RESTORE NATIVE MAP INTERACTIONS =====
    function disableNativeMapInteractions(map) {
        if (!map || typeof map.getInteractions !== 'function') return;
        try {
            map.getInteractions().forEach(interaction => {
                if (interaction && typeof interaction.setActive === 'function') {
                    const name = interaction.constructor?.name || '';
                    if (name.includes('Draw') || name.includes('Modify') || name.includes('Snap') || name.includes('DoubleClickZoom')) {
                        if (interaction.getActive()) {
                            interaction.setActive(false);
                            interaction.__topoDisabled = true;
                        }
                    }
                }
            });
        } catch (e) {}
    }

    function restoreNativeMapInteractions(map) {
        if (!map || typeof map.getInteractions !== 'function') return;
        try {
            map.getInteractions().forEach(interaction => {
                if (interaction && interaction.__topoDisabled) {
                    interaction.setActive(true);
                    delete interaction.__topoDisabled;
                }
            });
        } catch (e) {}
    }

    // ===== MOUSE INTERACTION HANDLERS =====
    function isUIElementClick(e) {
        if (!e || !e.target) return false;
        return !!(e.target.closest('#topo-checker-panel') || e.target.closest('#topo-fab-btn') || e.target.closest('.topo-area-bar'));
    }

    function onMouseDown(e) {
        if (!isSmartDrawing || isUIElementClick(e) || e.button !== 0) return;
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        mouseDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
    }

    function onMouseUp(e) {
        if (!isSmartDrawing || !mouseDownPos || isUIElementClick(e) || e.button !== 0) return;
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        const dist = Math.hypot(dx, dy);
        const duration = Date.now() - mouseDownPos.time;

        mouseDownPos = null;

        if (dist > 6 || duration > 350) return; // Ignored dragging

        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        const canvas = getOrCreateCanvasOverlay();
        if (!map || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const px = [e.clientX - rect.left, e.clientY - rect.top];
        const coord = map.getCoordinateFromPixel(px);

        if (coord) {
            const now = Date.now();
            const timeDiff = now - lastClickInfo.time;
            const clickDist = lastClickInfo.pos ? Math.hypot(e.clientX - lastClickInfo.pos.x, e.clientY - lastClickInfo.pos.y) : Infinity;

            // Only evaluate finish condition if we ALREADY have >= 2 points placed
            let isFinishAction = false;
            if (activePoints.length >= 2) {
                const lastPt = activePoints[activePoints.length - 1];
                const lastPx = map.getPixelFromCoordinate(lastPt);
                if (lastPx) {
                    const distToLast = Math.hypot(px[0] - lastPx[0], px[1] - lastPx[1]);
                    if (distToLast < 25) {
                        isFinishAction = true;
                    }
                }
                if (timeDiff < 500 && clickDist < 25) {
                    isFinishAction = true;
                }
            }

            if (isFinishAction) {
                log('⚡ Finish condition met (Double click or clicked last vertex)! Finishing line...');
                lastClickInfo = { time: 0, pos: null };
                finishSmartDrawing();
                return;
            }

            lastClickInfo = { time: now, pos: { x: e.clientX, y: e.clientY } };
            activePoints.push(coord);
            renderSmartDrawCanvas();
            document.dispatchEvent(new CustomEvent('topo:area-point-added', { detail: { count: activePoints.length } }));
            log(`Added point #${activePoints.length}: [${coord[0].toFixed(2)}, ${coord[1].toFixed(2)}]`);
        }
    }

    function onMouseMove(e) {
        if (!isSmartDrawing || activePoints.length === 0 || isUIElementClick(e)) return;

        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        const canvas = getOrCreateCanvasOverlay();
        if (!map || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const px = [e.clientX - rect.left, e.clientY - rect.top];
        const coord = map.getCoordinateFromPixel(px);

        if (coord) {
            currentMouseCoord = coord;
            renderSmartDrawCanvas();
        }
    }

    function onDblClick(e) {
        if (!isSmartDrawing) return;
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        e.preventDefault();

        if (activePoints.length >= 2) {
            log('⚡ Captured native dblclick with >= 2 points! Finishing line...');
            finishSmartDrawing();
        }
    }

    function onKeyDown(e) {
        if (!isSmartDrawing) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            finishSmartDrawing();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            stopSmartDrawing();
        }
    }

    function attachEventListeners() {
        window.addEventListener('mousedown', onMouseDown, true);
        window.addEventListener('mouseup', onMouseUp, true);
        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('dblclick', onDblClick, true);
        window.addEventListener('keydown', onKeyDown, true);

        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (map) {
            try {
                map.on('postrender', renderSmartDrawCanvas);
                const view = map.getView();
                if (view && view.on) {
                    view.on('change:center', renderSmartDrawCanvas);
                    view.on('change:resolution', renderSmartDrawCanvas);
                }
            } catch (e) {}
        }
    }

    function detachEventListeners() {
        window.removeEventListener('mousedown', onMouseDown, true);
        window.removeEventListener('mouseup', onMouseUp, true);
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('dblclick', onDblClick, true);
        window.removeEventListener('keydown', onKeyDown, true);

        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (map) {
            try {
                map.un('postrender', renderSmartDrawCanvas);
            } catch (e) {}
        }
    }

    // ===== FIND VECTOR SOURCE =====
    function findTargetLineSource(map) {
        if (!map) return { source: null, sample: null };

        let lineSource = null;
        let sampleLineFeature = null;

        function walk(layer) {
            if (typeof layer.getLayers === 'function') {
                try { layer.getLayers().forEach(walk); } catch (e) {}
                return;
            }
            try {
                const src = layer.getSource?.();
                if (!src?.getFeatures) return;
                const features = src.getFeatures();
                for (const f of features) {
                    const type = f.getGeometry?.()?.getType?.();
                    if (type === 'LineString') {
                        lineSource = src;
                        sampleLineFeature = f;
                        return;
                    }
                }
                if (!lineSource && features.length > 0 && typeof src.addFeature === 'function') {
                    lineSource = src;
                }
            } catch (e) {}
        }

        try {
            map.getLayers().forEach(walk);
        } catch (e) {}

        return { source: lineSource, sample: sampleLineFeature };
    }

    // ===== ADD POLYLINE FEATURE WITH DYNAMICS LAND TYPE & COLOR =====
    function addPolylineFeatureToMap(map, coords, extraProps = {}) {
        const clean = sanitizeCoords(coords);
        if (!map || !clean || clean.length < 2) return null;

        const ol = window.ol || window.openlayers;
        const { source: targetSource, sample: sampleFeature } = findTargetLineSource(map);

        if (!targetSource) {
            log('No vector source available on map to insert feature.');
            return null;
        }

        const landNameMap = {
            'DGT': 'Đất công trình giao thông (DGT)',
            'DTL': 'Đất công trình thủy lợi (DTL)',
            'MNC': 'Đất có mặt nước chuyên dùng (MNC)',
            'LUA': 'Đất trồng lúa (LUA)',
            'CLN': 'Đất trồng cây lâu năm (CLN)',
            'ONT': 'Đất ở tại nông thôn (ONT)',
            'ODT': 'Đất ở tại đô thị (ODT)'
        };

        const featureId = generateUUID();
        const dgtProperties = {
            id: featureId,
            landType: currentLandType || 'DGT',
            name: landNameMap[currentLandType] || `Đất ${currentLandType || 'DGT'}`,
            color: currentColor || '#ffaa32',
            ...extraProps
        };

        try {
            let feat = null;
            let newGeom = null;

            if (sampleFeature && sampleFeature.getGeometry) {
                const sampleGeom = sampleFeature.getGeometry();
                if (sampleGeom && typeof sampleGeom.clone === 'function' && typeof sampleGeom.setCoordinates === 'function' && sampleGeom.getType?.() === 'LineString') {
                    try {
                        newGeom = sampleGeom.clone();
                        newGeom.setCoordinates(clean);
                    } catch (e) {}
                }
            }

            if (!newGeom && ol && ol.Feature && ol.geom && ol.geom.LineString) {
                try {
                    newGeom = new ol.geom.LineString(clean);
                } catch (e) {}
            }

            if (sampleFeature) {
                const FeatureClass = sampleFeature.constructor;

                if (!newGeom) {
                    try {
                        const LineStringClass = sampleFeature.getGeometry()?.constructor;
                        if (LineStringClass && LineStringClass.name !== 'Polygon') {
                            newGeom = new LineStringClass(clean, 'XY');
                        }
                    } catch (e) {}
                }

                if (newGeom) {
                    feat = new FeatureClass({ geometry: newGeom });
                    if (typeof feat.setId === 'function') feat.setId(featureId);
                    feat.set('id', featureId);

                    try {
                        const props = sampleFeature.getProperties() || {};
                        delete props.geometry;
                        feat.setProperties({ ...props, ...dgtProperties });
                    } catch (e) {
                        feat.setProperties(dgtProperties);
                    }
                }
            } else if (ol && ol.Feature && newGeom) {
                feat = new ol.Feature({ geometry: newGeom });
                if (typeof feat.setId === 'function') feat.setId(featureId);
                feat.set('id', featureId);
                feat.setProperties(dgtProperties);
            }

            if (feat) {
                try {
                    feat.set('landType', dgtProperties.landType);
                    feat.set('color', dgtProperties.color);
                    feat.set('name', dgtProperties.name);

                    const strokeColor = dgtProperties.color || '#ffaa32';
                    if (ol && ol.style && ol.style.Style && ol.style.Stroke) {
                        feat.setStyle(new ol.style.Style({
                            stroke: new ol.style.Stroke({
                                color: strokeColor,
                                width: 3.5
                            })
                        }));
                    }

                    targetSource.addFeature(feat);
                    if (typeof targetSource.changed === 'function') targetSource.changed();
                    targetSource.dispatchEvent({ type: 'addfeature', feature: feat });
                    targetSource.dispatchEvent('addfeature');
                } catch (e) { }
            }

            const geojsonFeat = {
                type: 'Feature',
                id: featureId,
                geometry: {
                    type: 'LineString',
                    coordinates: clean
                },
                properties: dgtProperties
            };

            if (!feat && targetSource) {
                const format = targetSource.getFormat ? targetSource.getFormat() : targetSource.format_;
                if (format && typeof format.readFeature === 'function') {
                    try {
                        feat = format.readFeature(geojsonFeat);
                        if (feat) {
                            try { targetSource.addFeature(feat); } catch (e) {}
                        }
                    } catch (e) {}
                }
            }

            if (window.__topoSyncFeatureToReactState) {
                window.__topoSyncFeatureToReactState(feat, geojsonFeat);
            }

            log(`✅ Saved LineString [${featureId}] into OpenLayers source & React State.`);
            return feat || geojsonFeat;
        } catch (e) {
            console.error('[SmartDrawer] Failed to add feature to OpenLayers map source:', e);
        }
        return null;
    }

    // ===== ENSURE NATIVE 3DG EDIT PANEL & LINE MODE =====
    function ensureNative3dgLineModeActive() {
        try {
            const isPanelOpen = Array.from(document.querySelectorAll('div, span, h1, h2, h3, header'))
                .some(el => (el.textContent || '').trim().includes('Biên tập dữ liệu'));

            if (!isPanelOpen) {
                const btns = Array.from(document.querySelectorAll('button'));
                const editBtn = btns.find(b => {
                    const svg = b.querySelector('svg');
                    if (!svg) return false;
                    const html = svg.outerHTML || '';
                    return html.includes('16.24 11.51') || html.includes('16.24') || html.includes('20.71 7.04') || (b.title && b.title.includes('Biên tập'));
                });

                if (editBtn) {
                    editBtn.click();
                    log('✅ Auto-clicked main 3DG Edit tool button to open "Biên tập dữ liệu" panel.');
                }
            }

            const trySelectLine = () => {
                const labels = Array.from(document.querySelectorAll('.ant-segmented-item, label'));
                const lineLabel = labels.find(el => {
                    const text = (el.textContent || '').trim();
                    return text === 'Đường' || (text.includes('Đường') && !text.includes('Smart') && !text.includes('Vẽ'));
                });

                if (lineLabel) {
                    const input = lineLabel.querySelector('input') || lineLabel.closest('label')?.querySelector('input');
                    if (input && !input.checked) {
                        lineLabel.click();
                        input.click();
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        log('✅ Automatically activated native 3DG "Đường" mode radio button.');
                    } else if (!lineLabel.classList.contains('ant-segmented-item-selected')) {
                        lineLabel.click();
                        log('✅ Clicked native 3DG "Đường" mode segment label.');
                    }
                }
            };

            trySelectLine();
            setTimeout(trySelectLine, 250);
            setTimeout(trySelectLine, 600);
        } catch (e) {
            console.warn('[SmartDrawer] Failed to auto-trigger native edit panel and line mode:', e);
        }
    }

    // ===== FINISH & SAVE DRAWING =====
    function finishSmartDrawing() {
        ensureNative3dgLineModeActive();
        const cleanPoints = sanitizeCoords(activePoints);
        if (!isSmartDrawing || cleanPoints.length < 2) {
            stopSmartDrawing();
            return;
        }

        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) return;

        const scale = getMeterScaleFactor(cleanPoints[0]);
        const scaledDist = currentDistance * scale;
        const renderSides = currentSide === 'both' ? ['right', 'left'] : [currentSide];

        const landNameMap = {
            'DGT': 'Đất công trình giao thông (DGT)',
            'DTL': 'Đất công trình thủy lợi (DTL)',
            'MNC': 'Đất có mặt nước chuyên dùng (MNC)',
            'LUA': 'Đất trồng lúa (LUA)',
            'CLN': 'Đất trồng cây lâu năm (CLN)',
            'ONT': 'Đất ở tại nông thôn (ONT)',
            'ODT': 'Đất ở tại đô thị (ODT)'
        };

        const extraProps = {
            landType: currentLandType,
            color: currentColor,
            name: landNameMap[currentLandType] || `Đất ${currentLandType}`
        };

        const mainFeat = addPolylineFeatureToMap(map, cleanPoints, extraProps);

        renderSides.forEach(side => {
            const dist = side === 'left' ? -scaledDist : scaledDist;
            let offsetCoords = computeParallelOffset(cleanPoints, dist);
            const cleanOffset = sanitizeCoords(offsetCoords);
            if (cleanOffset.length >= 2) {
                addPolylineFeatureToMap(map, cleanOffset, extraProps);
            }
        });

        try {
            window.dispatchEvent(new CustomEvent('topo:features-updated'));
        } catch (e) { }

        stopSmartDrawing();
        log('✅ Finish Smart Drawing complete and features saved.');
    }

    // ===== START / STOP SMART DRAWER =====
    function startSmartDrawing(options = {}) {
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) {
            alert('Không tìm thấy bản đồ 3DG OpenLayers!');
            return false;
        }

        ensureNative3dgLineModeActive();
        disableNativeMapInteractions(map);

        isSmartDrawing = true;
        activePoints = [];
        currentMouseCoord = null;
        lastClickInfo = { time: 0, pos: null };
        mouseDownPos = null;

        currentDistance = options.distance || 5.0;
        currentSide = options.side || 'right';
        if (options.landType) currentLandType = options.landType;
        if (options.color) currentColor = options.color;

        const canvas = getOrCreateCanvasOverlay();
        if (canvas) canvas.style.pointerEvents = 'none';

        attachEventListeners();
        clearCanvas();

        log(`Smart Drawer activated! Mode: [${currentLandType}], Color: [${currentColor}], Dist: [${currentDistance}m]`);
        return true;
    }

    function stopSmartDrawing() {
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (map) restoreNativeMapInteractions(map);

        isSmartDrawing = false;
        activePoints = [];
        currentMouseCoord = null;
        lastClickInfo = { time: 0, pos: null };
        mouseDownPos = null;

        detachEventListeners();
        clearCanvas();

        log('Smart Drawer stopped.');
    }

    // Global APIs
    window.__smartDrawerStart = startSmartDrawing;
    window.__smartDrawerStop = stopSmartDrawing;
    window.__smartDrawerFinish = finishSmartDrawing;
    window.__smartDrawerSetLandType = setLandTypeAndColor;

})();
