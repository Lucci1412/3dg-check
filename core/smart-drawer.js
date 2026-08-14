// ============================================================
// 3DG Map Tools — Smart Dual Line Drawer Module
// Tự động sinh đường nét vẽ (Bên phải / Bên trái / Cả 2 bên) theo khoảng cách cài đặt
// 1. Gán thuộc tính mặc định: Đất giao thông DGT (#ffaa32)
// 2. Tự động Snap (bắt điểm) đường song song phụ khớp 100% với đường trước đó
// ============================================================

(function () {
    'use strict';

    function log(...args) {
        console.log('[SmartDrawer]', ...args);
    }

    let isSmartDrawing = false;
    let currentDistance = 5.0; // mét
    let currentSide = 'right'; // 'right', 'left', 'both'
    let activePoints = [];
    let currentMouseCoord = null;

    let canvasOverlay = null;

    // Cache lưu các cặp điểm đầu-cuối của đường chính & đường phụ để Snap tự động
    const endpointPairCache = [];

    function registerEndpointPair(mainCoords, parallelCoords) {
        if (!mainCoords || mainCoords.length < 2 || !parallelCoords || parallelCoords.length < 2) return;
        endpointPairCache.push({
            mainStart: mainCoords[0],
            mainEnd: mainCoords[mainCoords.length - 1],
            parallelStart: parallelCoords[0],
            parallelEnd: parallelCoords[parallelCoords.length - 1]
        });
    }

    function snapParallelLineEndpoints(mainCoords, parallelCoords, snapTolSq = 16.0) {
        if (!parallelCoords || parallelCoords.length < 2 || !mainCoords || mainCoords.length < 2) return parallelCoords;
        const result = parallelCoords.map(p => [...p]);

        function distSq(p1, p2) {
            return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;
        }

        // Snap điểm đầu của đường song song phụ
        const mainStart = mainCoords[0];
        for (let i = endpointPairCache.length - 1; i >= 0; i--) {
            const pair = endpointPairCache[i];
            if (distSq(mainStart, pair.mainEnd) <= snapTolSq) {
                result[0] = [...pair.parallelEnd];
                break;
            } else if (distSq(mainStart, pair.mainStart) <= snapTolSq) {
                result[0] = [...pair.parallelStart];
                break;
            }
        }

        // Snap điểm cuối của đường song song phụ
        const mainEnd = mainCoords[mainCoords.length - 1];
        for (let i = endpointPairCache.length - 1; i >= 0; i--) {
            const pair = endpointPairCache[i];
            if (distSq(mainEnd, pair.mainEnd) <= snapTolSq) {
                result[result.length - 1] = [...pair.parallelEnd];
                break;
            } else if (distSq(mainEnd, pair.mainStart) <= snapTolSq) {
                result[result.length - 1] = [...pair.parallelStart];
                break;
            }
        }

        return result;
    }

    // ===== SPATIAL PARALLEL OFFSET ALGORITHM (WITH MITER JOIN CORNER HANDLING) =====
    function computeParallelOffset(coords, distance) {
        if (!coords || coords.length < 2) return [];

        const offsetCoords = [];
        const n = coords.length;

        function getNormal(p1, p2) {
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-9) return [0, 0];
            return [dy / len, -dx / len]; // Right-hand normal
        }

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

    // ===== WEB MERCATOR (EPSG:3857) SCALE FACTOR FOR REAL-WORLD METERS =====
    function getMeterScaleFactor(coord) {
        if (!coord || Math.abs(coord[1]) < 90) return 1.0;
        const y = coord[1];
        const rad = Math.atan(Math.sinh(y / 6378137));
        return 1.0 / Math.max(0.1, Math.cos(rad));
    }

    // ===== SANITIZE COORD ARRAY (REMOVE DUPLICATE ADJACENT VERTICES) =====
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

    // ===== CANVAS OVERLAY CREATION =====
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

        if (!isSmartDrawing || activePoints.length === 0) return;

        const fullCoords = [...activePoints];
        if (currentMouseCoord) {
            fullCoords.push(currentMouseCoord);
        }

        const cleanFull = sanitizeCoords(fullCoords);
        if (cleanFull.length < 1) return;

        const pixels = cleanFull.map(pt => map.getPixelFromCoordinate(pt)).filter(p => p && !isNaN(p[0]) && !isNaN(p[1]));
        if (pixels.length === 0) return;

        ctx.save();

        // 1. Draw Original Line 1 (DGT Orange / Cyan LineString)
        if (pixels.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(pixels[0][0], pixels[0][1]);
            for (let i = 1; i < pixels.length; i++) {
                ctx.lineTo(pixels[i][0], pixels[i][1]);
            }
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = '#ffaa32'; // Màu DGT (Đất giao thông)
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        // Draw original vertex dots
        pixels.forEach(p => {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffaa32';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // 2. Compute & Draw Parallel Offset Line 2 (With Auto End Snap)
        if (cleanFull.length >= 2) {
            const scale = getMeterScaleFactor(cleanFull[0]);
            const scaledDist = currentDistance * scale;

            const renderSides = currentSide === 'both' ? ['right', 'left'] : [currentSide];

            renderSides.forEach(side => {
                const dist = side === 'left' ? -scaledDist : scaledDist;
                let offsetCoords = computeParallelOffset(cleanFull, dist);
                offsetCoords = snapParallelLineEndpoints(cleanFull, offsetCoords, 16.0);
                const cleanOffset = sanitizeCoords(offsetCoords);
                const offsetPixels = cleanOffset.map(pt => map.getPixelFromCoordinate(pt)).filter(p => p && !isNaN(p[0]) && !isNaN(p[1]));

                if (offsetPixels.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(offsetPixels[0][0], offsetPixels[0][1]);
                    for (let i = 1; i < offsetPixels.length; i++) {
                        ctx.lineTo(offsetPixels[i][0], offsetPixels[i][1]);
                    }
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = '#ffaa32';
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
                        ctx.strokeStyle = '#ffaa32';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    });
                }
            });
        }

        ctx.restore();
    }

    // ===== MOUSE INTERACTION HANDLERS (WITH DRAG/PAN DETECTION) =====
    let mouseDownPos = null;

    function isUIElementClick(e) {
        if (!e || !e.target) return false;
        return !!(e.target.closest('#topo-checker-panel') || e.target.closest('#topo-fab-btn') || e.target.closest('.topo-area-bar'));
    }

    function onMouseDown(e) {
        if (!isSmartDrawing || isUIElementClick(e) || e.button !== 0) return;
        mouseDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
    }

    function onMouseUp(e) {
        if (!isSmartDrawing || !mouseDownPos || isUIElementClick(e) || e.button !== 0) return;

        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        const dist = Math.hypot(dx, dy);
        const duration = Date.now() - mouseDownPos.time;

        mouseDownPos = null;

        if (dist > 6 || duration > 350) {
            log('Ignored point placement because user was dragging/panning the map.');
            return;
        }

        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        const canvas = getOrCreateCanvasOverlay();
        if (!map || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const px = [e.clientX - rect.left, e.clientY - rect.top];
        const coord = map.getCoordinateFromPixel(px);

        if (coord) {
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
        e.preventDefault();
        e.stopPropagation();

        const clean = sanitizeCoords(activePoints);
        if (clean.length >= 2) {
            finishSmartDrawing();
        } else {
            stopSmartDrawing();
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

    // ===== FIND TARGET VECTOR SOURCE FOR LINESTRINGS =====
    function findTargetLineSource(map) {
        let lineSource = null;
        let sampleLineFeature = null;

        if (!map) return { source: null, sample: null };

        map.getLayers().forEach(l => {
            if (lineSource) return;
            const src = l.getSource?.();
            if (src && typeof src.addFeature === 'function' && l.get('name') !== 'preview') {
                const feats = src.getFeatures?.() || [];
                const lineFeat = feats.find(f => {
                    const g = f.getGeometry?.();
                    return g && (g.getType?.() === 'LineString' || g.constructor?.name === 'LineString');
                });
                if (lineFeat) {
                    lineSource = src;
                    sampleLineFeature = lineFeat;
                }
            }
        });

        if (!lineSource) {
            map.getLayers().forEach(l => {
                if (lineSource) return;
                const src = l.getSource?.();
                if (src && typeof src.addFeature === 'function' && l.get('name') !== 'preview') {
                    lineSource = src;
                    const feats = src.getFeatures?.() || [];
                    if (feats.length > 0) sampleLineFeature = feats[0];
                }
            });
        }

        return { source: lineSource, sample: sampleLineFeature };
    }

    // ===== ADD POLYLINE FEATURE WITH DGT (ĐẤT GIAO THÔNG) PROPERTIES =====
    function addPolylineFeatureToMap(map, coords, extraProps = {}) {
        const clean = sanitizeCoords(coords);
        if (!map || !clean || clean.length < 2) return;

        const ol = window.ol || window.openlayers;
        const { source: targetSource, sample: sampleFeature } = findTargetLineSource(map);

        if (!targetSource) {
            log('No vector source available on map to insert feature.');
            return;
        }

        // DGT Properties
        const dgtProperties = {
            landType: 'DGT',
            name: 'Đất công trình giao thông (DGT)',
            color: '#ffaa32',
            ...extraProps
        };

        try {
            if (ol && ol.Feature && ol.geom && ol.geom.LineString) {
                const geom = new ol.geom.LineString(clean);
                const feat = new ol.Feature({ geometry: geom });
                feat.setProperties(dgtProperties);

                // If OpenLayers style is used on feature
                if (ol.style) {
                    feat.setStyle(new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#ffaa32',
                            width: 2.5
                        })
                    }));
                }

                targetSource.addFeature(feat);
                log('Added DGT LineString via ol.geom.LineString.');
                return;
            }

            if (sampleFeature) {
                const FeatureClass = sampleFeature.constructor;
                let LineStringClass = sampleFeature.getGeometry()?.constructor;

                if (sampleFeature.getGeometry()?.getType?.() !== 'LineString') {
                    map.getLayers().forEach(l => {
                        const src = l.getSource?.();
                        if (src && src.getFeatures) {
                            for (const f of src.getFeatures()) {
                                const g = f.getGeometry?.();
                                if (g && g.getType?.() === 'LineString') {
                                    LineStringClass = g.constructor;
                                    break;
                                }
                            }
                        }
                    });
                }

                if (LineStringClass && LineStringClass.name !== 'Polygon') {
                    const newGeom = new LineStringClass(clean);
                    if (newGeom.getType && newGeom.getType() === 'Polygon') {
                        log('Warning: LineStringClass constructed a Polygon! Fallback to open coordinates array.');
                    } else {
                        const newFeat = new FeatureClass({ geometry: newGeom });

                        try {
                            const props = sampleFeature.getProperties() || {};
                            delete props.geometry;
                            newFeat.setProperties({ ...props, ...dgtProperties });
                        } catch (e) {
                            newFeat.setProperties(dgtProperties);
                        }

                        targetSource.addFeature(newFeat);
                        log('Added DGT LineString via constructor.');
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('[SmartDrawer] Failed to add feature to OpenLayers map source:', e);
        }
    }

    // ===== FINISH & SAVE DRAWING =====
    function finishSmartDrawing() {
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

        // 1. Thêm đường chính (DGT Line 1)
        addPolylineFeatureToMap(map, cleanPoints);

        // 2. Thêm đường phụ (DGT Line 2) có Tự Động Bắt Điểm (Snap) vào đường trước đó
        renderSides.forEach(side => {
            const dist = side === 'left' ? -scaledDist : scaledDist;
            let offsetCoords = computeParallelOffset(cleanPoints, dist);
            offsetCoords = snapParallelLineEndpoints(cleanPoints, offsetCoords, 16.0);
            const cleanOffset = sanitizeCoords(offsetCoords);
            if (cleanOffset.length >= 2) {
                addPolylineFeatureToMap(map, cleanOffset);
                registerEndpointPair(cleanPoints, cleanOffset);
            }
        });

        stopSmartDrawing();
        log('✅ Finished creating DGT LineString features with Auto Snap!');
    }

    // ===== START / STOP SMART DRAWING CONTROLLER =====
    function startSmartDrawing(options = {}) {
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) {
            alert('❌ Chưa kết nối được bản đồ 3DG!');
            return false;
        }

        currentDistance = options.distance !== undefined ? Number(options.distance) : 5.0;
        currentSide = options.side || 'right';

        stopSmartDrawing();
        isSmartDrawing = true;
        activePoints = [];
        currentMouseCoord = null;
        mouseDownPos = null;

        const canvas = getOrCreateCanvasOverlay();
        if (canvas) {
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = 'crosshair';
            canvas.addEventListener('mousedown', onMouseDown);
            canvas.addEventListener('mouseup', onMouseUp);
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('dblclick', onDblClick);
        }

        window.addEventListener('keydown', onKeyDown);

        try {
            map.on('postrender', renderSmartDrawCanvas);
            const view = map.getView();
            if (view && view.on) {
                view.on('change:center', renderSmartDrawCanvas);
                view.on('change:resolution', renderSmartDrawCanvas);
            }
        } catch (e) {}

        log(`🚀 Kích hoạt vẽ đường (Khoảng cách lề: ${currentDistance}m, Hướng: ${currentSide}, Loại đất: DGT)`);
        return true;
    }

    function stopSmartDrawing() {
        isSmartDrawing = false;
        activePoints = [];
        currentMouseCoord = null;
        mouseDownPos = null;

        const canvas = document.getElementById('topo-smart-draw-canvas');
        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('dblclick', onDblClick);
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
        }

        window.removeEventListener('keydown', onKeyDown);
        clearCanvas();
        log('Stopped smart drawing.');
    }

    function isSmartDrawingActive() {
        return isSmartDrawing;
    }

    // Expose module functions on window
    window.__smartDrawerStart = startSmartDrawing;
    window.__smartDrawerStop = stopSmartDrawing;
    window.__smartDrawerFinish = finishSmartDrawing;
    window.__smartDrawerIsActive = isSmartDrawingActive;

    log('Smart Line Drawer Canvas module loaded (DGT & Auto-Snap enabled).');
})();
