// ============================================================
// 3DG Topology Checker — Core Algorithm Engine Module
// Accurate Dangle / Unclosed Boundary Checker for 2000+ lines:
// - Detects open endpoints that fail to snap to any vertex or segment
// ============================================================

(function () {
    'use strict';

    function log(...args) {
        console.log('[TopologyEngine]', ...args);
    }

    // ===== SPATIAL UTILITIES =====
    function distSq(p1, p2) {
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        return dx * dx + dy * dy;
    }

    function pointToSegmentDistSq(p, a, b) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-12) return distSq(p, a);

        let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = a[0] + t * dx;
        const projY = a[1] + t * dy;
        return (p[0] - projX) ** 2 + (p[1] - projY) ** 2;
    }

    // ===== COLLECT ALL VECTOR FEATURES FROM MAP =====
    function collectAllFeatures() {
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) return [];

        const results = [];
        const seenFeatures = new Set();

        function walk(layer) {
            if (typeof layer.getLayers === 'function') {
                try { layer.getLayers().forEach(walk); } catch (e) { }
                return;
            }
            try {
                const src = layer.getSource?.();
                if (!src?.getFeatures) return;
                for (const f of src.getFeatures()) {
                    if (seenFeatures.has(f)) continue;
                    seenFeatures.add(f);
                    const geom = f.getGeometry?.();
                    if (!geom) continue;

                    const type = geom.getType();
                    if (type === 'LineString' || type === 'MultiLineString' || type === 'Polygon' || type === 'MultiPolygon') {
                        results.push({
                            feature: f,
                            id: f.getId?.() || ('feat_' + results.length),
                            geometry: geom,
                            layer: layer,
                            source: src
                        });
                    }
                }
            } catch (e) { }
        }

        try {
            map.getLayers().forEach(walk);
        } catch (e) { }

        return results;
    }

    // ===== MAIN TOPOLOGY SCANNER =====
    function runTopologyCheck(options = {}) {
        const startTime = performance.now();
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) {
            console.error('[TopologyEngine] Map instance not found!');
            return [];
        }

        const tolerance = options.tolerance !== undefined ? Number(options.tolerance) : 0.5;
        const tolSq = tolerance * tolerance;

        const featureItems = collectAllFeatures();
        log(`Scanned ${featureItems.length} features on map for unclosed dangle check...`);

        if (featureItems.length === 0) return [];

        const allSegments = [];
        const allVertices = [];

        for (const item of featureItems) {
            const geom = item.geometry;
            const type = geom.getType();
            const coords = geom.getCoordinates();

            if (type === 'LineString') {
                for (let i = 0; i < coords.length; i++) {
                    const isEnd = (i === 0 || i === coords.length - 1);
                    allVertices.push({
                        point: coords[i],
                        featureId: item.id,
                        isEndpoint: isEnd,
                        featureItem: item,
                        coordIndex: i
                    });
                    if (i < coords.length - 1) {
                        allSegments.push({
                            p1: coords[i],
                            p2: coords[i + 1],
                            featureId: item.id,
                            featureItem: item
                        });
                    }
                }
            } else if (type === 'MultiLineString') {
                for (const line of coords) {
                    for (let i = 0; i < line.length; i++) {
                        const isEnd = (i === 0 || i === line.length - 1);
                        allVertices.push({
                            point: line[i],
                            featureId: item.id,
                            isEndpoint: isEnd,
                            featureItem: item,
                            coordIndex: i
                        });
                        if (i < line.length - 1) {
                            allSegments.push({
                                p1: line[i],
                                p2: line[i + 1],
                                featureId: item.id,
                                featureItem: item
                            });
                        }
                    }
                }
            } else if (type === 'Polygon') {
                for (const ring of coords) {
                    for (let i = 0; i < ring.length - 1; i++) {
                        allVertices.push({
                            point: ring[i],
                            featureId: item.id,
                            isEndpoint: false,
                            featureItem: item,
                            coordIndex: i
                        });
                        allSegments.push({
                            p1: ring[i],
                            p2: ring[i + 1],
                            featureId: item.id,
                            featureItem: item
                        });
                    }
                }
            } else if (type === 'MultiPolygon') {
                for (const poly of coords) {
                    for (const ring of poly) {
                        for (let i = 0; i < ring.length - 1; i++) {
                            allVertices.push({
                                point: ring[i],
                                featureId: item.id,
                                isEndpoint: false,
                                featureItem: item,
                                coordIndex: i
                            });
                            allSegments.push({
                                p1: ring[i],
                                p2: ring[i + 1],
                                featureId: item.id,
                                featureItem: item
                            });
                        }
                    }
                }
            }
        }

        const errors = [];
        const seenErrorCoords = new Set();

        function addError(errorObj) {
            const key = `${Math.round(errorObj.coord[0]*100)}_${Math.round(errorObj.coord[1]*100)}_${errorObj.type}`;
            if (seenErrorCoords.has(key)) return;
            seenErrorCoords.add(key);
            errors.push(errorObj);
        }

        // ===== DANGLE ENDPOINTS CHECK =====
        for (const v of allVertices) {
            if (!v.isEndpoint) continue;

            const pt = v.point;
            let isConnected = false;

            for (const otherV of allVertices) {
                if (otherV === v) continue;
                if (otherV.featureId === v.featureId && otherV.isEndpoint) {
                    if (distSq(pt, otherV.point) < 1e-8) {
                        isConnected = true;
                        break;
                    }
                    continue;
                }

                if (distSq(pt, otherV.point) <= tolSq) {
                    isConnected = true;
                    break;
                }
            }

            if (!isConnected) {
                for (const seg of allSegments) {
                    if (seg.featureId === v.featureId) continue;
                    if (pointToSegmentDistSq(pt, seg.p1, seg.p2) <= tolSq) {
                        isConnected = true;
                        break;
                    }
                }
            }

            if (!isConnected) {
                addError({
                    id: 'err_' + (errors.length + 1),
                    type: 'dangle',
                    title: 'Đầu mút bị hở / Chưa khép kín',
                    description: `Line [${v.featureId}] có đầu mút chưa khớp vào thửa đất hoặc đường khác`,
                    coord: pt,
                    featureId: v.featureId,
                    featureItem: v.featureItem,
                    severity: 'high'
                });
            }
        }

        const endTime = performance.now();
        log(`Topology check completed in ${(endTime - startTime).toFixed(1)}ms. Found ${errors.length} unclosed dangle errors.`);

        return errors;
    }

    // Expose engine globally
    window.__topoRunCheck = runTopologyCheck;

})();
