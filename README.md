# Quản lý shop Shopee

Trang web tự quản lý shop Shopee qua Open Platform API v2: xem, tìm, sắp xếp sản phẩm; sửa giá và tồn kho từng sản phẩm, từng phân loại hoặc hàng loạt bằng Excel; theo dõi tài chính và lãi lỗ; tự trả lời đánh giá; đẩy sản phẩm tự động.

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

## Thử nghiệm và shop thật: hai tệp cấu hình riêng

| | Thử nghiệm (sandbox) | Shop thật |
|---|---|---|
| Tệp cấu hình | `.env` (mẫu: `.env.example`) | `.env.live` (mẫu: `.env.live.example`) |
| Chạy máy chủ | `npm start` | `npm run start:live` |
| Dòng lệnh | `npm run cli -- ...` | `npm run cli:live -- ...` |
| Tệp token | `data/shopee-token.json` | `data/shopee-token-live.json` |

Tách riêng để khóa và token của hai môi trường không bao giờ lẫn nhau. Máy chủ và lệnh `status` luôn in ra tên tệp cấu hình đang dùng. Cả hai tệp đều bị chặn khỏi git.

## Sản phẩm có phân loại, tìm và sắp xếp

Sản phẩm có phân loại (mùi, cỡ, combo...) thì Shopee lưu giá và tồn ở từng phân loại, không lưu ở cấp sản phẩm. Trang tải toàn bộ sản phẩm kèm từng phân loại một lần (giữ 10 phút, bấm **Tải lại** để lấy số mới), dòng sản phẩm hiện khoảng giá và tổng tồn, bấm **Sửa N phân loại** để sửa riêng từng phân loại.

Ô **Tìm** không cần gõ dấu, tìm theo tên, mã, SKU và cả tên phân loại. Ô **Sắp xếp** theo mới cập nhật, tên, giá hoặc tồn kho.

## Sửa giá, tồn hàng loạt bằng Excel

Thẻ **Sửa hàng loạt**:

1. **Tải tệp Excel**: mỗi sản phẩm hoặc phân loại một dòng, có sẵn giá và tồn hiện tại. Tên tệp theo dạng `YYMMDD_TenShop_SuaGiaTon.xlsx`.
2. Điền các cột nền xanh nhạt **Giá gốc mới**, **Tồn kho mới**, **Giá vốn** (giá vốn đã điền sẵn số đang lưu). Ô trống là giữ nguyên. Không sửa cột mã.
3. Tải tệp lên: hệ thống so với số liệu Shopee ngay lúc đó, liệt kê từng thay đổi (số cũ gạch đỏ, số mới mực xanh), dòng lỗi kèm số dòng trong tệp, và đánh dấu dòng giá đổi bất thường (gấp rưỡi trở lên hoặc còn một nửa trở xuống) để kiểm tra lại.
4. Bỏ chọn dòng không muốn đổi rồi bấm **Áp dụng**. Ở shop thật phải bấm hai lần. Hệ thống gửi dần lên Shopee (gom theo sản phẩm, tối đa 50 phân loại mỗi lệnh, nghỉ giữa các lệnh, tự thử lại khi Shopee báo bận) và báo kết quả từng dòng.

Bản xem trước giữ trên máy chủ 30 phút và chỉ áp dụng được một lần, nên số được gửi đúng là số người dùng đã xem.

## Tài chính và lãi lỗ

Thẻ **Tài chính** (chọn kỳ: 7 ngày, 30 ngày, tháng này, tháng trước hoặc tự chọn):

- **Tiền:** tiền đang chờ Shopee đối soát, tiền đã về ví trong kỳ, số dư ví.
- **Bảng kê:** tiền hàng, trừ mã giảm giá của shop, phí cố định, phí dịch vụ, phí thanh toán, phí khác, thuế Shopee khấu trừ thay, vận chuyển và điều chỉnh, ra **thực nhận** đúng bằng số Shopee trả (dòng vận chuyển, điều chỉnh là phần bù để khớp tuyệt đối). Đơn chưa hoàn thành ghi rõ là tạm tính; đơn hủy tính riêng.
- **Lãi lỗ:** thực nhận trừ giá vốn, chỉ tính trên đơn có đủ giá vốn và nói rõ bao nhiêu đơn còn thiếu.
- **Theo ngày** (biểu đồ, có bảng số), **theo sản phẩm** (thực nhận chia theo tỷ lệ tiền hàng, sửa giá vốn ngay tại bảng), **đơn hàng** (mở ra xem từng khoản tiền), **ví** (tiền vào, rút về ngân hàng).

Số liệu lấy từ Shopee (danh sách đơn, `get_escrow_detail_batch`, `get_income_detail`, `get_wallet_transaction_list`, `get_income_overview`), chia khoảng theo giới hạn 14, 15 ngày của Shopee, lưu vào `data/finance-<vùng>-<partner_id>.json`. Chỉ lưu con số cần cho báo cáo, **không lưu tên, địa chỉ hay thông tin người mua**. Lần đầu mở một kỳ chưa có số liệu, trang tự lấy; sau đó bấm **Lấy số liệu mới từ Shopee** khi cần. Phần nào Shopee không cho lấy (ứng dụng chưa được cấp quyền) thì báo riêng phần đó, các phần khác vẫn chạy.

Bản trước 29/9/2026 lấy trang đầu của ví hai lần (mỗi 15 ngày có trên 100 giao dịch thừa 100 dòng), làm phồng tiền vào, tiền ra, nạp quảng cáo. Nay mỗi lần lưu đều bỏ dòng trùng. Muốn làm sạch tệp cũ ngay mà không cần lấy lại từ Shopee, tắt máy chủ rồi chạy (chỉ đọc, ghi tệp trên máy; tự sao lưu sang `.backup-<ngày giờ>.json` trước khi ghi):

```bash
npx tsx scripts/lam-sach-vi.ts data/finance-<vùng>-<partner_id>.json --chay-thu
npx tsx scripts/lam-sach-vi.ts data/finance-<vùng>-<partner_id>.json --so-dong-bo=<số dòng lần chạy thử báo>
```

**Giá vốn** là giá nhập một đơn vị, Shopee không biết nên shop tự nhập: ở cột Giá vốn trang Sản phẩm, trong bảng Theo sản phẩm của trang Tài chính, hoặc cột Giá vốn của tệp Excel. Chỉ lưu trên máy (`data/costs-<vùng>-<partner_id>.json`), không gửi Shopee. Lãi lỗ dùng giá vốn hiện tại cho mọi đơn trong kỳ.

## Tự trả lời đánh giá

Thẻ **Đánh giá** đọc tối đa 1.000 đánh giá gần nhất (giới hạn của Shopee), không hiện và không lưu tên người mua.

- Bật công tắc **Tự trả lời 4-5 sao**: cứ 30 phút (đổi bằng `REVIEW_CHECK_MINUTES`), đánh giá 4-5 sao trong 30 ngày gần nhất chưa có trả lời được trả lời theo mẫu. Lần bật đầu tiên trên shop thật phải bấm hai lần, lần đầu nói rõ sẽ trả lời ngay bao nhiêu đánh giá.
- Đánh giá 1-3 sao và đánh giá cũ hơn nằm ở mục **Chờ duyệt**: câu trả lời đã soạn sẵn theo mẫu, sửa rồi bấm **Gửi trả lời**, hoặc đánh dấu nhiều câu rồi gửi một lần (shop thật bấm hai lần).
- **Mẫu trả lời** theo từng mức sao, mỗi mức nhiều mẫu; mỗi đánh giá được gán cố định một mẫu để các câu không trùng nhau. `{shop}` chèn tên shop, `{san_pham}` chèn tên sản phẩm rút gọn; tối đa 500 ký tự.
- Mỗi câu đã gửi qua trang được ghi lại (`data/reviews-<vùng>-<partner_id>.json`) để không bao giờ gửi trùng, kể cả khi Shopee cập nhật chậm.

## Đẩy sản phẩm tự động

Shopee cho đẩy tối đa 5 sản phẩm cùng lúc, mỗi lượt 4 giờ. Trên trang web:

1. Thẻ **Sản phẩm**: đánh dấu ô **Đẩy** ở những sản phẩm muốn đẩy (tối đa 50, không giới hạn ở 5).
2. Thẻ **Đẩy sản phẩm**: bật công tắc **Tự động đẩy**. Cứ 10 phút hệ thống kiểm tra, còn chỗ trống thì đẩy tiếp sản phẩm lâu chưa đẩy nhất, xoay vòng cả danh sách. **Đẩy ngay** để đẩy liền không chờ.

Chỉ chạy khi máy chủ đang chạy. Danh sách lưu riêng cho từng môi trường (`data/state-<vùng>-<partner_id>.json`). Đổi chu kỳ bằng `BOOST_CHECK_MINUTES` trong tệp cấu hình.

## Công cụ dòng lệnh

```bash
npm run cli -- status       # Xem tình trạng kết nối và hạn token
npm run cli -- auth-url     # In đường dẫn ủy quyền shop
npm run cli -- exchange "<đường dẫn>"  # Hoàn tất ủy quyền bằng tay, xem bên dưới
npm run cli -- refresh      # Gia hạn token ngay
npm run cli -- shop         # Thông tin shop
npm run cli -- products 20  # Liệt kê 20 sản phẩm đầu
npm run cli -- tao-san-pham-thu 3  # Tạo 3 sản phẩm thử, CHỈ chạy trên môi trường thử nghiệm
npm run cli -- trang-thai-day      # Danh sách đẩy và sản phẩm đang được đẩy
npm run cli -- day-ngay            # Chạy một vòng đẩy sản phẩm ngay
```

**Hoàn tất ủy quyền bằng tay:** nếu sau khi bấm đồng ý trên Shopee mà trình duyệt báo không mở được trang (máy chủ chưa chạy, hoặc chạy ở máy khác), đừng bấm lại. Chép nguyên đường dẫn trên thanh địa chỉ, dán vào lệnh `exchange` trong vòng vài phút. Mã `code` trong đường dẫn chỉ dùng được một lần.

## Kiểm tra chất lượng

```bash
npm run typecheck   # Kiểm tra kiểu dữ liệu
npm test            # 65 bài kiểm thử
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
  routes/excel.ts    Tải tệp, xem trước, áp dụng sửa hàng loạt
  catalog.ts         Toàn bộ sản phẩm kèm từng phân loại, giữ trong bộ nhớ
  excel.ts           Tạo, đọc tệp Excel, so sánh thay đổi, gửi dần lên Shopee
  finance.ts         Lấy số liệu tiền, lập bảng kê, lãi lỗ theo kỳ
  costs.ts           Giá vốn, chỉ lưu trên máy
  routes/finance.ts  Đường dẫn tài chính và giá vốn
  reviews.ts         Soạn trả lời theo mẫu, tự trả lời 4-5 sao, hẹn giờ
  routes/reviews.ts  Đường dẫn đánh giá
  boost.ts           Đẩy sản phẩm tự động
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
- **Sản phẩm có phân loại:** giá và tồn sửa ở từng phân loại (gửi kèm `model_id`), cả trên trang và trong tệp Excel.
- **Một chỗ vá tạm:** SDK khai báo nhầm vị trí trường tồn kho `stock_info_v2`. Dự án khai báo lại cho khớp dữ liệu Shopee trả về thật. Xem chú thích trong `src/routes/api.ts`. Khi nâng cấp SDK nên kiểm lại chỗ này.

## Việc chưa làm

Đây là nền móng chạy được, chưa phải bản đầy đủ. Những phần có thể làm tiếp:

- Xử lý và in đơn hàng loạt (làm tiếp theo)
- Quản lý đơn hàng: in vận đơn, cập nhật trạng thái
- Mã giảm giá, khuyến mại, flash sale
- Nhận thông báo đẩy từ Shopee thay vì hỏi liên tục
- Đối soát tiền về

## Skill cho Claude Code

Nằm trong `.claude/skills/`, Claude tự nạp khi gặp đúng tình huống, gọi tay bằng `/<ten-skill>`.

| Skill | Dùng khi |
|---|---|
| `goi-api-shopee` | Thêm lệnh gọi API, sửa giá hoặc tồn kho, sửa ủy quyền và gia hạn token |
| `kiem-tra-truoc-khi-push` | Trước mọi commit và push |

## Giấy phép

MIT
