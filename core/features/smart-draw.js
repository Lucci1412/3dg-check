// ============================================================
// 3DG Map Tools — Feature Module 2: Smart Drawer (Vẽ Đường / Vẽ Sông)
// - Interactive Polyline & Parallel Line Drawer
// - Fast Double-Click & End-Vertex Click Finish
// - Supports DGT, DTL, MNC, LUA, CLN land types & custom stroke colors
// - Synchronizes with OpenLayers map sources & 3DG React State
// ============================================================

(function () {
    'use strict';

    function log() {}

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
    let justFinishedTime = 0;
    let lastSnapInfo = { coord: null, isSnapped: false };

    function setLandTypeAndColor(type, color) {
        if (type) currentLandType = type;
        if (color) currentColor = color;
        ensureNative3dgLineModeActive(currentLandType);
        renderSmartDrawCanvas();
        log(`Updated SmartDrawer LandType: ${currentLandType}, Color: ${currentColor}`);
    }

    function setSideOption(side) {
        if (side === 'right' || side === 'left' || side === 'both') {
            currentSide = side;
            renderSmartDrawCanvas();
            log(`Updated SmartDrawer Side: ${currentSide}`);
        }
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
                const snappedOffset = snapOffsetLineCoords(map, offsetCoords, 25);
                const cleanOffset = sanitizeCoords(snappedOffset);
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

        // 3. Draw Green Magnet Ring Snap Indicator if mouse is snapped to existing vertex
        if (lastSnapInfo && lastSnapInfo.isSnapped && lastSnapInfo.coord) {
            const snapPx = map.getPixelFromCoordinate(lastSnapInfo.coord);
            if (snapPx && !isNaN(snapPx[0]) && !isNaN(snapPx[1])) {
                ctx.beginPath();
                ctx.arc(snapPx[0], snapPx[1], 9, 0, Math.PI * 2);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2.5;
                ctx.shadowColor = '#22c55e';
                ctx.shadowBlur = 10;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(snapPx[0], snapPx[1], 4, 0, Math.PI * 2);
                ctx.fillStyle = '#22c55e';
                ctx.fill();
            }
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

    // ===== VERTEX SNAPPING UTILITY =====
    function getSnappedCoordinate(map, rawCoord, pxThreshold = 20) {
        if (!map || !rawCoord) return { coord: rawCoord, isSnapped: false };
        const mousePx = map.getPixelFromCoordinate(rawCoord);
        if (!mousePx) return { coord: rawCoord, isSnapped: false };

        let closestCoord = rawCoord;
        let minPxDist = pxThreshold;
        let isSnapped = false;

        const { sources } = findAllTargetLineSources(map);
        sources.forEach(src => {
            if (!src || !src.getFeatures) return;
            const features = src.getFeatures();
            features.forEach(f => {
                const geom = f.getGeometry?.();
                if (!geom) return;
                const type = geom.getType?.();
                let coords = [];
                if (type === 'LineString') {
                    coords = geom.getCoordinates() || [];
                } else if (type === 'MultiLineString') {
                    const lines = geom.getCoordinates() || [];
                    lines.forEach(l => coords.push(...l));
                } else if (type === 'Polygon') {
                    const rings = geom.getCoordinates() || [];
                    rings.forEach(r => coords.push(...r));
                }

                coords.forEach(pt => {
                    const px = map.getPixelFromCoordinate(pt);
                    if (px && !isNaN(px[0]) && !isNaN(px[1])) {
                        const dist = Math.hypot(mousePx[0] - px[0], mousePx[1] - px[1]);
                        if (dist < minPxDist) {
                            minPxDist = dist;
                            closestCoord = pt;
                            isSnapped = true;
                        }
                    }
                });
            });
        });

        return { coord: closestCoord, isSnapped };
    }

    function snapOffsetLineCoords(map, offsetCoords, snapThresholdPx = 25) {
        if (!map || !offsetCoords || offsetCoords.length === 0) return offsetCoords;
        const snapped = [];
        for (let i = 0; i < offsetCoords.length; i++) {
            const snapRes = getSnappedCoordinate(map, offsetCoords[i], snapThresholdPx);
            if (snapRes.isSnapped) {
                snapped.push(snapRes.coord);
            } else {
                snapped.push(offsetCoords[i]);
            }
        }
        return snapped;
    }

    // ===== MOUSE INTERACTION HANDLERS =====
    function isUIElementClick(e) {
        if (!e || !e.target) return false;
        // Click ngoài .ol-viewport (panel, nút UI...) → không phải click vẽ
        const viewport = document.querySelector('.ol-viewport');
        if (viewport && !viewport.contains(e.target)) return true;
        return !!(e.target.closest('#topo-checker-panel') || e.target.closest('#topo-fab-btn') || e.target.closest('.topo-area-bar'));
    }

    function onMouseDown(e) {
        if (!isSmartDrawing || isUIElementClick(e) || e.button !== 0 || (Date.now() - justFinishedTime < 450)) return;
        mouseDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
    }

    function onMouseUp(e) {
        if (!isSmartDrawing || !mouseDownPos || isUIElementClick(e) || e.button !== 0 || (Date.now() - justFinishedTime < 450)) return;

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
        const rawCoord = map.getCoordinateFromPixel(px);

        if (rawCoord) {
            const snapRes = getSnappedCoordinate(map, rawCoord, 20);
            const coord = snapRes.coord;
            lastSnapInfo = snapRes;

            const now = Date.now();
            const timeDiff = now - lastClickInfo.time;
            const clickDist = lastClickInfo.pos ? Math.hypot(e.clientX - lastClickInfo.pos.x, e.clientY - lastClickInfo.pos.y) : Infinity;

            let isFinishAction = false;

            // Finish condition 1: Rapid double click (two clicks within 600ms and < 40px)
            if (activePoints.length >= 1 && timeDiff < 600 && clickDist < 40) {
                isFinishAction = true;
            }

            // Finish condition 2: Clicked on or near the last placed vertex (< 35px)
            if (!isFinishAction && activePoints.length >= 2) {
                const lastPt = activePoints[activePoints.length - 1];
                const lastPx = map.getPixelFromCoordinate(lastPt);
                if (lastPx) {
                    const distToLast = Math.hypot(px[0] - lastPx[0], px[1] - lastPx[1]);
                    if (distToLast < 35) {
                        isFinishAction = true;
                    }
                }
            }

            if (isFinishAction) {
                log('⚡ Finish condition met (Double click or clicked last vertex)! Finishing line...');
                lastClickInfo = { time: 0, pos: null };

                // Clean up duplicate point added by second click of double-click if close to last point
                if (activePoints.length >= 2) {
                    const pLast = activePoints[activePoints.length - 1];
                    const pPrev = activePoints[activePoints.length - 2];
                    const pxLast = map.getPixelFromCoordinate(pLast);
                    const pxPrev = map.getPixelFromCoordinate(pPrev);
                    if (pxLast && pxPrev && Math.hypot(pxLast[0] - pxPrev[0], pxLast[1] - pxPrev[1]) < 35) {
                        activePoints.pop();
                    }
                }

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
        const rawCoord = map.getCoordinateFromPixel(px);

        if (rawCoord) {
            const snapRes = getSnappedCoordinate(map, rawCoord, 20);
            currentMouseCoord = snapRes.coord;
            lastSnapInfo = snapRes;
            renderSmartDrawCanvas();
        }
    }

    function onDblClick(e) {
        if (!isSmartDrawing || isUIElementClick(e) || (Date.now() - justFinishedTime < 450)) return;
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();

        if (activePoints.length >= 1) {
            log('⚡ Captured native dblclick! Finishing line...');
            if (activePoints.length >= 2) {
                const pLast = activePoints[activePoints.length - 1];
                const pPrev = activePoints[activePoints.length - 2];
                const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
                if (map && pLast && pPrev) {
                    const pxLast = map.getPixelFromCoordinate(pLast);
                    const pxPrev = map.getPixelFromCoordinate(pPrev);
                    if (pxLast && pxPrev && Math.hypot(pxLast[0] - pxPrev[0], pxLast[1] - pxPrev[1]) < 40) {
                        activePoints.pop();
                    }
                }
            }
            finishSmartDrawing();
        }
    }

    function setDistanceInMeters(dist) {
        if (typeof dist === 'number' && !isNaN(dist) && dist > 0) {
            currentDistance = dist;
            renderSmartDrawCanvas();
            log(`Updated SmartDrawer Distance: ${currentDistance}m`);
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
    function findAllTargetLineSources(map) {
        if (!map) return { primary: null, sources: [], sample: null };

        let sources = [];
        let primarySource = null;
        let sampleLineFeature = null;

        function walk(layer) {
            if (typeof layer.getLayers === 'function') {
                try { layer.getLayers().forEach(walk); } catch (e) {}
                return;
            }
            try {
                const src = layer.getSource?.();
                if (!src || typeof src.addFeature !== 'function' || !src.getFeatures) return;

                const layerId = String(layer.get?.('id') || layer.get?.('name') || layer.get?.('title') || '').toLowerCase();
                if (layerId.includes('topo') || layerId.includes('highlight') || layerId.includes('overlay') || layerId.includes('canvas')) return;

                const features = src.getFeatures();
                let hasLineString = false;
                for (const f of features) {
                    const type = f.getGeometry?.()?.getType?.();
                    if (type === 'LineString') {
                        hasLineString = true;
                        if (!sampleLineFeature) sampleLineFeature = f;
                        break;
                    }
                }

                if (!sources.includes(src)) {
                    sources.push(src);
                }

                if (hasLineString || layerId.includes('edit') || layerId.includes('draw') || layerId.includes('main') || layerId.includes('vector')) {
                    if (!primarySource) primarySource = src;
                }
            } catch (e) {}
        }

        try {
            map.getLayers().forEach(walk);
        } catch (e) {}

        if (!primarySource && sources.length > 0) {
            primarySource = sources[0];
        }

        return { primary: primarySource, sources: sources, sample: sampleLineFeature };
    }

    // Lấy source trực tiếp từ Draw interaction (tin cậy hơn walk layer tree)
    // vì App không đặt tên layer, findAllTargetLineSources có thể trả về source sai
    function getDrawInteractionSource(map) {
        if (!map) return null;
        try {
            const interactions = map.getInteractions().getArray();
            for (const inter of interactions) {
                if (inter.source_ && typeof inter.source_.addFeature === 'function'
                    && inter.type_ === 'LineString') {
                    return inter.source_;
                }
            }
            for (const inter of interactions) {
                if (inter.source_ && typeof inter.source_.addFeature === 'function'
                    && typeof inter.source_.getFeatures === 'function') {
                    return inter.source_;
                }
            }
        } catch (e) {}
        return null;
    }

    function createOlStyleForFeature(color, width = 3.5, sampleFeature = null, map = null) {
        const ol = window.ol || window.openlayers;
        let StyleClass = ol?.style?.Style;
        let StrokeClass = ol?.style?.Stroke;

        if (!StyleClass && sampleFeature && typeof sampleFeature.getStyle === 'function') {
            try {
                const st = sampleFeature.getStyle();
                const sampleInst = typeof st === 'function' ? st(sampleFeature, 1) : st;
                const item = Array.isArray(sampleInst) ? sampleInst[0] : sampleInst;
                if (item) {
                    StyleClass = item.constructor;
                    if (typeof item.getStroke === 'function') {
                        const strokeInst = item.getStroke();
                        if (strokeInst) StrokeClass = strokeInst.constructor;
                    }
                }
            } catch (e) {}
        }

        if (!StyleClass && map) {
            try {
                map.getLayers().forEach(layer => {
                    if (StyleClass) return;
                    const st = layer.getStyle?.();
                    if (st) {
                        const sampleInst = typeof st === 'function' ? st(null, 1) : st;
                        const item = Array.isArray(sampleInst) ? sampleInst[0] : sampleInst;
                        if (item) {
                            StyleClass = item.constructor;
                            if (typeof item.getStroke === 'function') {
                                const strokeInst = item.getStroke();
                                if (strokeInst) StrokeClass = strokeInst.constructor;
                            }
                        }
                    }
                });
            } catch (e) {}
        }

        if (StyleClass && StrokeClass) {
            try {
                return new StyleClass({
                    stroke: new StrokeClass({
                        color: color,
                        width: width
                    })
                });
            } catch (e) {}
        }

        return null;
    }

    // ===== ADD POLYLINE FEATURE WITH DYNAMICS LAND TYPE & COLOR =====
    function addPolylineFeatureToMap(map, coords, extraProps = {}) {
        const clean = sanitizeCoords(coords);
        if (!map || !clean || clean.length < 2) return null;

        const ol = window.ol || window.openlayers;
        const { primary: layerSource, sources: allSources, sample: sampleFeature } = findAllTargetLineSources(map);

        // Ưu tiên dùng source từ Draw interaction trực tiếp (chính xác hơn walk layer tree)
        const drawSource = getDrawInteractionSource(map);
        const targetSource = drawSource || layerSource;

        if (!targetSource) {
            log('No vector source available on map to insert feature.');
            return null;
        }

        // Lấy sample feature để clone constructor
        let resolvedSample = sampleFeature;
        if (!resolvedSample && drawSource) {
            const feats = drawSource.getFeatures();
            if (feats.length > 0) resolvedSample = feats[0];
        }

        const activeColor = extraProps.color || currentColor || '#ffaa32';
        const strokeColor = activeColor;
        const featureId = generateUUID();

        // Chỉ set đúng 2 properties mà native 3DG dùng: _editId + color
        // KHÔNG set landType/Layer (3DG group select theo Layer)
        try {
            let feat = null;
            let newGeom = null;

            if (resolvedSample && resolvedSample.getGeometry) {
                const sampleGeom = resolvedSample.getGeometry();
                if (sampleGeom && typeof sampleGeom.clone === 'function'
                    && typeof sampleGeom.setCoordinates === 'function'
                    && sampleGeom.getType?.() === 'LineString') {
                    try {
                        newGeom = sampleGeom.clone();
                        newGeom.setCoordinates(clean);
                    } catch (e) {}
                }
            }

            if (!newGeom && resolvedSample) {
                try {
                    const LineStringClass = resolvedSample.getGeometry()?.constructor;
                    if (LineStringClass) {
                        newGeom = new LineStringClass(clean, 'XY');
                    }
                } catch (e) {}
            }

            if (!newGeom && ol?.geom?.LineString) {
                try { newGeom = new ol.geom.LineString(clean); } catch (e) {}
            }

            if (!newGeom) {
                log('Cannot create LineString geometry.');
                return null;
            }

            const FeatureClass = resolvedSample?.constructor || ol?.Feature;
            if (FeatureClass) {
                try { feat = new FeatureClass({ geometry: newGeom }); } catch (e) {}
            }

            if (feat) {
                try {
                    if (typeof feat.setId === 'function') feat.setId(featureId);
                    feat.id_ = featureId;

                    if (typeof feat.set === 'function') {
                        feat.set('_editId', featureId);
                        feat.set('color', strokeColor);
                        feat.set('strokeColor', strokeColor);
                    }

                    const customStyle = createOlStyleForFeature(strokeColor, 3.5, resolvedSample, map);
                    if (customStyle && typeof feat.setStyle === 'function') {
                        feat.setStyle(customStyle);
                    }

                    const existing = targetSource.getFeatureById ? targetSource.getFeatureById(featureId) : null;
                    if (!existing) {
                        targetSource.addFeature(feat);
                    }

                    if (layerSource && layerSource !== targetSource) {
                        try {
                            const ex2 = layerSource.getFeatureById ? layerSource.getFeatureById(featureId) : null;
                            if (!ex2) layerSource.addFeature(feat);
                        } catch (e) {}
                    }
                } catch (e) { }
            }

            log(`✅ Saved LineString [${featureId}] into Draw source.`);
            return feat;
        } catch (e) {
            console.error('[SmartDrawer] Failed to add feature to OpenLayers map source:', e);
        }
        return null;
    }

    function cleanupNative3dgDefaultLine(map) {
        if (!map) return;
        // Check ALL sources (not just primary) since 3DG may create BAN_VE line in a different source
        const { sources: allSources } = findAllTargetLineSources(map);

        allSources.forEach(source => {
            if (!source || !source.getFeatures) return;
            try {
                const features = [...source.getFeatures()]; // Clone to avoid mutation during iteration
                features.forEach(f => {
                    const landType = f.get?.('landType');
                    const layerProp = f.get?.('Layer') || f.get?.('layer') || '';
                    const color = f.get?.('color') || f.get?.('stroke') || '';
                    const name = f.get?.('name') || '';

                    // Native 3DG BAN_VE line: no landType, Layer === 'BAN_VE', gray color (#c8c8c8)
                    const isBanVeLine = !landType && (
                        layerProp === 'BAN_VE' ||
                        color.toLowerCase() === '#c8c8c8' ||
                        (/^Đường\s+[a-z0-9]+$/i.test(name) && !landType)
                    );

                    if (isBanVeLine) {
                        const id = f.getId?.() || '';
                        log(`🧹 Removing native 3DG default BAN_VE line [Layer:${layerProp}] [color:${color}] [name:${name}] (${id})`);
                        try {
                            source.removeFeature(f);
                            if (typeof source.changed === 'function') source.changed();
                        } catch (e) {}
                    }
                });
            } catch (e) {}
        });
    }

    // ===== ENSURE NATIVE 3DG EDIT PANEL & LINE MODE =====
    function ensureNative3dgLineModeActive(landType = 'DGT') {
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

            const targetText = (landType === 'DTL') ? 'Sông' : 'Đường';

            const trySelectLine = () => {
                const labels = Array.from(document.querySelectorAll('.ant-segmented-item, label'));
                const lineLabel = labels.find(el => {
                    const text = (el.textContent || '').trim();
                    return text === targetText || (text.includes(targetText) && !text.includes('Smart') && !text.includes('Vẽ'));
                });

                if (lineLabel) {
                    const input = lineLabel.querySelector('input') || lineLabel.closest('label')?.querySelector('input');
                    if (input && !input.checked) {
                        lineLabel.click();
                        input.click();
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (!lineLabel.classList.contains('ant-segmented-item-selected')) {
                        lineLabel.click();
                    }
                }

                const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
                if (map && isSmartDrawing) {
                    disableNativeMapInteractions(map);
                }
            };

            trySelectLine();
            setTimeout(trySelectLine, 150);
            setTimeout(trySelectLine, 400);
        } catch (e) {
            console.warn('[SmartDrawer] Failed to auto-trigger native edit panel and line mode:', e);
        }
    }

    // ===== FINISH & SAVE DRAWING =====
    function finishSmartDrawing() {
        const cleanPoints = sanitizeCoords(activePoints);
        if (!isSmartDrawing || cleanPoints.length < 2) {
            activePoints = [];
            currentMouseCoord = null;
            clearCanvas();
            return;
        }

        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) return;

        const scale = getMeterScaleFactor(cleanPoints[0]);
        const scaledDist = currentDistance * scale;

        const extraProps = {
            landType: currentLandType,
            color: currentColor
        };

        // Tìm Select interaction để deselect sau khi add xong
        const allInteractions = map.getInteractions().getArray();
        const selectInter = allInteractions.find(inter =>
            typeof inter.getFeatures === 'function' &&
            typeof inter.setActive === 'function'
        );

        if (currentSide === 'both') {
            // For 'both': only create 2 offset lines (left + right), NO center line
            ['right', 'left'].forEach(side => {
                const dist = side === 'left' ? -scaledDist : scaledDist;
                let offsetCoords = computeParallelOffset(cleanPoints, dist);
                // Không snap đường offset — snap 25px khi zoom out = nhiều mét thực
                // → endpoint offset bị snap vào endpoint gốc → 2 đường trùng thành 1
                const cleanOffset = sanitizeCoords(offsetCoords);
                if (cleanOffset.length >= 2) {
                    addPolylineFeatureToMap(map, cleanOffset, extraProps);
                }
            });
        } else {
            // For 'right' or 'left': main drawn line + 1 parallel offset = 2 independent lines
            addPolylineFeatureToMap(map, cleanPoints, extraProps);
            const dist = currentSide === 'left' ? -scaledDist : scaledDist;
            let offsetCoords = computeParallelOffset(cleanPoints, dist);
            // Không snap đường offset — tránh merge 2 đường thành 1 khi zoom out
            const cleanOffset = sanitizeCoords(offsetCoords);
            if (cleanOffset.length >= 2) {
                addPolylineFeatureToMap(map, cleanOffset, extraProps);
            }
        }

        // Deselect: dispatch 'select' event để buộc 3DG React cập nhật selection state về empty
        function forceDeselectViaEvent() {
            try {
                if (!selectInter) return;
                const featColl = selectInter.getFeatures?.();
                if (!featColl) return;
                const deselected = featColl.getArray().slice();
                featColl.clear();
                if (deselected.length > 0) {
                    try {
                        selectInter.dispatchEvent({
                            type: 'select',
                            selected: [],
                            deselected: deselected
                        });
                    } catch(e) {}
                }
                map.getInteractions().forEach(inter => {
                    if (inter !== selectInter && typeof inter.getFeatures === 'function') {
                        try { inter.getFeatures().clear(); } catch(e) {}
                    }
                });
                map.render();
            } catch(e) {}
        }
        setTimeout(forceDeselectViaEvent, 150);
        setTimeout(forceDeselectViaEvent, 500);

        try {
            window.dispatchEvent(new CustomEvent('topo:features-updated'));
        } catch (e) { }

        // Clean up native BAN_VE line created by 3DG native draw (giữ trong setTimeout
        // để tránh xóa trước khi feature của chúng ta được thêm vào)
        setTimeout(() => {
            cleanupNative3dgDefaultLine(map);
        }, 100);
        setTimeout(() => {
            cleanupNative3dgDefaultLine(map);
        }, 400);

        // Reset points for NEXT line, keeping drawer active for continuous parallel line drawing!
        activePoints = [];
        currentMouseCoord = null;
        lastClickInfo = { time: 0, pos: null };
        mouseDownPos = null;
        justFinishedTime = Date.now();
        clearCanvas();

        log('✅ Finish Smart Drawing complete and features saved. Ready for NEXT line!');
    }

    // ===== START / STOP SMART DRAWER =====
    function startSmartDrawing(options = {}) {
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) {
            alert('Không tìm thấy bản đồ 3DG OpenLayers!');
            return false;
        }

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

        ensureNative3dgLineModeActive(currentLandType);

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
    window.__smartDrawerSetDistance = setDistanceInMeters;
    window.__smartDrawerSetSide = setSideOption;

})();
