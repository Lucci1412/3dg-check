# 3DG Map Topology Checker Extension

Extension Chrome dành riêng cho nền tảng web GIS `https://3dg.vn` giúp kiểm tra topology, phát hiện nhanh các vị trí đầu mút bị hở, ranh giới chưa khép kín thửa đất và chuyển bản đồ trực tiếp tới vị trí lỗi.

## 📁 Cấu trúc Module Mô-đun (Modular Architecture)

Mã nguồn được phân chia thành các Module độc lập trong thư mục `core/` để dễ dàng mở rộng thêm các tính năng mới sau này:

```
3dg-topology-checker/
├── manifest.json            # Chrome Extension Manifest V3
├── content.js               # Content Script Injector
├── styles.css               # Giao diện Xám-Trắng & Hiệu ứng nhấp nháy
├── README.md                # Tài liệu hướng dẫn
└── core/                    # Thư mục các Module chức năng
    ├── map-bridge.js        # Module kết nối OpenLayers Map, Zoom & Lớp Marker
    ├── topo-engine.js       # Module thuật toán quét lỗi Topology Dangle
    └── topo-ui.js           # Module Giao diện người dùng CAD Minimalist
```

## ⚡ Tính năng nổi bật

1. **Check Topo nhanh chóng**:
   * Nút bấm **Check Topo** giúp quét toàn bộ >2000 đường ranh giới trong vài miligiây.
2. **Hiển thị Bóng Đèn Đỏ Nhấp Nháy tại mút hở**:
   * Tự động hiển thị chấm đỏ nhấp nháy phát sáng tại tất cả các vị trí mút hở trên bản đồ.
3. **Chế độ Zoom Cận Cảnh**:
   * Bấm vào bất kỳ ô lỗi nào (`🔴 Lỗi 1`, `🔴 Lỗi 2`,...) bản đồ sẽ tự động thu phóng cận cảnh (Level 21) đến đúng vị trí đó.
4. **Giao diện Xám - Trắng Tinh Gọn**:
   * Nút kính lúp `🔍` và Bảng điều khiển có thể **Kéo & Thả (Drag & Drop)** tự do trên màn hình.
   * Hỗ trợ nút **Cài đặt (`⚙️`)**, **Thu nhỏ (`—`)**, **Đóng (`✕`)**.

## 🛠️ Hướng dẫn cài đặt vào Chrome

1. Truy cập `chrome://extensions/` trên trình duyệt Chrome.
2. Bật **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
3. Bấm nút **Load unpacked (Tải tiện ích đã giải nén)**.
4. Chọn thư mục `3dg-topology-checker`.
5. Truy cập `https://3dg.vn` và bấm nút kính lúp `🔍` để sử dụng!
