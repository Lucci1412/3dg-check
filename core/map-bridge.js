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

    // ===== DOM PIXEL-BASED MARKER LAYER MANAGER =====
    let markerLayerDiv = null;
    let storedErrorItems = []; // { coord, element, activeElement, type }
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

    function updateMarkerPositions() {
        const map = window.__topoMap || findOlMap();
        if (!map || !storedErrorItems.length) return;

        const container = getOrCreateMarkerLayerDiv();
        if (!container) return;

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

    // Clear tất cả các marker đầu mút hở
    function clearAllErrorOverlays() {
        const container = getOrCreateMarkerLayerDiv();
        if (container) {
            container.innerHTML = '';
        }
        storedErrorItems = [];
        activeErrorCoord = null;
    }

    // Hiển thị bóng đèn đỏ nháy nháy cho TẤT CẢ các đầu mút hở trên bản đồ
    function renderAllErrorOverlays(errors) {
        const map = window.__topoMap || findOlMap();
        if (!map) return;

        clearAllErrorOverlays();

        if (!errors || errors.length === 0) return;

        attachMapRenderListeners(map);
        const container = getOrCreateMarkerLayerDiv();
        if (!container) return;

        errors.forEach((err, idx) => {
            const el = document.createElement('div');
            el.className = 'topo-marker-bulb-container';
            el.style.position = 'absolute';
            el.innerHTML = `
                <div class="topo-marker-bulb-ring"></div>
                <div class="topo-marker-bulb-dot" title="Lỗi #${idx + 1}: ${err.title}"></div>
            `;
            container.appendChild(el);

            storedErrorItems.push({
                coord: err.coord,
                element: el,
                type: err.type
            });
        });

        updateMarkerPositions();
        log(`Rendered ${storedErrorItems.length} red lightbulb markers on map via DOM layer.`);
    }

    // Highlight lỗi được chọn (Zoom tới & hiển thị vòng hào quang lớn hơn)
    function highlightErrorLocation(coord) {
        const map = window.__topoMap || findOlMap();
        if (!map) return;

        activeErrorCoord = coord;
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
                type: 'active'
            });
        }

        updateMarkerPositions();
    }

    // ===== NAVIGATE & ZOOM TO ERROR LOCATION =====
    function zoomToErrorLocation(coord, targetZoom = 21) {
        const map = window.__topoMap || findOlMap();
        if (!map) {
            console.warn('[TopologyChecker] Không tìm thấy bản đồ OpenLayers!');
            return false;
        }

        window.__topoMap = map;
        const view = map.getView();
        if (!view) return false;

        highlightErrorLocation(coord);

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

    // Expose helpers globally
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
