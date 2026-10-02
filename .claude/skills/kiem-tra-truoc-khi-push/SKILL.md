---
name: kiem-tra-truoc-khi-push
description: >
  Cổng kiểm tra trước khi commit hoặc push trong kho shopee-shop-manager: chạy
  typecheck và toàn bộ bài kiểm thử, soát lại khóa bí mật không lọt ra ngoài, và
  giữ đúng quy ước viết tiếng Việt của kho.
  Kích hoạt khi: chuẩn bị commit, push, tạo Pull Request; PM nói "xong chưa",
  "kiểm tra giúp", "đẩy lên"; hoặc ngay sau khi sửa xong một nhóm tệp.
  KHÔNG dùng cho: chỉ đọc mã hoặc trả lời câu hỏi.
---

# Kiểm tra trước khi push

## Hai lệnh, chạy đủ cả hai

```bash
npm run typecheck   # tsc --noEmit, phải sạch
npm test            # toàn bộ bài kiểm thử phải xanh
```

Đỏ thì sửa nguyên nhân rồi chạy lại từ đầu. Không sửa bài kiểm thử cho qua.

## Soát tay bốn điều

1. Không có khóa thật nào trong diff. Kiểm nhanh:
   `git diff --cached | grep -iE "partner_key|access_token|refresh_token|sb_secret|Bearer "`
2. `.env` không nằm trong diff. Chỉ `.env.example` được commit, và chỉ chứa ô trống.
3. Biến môi trường mới đã có trong `src/config.ts` và `.env.example`.
4. Chuỗi hiển thị cho người dùng là tiếng Việt, thông báo lỗi nói rõ thiếu gì và
   phải làm gì, không để nguyên thông báo tiếng Anh của SDK.

## Quy ước viết của kho này

- Chú thích trong mã nguồn TypeScript viết tiếng Việt không dấu, theo đúng các tệp
  đang có. Tài liệu Markdown viết tiếng Việt có dấu.
- Chú thích giải thích VÌ SAO làm vậy, nhất là chỗ né một cái bẫy - xem đầu tệp
  `src/shopee.ts` làm mẫu.
- Chỉ dùng gạch ngắn, không dùng gạch dài. Không dùng biểu tượng.

## Sửa phần token hoặc ủy quyền

Bắt buộc chạy và đọc kết quả hai tệp `test/refreshGuard.test.ts` và
`test/tokenStore.test.ts`. Đây là hai lớp chặn duy nhất giữ cho kết nối shop không
hỏng. Sửa mà không chạy hai tệp này thì coi như chưa kiểm chứng.

## Thử thật trước khi báo xong

Với thay đổi đụng tới luồng chạy, bật máy chủ và mở thử:

```bash
npm start
# mở http://localhost:3000 và http://localhost:3000/healthz
```

Chỉ báo xong sau khi đã nhìn thấy kết quả đúng, không suy luận.

## Cấm

- Chạy lệnh ghi dữ liệu lên shop thật khi `SHOPEE_REGION=GLOBAL` mà chưa hỏi PM.
- Commit `.env` hoặc khóa thật.
- Báo xong khi chưa chạy đủ typecheck và kiểm thử.
