// ============================================================
// 3DG Topology Checker — Minimalist CAD-Style UI
// - Floating Magnifying Glass Icon Button (Draggable)
// - Minimalist Panel with ⚙️ Settings, — Minimize, ✕ Close
// - Tolerance slider inside ⚙️ Settings
// - Default close-up zoom = 21 (Hardcoded, no zoom setting needed)
// ============================================================

(function () {
    'use strict';

    function log(...args) {
        console.log('[TopologyUI]', ...args);
    }

    let isPanelOpen = false;
    let isMinimized = false;
    let isSettingsOpen = false;
    let currentErrors = [];
    let activeErrorId = null;

    // ===== CREATE MINIMALIST UI =====
    function createUI() {
        if (document.getElementById('topo-fab-btn')) return;

        // 1. Minimalist Magnifying Glass Button (Icon kính lúp, bo góc ít, kéo thả tự do)
        const fab = document.createElement('button');
        fab.id = 'topo-fab-btn';
        fab.className = 'topo-fab';
        fab.title = 'Kiểm tra lỗi Topology (Giữ chuột để kéo di chuyển)';
        fab.innerHTML = `
            <span class="topo-fab-icon">🔍</span>
            <span class="topo-fab-badge" id="topo-fab-badge" style="display:none">0</span>
        `;

        // 2. Minimalist Error Panel (Kéo thả tự do bằng Header)
        const panel = document.createElement('div');
        panel.id = 'topo-checker-panel';
        panel.className = 'topo-panel topo-panel-hidden';

        panel.innerHTML = `
            <div class="topo-header" id="topo-header" title="Giữ chuột để kéo di chuyển bảng">
                <div class="topo-title">
                    <span class="topo-icon">🔍</span>
                    <span>Kiểm Tra Topology</span>
                </div>
                <div class="topo-header-actions">
                    <button class="topo-btn-icon" id="topo-btn-settings" title="Cài đặt thông số (⚙️)">⚙️</button>
                    <button class="topo-btn-icon" id="topo-btn-minimize" title="Thu nhỏ / Mở rộng (—)">—</button>
                    <button class="topo-btn-icon" id="topo-btn-close" title="Đóng (✕)">✕</button>
                </div>
            </div>

            <div class="topo-body" id="topo-body">
                <!-- Settings Drawer (Toggled by ⚙️) -->
                <div class="topo-settings-drawer topo-drawer-hidden" id="topo-settings-drawer">
                    <div class="topo-setting-row">
                        <label for="topo-tolerance-slider">Dung sai (Tolerance): <b id="topo-tol-val">0.5m</b></label>
                        <input type="range" id="topo-tolerance-slider" min="0.1" max="5.0" step="0.1" value="0.5">
                    </div>
                </div>

                <div class="topo-controls">
                    <button class="topo-btn-primary" id="topo-btn-scan">
                        <span>⚡ Quét Kiểm Tra Lỗi</span>
                    </button>
                </div>

                <div class="topo-stats" id="topo-stats">
                    <span id="topo-stats-text">Bấm "Quét Kiểm Tra Lỗi" để kiểm tra bản đồ.</span>
                </div>

                <div class="topo-error-list" id="topo-error-list">
                    <div class="topo-empty-state">
                        Chưa có danh sách lỗi. Bấm nút quét để kiểm tra.
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        bindEvents();
        makeDraggable(fab, fab, true);
        makeDraggable(panel, document.getElementById('topo-header'), false);
    }

    // ===== TOGGLE PANEL STATE =====
    function togglePanel() {
        const fab = document.getElementById('topo-fab-btn');
        const panel = document.getElementById('topo-checker-panel');
        if (!fab || !panel) return;

        isPanelOpen = !isPanelOpen;
        if (isPanelOpen) {
            panel.classList.remove('topo-panel-hidden');
            fab.classList.add('topo-fab-active');

            // Căn chỉnh vị trí bảng gần nút kính lúp nếu bảng chưa bị kéo thủ công
            if (!panel.dataset.dragged) {
                const fabRect = fab.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();

                let pTop = fabRect.top - panelRect.height - 10;
                if (pTop < 10) pTop = fabRect.bottom + 10;
                let pLeft = fabRect.left - panelRect.width + fabRect.width;
                if (pLeft < 10) pLeft = 10;

                panel.style.top = Math.max(10, pTop) + 'px';
                panel.style.left = Math.max(10, pLeft) + 'px';
                panel.style.bottom = 'auto';
                panel.style.right = 'auto';
            }
        } else {
            panel.classList.add('topo-panel-hidden');
            fab.classList.remove('topo-fab-active');
        }
    }

    // ===== BIND UI EVENTS =====
    function bindEvents() {
        const fab = document.getElementById('topo-fab-btn');
        const panel = document.getElementById('topo-checker-panel');
        const closeBtn = document.getElementById('topo-btn-close');
        const minimizeBtn = document.getElementById('topo-btn-minimize');
        const settingsBtn = document.getElementById('topo-btn-settings');
        const settingsDrawer = document.getElementById('topo-settings-drawer');
        const body = document.getElementById('topo-body');
        const scanBtn = document.getElementById('topo-btn-scan');
        const tolSlider = document.getElementById('topo-tolerance-slider');
        const tolVal = document.getElementById('topo-tol-val');

        // 1. Settings button (⚙️) -> Toggle settings drawer
        if (settingsBtn && settingsDrawer) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isSettingsOpen = !isSettingsOpen;
                if (isSettingsOpen) {
                    settingsDrawer.classList.remove('topo-drawer-hidden');
                    settingsBtn.classList.add('--active');
                } else {
                    settingsDrawer.classList.add('topo-drawer-hidden');
                    settingsBtn.classList.remove('--active');
                }
            });
        }

        // 2. Minimize button (—) -> Toggle panel body collapse
        if (minimizeBtn && body) {
            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isMinimized = !isMinimized;
                if (isMinimized) {
                    body.classList.add('topo-body-collapsed');
                    minimizeBtn.textContent = '+';
                    minimizeBtn.title = 'Mở rộng (+)';
                } else {
                    body.classList.remove('topo-body-collapsed');
                    minimizeBtn.textContent = '—';
                    minimizeBtn.title = 'Thu nhỏ (—)';
                }
            });
        }

        // 3. Close button (✕)
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isPanelOpen = false;
                panel.classList.add('topo-panel-hidden');
                fab.classList.remove('topo-fab-active');
            });
        }

        // 4. Tolerance slider
        if (tolSlider && tolVal) {
            tolSlider.addEventListener('input', (e) => {
                tolVal.textContent = e.target.value + 'm';
            });
        }

        // 5. Scan button
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                executeScan();
            });
        }
    }

    // ===== DRAGGABLE HELPER FOR BUTTON & PANEL =====
    function makeDraggable(element, handle, isFab = false) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let startX = 0, startY = 0;
        let hasMoved = false;

        handle.style.cursor = 'grab';
        handle.addEventListener('mousedown', dragMouseDown);

        function dragMouseDown(e) {
            if (e.target.closest('.topo-header-actions')) return;
            e.preventDefault();

            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            handle.style.cursor = 'grabbing';

            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('mousemove', elementDrag);
        }

        function elementDrag(e) {
            e.preventDefault();
            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);
            if (dx > 4 || dy > 4) {
                hasMoved = true;
                if (!isFab) element.dataset.dragged = "true";
            }

            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            const rect = element.getBoundingClientRect();
            let newTop = rect.top - pos2;
            let newLeft = rect.left - pos1;

            // Giới hạn trong khung màn hình
            newTop = Math.max(5, Math.min(window.innerHeight - rect.height - 5, newTop));
            newLeft = Math.max(5, Math.min(window.innerWidth - rect.width - 5, newLeft));

            element.style.top = newTop + 'px';
            element.style.left = newLeft + 'px';
            element.style.bottom = 'auto';
            element.style.right = 'auto';
        }

        function closeDragElement(e) {
            handle.style.cursor = 'grab';
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('mousemove', elementDrag);

            if (isFab && !hasMoved) {
                togglePanel();
            }
        }
    }

    // ===== EXECUTE TOPOLOGY SCAN =====
    function executeScan() {
        const scanBtn = document.getElementById('topo-btn-scan');
        const tolSlider = document.getElementById('topo-tolerance-slider');
        const statsText = document.getElementById('topo-stats-text');
        const fabBadge = document.getElementById('topo-fab-badge');

        const tolerance = parseFloat(tolSlider.value) || 0.5;

        scanBtn.disabled = true;
        scanBtn.innerHTML = `<span>⏳ Đang quét dữ liệu...</span>`;
        statsText.textContent = `Đang quét dữ liệu bản đồ (dung sai ${tolerance}m)...`;

        setTimeout(() => {
            if (window.__topoRunCheck) {
                currentErrors = window.__topoRunCheck({ tolerance });
                renderErrorList(currentErrors);

                if (currentErrors.length > 0) {
                    fabBadge.textContent = currentErrors.length;
                    fabBadge.style.display = 'flex';
                } else {
                    fabBadge.style.display = 'none';
                }
            } else {
                statsText.textContent = `❌ Lỗi: Chưa nạp được Engine kiểm tra!`;
            }

            scanBtn.disabled = false;
            scanBtn.innerHTML = `<span>⚡ Quét Kiểm Tra Lỗi</span>`;
        }, 100);
    }

    // ===== RENDER ERROR LIST =====
    function renderErrorList(errors) {
        const listEl = document.getElementById('topo-error-list');
        const statsText = document.getElementById('topo-stats-text');

        if (!errors || errors.length === 0) {
            statsText.innerHTML = `<span class="topo-text-success">✅ Không có lỗi. Tất cả ranh giới khép kín.</span>`;
            listEl.innerHTML = `
                <div class="topo-empty-state topo-success">
                    Không phát hiện vị trí hở ranh giới.
                </div>
            `;
            if (window.__topoClearHighlight) window.__topoClearHighlight();
            return;
        }

        // Render bóng đèn nhấp nháy đỏ trên bản đồ cho tất cả đầu mút hở
        if (window.__topoRenderAllOverlays) {
            window.__topoRenderAllOverlays(errors);
        }

        statsText.innerHTML = `
            <span class="topo-text-danger">⚠️ Phát hiện <b>${errors.length}</b> vị trí đầu mút bị hở / chưa khép kín</span>
        `;

        listEl.innerHTML = '';

        errors.forEach((err, idx) => {
            const item = document.createElement('div');
            item.className = 'topo-error-item';
            if (err.id === activeErrorId) item.classList.add('--active');

            const x = err.coord[0].toFixed(2);
            const y = err.coord[1].toFixed(2);

            item.innerHTML = `
                <div class="topo-item-title">🔴 Lỗi ${idx + 1}</div>
                <div class="topo-item-coord">Tọa độ: [${x}, ${y}]</div>
            `;

            item.addEventListener('click', () => {
                selectAndZoomError(err, item);
            });

            listEl.appendChild(item);
        });
    }

    // ===== SELECT AND ZOOM TO ERROR =====
    function selectAndZoomError(err, itemElement) {
        activeErrorId = err.id;

        document.querySelectorAll('.topo-error-item').forEach(el => el.classList.remove('--active'));
        if (itemElement) itemElement.classList.add('--active');

        // Mặc định zoom cận cảnh level 21
        const defaultZoom = 21;

        if (window.__topoZoomToError) {
            const ok = window.__topoZoomToError(err.coord, defaultZoom);
            if (ok) {
                console.log(`[TopologyUI] 🎯 Zoomed to error at [${err.coord[0]}, ${err.coord[1]}] (Zoom: ${defaultZoom})`);
            }
        }
    }

    // ===== INIT UI =====
    setTimeout(createUI, 1000);

})();
