# 🗺️ 3DG Map Topology Checker — Chrome Extension V3

Tiện ích mở rộng chuyên dụng dành riêng cho trang web **3dg.vn**, hỗ trợ các kỹ sư bản đồ & biên tập viên GIS tự động kiểm tra lỗi topology, vẽ đường giao thông & sông suối song song thông minh, đổi màu vùng quy hoạch đất và xóa nhanh theo vùng.

---

## 🌟 Tính Năng Nổi Bật

### 1. 🔍 Check Topo (Kiểm Tra Lỗi Topology)
* **Kiểm tra đầu mút hở (Dangle Check)**: Phát hiện chính xác các đường ranh giới chưa khép kín thửa đất.
* **Kiểm tra trùng nét (Duplicate Check)**: Quét và phát hiện các đoạn ranh giới trùng lặp giữa các thửa.
* **Khóa đỉnh trùng (Auto Clean)**: Tự động loại bỏ các đỉnh trùng lặp tọa độ liên tiếp.
* **Điều hướng nhanh**: Bấm vào danh sách lỗi để bản đồ tự động phóng tới vị trí lỗi.

### 2. ✏️ Vẽ Đường & Vẽ Sông (Smart Drawer)
* **Chuyển đổi trực quan**: Chọn nhanh giữa **🚗 Vẽ Đường (DGT - Cam)** và **🌊 Vẽ Sông (DTL - Xanh)** trực tiếp trên thanh công cụ chính.
* **Tự động sinh đường song song**: Nhập khoảng cách lề (mètres) và chọn hướng (Bên phải, Bên trái, Cả 2 bên), hệ thống sẽ tự động tính toán và tạo đường song song đồng bộ.
* **Thao tác ngắt nét linh hoạt**:
  * **Nhấp đúp chuột (Double click)** trên bản đồ.
  * **Click vào đỉnh vừa chấm** (kể cả sau vài giây).
  * Nhấn phím **Enter**.
* **Đồng bộ 100% dữ liệu**: Tự động đưa đường vẽ & màu sắc vào OpenLayers và **3DG React State / Layer Store**, bảo toàn dữ liệu khi xuất file GeoJSON.

### 3. 🎨 Đổi Màu Vùng (Area Colorizer)
* **Bảng màu quy hoạch đất**: Tích hợp danh mục mã loại đất chuẩn (DGT, DTL, MNC, LUA, CLN...).
* **Ghim ưu tiên (⭐ Favorite)**: Tích sao để ghim các loại đất thường dùng lên đầu danh sách (tự động lưu vào localStorage).
* **Màu tự chọn**: Bảng màu 5x8 phong phú kèm ô nhập mã màu Hex & Color Picker tùy chỉnh.

### 4. 🗑️ Xóa Vùng (Area Deleter)
* Khoanh vùng Polygon linh hoạt trên bản đồ.
* Tự động quét và phát hiện tất cả các nét vẽ nằm trong vùng được khoanh.
* Highlight đường được chọn và cho phép xóa hàng loạt khỏi bản đồ chỉ với 1 cú click (hoặc phím **Delete**).

---

## 📁 Cấu Trúc Mã Nguồn (Modular Architecture)

```
3dg-check/
├── manifest.json            # Chrome Extension Manifest V3
├── content.js                # Extension Loader Script (Inject vào MAIN world)
├── setting.js                # Cấu hình cài đặt extension
├── color.json                # Danh mục loại đất & mã màu chuẩn quy hoạch
├── land-colors.json          # Danh mục loại đất tham chiếu
├── styles.css                # Giao diện UI Ant Design modern
├── README.md                 # Tài liệu hướng dẫn sử dụng
└── core/                     # Lõi ứng dụng
    ├── map-bridge.js         # Cầu nối OpenLayers & React Fiber State của 3DG.vn
    ├── topo-ui.js            # Bảng điều khiển chính (Control Panel & Floating Action Button)
    └── features/             # 4 Module tính năng độc lập
        ├── check-topo.js     # 🔍 Feature 1: Thuật toán kiểm tra lỗi topology
        ├── smart-draw.js      # ✏️ Feature 2: Vẽ đường chính, đường song song & cắt nét
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
* **Manifest V3** Chrome Extension Standard.
* **Vanilla JavaScript (ES6+)** — Độc lập, không phụ thuộc thư viện ngoài.
* **OpenLayers Spatial API** — Tương tác bản đồ GIS trực tiếp.
* **React Fiber Tree Traversal** — Đồng bộ React State trên 3DG.vn.
