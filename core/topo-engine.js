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

    // ===== CONSECUTIVE DUPLICATE VERTEX CLEANER =====
    function sanitizeLineStringCoords(coords) {
        if (!coords || coords.length < 2) return { cleaned: coords, removedCount: 0 };
        const cleaned = [coords[0]];
        let removedCount = 0;

        for (let i = 1; i < coords.length; i++) {
            const prev = cleaned[cleaned.length - 1];
            const curr = coords[i];
            const dx = Math.abs(curr[0] - prev[0]);
            const dy = Math.abs(curr[1] - prev[1]);

            if (dx <= 1e-6 && dy <= 1e-6) {
                removedCount++;
            } else {
                cleaned.push(curr);
            }
        }

        return { cleaned, removedCount };
    }

    function autoCleanDuplicateVerticesOnMap() {
        const featureItems = collectAllFeatures();
        let totalCleanedFeatures = 0;
        let totalPointsRemoved = 0;

        featureItems.forEach(item => {
            const geom = item.geometry;
            if (geom && geom.getType?.() === 'LineString') {
                const coords = geom.getCoordinates();
                const { cleaned, removedCount } = sanitizeLineStringCoords(coords);

                if (removedCount > 0) {
                    geom.setCoordinates(cleaned);
                    totalCleanedFeatures++;
                    totalPointsRemoved += removedCount;

                    if (item.source && typeof item.source.changed === 'function') {
                        item.source.changed();
                    }
                }
            }
        });

        if (totalCleanedFeatures > 0) {
            log(`⚡ Automatically deleted ${totalPointsRemoved} consecutive duplicate vertices across ${totalCleanedFeatures} features!`);
        }

        return { cleanedFeatures: totalCleanedFeatures, pointsRemoved: totalPointsRemoved };
    }

    // ===== MAIN TOPOLOGY SCANNER =====
    function runTopologyCheck(options = {}) {
        const startTime = performance.now();
        const map = window.__topoMap || (window.__topoFindOlMap && window.__topoFindOlMap());
        if (!map) {
            console.error('[TopologyEngine] Map instance not found!');
            return [];
        }

        // Auto clean duplicate consecutive vertices (e.g. vertices 8, 9, 10 having identical coordinates)
        const cleanResult = autoCleanDuplicateVerticesOnMap();

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

        // ===== DANGLE ENDPOINTS CHECK (Chỉ kiểm tra các đầu mút chưa khép kín) =====
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
                    title: 'Chưa khép thửa',
                    description: `Chưa khép thửa`,
                    coord: pt,
                    featureId: v.featureId,
                    featureItem: v.featureItem,
                    severity: 'high'
                });
            }
        }

        // ===== DUPLICATE SEGMENTS CHECK (Kiểm tra trùng nét vẽ theo đoạn & gộp dải trùng) =====
        function segmentsOverlap(a1, a2, b1, b2) {
            const matchSame = (distSq(a1, b1) <= tolSq && distSq(a2, b2) <= tolSq);
            const matchRev  = (distSq(a1, b2) <= tolSq && distSq(a2, b1) <= tolSq);
            if (matchSame || matchRev) return true;

            const dA1_B = pointToSegmentDistSq(a1, b1, b2);
            const dA2_B = pointToSegmentDistSq(a2, b1, b2);
            if (dA1_B <= tolSq && dA2_B <= tolSq) return true;

            const dB1_A = pointToSegmentDistSq(b1, a1, a2);
            const dB2_A = pointToSegmentDistSq(b2, a1, a2);
            if (dB1_A <= tolSq && dB2_A <= tolSq) return true;

            return false;
        }

        // Lọc các feature trùng khớp 100% hình học để tránh cảnh báo rác do trùng lặp cả đối tượng
        const uniqueFeatureItems = [];
        const seenGeomKeys = new Set();
        for (const item of featureItems) {
            try {
                const coords = item.geometry.getCoordinates?.();
                if (coords) {
                    const key = JSON.stringify(coords);
                    if (seenGeomKeys.has(key)) continue;
                    seenGeomKeys.add(key);
                }
            } catch (e) {}
            uniqueFeatureItems.push(item);
        }

        const pairMap = new Map();

        for (let i = 0; i < uniqueFeatureItems.length; i++) {
            const f1 = uniqueFeatureItems[i];
            const coords1 = f1.geometry.getCoordinates?.() || [];
            if (!coords1 || coords1.length < 2) continue;

            for (let j = i + 1; j < uniqueFeatureItems.length; j++) {
                const f2 = uniqueFeatureItems[j];
                const coords2 = f2.geometry.getCoordinates?.() || [];
                if (!coords2 || coords2.length < 2) continue;

                const matches = [];

                for (let s1 = 0; s1 < coords1.length - 1; s1++) {
                    const p1 = coords1[s1];
                    const p2 = coords1[s1 + 1];

                    for (let s2 = 0; s2 < coords2.length - 1; s2++) {
                        const q1 = coords2[s2];
                        const q2 = coords2[s2 + 1];

                        if (segmentsOverlap(p1, p2, q1, q2)) {
                            matches.push({ s1, s2, p1, p2, q1, q2 });
                        }
                    }
                }

                if (matches.length > 0) {
                    const pairKey = `${f1.id}___${f2.id}`;
                    pairMap.set(pairKey, { f1, f2, matches, coords1, coords2 });
                }
            }
        }

        pairMap.forEach(({ f1, f2, matches, coords1, coords2 }) => {
            const name1 = f1.feature?.get?.('name') || f1.properties?.name || f1.id;
            const name2 = f2.feature?.get?.('name') || f2.properties?.name || f2.id;
            const totalV1 = coords1.length;
            const totalV2 = coords2.length;

            matches.sort((a, b) => a.s1 - b.s1);

            let currentGroup = [matches[0]];

            for (let k = 1; k < matches.length; k++) {
                const prev = currentGroup[currentGroup.length - 1];
                const curr = matches[k];

                if (curr.s1 === prev.s1 + 1 && Math.abs(curr.s2 - prev.s2) <= 1) {
                    currentGroup.push(curr);
                } else {
                    addConsolidatedDupError(f1, f2, currentGroup, totalV1, totalV2, name1, name2, coords1);
                    currentGroup = [curr];
                }
            }
            if (currentGroup.length > 0) {
                addConsolidatedDupError(f1, f2, currentGroup, totalV1, totalV2, name1, name2, coords1);
            }
        });

        function addConsolidatedDupError(f1, f2, group, totalV1, totalV2, name1, name2, coords1) {
            const firstMatch = group[0];
            const lastMatch = group[group.length - 1];

            const pathCoords = [];
            for (let idx = firstMatch.s1; idx <= lastMatch.s1 + 1; idx++) {
                pathCoords.push(coords1[idx]);
            }

            const midIdx = Math.floor(pathCoords.length / 2);
            const centerPt = pathCoords[midIdx] || pathCoords[0];

            addError({
                id: 'err_dup_' + (errors.length + 1),
                type: 'duplicate',
                title: 'Trùng nét',
                description: 'Trùng nét',
                coord: centerPt,
                pathCoords: pathCoords,
                segment: [firstMatch.p1, lastMatch.p2],
                featureIds: [f1.id, f2.id],
                featureItems: [f1, f2],
                severity: 'high'
            });
        }

        const endTime = performance.now();
        log(`Topology check completed in ${(endTime - startTime).toFixed(1)}ms. Found ${errors.length} errors.`);

        return errors;
    }

    // Expose engine globally
    window.__topoRunCheck = runTopologyCheck;
    window.__topoCleanDuplicateVertices = autoCleanDuplicateVerticesOnMap;

})();
