# Đăng ký Shopee Open Platform

Hướng dẫn xin quyền truy cập API cho shop của chính mình.

Lưu ý về độ tin cậy: trang tài liệu chính thức của Shopee và Học viện Shopee bị chặn khi soạn tài liệu này, nên các con số về thời gian duyệt và một số điều kiện lấy từ nguồn thứ cấp. Hãy đối chiếu lại trên `open.shopee.com` trước khi nộp hồ sơ.

## Bước 1: Kiểm tra điều kiện

Có nguồn cho biết shop phải đạt Shop Yêu Thích hoặc Shopee Mall mới được cấp API. Nếu shop chưa đạt thì kiểm tra lại điều kiện này trước, vì nó quyết định có đi tiếp được không.

## Bước 2: Tạo tài khoản lập trình viên

1. Vào `https://open.shopee.com`, bấm "Get Access".
2. Xác minh email. **Email này không đổi được về sau**, nên chọn email dùng lâu dài, không nên dùng email cá nhân tạm.
3. Khai thông tin doanh nghiệp và mục đích sử dụng.

## Bước 3: Tạo ứng dụng, chọn đúng loại

Đây là bước quan trọng nhất.

| Loại ứng dụng | Dùng khi nào | Hồ sơ | Thời gian duyệt |
|---|---|---|---|
| Tự dùng (in-house) | Chỉ kết nối shop của chính mình | Nhẹ | Khoảng 3 đến 5 ngày làm việc |
| Đối tác bên thứ ba | Bán dịch vụ cho nhiều shop khác | Cần giấy phép kinh doanh, website chạy HTTPS thật, sản phẩm đã vận hành, tài khoản dùng thử cho Shopee kiểm tra | Khoảng 1 đến 2 tuần |

Với mục đích tự quản lý shop của mình thì chọn **tự dùng**. Đăng ký và dùng API cơ bản đều miễn phí.

Lưu ý: ứng dụng loại tự dùng có thể không được cấp quyền cho một số nhóm lệnh gọi như Chat và Quảng cáo. Nếu cần những nhóm này thì phải xin quyền riêng.

## Bước 4: Lấy khóa

Sau khi được duyệt, vào **App Management > App List** để lấy:

- `partner_id` - số định danh ứng dụng
- `partner_key` - khóa bí mật để ký lệnh gọi

Điền hai giá trị này vào tệp `.env` của dự án. **Không bao giờ đưa `partner_key` vào mã nguồn hay đẩy lên git.**

## Bước 5: Khai IP máy chủ

Vào **Console > App list > IP Address Whitelist**, khai IP của máy chủ sẽ gọi API.

Đây là bước hay bị quên nhất. Nếu không khai, mọi lệnh gọi trả về lỗi `source_ip_undeclared`.

Hệ quả thực tế: không đặt ứng dụng trên các dịch vụ có IP thay đổi liên tục (Vercel, Netlify, các nền tảng không máy chủ). Cần một máy chủ ảo có IP cố định.

Chiều ngược lại: nếu dùng thông báo đẩy từ Shopee, nên chỉ cho phép dải IP của Shopee gọi vào. Lấy dải IP bằng lệnh gọi `/public/get_shopee_ip_ranges`.

## Bước 6: Khai địa chỉ nhận ủy quyền

Khai chính xác địa chỉ callback trong Console, phải **giống hệt** giá trị `SHOPEE_REDIRECT_URI` trong `.env`, kể cả dấu gạch chéo ở cuối.

- Khi chạy thử trên máy: `http://localhost:3000/auth/callback`
- Khi chạy thật: `https://ten-mien-cua-ban/auth/callback`

## Bước 7: Thử trên môi trường thử nghiệm trước

Shopee có môi trường thử nghiệm riêng. Trong `.env` đặt `SHOPEE_REGION=TEST_GLOBAL`.

| Môi trường | Địa chỉ API | Trang ủy quyền |
|---|---|---|
| Thử nghiệm | `openplatform.sandbox.test-stable.shopee.sg/api/v2` | `open.sandbox.test-stable.shopee.com/auth` |
| Thật (Việt Nam) | `partner.shopeemobile.com/api/v2` | `open.shopee.com/auth` |

Việt Nam nằm trong vùng `GLOBAL`, không có địa chỉ riêng.

Chỉ đổi sang `GLOBAL` khi đã chạy thông trên môi trường thử nghiệm. Sau khi đổi, mọi thay đổi giá và tồn kho đều có hiệu lực thật ngay lập tức.

## Bước 8: Ủy quyền shop

1. Chạy `npm start`.
2. Mở `http://localhost:3000`, bấm "Kết nối shop Shopee".
3. Đăng nhập tài khoản người bán, bấm đồng ý.
4. Shopee chuyển về `/auth/callback`, hệ thống tự đổi mã lấy token và lưu lại.

Đường dẫn ủy quyền chỉ sống 5 phút. Nếu để lâu quá thì bấm lại từ đầu.

## Sau khi xong

Đọc tiếp [02-van-hanh.md](02-van-hanh.md) về cách giữ kết nối sống và xử lý lỗi thường gặp.
