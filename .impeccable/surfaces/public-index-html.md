---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: []
---

# Trang quản lý shop (public/index.html)

Scope: toàn bộ giao diện một trang, chế độ Operate. Người dùng: chủ shop và nhân viên, máy tính và điện thoại (điện thoại là cách dùng chính thức). Việc: xem sản phẩm, sửa giá và tồn, chọn sản phẩm đẩy lượt hiển thị; sắp tới thêm sửa hàng loạt, trả lời đánh giá, xử lý đơn. Ràng buộc: tệp HTML thuần, không bước biên dịch; giữ nguyên mọi đường dẫn API; màu và logo Combi Home chưa nhận, chỉ để chỗ trống bằng biến `--cover`.

## Direction contract

THESIS: Trang quản lý là cuốn sổ bán hàng của shop: mỗi sản phẩm là một dòng sổ, mỗi lần sửa giá hay tồn là một lần chữa sổ, số cũ gạch đỏ, số mới viết mực xanh, Shopee nhận thì có dấu tích. Từ chối kiểu mặc định của loại này: bảng điều khiển màu cam nhái Kênh Người Bán, thẻ số liệu lớn và thanh bên.

OWN-WORLD: giấy vở trắng hơi xanh kẻ đúng mẫu vở ô ly (ô lớn 32px, ba dòng kẻ mảnh cách 8px), một đường lề đỏ; mực bi xanh là mực duy nhất cho dữ liệu và nút; bút đỏ chỉ có ba việc (kẻ lề, gạch số cũ và báo lỗi, dấu "Shop thật"); bút chì xám và bìa màu chì cho môi trường thử nghiệm; bìa sổ màu đặc có nhãn vở trắng. Dòng kẻ ngang thay cho thẻ, không đổ bóng trừ nhãn vở. Be Vietnam Pro tự lưu trên máy, số dạng bảng. Chế độ tối là giấy than.

STORY: Nhân viên mở trang, đọc nhãn vở biết ngay shop nào, môi trường nào; tìm dòng sản phẩm, chữa giá hoặc tồn, thấy từng dòng được xác nhận hay bị từ chối kèm lý do; nhìn năm ô đẩy biết còn chỗ trống hay không.

FIRST VIEWPORT: Điện thoại 390: bìa sổ cao khoảng 96px, nhãn vở trắng bên trong ghi tên shop, mã shop, tình trạng kết nối; con dấu môi trường góc phải nhãn. Ngay dưới là các dòng sổ sản phẩm đầu tiên. Thanh thẻ cố định ở đáy màn hình trong tầm ngón cái. Máy tính: bìa sổ trải ngang, thẻ phân trang nhô lên từ mép giấy, bảng sổ có đường lề đỏ bên trái. Thao tác chính (lưu giá, lưu tồn) nằm ngay trong dòng.

FORM: sổ bán hàng (sổ ô ly của cửa hàng), vị trí 6 trong danh sách xếp hạng, seed key 624da87f. Tương tác đặc trưng: chữa sổ (gạch số cũ, viết số mới, dấu tích khi Shopee nhận). Nâng cấp từ các hướng bị loại: ô đẩy trống là ô rỗng trong hàng năm ô (console); luật một mực (catalog); ô đang đẩy vơi dần đúng 4 giờ kèm số phút (cloud quarry); màu không bao giờ là tín hiệu duy nhất, trạng thái luôn có chữ và dấu (cyclorama); khoảng cách theo bội số 4px của dòng kẻ ô ly (arcade); mọi con số là số dạng bảng, căn phải theo cột (oscilloscope).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Chưa quyết

- Màu bìa và logo Combi Home: chờ PM gửi, thay `--cover` và ô logo trong nhãn vở.
