# Vận hành và xử lý lỗi

## Vòng đời token

| Thứ | Hạn dùng | Ghi chú |
|---|---|---|
| `access_token` | 4 giờ | Dùng để gọi API |
| `refresh_token` | 30 ngày | **Chỉ dùng được một lần.** Mỗi lần gia hạn trả về mã mới, mã cũ bị hủy ngay |
| Đường dẫn ủy quyền | 5 phút | Để lâu quá thì bấm lại |
| `timestamp` khi ký | 5 phút | Đồng hồ máy chủ lệch quá 5 phút là hỏng hết |

Hệ thống tự gia hạn khi token sắp hết hạn, và có vòng lặp kiểm tra định kỳ (`TOKEN_KEEPALIVE_MINUTES`) để giữ kết nối sống ngay cả khi shop không hoạt động.

Vì sao cần vòng lặp này: nếu hệ thống nằm im hơn 30 ngày (nghỉ Tết chẳng hạn), `refresh_token` chết hạn và phải vào Shopee ủy quyền lại bằng tay.

Xem hạn còn lại bất cứ lúc nào:

```bash
npm run cli -- status
```

Hoặc mở `http://localhost:3000/healthz`.

## Đồng bộ đồng hồ máy chủ

Bắt buộc, vì `timestamp` lệch quá 5 phút là mọi lệnh gọi đều bị từ chối.

```bash
# Ubuntu / Debian
sudo timedatectl set-ntp true
timedatectl status    # kiểm tra dòng "System clock synchronized: yes"
```

## Giới hạn của Shopee

Shopee không công bố số lệnh gọi tối đa mỗi phút trong tài liệu. Con số "100 lệnh gọi mỗi phút" lan truyền trên các blog không kiểm chứng được. Hạn mức thật do Shopee cấp riêng cho từng ứng dụng sau khi duyệt.

Hai mã lỗi liên quan:

- `error_rate_limit` - gọi quá nhanh, cần chờ rồi thử lại
- `error_limit` - hết hạn mức trong ngày, đặt lại lúc 00:00 giờ UTC+8

Các giới hạn theo lô đã xác nhận:

| Lệnh gọi | Giới hạn |
|---|---|
| Cập nhật giá, cập nhật tồn kho | Mỗi lần 1 sản phẩm, danh sách biến thể từ 1 đến 50 |
| Lấy chi tiết sản phẩm | Tối đa 50 mã mỗi lần |
| Lấy chi tiết đơn | Tối đa 50 mã đơn mỗi lần |
| Lấy danh sách đơn | Khoảng thời gian tối đa 15 ngày |
| Tạo vận đơn | Từ 1 đến 50 đơn |

Dự án đã đặt sẵn các giới hạn này trong `src/routes/api.ts`.

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `error_sign` | Sai chuỗi ký, hoặc lẫn khóa thật với khóa thử nghiệm | Kiểm tra `SHOPEE_PARTNER_KEY` và `SHOPEE_REGION` có khớp nhau không |
| `error_param` kèm "Timestamp is expired" | Đồng hồ máy chủ lệch | Bật đồng bộ giờ tự động |
| `source_ip_undeclared` | Chưa khai IP máy chủ | Khai trong Console > App list > IP Address Whitelist |
| `invalid_access_token` | Token hết hạn hoặc đã bị hủy | Hệ thống tự gia hạn. Nếu vẫn lỗi thì ủy quyền lại |
| `invalid_refresh_token` | Mã gia hạn đã dùng rồi hoặc quá 30 ngày | Vào `/auth/start` ủy quyền lại |
| `error_partner_key_expired` | Khóa thật đã hết hạn | Đặt lại khóa trong Console |
| `error_api_permission` | Loại ứng dụng không đủ quyền cho nhóm lệnh gọi này | Ứng dụng tự dùng không có quyền Chat, Quảng cáo. Phải xin riêng |
| `shop_no_linked` | Shop chưa được ủy quyền | Vào `/auth/start` |
| `error_kyc_auth` | Shop chưa hoàn tất đăng ký người bán | Hoàn tất trên Shopee trước |

## Khi nào phải ủy quyền lại

- Quá 30 ngày không gia hạn
- Người bán tự thu hồi quyền trên Shopee
- Đổi `partner_id` hoặc đổi môi trường (thử nghiệm sang thật)
- Tệp token bị xóa hoặc hỏng

Cách làm: mở `/auth/start` trên trình duyệt, đăng nhập và bấm đồng ý lại.

## Sao lưu token

Tệp token nằm ở đường dẫn khai trong `TOKEN_FILE` (mặc định `./data/shopee-token.json`), quyền đọc chỉ dành cho chủ sở hữu.

Nếu chuyển máy chủ, chép tệp này sang là giữ được kết nối, không cần ủy quyền lại. Nhớ giữ quyền tệp ở mức `600`.

**Tuyệt đối không đẩy tệp này lên git.** Ai có nó là truy cập được shop.

## Chạy nhiều bản sao cùng lúc

Hệ thống có khóa tệp nên chạy nhiều tiến trình trên **cùng một máy** là an toàn: chỉ một tiến trình được gia hạn token, các tiến trình còn lại đọc lại kết quả.

Nếu chạy trên **nhiều máy khác nhau**, khóa tệp không còn tác dụng vì mỗi máy có hệ thống tệp riêng. Lúc đó cần chuyển sang lưu token tập trung (Redis hoặc cơ sở dữ liệu) kèm khóa phân tán. Thay lớp `FileTokenStorage` trong `src/tokenStore.ts` là đủ, phần còn lại không phải sửa.

## Thông báo đẩy từ Shopee

Thay vì hỏi liên tục, Shopee có thể chủ động gọi về khi có thay đổi. Khai địa chỉ nhận qua lệnh gọi `/push/set_app_push_config` và bật các mã sự kiện cần dùng:

| Mã | Sự kiện |
|---|---|
| 1 | Shop ủy quyền |
| 2 | Shop hủy ủy quyền |
| 3 | Đơn hàng đổi trạng thái |
| 4 | Có mã vận đơn |
| 6 | Sản phẩm bị khóa |
| 8 | Thay đổi tồn kho đang bị giữ |
| 10 | Tin nhắn khách |
| 12 | Sắp hết hạn ủy quyền |

Nếu lỡ mất thông báo nào thì lấy lại bằng `/push/get_lost_push_message`.

Phần này chưa được cài trong dự án, đây là hướng làm tiếp.
