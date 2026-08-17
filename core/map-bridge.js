// ============================================================
// 3DG Map Tools — Core Map Bridge & Marker Overlay Engine
// - Finds OpenLayers map instance via React Fiber traversal
// - Provides DOM Pixel-synced Red Lightbulb Markers
// - Provides Smooth Zoom & Center navigation APIs
// ============================================================

(function () {
    'use strict';

    function log(...args) {
        console.log('[3DGMapBridge]', ...args);
    }

    // ===== FIND OPENLAYERS MAP VIA REACT FIBER =====
    function findOlMap() {
        const viewport = document.querySelector('.ol-viewport');
        if (!viewport) return null;
        let el = viewport.parentElement;
        while (el && el !== document.body) {
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (key) {
                let node = el[key];
                for (let d = 0; d < 200 && node; d++) {
                    try {
                        let s = node.memoizedState;
                        while (s) {
                            if (s.queue === null && s.memoizedState?.current) {
                                const cur = s.memoizedState.current;
                                if (typeof cur?.getInteractions === 'function' && typeof cur?.getLayers === 'function') return cur;
                            }
                            s = s.next;
                        }
                    } catch (e) { }
                    node = node.return;
                }
                break;
            }
            el = el.parentElement;
        }
        return null;
    }

    // Global reference for map
    window.__topoFindOlMap = findOlMap;
    window.__topoMap = null;

    // ===== DOM PIXEL-BASED MARKER & LINE HIGHLIGHT LAYER MANAGER =====
    let markerLayerDiv = null;
    let storedErrorItems = []; // { coord, element, activeElement, type }
    let storedDuplicateSegments = []; // [ { p1, p2, id } ]
    let activeDuplicateSegment = null; // { p1, p2, id }
    let activeErrorCoord = null;
    let isListenerAttached = false;

    function getOrCreateMarkerLayerDiv() {
        const viewport = document.querySelector('.ol-viewport');
        if (!viewport) return null;

        if (markerLayerDiv && viewport.contains(markerLayerDiv)) return markerLayerDiv;

        const div = document.createElement('div');
        div.id = 'topo-dom-marker-layer';
        div.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9999; overflow:visible;';
        viewport.appendChild(div);
        markerLayerDiv = div;
        return markerLayerDiv;
    }

    function getOrCreateHighlightCanvas() {
        const viewport = document.querySelector('.ol-viewport');
        if (!viewport) return null;

        let canvas = document.getElementById('topo-line-highlight-canvas');
        if (canvas && viewport.contains(canvas)) {
            if (canvas.width !== viewport.clientWidth || canvas.height !== viewport.clientHeight) {
                canvas.width = viewport.clientWidth;
                canvas.height = viewport.clientHeight;
            }
            return canvas;
        }

        canvas = document.createElement('canvas');
        canvas.id = 'topo-line-highlight-canvas';
        canvas.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9997; overflow:visible;';
        canvas.width = viewport.clientWidth;
        canvas.height = viewport.clientHeight;
        viewport.appendChild(canvas);
        return canvas;
    }
    // Set of disabled error highlight IDs (tắt sáng từng dây khi click)
    const disabledHighlightIds = new Set();

    function toggleErrorHighlight(errorId, forceState) {
        if (!errorId) return false;

        let isDisabled = false;
        if (typeof forceState === 'boolean') {
            if (!forceState) disabledHighlightIds.add(errorId);
            else disabledHighlightIds.delete(errorId);
            isDisabled = !forceState;
        } else {
            if (disabledHighlightIds.has(errorId)) {
                disabledHighlightIds.delete(errorId);
                isDisabled = false;
            } else {
                disabledHighlightIds.add(errorId);
                isDisabled = true;
            }
        }

        if (isDisabled && activeDuplicateSegment && activeDuplicateSegment.id === errorId) {
            activeDuplicateSegment = null;
        }

        updateMarkerPositions();
        return isDisabled;
    }

    function drawDuplicateHighlightsCanvas() {
        const map = window.__topoMap || findOlMap();
        const canvas = getOrCreateHighlightCanvas();
        if (!canvas || !map) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        function drawEndpointGlowingDot(pt, colorRing, colorDot, isLarge = false) {
            if (!pt) return;
            const px = map.getPixelFromCoordinate(pt);
            if (!px || isNaN(px[0]) || isNaN(px[1])) return;

            ctx.save();
            ctx.beginPath();
            ctx.arc(px[0], px[1], isLarge ? 14 : 9, 0, Math.PI * 2);
            ctx.fillStyle = colorRing;
            ctx.shadowColor = colorRing;
            ctx.shadowBlur = isLarge ? 18 : 12;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(px[0], px[1], isLarge ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = colorDot;
            ctx.shadowBlur = 0;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }

        // 1. Chỉ làm sáng ở 2 đầu mút của các đoạn trùng nét (Ưu tiên làm sáng đoạn ngắn hơn trên cùng)
        if (storedDuplicateSegments && storedDuplicateSegments.length > 0) {
            // Sắp xếp dài trước -> ngắn sau để các đoạn ngắn được vẽ đè lên trên cùng!
            const sortedSegs = [...storedDuplicateSegments].sort((a, b) => (b.length || 0) - (a.length || 0));

            sortedSegs.forEach(seg => {
                if (disabledHighlightIds.has(seg.id)) return;
                const pts = seg.pathCoords || (seg.p1 && seg.p2 ? [seg.p1, seg.p2] : null);
                if (pts && pts.length >= 2) {
                    const isShort = (seg.length || 0) < 30; // Đoạn ngắn dưới 30m phát sáng nổi bật hơn
                    drawEndpointGlowingDot(pts[0], isShort ? 'rgba(234, 88, 12, 0.95)' : 'rgba(245, 158, 11, 0.85)', isShort ? '#ffed4a' : '#fbbf24', isShort);
                    drawEndpointGlowingDot(pts[pts.length - 1], isShort ? 'rgba(234, 88, 12, 0.95)' : 'rgba(245, 158, 11, 0.85)', isShort ? '#ffed4a' : '#fbbf24', isShort);
                }
            });
        }

        // 2. Làm sáng 2 đầu mút của đoạn trùng đang được chọn trong danh sách lỗi
        if (activeDuplicateSegment && !disabledHighlightIds.has(activeDuplicateSegment.id)) {
            const pts = activeDuplicateSegment.pathCoords || (activeDuplicateSegment.p1 && activeDuplicateSegment.p2 ? [activeDuplicateSegment.p1, activeDuplicateSegment.p2] : null);
            if (pts && pts.length >= 2) {
                drawEndpointGlowingDot(pts[0], 'rgba(239, 68, 68, 0.95)', '#ffffff', true);
                drawEndpointGlowingDot(pts[pts.length - 1], 'rgba(239, 68, 68, 0.95)', '#ffffff', true);
            }
        }
    }

    function updateMarkerPositions() {
        const map = window.__topoMap || findOlMap();
        if (!map) return;

        if (storedErrorItems.length) {
            const container = getOrCreateMarkerLayerDiv();
            if (container) {
                storedErrorItems.forEach(item => {
                    try {
                        const pixel = map.getPixelFromCoordinate(item.coord);
                        if (pixel && !isNaN(pixel[0]) && !isNaN(pixel[1])) {
                            if (item.element) {
                                item.element.style.left = pixel[0] + 'px';
                                item.element.style.top = pixel[1] + 'px';
                                item.element.style.display = 'block';
                            }
                            if (item.activeElement) {
                                item.activeElement.style.left = pixel[0] + 'px';
                                item.activeElement.style.top = pixel[1] + 'px';
                                item.activeElement.style.display = 'block';
                            }
                        } else {
                            if (item.element) item.element.style.display = 'none';
                            if (item.activeElement) item.activeElement.style.display = 'none';
                        }
                    } catch (e) {}
                });
            }
        }

        drawDuplicateHighlightsCanvas();
    }

    function attachMapRenderListeners(map) {
        if (isListenerAttached || !map) return;
        isListenerAttached = true;

        try {
            map.on('postrender', updateMarkerPositions);
            map.on('rendercomplete', updateMarkerPositions);
        } catch(e) {}

        try {
            const view = map.getView();
            if (view && view.on) {
                view.on('change:center', updateMarkerPositions);
                view.on('change:resolution', updateMarkerPositions);
            }
        } catch(e) {}

        window.addEventListener('resize', updateMarkerPositions);
        setInterval(updateMarkerPositions, 200);
    }

    // Clear tất cả các marker & line highlight
    function clearAllErrorOverlays() {
        const container = getOrCreateMarkerLayerDiv();
        if (container) {
            container.innerHTML = '';
        }
        const canvas = document.getElementById('topo-line-highlight-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        storedErrorItems = [];
        storedDuplicateSegments = [];
        activeDuplicateSegment = null;
        activeErrorCoord = null;
    }

    // Hiển thị bóng đèn & highlight line cho TẤT CẢ các lỗi trên bản đồ
    function renderAllErrorOverlays(errors) {
        const map = window.__topoMap || findOlMap();
        if (!map) return;

        clearAllErrorOverlays();

        if (!errors || errors.length === 0) return;

        attachMapRenderListeners(map);
        const container = getOrCreateMarkerLayerDiv();
        if (!container) return;

        errors.forEach((err, idx) => {
            if (err.type === 'duplicate') {
                storedDuplicateSegments.push({
                    p1: err.segment ? err.segment[0] : err.coord,
                    p2: err.segment ? err.segment[1] : err.coord,
                    pathCoords: err.pathCoords || err.segment,
                    id: err.id,
                    length: err.length || 0
                });
            }

            const el = document.createElement('div');
            el.className = err.type === 'duplicate' ? 'topo-marker-bulb-container topo-marker-duplicate-container' : 'topo-marker-bulb-container';
            el.style.position = 'absolute';

            if (err.type === 'duplicate') {
                el.innerHTML = `
                    <div class="topo-marker-bulb-ring topo-marker-dup-ring"></div>
                    <div class="topo-marker-bulb-dot topo-marker-dup-dot" title="Lỗi #${idx + 1}: ${err.title} - ${err.description}"></div>
                `;
            } else {
                el.innerHTML = `
                    <div class="topo-marker-bulb-ring"></div>
                    <div class="topo-marker-bulb-dot" title="Lỗi #${idx + 1}: ${err.title}"></div>
                `;
            }
            container.appendChild(el);

            storedErrorItems.push({
                coord: err.coord,
                element: el,
                type: err.type
            });
        });

        updateMarkerPositions();
        log(`Rendered ${storedErrorItems.length} error overlays (${storedDuplicateSegments.length} duplicate line highlights) on map.`);
    }

    // Highlight lỗi được chọn (Zoom tới & hiển thị vòng hào quang lớn hơn / sáng line trùng)
    function highlightErrorLocation(coord, errorObj = null) {
        const map = window.__topoMap || findOlMap();
        if (!map) return;

        activeErrorCoord = coord;

        if (errorObj && errorObj.type === 'duplicate') {
            activeDuplicateSegment = {
                p1: errorObj.segment ? errorObj.segment[0] : errorObj.coord,
                p2: errorObj.segment ? errorObj.segment[1] : errorObj.coord,
                pathCoords: errorObj.pathCoords || errorObj.segment,
                id: errorObj.id
            };
        } else {
            activeDuplicateSegment = null;
        }

        attachMapRenderListeners(map);
        const container = getOrCreateMarkerLayerDiv();
        if (!container) return;

        const oldActive = container.querySelector('.topo-marker-active-container');
        if (oldActive) oldActive.remove();

        const el = document.createElement('div');
        el.className = 'topo-marker-active-container';
        el.style.position = 'absolute';
        el.innerHTML = `
            <div class="topo-marker-active-ring"></div>
            <div class="topo-marker-active-ring-inner"></div>
            <div class="topo-marker-active-dot"></div>
        `;
        container.appendChild(el);

        let found = storedErrorItems.find(i => Math.abs(i.coord[0] - coord[0]) < 1e-4 && Math.abs(i.coord[1] - coord[1]) < 1e-4);
        if (found) {
            found.activeElement = el;
        } else {
            storedErrorItems.push({
                coord: coord,
                element: el,
                activeElement: el,
                type: errorObj?.type || 'active'
            });
        }

        updateMarkerPositions();
    }

    // ===== NAVIGATE & ZOOM TO ERROR LOCATION =====
    function zoomToErrorLocation(coord, targetZoom = 23, errorObj = null) {
        const map = window.__topoMap || findOlMap();
        if (!map) {
            console.warn('[TopologyChecker] Không tìm thấy bản đồ OpenLayers!');
            return false;
        }

        window.__topoMap = map;
        const view = map.getView();
        if (!view) return false;

        highlightErrorLocation(coord, errorObj);

        let maxAllowedZoom = 24;
        if (typeof view.getMaxZoom === 'function') {
            const mz = view.getMaxZoom();
            if (mz && !isNaN(mz) && isFinite(mz)) maxAllowedZoom = mz;
        }

        const finalZoom = Math.min(maxAllowedZoom, Math.max(targetZoom, 23));

        try {
            view.animate({
                center: coord,
                zoom: finalZoom,
                duration: 400
            });
        } catch (e) {
            view.setCenter(coord);
            view.setZoom(finalZoom);
        }

        setTimeout(updateMarkerPositions, 100);
        setTimeout(updateMarkerPositions, 450);

        return true;
    }

    // ===== SYNC NEW FEATURES TO 3DG.VN REACT STATE & REDUX STORE =====
    function syncFeatureTo3dgReactState(olFeature, geojsonFeature) {
        const map = window.__topoMap || findOlMap();

        // 1. Dispatch drawend event on OpenLayers draw interactions
        if (map) {
            try {
                map.getInteractions().forEach(interaction => {
                    const ctorName = interaction.constructor?.name || '';
                    if (ctorName.includes('Draw') || typeof interaction.dispatchEvent === 'function') {
                        try {
                            interaction.dispatchEvent({ type: 'drawend', feature: olFeature });
                        } catch (e) {}
                    }
                });
            } catch (e) {}
        }

        // Build 3DG Native Group Object matching exact 3DG React prop structure
        const featureId = olFeature?.get?.('id') || olFeature?.getId?.() || geojsonFeature?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'feat-' + Date.now());
        const shortId = String(featureId).slice(0, 4);
        const geom = olFeature?.getGeometry?.();
        const coords = geom?.getCoordinates?.() || geojsonFeature?.geometry?.coordinates || [];
        const pointCount = coords.length || 0;
        const landType = (olFeature && typeof olFeature.get === 'function' && olFeature.get('landType')) || geojsonFeature?.properties?.landType || 'DGT';
        const color = (olFeature && typeof olFeature.get === 'function' && olFeature.get('color')) || geojsonFeature?.properties?.color || '#ffaa32';

        const groupObject = {
            id: featureId,
            name: `Đường ${shortId}`,
            mode: 'line',
            color: color,
            landType: landType,
            pointCount: pointCount,
            createdBy: '',
            createdAt: new Date().toISOString(),
            feature: olFeature || geojsonFeature
        };

        const itemContainer = {
            group: groupObject,
            isActive: false,
            hidden: false,
            ownerCount: 0
        };

        // 2. Traversal of React Fiber tree to update 3dg.vn React state
        const root = document.getElementById('root') || document.body;
        const candidates = [root, ...Array.from(document.querySelectorAll('div, section, aside, main, nav, ul, li'))];

        for (const el of candidates) {
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
            if (!key) continue;

            let node = el[key];
            for (let depth = 0; depth < 300 && node; depth++) {
                try {
                    const props = node.memoizedProps;
                    if (props) {
                        if (typeof props.onGroupAdd === 'function') {
                            props.onGroupAdd(groupObject);
                            log('Synced group via props.onGroupAdd');
                        }
                        if (typeof props.onFeatureAdd === 'function') {
                            props.onFeatureAdd(groupObject);
                            props.onFeatureAdd(olFeature || geojsonFeature);
                            log('Synced feature via props.onFeatureAdd');
                        }
                        if (typeof props.setGroups === 'function' && Array.isArray(props.groups)) {
                            props.setGroups(prev => [...prev, groupObject]);
                            log('Synced group via props.setGroups');
                        }
                        if (typeof props.setFeatures === 'function' && Array.isArray(props.features)) {
                            props.setFeatures(prev => [...prev, groupObject]);
                            log('Synced feature via props.setFeatures');
                        }
                    }

                    let s = node.memoizedState;
                    while (s) {
                        if (s.queue && typeof s.queue.dispatch === 'function' && Array.isArray(s.memoizedState)) {
                            const arr = s.memoizedState;
                            if (arr.length > 0) {
                                const sample = arr[0];
                                if (sample && (sample.group || sample.mode || sample.landType || sample.type === 'Feature' || sample.geometry || sample.id)) {
                                    s.queue.dispatch(prev => {
                                        if (Array.isArray(prev)) {
                                            if (prev.length > 0 && prev[0].group) {
                                                return [...prev, itemContainer];
                                            } else if (prev.length > 0 && (prev[0].mode || prev[0].landType)) {
                                                return [...prev, groupObject];
                                            }
                                            return [...prev, groupObject, geojsonFeature || olFeature];
                                        }
                                        return prev;
                                    });
                                    log('Synced group object via React state dispatch!');
                                }
                            }
                        }
                        s = s.next;
                    }
                } catch (e) {}
                node = node.return;
            }
        }
    }

    // ===== DISABLE DOUBLE CLICK ZOOM & PREVENT DARK MODAL BACKDROP =====
    function preventDarkModalOnDblClick(map) {
        if (!map || typeof map.getInteractions !== 'function') return;
        try {
            map.getInteractions().forEach(interaction => {
                const ctorName = interaction.constructor?.name || '';
                if (ctorName.includes('DoubleClick') || ctorName.includes('DblClick')) {
                    interaction.setActive(false);
                }
            });
        } catch (e) {}

        const viewport = document.querySelector('.ol-viewport');
        if (viewport && !viewport.__topoDblClickPrevented) {
            viewport.__topoDblClickPrevented = true;
            viewport.addEventListener('dblclick', function (e) {
                if (!e.target || !e.target.closest('#topo-checker-panel')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, true);
        }
    }

    // Expose helpers globally
    window.__topoZoomToError = zoomToErrorLocation;
    window.__topoRenderAllOverlays = renderAllErrorOverlays;
    window.__topoClearHighlight = clearAllErrorOverlays;
    window.__topoSyncFeatureToReactState = syncFeatureTo3dgReactState;
    window.__topoToggleHighlight = toggleErrorHighlight;

    // Auto init check
    (function waitForMap() {
        const map = findOlMap();
        if (map) {
            window.__topoMap = map;
            preventDarkModalOnDblClick(map);
            log('✅ OpenLayers Map detected and hooked ready!');
            attachMapRenderListeners(map);
            document.dispatchEvent(new CustomEvent('topo:map-ready', { detail: { map } }));
        } else {
            setTimeout(waitForMap, 1500);
        }
    })();

})();
