---
name: goi-api-shopee
description: >
  Cách gọi Shopee Open Platform API v2 an toàn trong kho này: giữ khóa bí mật ở máy
  chủ, tôn trọng vòng đời token dùng một lần, chạy thử ở môi trường sandbox trước,
  bám đúng giới hạn theo lô và hạn mức gọi của Shopee.
  Kích hoạt khi: thêm lệnh gọi API mới, sửa giá hoặc tồn kho, lấy đơn hàng, lấy sản
  phẩm, sửa luồng ủy quyền, sửa gia hạn token, xử lý lỗi error_rate_limit hay
  error_limit; hoặc khi kết nối shop bị hỏng.
  KHÔNG dùng cho: sửa giao diện tĩnh trong public/index.html mà không gọi API.
---

# Gọi API Shopee an toàn

## Luật số một - khóa bí mật không bao giờ ra khỏi máy chủ

`partner_key` và `access_token` chỉ tồn tại ở phía máy chủ. Trình duyệt không được
nhìn thấy, log không được in ra, thông báo lỗi không được nhắc tới.

Trước khi thêm một trường vào phản hồi trả cho trình duyệt, kiểm lại: trường đó có
kéo theo token hay chữ ký nào không?

Không commit `.env`. Không dán khóa thật vào mã, vào thông điệp commit, hay vào
mô tả Pull Request.

## Luật số hai - refresh_token chỉ dùng được một lần

Mỗi lần gia hạn trả về mã mới và hủy ngay mã cũ. Hai lệnh gia hạn chạy song song là
hỏng kết nối, phải vào Shopee ủy quyền lại bằng tay.

`src/shopee.ts` đã vá lỗ hổng này bằng hai lớp chặn: gộp lệnh trong cùng tiến trình
và khóa liên tiến trình qua `withLock`. Sửa phần gia hạn thì phải giữ nguyên cả hai
lớp, và chạy `test/refreshGuard.test.ts`.

| Thứ | Hạn dùng |
|---|---|
| `access_token` | 4 giờ |
| `refresh_token` | 30 ngày, chỉ dùng được một lần |
| Đường dẫn ủy quyền | 5 phút |
| `timestamp` khi ký | 5 phút |

Hệ thống nằm im quá 30 ngày thì `refresh_token` chết hạn, phải ủy quyền lại bằng tay.
Đó là lý do có vòng lặp `TOKEN_KEEPALIVE_MINUTES`, đừng tắt nó trên máy chạy thật.

Đồng hồ máy chủ lệch quá 5 phút là mọi lệnh gọi đều bị từ chối. Nghi ngờ thì kiểm
`timedatectl status`.

## Luật số ba - thử ở sandbox trước

Để `SHOPEE_REGION=TEST_GLOBAL` khi phát triển. Chỉ đổi sang `GLOBAL` khi đã chắc
chắn, vì lúc đó mọi thay đổi giá và tồn kho đều có hiệu lực thật trên shop.

Trước khi chạy bất cứ lệnh nào ghi dữ liệu lên shop thật, hỏi PM một câu xác nhận.

Xem tình trạng kết nối bất cứ lúc nào:

```bash
npm run cli -- status      # hoặc mở http://localhost:3000/healthz
```

## Giới hạn theo lô - vượt là lỗi, không phải cảnh báo

| Lệnh gọi | Giới hạn |
|---|---|
| Cập nhật giá, cập nhật tồn kho | Mỗi lần 1 sản phẩm, danh sách biến thể từ 1 đến 50 |
| Lấy chi tiết sản phẩm | Tối đa 50 mã mỗi lần |
| Lấy chi tiết đơn | Tối đa 50 mã đơn mỗi lần |
| Lấy danh sách đơn | Khoảng thời gian tối đa 15 ngày |

Cần lấy nhiều hơn thì chia lô, không gộp.

## Hai mã lỗi hạn mức

- `error_rate_limit`: gọi quá nhanh. Chờ rồi thử lại, có giãn cách tăng dần.
- `error_limit`: hết hạn mức trong ngày, đặt lại lúc 00:00 giờ UTC+8.

Shopee không công bố số lệnh gọi tối đa mỗi phút. Con số "100 lệnh gọi mỗi phút" lan
truyền trên blog là không kiểm chứng được - đừng thiết kế dựa vào nó.

## Cấu trúc kho

| Tệp | Việc |
|---|---|
| `src/config.ts` | Đọc và kiểm tra biến môi trường, báo lỗi sớm |
| `src/tokenStore.ts` | Lưu token ra tệp, có khóa chống ghi đồng thời |
| `src/shopee.ts` | Khởi tạo SDK, vá lỗ hổng gia hạn token |
| `src/routes/auth.ts` | Luồng ủy quyền shop |
| `src/routes/api.ts` | API nội bộ cho giao diện |
| `src/cli.ts` | Công cụ dòng lệnh |
| `public/index.html` | Giao diện, không có bước biên dịch |

Thêm biến môi trường mới thì kiểm tra nó trong `src/config.ts` và thêm vào
`.env.example` kèm chú thích tiếng Việt.

## Xong thì chạy skill `kiem-tra-truoc-khi-push`
