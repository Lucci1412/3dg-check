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
                    <div class="topo-setting-row" style="align-items: center; justify-content: space-between;">
                        <label for="topo-tolerance-input">Dung sai check (m):</label>
                        <input type="number" id="topo-tolerance-input" min="0.01" max="50.0" step="0.05" value="${(window.__topoConfig?.defaultTolerance || 0.5)}" style="width:75px; padding:3px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:600; text-align:center; color:#0284c7;">
                    </div>
                    <div class="topo-setting-row" style="margin-top:2px;">
                        <input type="range" id="topo-tolerance-slider" min="0.01" max="10.0" step="0.05" value="${(window.__topoConfig?.defaultTolerance || 0.5)}" style="flex:1;">
                    </div>
                    <div class="topo-setting-row" style="margin-top:6px; border-top:1px dashed #cbd5e1; padding-top:6px; flex-direction:column; align-items:flex-start;">
                        <label><b>🎨 Cài Đặt Màu Mặc Định:</b></label>
                        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-top:4px;">
                            <label style="font-size:12px;" for="topo-color-dgt">🚗 Màu Đường (DGT):</label>
                            <input type="color" id="topo-color-dgt" value="#ffaa32" style="width:32px; height:24px; border:none; cursor:pointer; border-radius:4px;">
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-top:4px;">
                            <label style="font-size:12px;" for="topo-color-dtl">🌊 Màu Sông suối (DTL):</label>
                            <input type="color" id="topo-color-dtl" value="#aaffff" style="width:32px; height:24px; border:none; cursor:pointer; border-radius:4px;">
                        </div>
                    </div>
                </div>

                <!-- Primary Action Buttons -->
                <div class="topo-controls">
                    <div class="topo-btn-group">
                        <button class="topo-btn-primary" id="topo-btn-scan">
                            <span>Check Topo</span>
                        </button>
                        <button class="topo-btn-secondary" id="topo-btn-smart-draw" title="Tự động vẽ đường chính & đường song song (Smart Drawer)">
                            <span>Vẽ Đường</span>
                        </button>
                        <button class="topo-btn-secondary" id="topo-btn-area-color">
                            <span>Đổi Màu Vùng</span>
                        </button>
                        <button class="topo-btn-secondary" id="topo-btn-area-delete">
                            <span>Xóa Vùng</span>
                        </button>
                    </div>
                </div>

                <!-- Area Selection & Line Drawing Active Bar -->
                <div class="topo-area-bar topo-drawer-hidden" id="topo-area-bar" style="flex-direction:column; gap:6px; padding:8px 10px;">
                    <div id="topo-draw-line-types" style="display:flex; align-items:center; gap:8px; width:100%;">
                        <label class="topo-main-radio" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; padding:4px 8px; background:#fff3e0; border:1px solid #ffb74d; border-radius:5px; cursor:pointer; flex:1;">
                            <input type="radio" name="topo-active-draw-type" value="DGT" checked style="margin:0;">
                            <span id="topo-badge-dgt" style="width:12px; height:12px; border-radius:50%; background:#ffaa32; display:inline-block; border:1px solid #ea580c;"></span>
                            <span>🚗 Vẽ Đường</span>
                        </label>
                        <label class="topo-main-radio" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; padding:4px 8px; background:#e0f7fa; border:1px solid #4dd0e1; border-radius:5px; cursor:pointer; flex:1;">
                            <input type="radio" name="topo-active-draw-type" value="DTL" style="margin:0;">
                            <span id="topo-badge-dtl" style="width:12px; height:12px; border-radius:50%; background:#aaffff; display:inline-block; border:1px solid #0284c7;"></span>
                            <span>🌊 Vẽ Sông</span>
                        </label>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                        <div class="topo-area-status" id="topo-area-status" style="font-size:11px; color:#475569;">Click chọn điểm, nhấp đúp để xong</div>
                        <div class="topo-area-actions">
                            <button class="topo-btn-sm topo-btn-primary" id="topo-btn-area-finish" style="display:none">✓ Hoàn Thành</button>
                            <button class="topo-btn-sm topo-btn-danger" id="topo-btn-area-confirm" style="display:none">🗑️ Xóa</button>
                            <button class="topo-btn-sm topo-btn-cancel" id="topo-btn-area-cancel">✕ Hủy</button>
                        </div>
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
        const smartDrawBtn = document.getElementById('topo-btn-smart-draw');
        const tolSlider = document.getElementById('topo-tolerance-slider');
        const tolVal = document.getElementById('topo-tol-val');

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

        // 4. Tolerance input & slider synchronization
        const tolInput = document.getElementById('topo-tolerance-input');
        if (tolSlider && tolInput) {
            tolSlider.addEventListener('input', (e) => {
                tolInput.value = e.target.value;
            });
            tolInput.addEventListener('input', (e) => {
                tolSlider.value = e.target.value;
            });
        }

        // Area Delete & Color elements
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

        const errorListContainer = document.getElementById('topo-error-list');
        const statsContainer = document.getElementById('topo-stats');

        function setUIVisibilityMode(mode) {
            if (mode === 'scan') {
                if (errorListContainer) errorListContainer.style.display = 'block';
                if (statsContainer) statsContainer.style.display = 'block';
            } else {
                if (errorListContainer) errorListContainer.style.display = 'none';
                if (statsContainer) statsContainer.style.display = 'none';
            }
        }

        function cancelAllInteractiveModes() {
            if (window.__smartDrawerStop) window.__smartDrawerStop();
            if (window.__areaDeleterCancel) window.__areaDeleterCancel();
            if (window.__areaColorizerHidePopover) window.__areaColorizerHidePopover();
            if (areaBar) areaBar.classList.add('topo-drawer-hidden');
            currentAreaMode = null;
            setUIVisibilityMode('scan');
        }

        function ensureNative3dgSelectEditModeActive() {
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
                    }
                }

                const trySelectEdit = () => {
                    const labels = Array.from(document.querySelectorAll('.ant-segmented-item, label'));
                    const selectEditLabel = labels.find(el => {
                        const text = (el.textContent || '').trim();
                        const svg = el.querySelector('svg');
                        const svgHtml = svg?.outerHTML || '';
                        return text.includes('Chọn/Sửa') || text === 'Chọn' || text === 'Sửa' || svgHtml.includes('M4.037 4.688') || svgHtml.includes('4.037');
                    });

                    if (selectEditLabel) {
                        const input = selectEditLabel.querySelector('input') || selectEditLabel.closest('label')?.querySelector('input');
                        if (input && !input.checked) {
                            selectEditLabel.click();
                            input.click();
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (!selectEditLabel.classList.contains('ant-segmented-item-selected')) {
                            selectEditLabel.click();
                        }
                    }
                };

                trySelectEdit();
                setTimeout(trySelectEdit, 200);
                setTimeout(trySelectEdit, 500);
            } catch (e) {
                console.warn('[CheckTopo] Failed to auto-trigger native "Chọn/Sửa" mode:', e);
            }
        }

        // 5. Scan button
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                cancelAllInteractiveModes();
                setActiveModeButton('topo-btn-scan');
                setUIVisibilityMode('scan');
                ensureNative3dgSelectEditModeActive();
                executeScan();
            });
        }

        // 5. Settings color pickers (⚙️) & Active Draw Type radios
        const dgtColorPicker = document.getElementById('topo-color-dgt');
        const dtlColorPicker = document.getElementById('topo-color-dtl');
        const badgeDgt = document.getElementById('topo-badge-dgt');
        const badgeDtl = document.getElementById('topo-badge-dtl');
        const drawTypeRadios = document.querySelectorAll('input[name="topo-active-draw-type"]');
        const lineTypeBox = document.getElementById('topo-draw-line-types');

        function getActiveDrawSettings() {
            const selectedRadio = document.querySelector('input[name="topo-active-draw-type"]:checked');
            const type = selectedRadio ? selectedRadio.value : 'DGT';
            const color = type === 'DGT' ? (dgtColorPicker ? dgtColorPicker.value : '#ffaa32') : (dtlColorPicker ? dtlColorPicker.value : '#aaffff');
            return { type, color };
        }

        function updateColorBadgesAndDrawer() {
            const dgtColor = dgtColorPicker ? dgtColorPicker.value : '#ffaa32';
            const dtlColor = dtlColorPicker ? dtlColorPicker.value : '#aaffff';

            if (badgeDgt) badgeDgt.style.backgroundColor = dgtColor;
            if (badgeDtl) badgeDtl.style.backgroundColor = dtlColor;

            const { type, color } = getActiveDrawSettings();
            if (window.__smartDrawerSetLandType) {
                window.__smartDrawerSetLandType(type, color);
            }
        }

        if (dgtColorPicker) dgtColorPicker.addEventListener('input', updateColorBadgesAndDrawer);
        if (dtlColorPicker) dtlColorPicker.addEventListener('input', updateColorBadgesAndDrawer);

        drawTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                updateColorBadgesAndDrawer();
            });
        });

        // 6. Smart Draw button
        if (smartDrawBtn) {
            smartDrawBtn.addEventListener('click', () => {
                if (smartDrawBtn.disabled) return;
                cancelAllInteractiveModes();
                setUIVisibilityMode('interactive');
                setActiveModeButton('topo-btn-smart-draw');
                currentAreaMode = 'smart-draw';

                const distEl = document.getElementById('topo-smart-dist');
                const sideEl = document.getElementById('topo-smart-side');
                const dist = distEl ? Number(distEl.value) : 5.0;
                const side = sideEl ? sideEl.value : 'right';

                const { type: landType, color } = getActiveDrawSettings();
                if (lineTypeBox) lineTypeBox.style.display = 'flex';

                if (window.__smartDrawerStart) {
                    const ok = window.__smartDrawerStart({ distance: dist, side: side, landType, color });
                    if (ok && areaBar) {
                        areaBar.classList.remove('topo-drawer-hidden');
                        if (areaStatus) areaStatus.innerHTML = `Click chọn điểm, <b>nhấp đúp hoặc click lại điểm cuối để xong</b>.`;
                        if (areaFinishBtn) areaFinishBtn.style.display = 'none';
                        if (areaConfirmBtn) areaConfirmBtn.style.display = 'none';
                    }
                }
            });
        }

        // ===== AREA SELECTION (COLOR vs DELETE) =====
        if (areaColorBtn) {
            areaColorBtn.addEventListener('click', () => {
                cancelAllInteractiveModes();
                setUIVisibilityMode('interactive');
                setActiveModeButton('topo-btn-area-color');
                currentAreaMode = 'color';
                if (lineTypeBox) lineTypeBox.style.display = 'none';
                if (window.__areaColorizerShowPopover) window.__areaColorizerShowPopover();
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
                setUIVisibilityMode('interactive');
                setActiveModeButton('topo-btn-area-delete');
                currentAreaMode = 'delete';
                if (lineTypeBox) lineTypeBox.style.display = 'none';
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

        // Point added event
        document.addEventListener('topo:area-point-added', (e) => {
            const count = e.detail?.count || 0;
            if (areaStatus) {
                if (currentAreaMode === 'smart-draw') {
                    areaStatus.innerHTML = `Click chọn điểm, <b>nhấp đúp hoặc click lại điểm cuối để xong</b>.`;
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

        // Finish Selection or Smart Drawing
        if (areaFinishBtn) {
            areaFinishBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (currentAreaMode === 'smart-draw') {
                    if (window.__smartDrawerFinish) window.__smartDrawerFinish();
                    cancelAllInteractiveModes();
                    setActiveModeButton('topo-btn-scan');
                    return;
                }
                if (window.__areaDeleterFinish) {
                    const selected = window.__areaDeleterFinish();
                    if (selected && selected.length > 0) {
                        if (currentAreaMode === 'color') {
                            areaStatus.innerHTML = `🎨 <b style="color:#0284c7">Đã quét thấy ${selected.length} đường</b>. Chọn màu bên dưới:`;
                            areaFinishBtn.style.display = 'none';
                            areaConfirmBtn.style.display = 'inline-flex';
                            areaConfirmBtn.textContent = `🎨 Chọn Màu (${selected.length} đường)`;

                            if (window.__areaColorizerShowPopover) {
                                window.__areaColorizerShowPopover(areaFinishBtn);
                            }
                        } else {
                            areaStatus.innerHTML = `⚠️ <b style="color:#dc2626">Đã quét thấy ${selected.length} đường</b> trong vùng.`;
                            areaFinishBtn.style.display = 'none';
                            areaConfirmBtn.style.display = 'inline-flex';
                            areaConfirmBtn.textContent = `🗑️ Xóa ${selected.length} đường`;
                        }
                    } else {
                        areaStatus.textContent = '❌ Không tìm thấy đường nào trong vùng đã chọn!';
                    }
                }
            });
        }

        // Confirm Action (Delete or Show Color Popover)
        function handleConfirmAction() {
            if (currentAreaMode === 'color') {
                if (window.__areaColorizerShowPopover) {
                    window.__areaColorizerShowPopover(areaConfirmBtn);
                }
            } else {
                handleConfirmDelete();
            }
        }

        function handleConfirmDelete() {
            const count = window.__areaDeleterGetSelectedCount ? window.__areaDeleterGetSelectedCount() : 0;
            if (count === 0) return;

            const sure = confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN ${count} đường/ranh giới trong vùng đã chọn không?`);
            if (sure && window.__areaDeleterDelete) {
                const deleted = window.__areaDeleterDelete();
                alert(`✅ Đã xóa thành công ${deleted} đường khỏi bản đồ!`);
                cancelAllInteractiveModes();
                setActiveModeButton('topo-btn-scan');
            }
        }

        if (areaConfirmBtn) {
            areaConfirmBtn.addEventListener('click', handleConfirmAction);
        }

        // Cancel Area Selection / Drawing Mode
        if (areaCancelBtn) {
            areaCancelBtn.addEventListener('click', () => {
                cancelAllInteractiveModes();
                setActiveModeButton('topo-btn-scan');
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
        const tolInput = document.getElementById('topo-tolerance-input');
        const tolSlider = document.getElementById('topo-tolerance-slider');
        const statsText = document.getElementById('topo-stats-text');
        const fabBadge = document.getElementById('topo-fab-badge');

        const tolerance = parseFloat(tolInput?.value) || parseFloat(tolSlider?.value) || 0.5;

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
            scanBtn.innerHTML = `<span>Check Topo</span>`;
        }, 100);
    }

    function clearTopologyCheckResults() {
        currentErrors = [];
        activeErrorId = null;

        if (window.__topoClearHighlight) {
            window.__topoClearHighlight();
        }

        const fabBadge = document.getElementById('topo-fab-badge');
        if (fabBadge) fabBadge.style.display = 'none';

        const statsText = document.getElementById('topo-stats-text');
        const listEl = document.getElementById('topo-error-list');

        if (statsText) {
            statsText.innerHTML = `<span class="topo-text-muted">🧹 Đã xóa toàn bộ kết quả quét topology.</span>`;
        }

        if (listEl) {
            listEl.innerHTML = `
                <div class="topo-empty-state">
                    Bấm <b>Check Topo</b> để quét lại vị trí lỗi trên bản đồ.
                </div>
            `;
        }
    }

    // ===== RENDER ERROR LIST =====
    function renderErrorList(errors) {
        const listEl = document.getElementById('topo-error-list');
        const statsText = document.getElementById('topo-stats-text');
        const statsEl = document.getElementById('topo-stats');

        if (statsEl) statsEl.style.display = 'block';

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
            <div class="topo-stats-header-row">
                <span class="topo-text-danger">⚠️ Phát hiện <b>${errors.length}</b> lỗi (${summaryParts.join(', ')})</span>
                <button type="button" class="topo-clear-errors-btn" id="topo-btn-clear-errors" title="Xóa toàn bộ kết quả quét Topo">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Xóa</span>
                </button>
            </div>
        `;

        const clearBtn = document.getElementById('topo-btn-clear-errors');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                clearTopologyCheckResults();
            });
        }

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

            item.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            listEl.appendChild(item);
        });
    }

    // ===== SELECT AND ZOOM TO ERROR (WITH TOGGLE OFF / TẮT SÁNG FEATURE) =====
    function selectAndZoomError(err, itemElement) {
        if (activeErrorId === err.id) {
            // Re-clicking active item TOGGLES OFF (Tắt sáng) highlight for this specific line!
            activeErrorId = null;
            if (itemElement) itemElement.classList.remove('--active');
            if (window.__topoToggleHighlight) {
                window.__topoToggleHighlight(err.id, false);
            }
            console.log(`[TopologyUI] 🔕 Turn OFF highlight for error [${err.id}]`);
            return;
        }

        activeErrorId = err.id;

        document.querySelectorAll('.topo-error-item').forEach(el => el.classList.remove('--active'));
        if (itemElement) itemElement.classList.add('--active');

        if (window.__topoToggleHighlight) {
            window.__topoToggleHighlight(err.id, true);
        }

        const defaultZoom = window.__topoConfig?.defaultZoom || 24;

        if (window.__topoZoomToError) {
            const ok = window.__topoZoomToError(err.coord, defaultZoom, err);
            if (ok) {
                console.log(`[TopologyUI] 🎯 Zoomed to error at [${err.coord[0]}, ${err.coord[1]}] (${err.type}, Zoom: ${defaultZoom})`);
            }
        }
    }

    // ===== INIT UI =====
    function initUI() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createUI);
        } else {
            createUI();
        }
    }

    initUI();
    setTimeout(createUI, 500);
    setTimeout(createUI, 1500);

})();
