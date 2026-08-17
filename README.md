# 🗺️ 3DG Map Topology Checker — Chrome Extension V3

Tiện ích mở rộng chuyên dụng dành riêng cho trang web **3dg.vn**, hỗ trợ các kỹ sư bản đồ & biên tập viên GIS tự động kiểm tra lỗi topology, vẽ đường giao thông & sông suối song song thông minh, đổi màu vùng quy hoạch đất và xóa nhanh theo vùng.

---

## 🌟 Tính Năng Nổi Bật

### 1. 🔍 Check Topo (Kiểm Tra Lỗi Topology)
* **Kiểm tra đầu mút hở (Dangle Check)**: Phát hiện chính xác các đường ranh giới chưa khép kín thửa đất (bậc của đỉnh = 1).
* **Kiểm tra trùng nét (Duplicate Check)**: Quét và phát hiện các đoạn ranh giới trùng lặp giữa các thửa.
* **Khóa đỉnh trùng (Auto Clean)**: Tự động loại bỏ các đỉnh trùng lặp tọa độ liên tiếp.
* **Điều hướng nhanh**: Bấm vào danh sách lỗi để bản đồ tự động phóng tới vị trí lỗi.

### 2. ✏️ Vẽ Đường & Vẽ Sông Thông Minh (Smart Drawer)
* **Chuyển đổi loại đất & màu sắc**: Chọn nhanh giữa **🚗 Vẽ Đường (DGT - Cam)** và **🌊 Vẽ Sông (DTL - Xanh)** hoặc mở bảng màu tùy chọn trực tiếp trên thanh công cụ.
* **Bộ điều khiển co giãn khoảng cách `[ − ] [ 5.00 ] [ m/dm/cm ] [ + ]`**:
  * Cho phép gõ số trực tiếp hoặc tăng/giảm khoảng cách bằng nút `+` và `−`.
  * Hỗ trợ chọn đơn vị linh hoạt: **m** (mét), **dm** (đề-xi-mét), **cm** (xăng-ti-mét).
  * Cập nhật đường song song xem trước thời gian thực (Real-time Preview).
* **Tùy chọn vị trí nét song song**: Hỗ trợ 3 hướng vẽ song song: **Phải** (Right), **Trái** (Left), hoặc **Cả 2 bên** (Both sides - tạo 3 đường).
* **Hệ thống bắt điểm tự động (Vertex Snapping & Offset Line Snapping)**:
  * **Hút dính điểm chính xác 100%**: Tự động bắt điểm vào tất cả các đỉnh nét vẽ cũ trên toàn bản đồ.
  * **Phản hồi trực quan (Green Magnet Ring)**: Vòng tròn màu xanh lá phát sáng đánh dấu chính xác điểm đang được hút bắt điểm.
  * **Bắt khớp cả nét chính lẫn nét song song**: Đảm bảo các đoạn đường/sông nối tiếp nhau khép kín hoàn toàn, cả nét 1 và nét 2 đều nối liền mạch không bị hở.
* **Thao tác ngắt nét linh hoạt**:
  * Click chuột trái nút **`[ ✓ Kết Thúc Nét Vẽ ]`** ở thanh công cụ.
  * Click chuột trái lại đúng điểm vừa chấm.
  * Nháy đúp chuột trái (**Double Click**).
  * Nhấn phím **Enter**.
  * Tích hợp **Cooldown Guard (450ms)** chống nảy sinh nét vẽ thừa khi nháy đúp.
* **Đồng bộ 100% GeoJSON & React State**: Tự động đưa thuộc tính (`Layer`, `OGR_STYLE`, `strokeColor`, `landType`, `name`) vào OpenLayers và **3DG React Fiber / Redux Store**, bảo toàn nguyên vẹn dữ liệu nét song song khi Xuất & Nhập file GeoJSON.

### 3. 🎨 Đổi Màu Vùng (Area Colorizer)
* **Bảng màu quy hoạch đất**: Tích hợp danh mục mã loại đất chuẩn (DGT, DTL, MNC, LUA, CLN, ONT, ODT...).
* **Ghim ưu tiên (⭐ Favorite)**: Tích sao để ghim các loại đất thường dùng lên đầu danh sách (tự động lưu vào localStorage).
* **Màu tự chọn**: Bảng màu 5x8 phong phú kèm ô nhập mã màu Hex & Color Picker tùy chỉnh.

### 4. 🗑️ Xóa Vùng (Area Deleter)
* Khoanh vùng Polygon linh hoạt trên bản đồ.
* Tự động quét và phát hiện tất cả các nét vẽ nằm trong vùng được khoanh.
* Highlight đường được chọn và cho phép xóa hàng loạt khỏi bản đồ chỉ với 1 cú click (hoặc phím **Delete**).

### 5. 🧹 Giao Diện UI Tối Ưu (Context-Aware Responsive UI)
* Tự động ẩn các thanh chỉnh khoảng cách vẽ đường khi chuyển sang chế độ "Đổi Màu Vùng" hay "Xóa Vùng".
* Giao diện nhỏ gọn, hiện đại, trải nghiệm mượt mà.

---

## 🏗️ KIẾN TRÚC MÃ NGUỒN & NGUYÊN LÝ HOẠT ĐỘNG KỸ THUẬT (DEVELOPER GUIDE)

### 1. ⚙️ Cơ Chế Inject & Môi Trường Hoạt Động (MAIN World Injection)
Extension hoạt động theo chuẩn **Manifest V3**. File `content.js` thực hiện inject mã nguồn vào môi trường **MAIN World** của trang web `3dg.vn`.

* **Lý do**: Trang `3dg.vn` sử dụng **OpenLayers (`ol.Map`)** và bộ quản lý trạng thái **React Fiber / Redux** chạy trong ngữ cảnh `window` toàn cục. Isolated World của Chrome Extension không thể truy cập trực tiếp các biến này.
* **Cơ chế nạp**: `content.js` nạp tuần tự các module:
  `map-bridge.js` ➔ `check-topo.js` ➔ `smart-draw.js` ➔ `area-color.js` ➔ `area-delete.js` ➔ `topo-ui.js`.

---

### 2. 🌉 Module `core/map-bridge.js` (Cầu Nối Dữ Liệu OpenLayers & React Fiber)

Module này đóng vai trò là "trái tim" giao tiếp giữa extension và hệ thống 3DG.vn:

* **Tự động tìm kiếm đối tượng bản đồ (`window.__topoMap`)**:
  Hàm `findOpenLayersMap()` duyệt qua cây DOM, các phần tử canvas, và các thuộc tính `ol` gắn trên `window` để xác định chính xác thể hiện `ol.Map` đang hoạt động.
* **Đồng bộ trạng thái React State / Redux (`syncFeatureTo3dgReactState`)**:
  * Khi thêm/sửa/xóa một Feature trên OpenLayers, dữ liệu cần được đưa vào Redux/React state của 3DG để giao diện web phản hồi và hỗ trợ xuất file GeoJSON.
  * Hàm thực hiện duyệt cây React Fiber (`__reactFiber$`), tìm các updater function (`setFeatures`, `dispatch`).
  * **Chống lặp vô hạn & Nhảy số lượng**: Sử dụng `dispatchedQueues = new Set()` và kiểm tra `prev.some(item => item.id === featureId)` để ngăn chặn việc dispatch trùng lặp lên hàng trăm React Node.
* **Chuẩn hóa GeoJSON & UUID**:
  * Chuyển đổi tọa độ giữa **Web Mercator (`EPSG:3857`)** và **WGS84 (`EPSG:4326` `[lon, lat]`)** bằng `transformToLonLat()`.
  * Đảm bảo mỗi Feature (bao gồm cả nét chính và nét song song) được gán 1 UUID duy nhất (`feat.setId(uuid)`), bổ sung đầy đủ các thuộc tính 3DG native: `Layer`, `OGR_STYLE`, `fill`, `stroke`, `strokeColor`, `landType`, `name`.

---

### 3. ✏️ Module `core/features/smart-draw.js` (Vẽ Song Song & Bắt Điểm)

Thuật toán chính của vẽ đường/sông song song và bắt điểm nằm tại đây:

* **Thuật toán tính đường song song (`computeParallelOffset`)**:
  * Với mỗi phân đoạn đường $\vec{P_i P_{i+1}}$, tính pháp tuyến đơn vị $\vec{n} = \left(-\frac{dy}{\text{len}}, \frac{dx}{\text{len}}\right)$.
  * Tại các đỉnh nối (Miter Join), tính vectơ phân giác và nhân với hệ số tỉ lệ Mercator theo vĩ độ (`getMeterScaleFactor`).
  * Hỗ trợ tính offset theo 3 chế độ: `right` ($+d$), `left` ($-d$), hoặc `both` ($\pm d$).
* **Thuật toán bắt điểm tự động (Vertex Snapping & Offset Snapping)**:
  * **`getSnappedCoordinate(map, rawCoord, pxThreshold = 20)`**: Rà quét tất cả các Feature trong mọi Vector Source trên bản đồ. Nếu khoảng cách màn hình (pixel) giữa con trỏ chuột và đỉnh cũ $< 20\text{px}$, trả về tọa độ chính xác của đỉnh cũ.
  * **`snapOffsetLineCoords(map, offsetCoords, 25)`**: Áp dụng rà quét và bắt điểm cho **tất cả các đỉnh của Line 2 (đường song song)**. Giúp Line 2 của nét mới tự động hút dính khép kín vào Line 2 của nét cũ.
* **Lớp phủ Canvas thời gian thực (`renderSmartDrawCanvas`)**:
  * Tạo một thẻ `<canvas>` đè lên bản đồ với `pointer-events: none`.
  * Lắng nghe sự kiện `mousemove` và `postrender` của OpenLayers để vẽ nét đứt xem trước (Preview Line) và **Vòng tròn nam châm màu xanh lá (`#22c55e`)** khi đang hút bắt điểm.
* **Bảo vệ ngắt nét (Cooldown Guard `justFinishedTime`)**:
  * Khi ngắt nét, thiết lập timestamp `justFinishedTime = Date.now()`.
  * Trong 450ms tiếp theo, mọi sự kiện click/mouseup sẽ bị loại bỏ để tránh việc cú nhấp thứ 2 của thao tác nháy đúp bị hiểu nhầm thành điểm bắt đầu của nét vẽ mới.

---

### 4. 🔍 Module `core/features/check-topo.js` (Kiểm Tra Lỗi Topology)

* **Phát hiện Dangle (Đầu mút hở)**:
  * Xây dựng đồ thị bậc đỉnh từ danh sách các đoạn thẳng.
  * Những đỉnh có bậc = 1 (chỉ kết nối với 1 đoạn thẳng) và không nằm trên ranh giới vùng làm việc được đánh dấu là lỗi **Dangle (Mút hở)**.
* **Phát hiện trùng nét (Duplicate)**:
  * Chuẩn hóa tọa độ đoạn thẳng (sắp xếp theo thứ tự tọa độ tăng dần để so sánh hai chiều).
  * Sử dụng Hash Map để phát hiện các đoạn thẳng trùng nhau 100% tọa độ.

---

### 5. 🎨 Module `core/features/area-color.js` & 🗑️ `core/features/area-delete.js`

* **Vẽ Polygon khoanh vùng**:
  * Cho phép người dùng chấm các điểm để tạo vùngPolygon ranh giới trên Canvas overlay.
* **Thuật toán giao cắt không gian (Spatial Intersection)**:
  * Sử dụng giải thuật Ray-Casting (Point-in-Polygon) hoặc OpenLayers Geometry Intersection để xác định tất cả các Feature nằm trong hoặc cắt qua vùng Polygon khoanh chọn.
* **Thực thi**:
  * `area-color.js`: Cập nhật lại màu sắc (`color`, `fill`, `stroke`) và thuộc tính mã loại đất cho các Feature được chọn.
  * `area-delete.js`: Xóa các Feature được chọn khỏi Vector Source và gọi `syncFeatureTo3dgReactState` để xóa sạch khỏi Redux/React State của 3DG.vn.

---

### 6. 🎨 Module `core/topo-ui.js` (Quản Lý Giao Diện & Trạng Thái UI)

* **Giao diện Ant Design Modern**:
  * Tạo Floating Action Button (FAB) `#topo-fab-btn` và bảng điều khiển chính `#topo-checker-panel`.
  * Hỗ trợ Kéo - Thả (Draggable) bảng điều khiển trên màn hình.
* **Quản lý ẩn/hiện thông minh (Context-Aware UI)**:
  * Hàm `setSmartDrawControlsVisible(visible)` tự động bật/tắt các thanh công cụ `Vẽ Đường/Sông`, `Giãn khoảng cách`, `Hàng song song` tùy theo chế độ làm việc hiện tại (`smart-draw`, `color`, `delete`, `scan`).

---

## 📁 Cấu Trúc Thư Mục Dự Án

```
3dg-check/
├── manifest.json            # Chrome Extension Manifest V3 (Main world script inject)
├── content.js                # Extension Loader Script (Inject vào MAIN world)
├── setting.js                # Cấu hình cài đặt extension
├── color.json                # Danh mục loại đất & mã màu chuẩn quy hoạch
├── land-colors.json          # Danh mục loại đất tham chiếu
├── styles.css                # Giao diện UI Ant Design modern
├── README.md                 # Tài liệu hướng dẫn & Kiến trúc mã nguồn
└── core/                     # Lõi ứng dụng
    ├── map-bridge.js         # Cầu nối OpenLayers & React Fiber State của 3DG.vn
    ├── topo-ui.js            # Bảng điều khiển chính (Control Panel & Floating Action Button)
    └── features/             # 4 Module tính năng độc lập
        ├── check-topo.js     # 🔍 Feature 1: Thuật toán kiểm tra lỗi topology
        ├── smart-draw.js      # ✏️ Feature 2: Vẽ đường chính, đường song song, bắt điểm & ngắt nét
        ├── area-color.js      # 🎨 Feature 3: Quản lý bảng màu & đổi màu theo vùng
        └── area-delete.js     # 🗑️ Feature 4: Khoanh vùng & xóa đường hàng loạt
```

---

## 🚀 Hướng Dẫn Cài Đặt

1. Tải hoặc Clone kho chứa mã nguồn `3dg-check` về máy tính.
2. Mở trình duyệt Chrome / Edge và truy cập địa chỉ `chrome://extensions/`.
3. Bật chế độ **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
4. Bấm nút **Load unpacked (Tải tiện ích đã giải nén)** và chọn thư mục `3dg-check`.
5. Truy cập trang web [https://3dg.vn](https://3dg.vn) để trải nghiệm tiện ích!

---

## 🛠️ Công Nghệ Sử Dụng
* **Manifest V3** Chrome Extension Standard (Main World Context Injection).
* **Vanilla JavaScript (ES6+)** — Độc lập, tối ưu hiệu năng cao.
* **OpenLayers Spatial API** — Tương tác bản đồ GIS trực tiếp.
* **HTML5 Canvas API** — Lớp phủ vẽ kỹ thuật & hiệu ứng phản hồi thời gian thực.
* **React Fiber Tree Traversal & Redux Store** — Đồng bộ dữ liệu 2 chiều với 3DG.vn.
