# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Chủ shop Combi Home (người quản lý) và vài nhân viên cùng thao tác.
- Dùng cả trên máy tính (MacBook) và **điện thoại**, ví dụ kiểm tra nhanh khi đang ở ngoài. Giao diện điện thoại là cách dùng chính thức, không phải phương án phụ.
- Việc hằng ngày: xem sản phẩm, sửa giá và tồn kho, chọn sản phẩm để đẩy lượt hiển thị. Sắp tới: sửa hàng loạt bằng Excel, trả lời đánh giá, xử lý và in đơn.

## Product Purpose

Trang quản lý nội bộ cho một shop Shopee (Combi Home) qua Shopee Open Platform API. Mục đích: làm nhanh những việc lặp lại mà trên Kênh Người Bán phải bấm tay nhiều lần, học theo các tính năng của Salework nhưng chỉ phục vụ một shop. Thành công là nhân viên làm xong việc hằng ngày nhanh hơn và không nhầm lẫn khi sửa dữ liệu thật.

## Positioning

Shop tự vận hành, không phải dịch vụ thuê ngoài: khóa API, mã truy cập và cài đặt nằm trên máy của shop, không qua bên thứ ba. Chỉ phục vụ đúng một shop nên được làm sát cách shop làm việc.

## Operating Context

- Chạy trên máy Mac của shop. Có hai môi trường: thử nghiệm (sandbox của Shopee, shop thử) và thật (shop combihome). Mở trang tại `http://localtest.me` (shop thật, cổng 80) hoặc `http://localtest.me:3000` (thử nghiệm).
- Chỉ hoạt động khi máy chủ đang chạy; các việc tự động (đẩy sản phẩm) dừng khi tắt máy.
- Trên shop thật, mọi thao tác ghi (sửa giá, tồn, đẩy sản phẩm) có hiệu lực ngay với khách mua.

## Capabilities and Constraints

- Đã có: kết nối và ủy quyền shop; xem sản phẩm kèm giá, tồn, phần tồn đang giữ cho khuyến mại; sửa giá, tồn từng sản phẩm; đẩy sản phẩm tự động (xoay vòng danh sách, bật/tắt, đẩy ngay).
- Sắp làm (PM đã chọn, theo thứ tự): sửa giá và tồn hàng loạt bằng Excel; tự trả lời đánh giá; xử lý và in đơn hàng loạt.
- Giới hạn của Shopee: đẩy tối đa 5 sản phẩm cùng lúc, mỗi lượt 4 giờ; sửa giá, tồn từng sản phẩm một (tối đa 50 phân loại mỗi lần); ứng dụng không có quyền xem dữ liệu nhạy cảm của người mua (tên, số điện thoại, địa chỉ bị che).
- Kỹ thuật: máy chủ Express (Node.js, TypeScript); giao diện là một tệp HTML thuần, không có bước biên dịch. Mọi chữ hiển thị là tiếng Việt có dấu.

## Brand Commitments

- Tên: Combi Home. Mặt hàng chính: đồ giặt giũ.
- Combi Home **đã có logo và màu thương hiệu riêng**; PM sẽ cung cấp. Chưa nhận được tại thời điểm ghi tệp này: không tự bịa logo hay màu thay thế.
- Ngôn ngữ: tiếng Việt có dấu, rõ ràng, dễ hiểu, không hàn lâm. Không dùng biểu tượng cảm xúc (emoji). Chỉ dùng dấu gạch ngắn `-`, không dùng gạch dài.

## Evidence on Hand

- Chưa có số liệu, lời khách hàng hay ảnh sản phẩm nào để đưa lên giao diện ngoài dữ liệu thật lấy từ Shopee. Không được bịa số liệu minh họa.

## Product Principles

1. Thao tác ghi lên shop thật phải rõ ràng: nói trước sẽ đổi gì, báo kết quả từng dòng, lỗi của Shopee hiện nguyên văn kèm lời giải thích.
2. Luôn biết mình đang ở môi trường nào: thử nghiệm và shop thật phải phân biệt được ngay bằng mắt.
3. Điện thoại là nơi làm việc thật: mọi việc hằng ngày làm được bằng một tay trên màn hình nhỏ.
4. Nhân viên mới đọc là hiểu: chữ tiếng Việt thông dụng, nhãn nói đúng việc sẽ xảy ra.

## Accessibility & Inclusion

- Chữ tiếng Việt có dấu phải hiển thị đúng và đủ lớn để đọc trên điện thoại. Chưa xác lập chuẩn tiếp cận cụ thể nào khác.
