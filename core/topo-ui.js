// ============================================================
// 3DG Topology Checker — Minimalist CAD-Style UI Module
// - Floating Magnifying Glass Icon Button (Draggable)
// - Minimalist Light Gray Panel with ⚙️ Settings, — Minimize, ✕ Close
// - "Check Topo" scan action button
// - "Xóa Theo Vùng" interactive polygon area deletion button
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

                <!-- Primary Action Buttons -->
                <div class="topo-controls">
                    <div class="topo-btn-group">
                        <button class="topo-btn-primary" id="topo-btn-scan">
                            <span>⚡ Check Topo</span>
                        </button>
                        <button class="topo-btn-secondary" id="topo-btn-area-delete">
                            <span>🗑️ Xóa Vùng</span>
                        </button>
                    </div>
                </div>

                <!-- Area Selection Active Bar -->
                <div class="topo-area-bar topo-drawer-hidden" id="topo-area-bar">
                    <div class="topo-area-status" id="topo-area-status">📍 Đang vẽ vùng...</div>
                    <div class="topo-area-actions">
                        <button class="topo-btn-sm topo-btn-primary" id="topo-btn-area-finish">✓ Hoàn Thành Vùng</button>
                        <button class="topo-btn-sm topo-btn-danger" id="topo-btn-area-confirm" style="display:none">🗑️ Xóa các đường</button>
                        <button class="topo-btn-sm topo-btn-cancel" id="topo-btn-area-cancel">✕ Hủy</button>
                    </div>
                </div>

                <div class="topo-stats" id="topo-stats" style="display:none">
                    <span id="topo-stats-text"></span>
                </div>

                <div class="topo-error-list" id="topo-error-list">
                    <div class="topo-empty-state">
                        Chưa có danh sách lỗi.
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

        // Area Delete elements
        const areaDeleteBtn = document.getElementById('topo-btn-area-delete');
        const areaBar = document.getElementById('topo-area-bar');
        const areaStatus = document.getElementById('topo-area-status');
        const areaFinishBtn = document.getElementById('topo-btn-area-finish');
        const areaConfirmBtn = document.getElementById('topo-btn-area-confirm');
        const areaCancelBtn = document.getElementById('topo-btn-area-cancel');

        // 1. Settings button (⚙️)
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

        // 2. Minimize button (—)
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

        // ===== AREA SELECTION & DELETION EVENTS =====
        if (areaDeleteBtn && areaBar) {
            areaDeleteBtn.addEventListener('click', () => {
                if (window.__areaDeleterStart) {
                    const ok = window.__areaDeleterStart();
                    if (ok) {
                        areaBar.classList.remove('topo-drawer-hidden');
                        areaStatus.textContent = '📍 Đang vẽ vùng...';
                        areaFinishBtn.style.display = 'inline-flex';
                        areaConfirmBtn.style.display = 'none';
                    }
                }
            });
        }

        // Point added event from area-deleter
        document.addEventListener('topo:area-point-added', (e) => {
            const count = e.detail?.count || 0;
            if (areaStatus) {
                areaStatus.textContent = `📍 Đã chọn ${count} điểm`;
            }
        });

        // Finish Area Selection
        if (areaFinishBtn) {
            areaFinishBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (window.__areaDeleterFinish) {
                    const selected = window.__areaDeleterFinish();
                    if (selected && selected.length > 0) {
                        areaStatus.innerHTML = `⚠️ <b style="color:#dc2626">Đã quét thấy ${selected.length} đường</b> trong vùng.`;
                        areaFinishBtn.style.display = 'none';
                        areaConfirmBtn.style.display = 'inline-flex';
                        areaConfirmBtn.textContent = `🗑️ Xóa ${selected.length} đường`;
                    } else {
                        areaStatus.textContent = '❌ Không tìm thấy đường nào trong vùng đã chọn!';
                    }
                }
            });
        }

        // Confirm Delete Execution
        function handleConfirmDelete() {
            const count = window.__areaDeleterGetSelectedCount ? window.__areaDeleterGetSelectedCount() : 0;
            if (count === 0) return;

            const sure = confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN ${count} đường/ranh giới trong vùng đã chọn không?`);
            if (sure && window.__areaDeleterDelete) {
                const deleted = window.__areaDeleterDelete();
                alert(`✅ Đã xóa thành công ${deleted} đường khỏi bản đồ!`);
                areaBar.classList.add('topo-drawer-hidden');
            }
        }

        if (areaConfirmBtn) {
            areaConfirmBtn.addEventListener('click', handleConfirmDelete);
        }

        // Cancel Area Selection
        if (areaCancelBtn) {
            areaCancelBtn.addEventListener('click', () => {
                if (window.__areaDeleterCancel) window.__areaDeleterCancel();
                areaBar.classList.add('topo-drawer-hidden');
            });
        }

        // Keyboard "Delete" or "Backspace" shortcut for deletion confirmation
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input, textarea')) {
                const count = window.__areaDeleterGetSelectedCount ? window.__areaDeleterGetSelectedCount() : 0;
                if (count > 0) {
                    e.preventDefault();
                    handleConfirmDelete();
                }
            }
        });
    }

    // ===== DRAGGABLE HELPER =====
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
            scanBtn.innerHTML = `<span>⚡ Check Topo</span>`;
        }, 100);
    }

    // ===== RENDER ERROR LIST =====
    function renderErrorList(errors) {
        const listEl = document.getElementById('topo-error-list');
        const statsText = document.getElementById('topo-stats-text');
        const statsEl = document.getElementById('topo-stats');

        if (statsEl) statsEl.style.display = 'block';

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
