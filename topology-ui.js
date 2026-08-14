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
                    <div class="topo-setting-row" style="margin-top:6px; border-top:1px dashed #cbd5e1; padding-top:6px;">
                        <label><b>✏️ Cài Đặt Vẽ Đường:</b></label>
                    </div>
                    <div class="topo-setting-row">
                        <label for="topo-smart-dist">Khoảng cách lề (m):</label>
                        <input type="number" id="topo-smart-dist" value="5.0" step="0.5" min="0.5" max="100.0" style="width:65px; padding:2px 6px; border:1px solid #cbd5e1; border-radius:4px;">
                    </div>
                    <div class="topo-setting-row">
                        <label for="topo-smart-side">Hướng sinh đường:</label>
                        <select id="topo-smart-side" style="padding:2px 6px; border:1px solid #cbd5e1; border-radius:4px;">
                            <option value="right" selected>Bên Phải</option>
                            <option value="left">Bên Trái</option>
                            <option value="both">Cả 2 Bên</option>
                        </select>
                    </div>
                </div>

                <div class="topo-controls">
                    <div class="topo-btn-group">
                        <button class="topo-btn-primary" id="topo-btn-scan">
                            <span>Check Topo</span>
                        </button>
                        <button class="topo-btn-secondary" id="topo-btn-smart-draw">
                            <span>Vẽ Đường</span>
                        </button>
                        <button class="topo-btn-secondary" id="topo-btn-area-color">
                            <span>Đổi Màu</span>
                        </button>
                        <button class="topo-btn-secondary" id="topo-btn-area-delete">
                            <span>Xóa Vùng</span>
                        </button>
                    </div>
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

        const smartDrawBtn = document.getElementById('topo-btn-smart-draw');
        const areaColorBtn = document.getElementById('topo-btn-area-color');
        const areaDeleteBtn = document.getElementById('topo-btn-area-delete');
        const areaBar = document.getElementById('topo-area-bar');
        const areaStatus = document.getElementById('topo-area-status');
        const areaFinishBtn = document.getElementById('topo-btn-area-finish');
        const areaConfirmBtn = document.getElementById('topo-btn-area-confirm');
        const areaCancelBtn = document.getElementById('topo-btn-area-cancel');

        let currentAreaMode = 'delete'; // 'delete' or 'color'

        function setActiveModeButton(activeId) {
            if (!scanBtn || !smartDrawBtn || !areaColorBtn || !areaDeleteBtn) return;
            [scanBtn, smartDrawBtn, areaColorBtn, areaDeleteBtn].forEach(btn => {
                if (btn.id === activeId) {
                    btn.classList.remove('topo-btn-secondary');
                    btn.classList.add('topo-btn-primary');
                } else {
                    btn.classList.remove('topo-btn-primary');
                    btn.classList.add('topo-btn-secondary');
                }
            });
        }

        function cancelAllInteractiveModes() {
            if (window.__smartDrawerStop) window.__smartDrawerStop();
            if (window.__areaDeleterCancel) window.__areaDeleterCancel();
            if (window.__areaColorizerHidePopover) window.__areaColorizerHidePopover();
            if (areaBar) areaBar.classList.add('topo-drawer-hidden');
            currentAreaMode = null;
        }

        // 5. Scan button
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                cancelAllInteractiveModes();
                setActiveModeButton('topo-btn-scan');
                executeScan();
            });
        }

        // 6. Smart Draw button
        if (smartDrawBtn) {
            smartDrawBtn.addEventListener('click', () => {
                cancelAllInteractiveModes();
                setActiveModeButton('topo-btn-smart-draw');
                currentAreaMode = 'smart-draw';

                const distEl = document.getElementById('topo-smart-dist');
                const sideEl = document.getElementById('topo-smart-side');
                const dist = distEl ? Number(distEl.value) : 5.0;
                const side = sideEl ? sideEl.value : 'right';

                const sideLabel = side === 'right' ? 'Bên Phải' : (side === 'left' ? 'Bên Trái' : 'Cả 2 Bên');

                if (window.__smartDrawerStart) {
                    const ok = window.__smartDrawerStart({ distance: dist, side: side });
                    if (ok && areaBar) {
                        areaBar.classList.remove('topo-drawer-hidden');
                        if (areaStatus) areaStatus.textContent = `✏️ Đang vẽ đường (${dist}m, ${sideLabel})... Click chọn điểm, nhấp đúp để xong.`;
                        if (areaFinishBtn) {
                            areaFinishBtn.style.display = 'inline-flex';
                            areaFinishBtn.textContent = '✓ Hoàn Thành Đường';
                            areaFinishBtn.disabled = true;
                        }
                        if (areaConfirmBtn) areaConfirmBtn.style.display = 'none';
                    }
                }
            });
        }

        // ===== AREA SELECTION (COLOR vs DELETE) =====
        if (areaColorBtn) {
            areaColorBtn.addEventListener('click', () => {
                cancelAllInteractiveModes();
                setActiveModeButton('topo-btn-area-color');
                currentAreaMode = 'color';
                if (window.__areaDeleterStart) {
                    const ok = window.__areaDeleterStart();
                    if (ok && areaBar) {
                        areaBar.classList.remove('topo-drawer-hidden');
                        if (areaStatus) areaStatus.textContent = '🎨 Đang vẽ vùng (Chọn ít nhất 3 điểm)...';
                        if (areaFinishBtn) {
                            areaFinishBtn.style.display = 'inline-flex';
                            areaFinishBtn.textContent = '✓ Hoàn Thành Vùng';
                            areaFinishBtn.disabled = true;
                        }
                        if (areaConfirmBtn) areaConfirmBtn.style.display = 'none';
                    }
                }
            });
        }

        if (areaDeleteBtn) {
            areaDeleteBtn.addEventListener('click', () => {
                cancelAllInteractiveModes();
                setActiveModeButton('topo-btn-area-delete');
                currentAreaMode = 'delete';
                if (window.__areaDeleterStart) {
                    const ok = window.__areaDeleterStart();
                    if (ok && areaBar) {
                        areaBar.classList.remove('topo-drawer-hidden');
                        if (areaStatus) areaStatus.textContent = '📍 Đang vẽ vùng (Chọn ít nhất 3 điểm)...';
                        if (areaFinishBtn) {
                            areaFinishBtn.style.display = 'inline-flex';
                            areaFinishBtn.textContent = '✓ Hoàn Thành Vùng';
                            areaFinishBtn.disabled = true;
                        }
                        if (areaConfirmBtn) areaConfirmBtn.style.display = 'none';
                    }
                }
            });
        }

        document.addEventListener('topo:area-point-added', (e) => {
            const count = e.detail?.count || 0;
            if (areaStatus) {
                if (currentAreaMode === 'smart-draw') {
                    areaStatus.textContent = `✏️ Đã chấm ${count} điểm (Nhấp đúp hoặc bấm Hoàn thành)`;
                    if (areaFinishBtn) areaFinishBtn.disabled = (count < 2);
                    return;
                }
                if (count < 3) {
                    areaStatus.textContent = `📍 Đã chọn ${count} điểm (Cần thêm ${3 - count} điểm)`;
                } else {
                    areaStatus.textContent = `📍 Đã chọn ${count} điểm (Đủ điều kiện hoàn thành)`;
                }
            }
            if (areaFinishBtn) {
                areaFinishBtn.disabled = (count < 3);
            }
        });
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
            statsText.innerHTML = `<span class="topo-text-success">✅ Không có lỗi topology (Khép kín, không trùng nét).</span>`;
            listEl.innerHTML = `
                <div class="topo-empty-state topo-success">
                    Không phát hiện vị trí hở ranh giới hoặc trùng nét vẽ.
                </div>
            `;
            if (window.__topoClearHighlight) window.__topoClearHighlight();
            return;
        }

        if (window.__topoRenderAllOverlays) {
            window.__topoRenderAllOverlays(errors);
        }

        const dangleCount = errors.filter(e => e.type === 'dangle').length;
        const dupCount = errors.filter(e => e.type === 'duplicate').length;

        let summaryParts = [];
        if (dangleCount > 0) summaryParts.push(`<b>${dangleCount}</b> hở ranh giới`);
        if (dupCount > 0) summaryParts.push(`<b>${dupCount}</b> trùng nét`);

        statsText.innerHTML = `
            <span class="topo-text-danger">⚠️ Phát hiện <b>${errors.length}</b> lỗi (${summaryParts.join(', ')})</span>
        `;

        listEl.innerHTML = '';

        errors.forEach((err, idx) => {
            const item = document.createElement('div');
            item.className = 'topo-error-item';
            if (err.type === 'duplicate') item.classList.add('--duplicate');
            if (err.id === activeErrorId) item.classList.add('--active');

            const x = err.coord[0].toFixed(2);
            const y = err.coord[1].toFixed(2);

            if (err.type === 'duplicate') {
                item.innerHTML = `
                    <div class="topo-item-title topo-title-dup">🟧 Lỗi ${idx + 1}: Trùng nét</div>
                    <div class="topo-item-coord">Tọa độ: [${x}, ${y}]</div>
                `;
            } else {
                item.innerHTML = `
                    <div class="topo-item-title">🔴 Lỗi ${idx + 1}: Chưa khép thửa</div>
                    <div class="topo-item-coord">Tọa độ: [${x}, ${y}]</div>
                `;
            }

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
            const ok = window.__topoZoomToError(err.coord, defaultZoom, err);
            if (ok) {
                console.log(`[TopologyUI] 🎯 Zoomed to error at [${err.coord[0]}, ${err.coord[1]}] (${err.type}, Zoom: ${defaultZoom})`);
            }
        }
    }

    // ===== INIT UI =====
    setTimeout(createUI, 1000);

})();
