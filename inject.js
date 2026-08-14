// ============================================================
// 3DG Topology Checker — Core Map Hook & Overlay Manager
// Finds OpenLayers map instance via React Fiber traversal
// Creates DOM Pixel-synced Red Lightbulb Markers for all open endpoints
// ============================================================

(function () {
    'use strict';

    function log(...args) {
        console.log('[TopologyChecker]', ...args);
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

    function drawDuplicateHighlightsCanvas() {
        const map = window.__topoMap || findOlMap();
        const canvas = getOrCreateHighlightCanvas();
        if (!canvas || !map) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        function drawPolyline(pts, strokeStyle, width, shadowColor, shadowBlur, coreStyle = null, coreWidth = 0) {
            if (!pts || pts.length < 2) return;
            const pixels = pts.map(p => map.getPixelFromCoordinate(p)).filter(px => px && !isNaN(px[0]) && !isNaN(px[1]));
            if (pixels.length < 2) return;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pixels[0][0], pixels[0][1]);
            for (let i = 1; i < pixels.length; i++) {
                ctx.lineTo(pixels[i][0], pixels[i][1]);
            }
            ctx.lineWidth = width;
            ctx.strokeStyle = strokeStyle;
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            if (coreStyle && coreWidth > 0) {
                ctx.lineWidth = coreWidth;
                ctx.strokeStyle = coreStyle;
                ctx.shadowBlur = 0;
                ctx.stroke();
            }
            ctx.restore();
        }

        // 1. Vẽ tất cả các line segment/path trùng nét với hiệu ứng sáng chói (Yellow / Orange Neon Glow)
        if (storedDuplicateSegments && storedDuplicateSegments.length > 0) {
            storedDuplicateSegments.forEach(seg => {
                const pts = seg.pathCoords || (seg.p1 && seg.p2 ? [seg.p1, seg.p2] : null);
                drawPolyline(pts, '#f59e0b', 6, '#ef4444', 12, '#ffff00', 3);
            });
        }

        // 2. Vẽ line trùng đang được chọn (Active Highlight) phát sáng rực rỡ với màu đỏ nhấp nháy
        if (activeDuplicateSegment) {
            const pts = activeDuplicateSegment.pathCoords || (activeDuplicateSegment.p1 && activeDuplicateSegment.p2 ? [activeDuplicateSegment.p1, activeDuplicateSegment.p2] : null);
            drawPolyline(pts, '#dc2626', 10, '#ff0055', 24, '#ffffff', 4);
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
                    id: err.id
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
    function zoomToErrorLocation(coord, targetZoom = 21, errorObj = null) {
        const map = window.__topoMap || findOlMap();
        if (!map) {
            console.warn('[TopologyChecker] Không tìm thấy bản đồ OpenLayers!');
            return false;
        }

        window.__topoMap = map;
        const view = map.getView();
        if (!view) return false;

        highlightErrorLocation(coord, errorObj);

        const maxAllowedZoom = typeof view.getMaxZoom === 'function' ? view.getMaxZoom() : 22;
        const finalZoom = Math.min(maxAllowedZoom, Math.max(targetZoom, 21));

        try {
            view.animate({
                center: coord,
                zoom: finalZoom,
                duration: 500
            });
        } catch (e) {
            view.setCenter(coord);
            view.setZoom(finalZoom);
        }

        setTimeout(updateMarkerPositions, 100);
        setTimeout(updateMarkerPositions, 550);

        return true;
    }

    // Expose helpers
    window.__topoZoomToError = zoomToErrorLocation;
    window.__topoRenderAllOverlays = renderAllErrorOverlays;
    window.__topoClearHighlight = clearAllErrorOverlays;

    // Auto init check
    (function waitForMap() {
        const map = findOlMap();
        if (map) {
            window.__topoMap = map;
            log('✅ OpenLayers Map detected and hooked ready!');
            attachMapRenderListeners(map);
            document.dispatchEvent(new CustomEvent('topo:map-ready', { detail: { map } }));
        } else {
            setTimeout(waitForMap, 1500);
        }
    })();

})();
