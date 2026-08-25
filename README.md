# 3DG Map Topology Checker - Chrome Extension V3

Tien ich Chrome danh rieng cho **3dg.vn**, ho tro kiem tra loi topology, ve duong song song thong minh, doi mau vung va xoa nhanh theo vung.

---

## Tinh Nang

### 1. Check Topo
- Phat hien dau mut ho (Dangle): dinh co bac = 1 chua khep kin thua dat
- Phat hien trung net (Duplicate): doan ranh gioi trung lap giua cac thua
- Click vao loi de ban do zoom toi vi tri

### 2. Smart Drawer - Ve Duong va Song Song Song
- Chon loai dat: DGT (duong - cam), DTL (song - xanh), hoac bat ky loai dat khac
- Dieu chinh khoang cach net song song: nhap so hoac bam + / -, don vi m/dm/cm
- 3 huong song song: Phai, Trai, Ca 2 ben
- Bat diem tu dong (Vertex Snapping 20px): hut dinh vao dinh net cu, co vong xanh phan hoi
- Ket thuc net: Double-click, click lai diem cuoi, Enter, hoac nut Ket Thuc
- Cooldown guard 450ms chong nay sinh net thua khi double-click
- Moi click ngoai `.ol-viewport` (panel, nut UI...) bi bo qua hoan toan

### 3. Doi Mau Vung
- Bang mau loai dat chuan (DGT, DTL, MNC, LUA, CLN, ONT, ODT...)
- Ghim uu tien (star) luu vao localStorage
- Mau tu chon Hex + Color Picker

### 4. Xoa Vung
- Khoanh Polygon -> quet va highlight tat ca net trong vung -> xoa hang loat (1-click hoac Delete)

---

## Kien Truc

```
content.js (MAIN world inject)
  +- setting.js
  +- map-bridge.js        <- tim ol.Map qua React Fiber, expose window.__topoMap
  +- 2d/                  <- Tinh nang 2D Tiles
  |    +- check-topo.js   <- kiem tra topology 2D
  |    +- smart-draw.js   <- ve duong/song song song 2D
  |    +- cut-line.js     <- cat net ve 2D
  |    +- area-color.js   <- doi mau vung 2D
  |    +- area-delete.js  <- xoa vung 2D
  +- 3d/                  <- Tinh nang 3D Mesh
  |    +- bridge-3d.js    <- bridge ket noi viewer/scene 3D
  |    +- check-topo.js   <- kiem tra topology 3D
  |    +- area-color.js   <- doi mau vung 3D
  +- topo-ui.js           <- panel UI, FAB button, auto-detect 2D/3D Mode Router
```

### smart-draw.js - Luong hoat dong

```
startSmartDrawing()
  -> disableNativeMapInteractions()   <- tat Draw/Modify/Snap/DblClickZoom cua OL
  -> ensureNative3dgLineModeActive()  <- click tab "Duong" trong panel 3DG
  -> attachEventListeners()           <- lang nghe mousedown/up/move/dblclick/keydown

onMouseUp() -> finishSmartDrawing()
  -> computeParallelOffset()          <- tinh duong song song (miter join, clamp 2.5x)
  -> addPolylineFeatureToMap()        <- tao OL Feature, add vao drawSource + layerSources
  -> forceDeselectViaEvent()          <- clear Select interaction (delay 150ms, 500ms)
  -> cleanupNative3dgDefaultLine()    <- xoa BAN_VE line goc (delay 100ms, 400ms)
```

### Tim source de add feature

Feature duoc add vao ca hai loai source:

| Source | Tim bang | Vai tro |
|--------|----------|---------|
| drawSource | interactions[i].source_ voi type_=LineString | Render dung tren map canvas |
| allSources (layer tree) | map.getLayers() walk | collectAllMapFeatures() trong map-bridge tim duoc khi trash button click |

---

## Van De Chua Giai Quyet

### 1. Danh sach +1 lan ve dau tien (sau reload moi dung)

**Trieu chung:** Lan ve dau tien trong session -> list tang +1 thay vi +2. Tu lan 2 tro di: dung. Sau reload: luon dung.

**Root cause:** 3DG React chi update list khi Draw interaction fires `drawend` event (native flow). Feature cua extension duoc add bang `source.addFeature()` truc tiep -> chi fires `addfeature` -> 3DG React khong lang nghe -> list thieu. BAN_VE (net goc native) xuat hien dung vi no di qua `drawend` flow.

**Da thu, that bai:**
- Dispatch `drawend` tren Draw interaction -> 3DG reset interaction -> mat het feature tren map
- Switch tab "Diem" -> "Duong" nhanh de force remount -> gay loi khac
- Goi `__topoSyncFeatureToReactState` -> duplicate entries

**Workaround:** F5 sau lan ve dau neu can so dem chinh xac.

---

### 2. Trash button chi xoa list, khong xoa net tren map

**Trieu chung:** Click thung rac -> entry bien khoi list nhung net ve con tren map. Sau reload: ca list lan map deu dung.

**Root cause:**
```
map-bridge.js -> removeFeatureDirectlyFromFlex()
  -> collectAllMapFeatures()   <- walk map.getLayers() tree ONLY
  -> itemsToDelete = []        <- khong thay feature neu no chi trong drawSource
                                  (drawSource = interaction source, khong phai layer source)
  -> triggerSilentNativeDelete() <- xoa React list entry [OK]
  -> source.removeFeature()    <- BI BO QUA vi itemsToDelete rong [FAIL]
```

**Dang thu:** Add feature vao allSources (layer tree) de collectAllMapFeatures() tim duoc. Chua verify hoan toan.

---

## Cai Dat

1. Clone repo ve may
2. Chrome -> chrome://extensions/ -> bat Developer mode
3. Load unpacked -> chon thu muc 3dg-check
4. Truy cap https://3dg.vn

---

## Tech Stack

- Manifest V3 Chrome Extension (MAIN world injection)
- Vanilla JS ES6+
- OpenLayers - tuong tac map GIS
- HTML5 Canvas API - preview net ve real-time
- React Fiber traversal - tim ol.Map qua component tree