# Đăng ký Shopee Open Platform

Hướng dẫn xin quyền truy cập API cho shop của chính mình.

Nguồn: các mục về shop thử, ủy quyền và Go-Live đối chiếu với **Shopee Open API Developer Guide v2.1** (bản Thái Lan, 22/7/2022, tài liệu chính thức của Shopee). Tài liệu này đã hơn 4 năm nên tên menu có thể đổi chút ít. Những điểm còn lại lấy từ nguồn thứ cấp, được ghi rõ ngay tại chỗ.

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
| Tự dùng (in-house) | Chỉ kết nối shop của chính mình | Nhẹ | 3 đến 5 ngày làm việc |
| Đối tác bên thứ ba | Bán dịch vụ cho nhiều shop khác | Cần giấy phép kinh doanh, website chạy HTTPS thật, sản phẩm đã vận hành, tài khoản dùng thử cho Shopee kiểm tra | 10 đến 12 ngày làm việc |

Với mục đích tự quản lý shop của mình thì chọn **tự dùng**. Đăng ký và dùng API cơ bản đều miễn phí.

Lưu ý: ứng dụng loại tự dùng có thể không được cấp quyền cho một số nhóm lệnh gọi như Chat và Quảng cáo. Nếu cần những nhóm này thì phải xin quyền riêng.

Trong Console, bấm **Add New APP**, điền thông tin cơ bản. Ở mục **App Category** chọn đúng **Seller In House System**. Chọn sai loại thì về sau không kết nối được.

## Bước 4: Lấy khóa - có hai cặp khóa

| Cặp khóa | Khi nào có | Dùng cho |
|---|---|---|
| Test Partner ID + Test Key | Ngay sau khi tạo ứng dụng | Chỉ môi trường thử nghiệm (sandbox). Không nối được shop thật |
| Live Partner ID + Live Key | Sau khi bấm **Go-Live** và Shopee duyệt | Shop thật |

Xem khóa trong **App Management > App List**. Điền vào tệp `.env` của dự án:

- `SHOPEE_PARTNER_ID` - số định danh ứng dụng
- `SHOPEE_PARTNER_KEY` - khóa bí mật để ký lệnh gọi

**Không bao giờ đưa `partner_key` vào mã nguồn, đẩy lên git, hay dán vào khung chat.**

Khi bấm Go-Live (**Console > App List > chọn ứng dụng > Go-Live**), Shopee hỏi tài khoản đăng nhập thử vào hệ thống của mình. Theo tài liệu chính thức: nếu hệ thống chỉ dùng nội bộ, **điền dấu `-` vào cả hai ô Test Account User Name và Password**, rồi ghi lý do ở ô Brief Introduction. Nghĩa là không cần đưa trang quản lý ra ngoài cho Shopee vào xem.

Theo một đơn vị đã làm (Qxpress Smartship), Shopee yêu cầu **xác nhận lại danh sách IP 90 ngày một lần**. Điểm này chưa đối chiếu được với tài liệu chính thức.

## Bước 5: Khai IP máy chủ

Biểu mẫu Go-Live có mục **IP Address Whitelist** gồm hai phần:

- **APP IP Address Management** (bắt buộc): khai ít nhất một IP. Lấy IP mạng hiện tại bằng lệnh `curl -s https://api.ipify.org`.
- **Enable IP Address Whitelist** (công tắc): khi **bật**, Shopee chỉ nhận lệnh gọi từ các IP đã khai, sai IP thì báo `source_ip_undeclared`. Khi **tắt**, gọi từ đâu cũng được.

Chạy trên máy cá nhân ở nhà hoặc văn phòng thì IP hay đổi, nên **để tắt**. Đổi lại phải giữ Partner Key thật kín, vì ai có Key là gọi được từ máy khác. Khi chuyển lên máy chủ IP cố định thì bật công tắc cho chặt chẽ.

Nếu dùng thông báo đẩy từ Shopee, nên chỉ cho phép dải IP của Shopee gọi vào. Lấy dải IP bằng lệnh gọi `/public/get_shopee_ip_ranges`.

## Bước 6: Khai địa chỉ nhận ủy quyền

Console **không nhận tên `localhost`** ở ô Test/Live Redirect URL Domain. Dùng tên miền `localtest.me`: đây là tên miền công khai luôn trỏ về `127.0.0.1`, tức chính máy đang mở trình duyệt, nên Shopee chấp nhận mà trình duyệt vẫn quay về máy chủ chạy trên máy mình.

- Trong Console, hai ô Redirect URL Domain điền: `http://localtest.me` (chỉ tên miền, không kèm cổng hay đường dẫn)
- Thử nghiệm (`.env`): `SHOPEE_REDIRECT_URI=http://localtest.me:3000/auth/callback`, `PORT=3000`. Môi trường thử nghiệm bỏ qua số cổng nên vẫn chạy.
- Shop thật (`.env.live`): `SHOPEE_REDIRECT_URI=http://localtest.me/auth/callback`, `PORT=80`. **Shopee thật so khớp tuyệt đối cả số cổng**: để `:3000` thì báo lỗi *The domain of redirect_uri is not consistent with the Redirect URL Domain declared in console*. Cổng 80 là cổng mặc định của web nên địa chỉ không cần ghi số cổng, khớp đúng tên miền đã khai. Mở trang bằng `http://localtest.me`.

Máy Mac từ bản Mojave cho chương trình thường dùng cổng 80. Nếu máy báo `EACCES` hoặc cổng đã bị chiếm, cách thay thế là sửa ô Live Redirect URL Domain trong Console thành `http://localtest.me:3000` và giữ cổng 3000.

Kiểm tra mạng có dùng được không: chạy `npm start` rồi mở `http://localtest.me:3000`. Một số bộ phát wifi chặn kiểu tên miền trỏ về máy nội bộ; khi đó phải dùng tên miền riêng.

## Bước 7: Thử trên môi trường thử nghiệm trước

Shopee có môi trường thử nghiệm riêng. Trong `.env` đặt `SHOPEE_REGION=TEST_GLOBAL`.

| Môi trường | Địa chỉ API | Trang ủy quyền |
|---|---|---|
| Thử nghiệm | `openplatform.sandbox.test-stable.shopee.sg/api/v2` | `open.sandbox.test-stable.shopee.com/auth` |
| Thật (Việt Nam) | `partner.shopeemobile.com/api/v2` | `open.shopee.com/auth` |

Việt Nam nằm trong vùng `GLOBAL`, không có địa chỉ riêng.

Chỉ đổi sang `GLOBAL` khi đã chạy thông trên môi trường thử nghiệm. Sau khi đổi, mọi thay đổi giá và tồn kho đều có hiệu lực thật ngay lập tức.

## Bước 8: Tạo shop thử

Môi trường thử nghiệm là một Shopee riêng. **Tài khoản shop thật không tồn tại ở đó**, nên đăng nhập bằng tài khoản thật sẽ luôn thất bại. Phải tạo shop thử:

1. Vào **Console > Tools > Test Shop > Create Test Shop**.
2. Loại tài khoản chọn **Local Shop**, khu vực chọn **Vietnam**. Không chọn Cross Border (loại đó dành cho người bán ở Trung Quốc, Hồng Kông, Nhật, Hàn), vì hai loại khác nhau về ngành hàng và đơn vị vận chuyển.
3. Ghi lại tên đăng nhập và mật khẩu Console cấp cho shop thử. Mỗi tài khoản lập trình viên tạo được tối đa 8 shop thử loại Local.

Tài liệu chính thức dặn: **làm mọi thao tác thử nghiệm trong cửa sổ ẩn danh** (Chrome: Cmd+Shift+N), để trình duyệt không lẫn phiên đăng nhập Kênh Người Bán thật với phiên thử nghiệm.

Muốn tạo sản phẩm, đơn hàng giả để thử thì đăng nhập Kênh Người Bán thử nghiệm bằng chính tài khoản shop thử. Bản Thái Lan ở `seller.test-stable.shopee.co.th`, bản Việt Nam nhiều khả năng là `seller.test-stable.shopee.vn` (chưa kiểm chứng). Trước khi thử luồng đơn hàng phải khai địa chỉ người bán trong đó.

## Bước 9: Ủy quyền shop

1. Chạy `npm start`.
2. Trong **cửa sổ ẩn danh**, mở `http://localhost:3000`, bấm "Kết nối shop Shopee".
3. Ở trang của Shopee, chọn khu vực **VN**, đăng nhập bằng **tài khoản shop thử** ở Bước 8. Nếu bị hỏi mã OTP thì nhập **`123456`** (mã cố định của môi trường thử nghiệm).
4. Bấm **Confirm Authorization**. Shopee chuyển về `/auth/callback`, hệ thống tự đổi mã lấy token và lưu lại.

Đường dẫn ủy quyền chỉ sống 5 phút. Nếu để lâu quá thì bấm lại từ đầu.

Khi lên shop thật: người đăng nhập ở bước 3 là người giữ tài khoản Kênh Người Bán của shop. **Mỗi lần ủy quyền có hiệu lực 365 ngày**, hết hạn phải ủy quyền lại, kể cả khi token vẫn được gia hạn đều.

## Sau khi xong

Đọc tiếp [02-van-hanh.md](02-van-hanh.md) về cách giữ kết nối sống và xử lý lỗi thường gặp.
