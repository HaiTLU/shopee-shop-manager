# Quản lý shop Shopee

Trang web tự quản lý shop Shopee qua Open Platform API v2: xem danh sách sản phẩm, sửa giá và tồn kho, xem đơn hàng.

Toàn bộ khóa bí mật và token nằm trên máy chủ. Trình duyệt không bao giờ nhìn thấy `partner_key` hay `access_token`.

## Cần gì trước khi chạy

1. Tài khoản Open Platform đã được Shopee duyệt, có `partner_id` và `partner_key`.
   Xem [docs/01-dang-ky-open-platform.md](docs/01-dang-ky-open-platform.md).
2. Node.js phiên bản 20 trở lên.
3. Một máy chủ có IP cố định khi chạy thật. Shopee bắt buộc khai IP, nếu không mọi lệnh gọi đều bị từ chối.
   Khi chạy thử trên máy cá nhân thì dùng môi trường thử nghiệm (sandbox), không cần IP cố định.

## Chạy thử trong 5 phút

```bash
npm install
cp .env.example .env
# Mở .env, điền SHOPEE_PARTNER_ID và SHOPEE_PARTNER_KEY
npm start
```

Mở `http://localhost:3000`, bấm "Kết nối shop Shopee", đăng nhập tài khoản người bán và bấm đồng ý. Xong là danh sách sản phẩm hiện ra.

Lần đầu nên để `SHOPEE_REGION=TEST_GLOBAL` (môi trường thử nghiệm của Shopee). Chỉ đổi sang `GLOBAL` khi đã chắc chắn, vì lúc đó mọi thay đổi giá và tồn kho đều có hiệu lực thật.

## Công cụ dòng lệnh

```bash
npm run cli -- status       # Xem tình trạng kết nối và hạn token
npm run cli -- auth-url     # In đường dẫn ủy quyền shop
npm run cli -- exchange "<đường dẫn>"  # Hoàn tất ủy quyền bằng tay, xem bên dưới
npm run cli -- refresh      # Gia hạn token ngay
npm run cli -- shop         # Thông tin shop
npm run cli -- products 20  # Liệt kê 20 sản phẩm đầu
npm run cli -- tao-san-pham-thu 3  # Tạo 3 sản phẩm thử, CHỈ chạy trên môi trường thử nghiệm
```

**Hoàn tất ủy quyền bằng tay:** nếu sau khi bấm đồng ý trên Shopee mà trình duyệt báo không mở được trang (máy chủ chưa chạy, hoặc chạy ở máy khác), đừng bấm lại. Chép nguyên đường dẫn trên thanh địa chỉ, dán vào lệnh `exchange` trong vòng vài phút. Mã `code` trong đường dẫn chỉ dùng được một lần.

## Kiểm tra chất lượng

```bash
npm run typecheck   # Kiểm tra kiểu dữ liệu
npm test            # 34 bài kiểm thử
```

## Cấu trúc

```
src/
  config.ts          Đọc và kiểm tra biến môi trường
  tokenStore.ts      Lưu token vào tệp, có khóa chống ghi đồng thời
  shopee.ts          Khởi tạo SDK, vá lỗ hổng gia hạn token
  server.ts          Máy chủ web
  routes/auth.ts     Luồng ủy quyền shop
  routes/api.ts      API nội bộ cho giao diện
  authCallback.ts    Tách code và shop_id từ đường dẫn sau ủy quyền
  cli.ts             Công cụ dòng lệnh
public/index.html    Giao diện, không cần bước biên dịch
docs/                Hướng dẫn đăng ký và vận hành
test/                Kiểm thử
```

## Vì sao phải tự viết lớp gia hạn token

Dự án dùng thư viện `@congminh1254/shopee-sdk`. Thư viện này tốt và được cập nhật đều, nhưng có một lỗ hổng nguy hiểm: nó tự gia hạn token khi hết hạn mà **không có khóa**.

Shopee cấp `refresh_token` chỉ dùng được **đúng một lần**. Mỗi lần gia hạn, Shopee trả về mã mới và hủy mã cũ ngay. Nếu hai lệnh gọi cùng gia hạn một lúc, một bên thắng và một bên thua. Bên thua có thể ghi đè mất token vừa lấy được. Hậu quả: mất kết nối với shop, phải vào Shopee bấm ủy quyền lại từ đầu.

Đo thực tế với 20 lệnh gọi song song:

| | Số lần gọi gia hạn |
|---|---|
| SDK gốc | 20 |
| Có lớp bảo vệ của dự án này | 1 |

Lớp bảo vệ nằm ở `src/shopee.ts` và `src/tokenStore.ts`, gồm hai tầng: gộp lệnh trong cùng tiến trình, và khóa tệp giữa nhiều tiến trình. Bài kiểm thử `test/refreshGuard.test.ts` giữ cho tính chất này không bị phá vỡ về sau.

Lớp bảo vệ cũng xử lý trường hợp Shopee từ chối một token mà theo đồng hồ vẫn còn hạn (bị thu hồi, hết hạn sớm): lúc đó hệ thống gia hạn thật rồi gọi lại, thay vì dùng lại token hỏng. Có bài kiểm thử tái hiện đúng đường đi này trong SDK.

## Điểm cần lưu ý

- **Tệp `.env` và thư mục `data/` không bao giờ được đẩy lên git.** Đã chặn sẵn trong `.gitignore`.
- **Sửa tồn kho:** Shopee chỉ cho sửa phần tồn của người bán. Tồn mới phải lớn hơn hoặc bằng phần đang bị giữ cho khuyến mại, nếu không Shopee từ chối. Giao diện có hiển thị số đang bị giữ.
- **Sản phẩm có biến thể:** giao diện hiện tại chỉ sửa được biến thể mặc định. Muốn sửa từng biến thể thì dùng `/api/products/:itemId/models` rồi gọi cập nhật kèm `model_id`.
- **Một chỗ vá tạm:** SDK khai báo nhầm vị trí trường tồn kho `stock_info_v2`. Dự án khai báo lại cho khớp dữ liệu Shopee trả về thật. Xem chú thích trong `src/routes/api.ts`. Khi nâng cấp SDK nên kiểm lại chỗ này.

## Việc chưa làm

Đây là nền móng chạy được, chưa phải bản đầy đủ. Những phần có thể làm tiếp:

- Sửa giá và tồn theo lô cho nhiều sản phẩm cùng lúc
- Quản lý đơn hàng: in vận đơn, cập nhật trạng thái
- Mã giảm giá, khuyến mại, flash sale
- Nhận thông báo đẩy từ Shopee thay vì hỏi liên tục
- Đối soát tiền về

## Giấy phép

MIT
