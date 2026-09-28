---
name: Quản lý shop Combi Home
description: Trang quản lý shop Shopee dựng theo cuốn sổ bán hàng ô ly của cửa hàng
colors:
  ballpoint-ink: "#1f3fae"
  ballpoint-ink-deep: "#162f86"
  pencil-graphite: "#474c5c"
  pencil-graphite-deep: "#30343f"
  red-pen: "#c42b28"
  notebook-cover: "#1c2b73"
  paper: "#fbfcff"
  label-white: "#ffffff"
  printed-ink: "#1b1d2a"
  printed-soft: "#555a6b"
  rule-line: "#dcdfef"
  rule-line-strong: "#b7bcda"
  oly-line: "rgba(98, 86, 190, .045)"
  oly-line-strong: "rgba(98, 86, 190, .11)"
  carbon-paper: "#11152a"
  carbon-label: "#1a1f3a"
  carbon-ink: "#9fb3ff"
  carbon-print: "#e7e9f4"
  carbon-red: "#ff8f86"
typography:
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  figure:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "tnum"
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
  stamp:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  mark: "2px"
  stamp: "3px"
  control: "4px"
  label: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ballpoint-ink}"
    textColor: "{colors.label-white}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ballpoint-ink-deep}"
  button-line:
    backgroundColor: "transparent"
    textColor: "{colors.ballpoint-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  input-figure:
    backgroundColor: "transparent"
    textColor: "{colors.printed-ink}"
    typography: "{typography.figure}"
    padding: "4px 2px"
  tab-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.printed-ink}"
    padding: "0 16px"
    height: "44px"
  notebook-label:
    backgroundColor: "{colors.label-white}"
    textColor: "{colors.printed-ink}"
    rounded: "{rounded.label}"
    padding: "16px 20px"
  stamp-live:
    textColor: "{colors.red-pen}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
    padding: "2px 10px"
  boost-slot:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.printed-ink}"
    rounded: "{rounded.control}"
    padding: "12px"
---

# Design System: Quản lý shop Combi Home

## Overview

**Creative North Star: "Cuốn sổ bán hàng ô ly"**

Trang quản lý là cuốn sổ bán hàng của cửa hàng: bìa màu đặc có nhãn vở trắng ghi tên shop, bên trong là trang giấy kẻ ô ly với một đường lề đỏ, mỗi sản phẩm là một dòng sổ. Sửa giá hay tồn kho là chữa sổ: số cũ bị gạch bằng bút đỏ, số mới viết bằng mực bi xanh, Shopee nhận thì có dấu tích. Người Việt nào cũng từng viết vở ô ly, nên nhân viên mới nhìn là hiểu ngay đâu là chỗ ghi, đâu là chỗ đã chữa.

Mật độ cao nhưng yên: dòng kẻ ngang ngăn các dòng sổ, không có thẻ nổi, không có số liệu to khoe khoang. Màu chỉ làm việc: mực xanh cho dữ liệu và nút, bút đỏ cho lề, số bị gạch, lỗi và con dấu "Shop thật", bút chì cho shop thử nghiệm. Chế độ tối là giấy than của phiếu xuất kho.

Màu bìa (`notebook-cover`) và logo hiện là chỗ để trống cho nhận diện Combi Home: shop đã có logo và màu riêng nhưng chưa gửi. Khi có, thay màu bìa và đặt logo vào nhãn vở; không bịa màu hay logo thay thế.

**Key Characteristics:**
- Bìa sổ màu đặc, nhãn vở trắng có khung trong, con dấu môi trường nghiêng nhẹ.
- Nền giấy kẻ đúng mẫu vở ô ly, một đường lề đỏ mảnh bên trái nội dung.
- Dòng sổ thay cho thẻ; số liệu là số dạng bảng, căn phải theo cột.
- Chữa sổ: số cũ gạch đỏ, số mới mực xanh, dấu tích khi Shopee nhận.
- Hai môi trường khác nhau bằng mắt: mực xanh và con dấu đỏ cho shop thật, bút chì và con dấu xám cho thử nghiệm.

## Colors

Hai loại mực trên nền giấy trắng hơi xanh, cộng bút chì cho môi trường thử nghiệm.

### Primary
- **Mực bi xanh** (`ballpoint-ink`): mực duy nhất cho dữ liệu người dùng nhập, số vừa chữa, nút chính, ô đánh dấu, thanh ô đẩy và trạng thái "Đang đẩy". Khi rê chuột, nút chuyển sang **mực bi đậm** (`ballpoint-ink-deep`).

### Secondary
- **Bút đỏ** (`red-pen`): chỉ ba việc: kẻ lề, gạch số cũ và báo lỗi, con dấu "Shop thật" cùng dòng nhắc "Shop thật: bấm Lưu là khách mua thấy... ngay".

### Tertiary
- **Bút chì** (`pencil-graphite`, đậm `pencil-graphite-deep`): thay chỗ mực bi xanh và màu bìa khi đang ở shop thử nghiệm.

### Neutral
- **Giấy vở** (`paper`): nền trang và thẻ đang mở.
- **Nhãn trắng** (`label-white`): nền nhãn vở trên bìa.
- **Chữ in** (`printed-ink`): chữ in sẵn của sổ: tên sản phẩm, tiêu đề, nhãn.
- **Chữ in nhạt** (`printed-soft`): tên cột, mã sản phẩm, lời giải thích.
- **Dòng kẻ** (`rule-line`) và **dòng kẻ đậm** (`rule-line-strong`): ngăn dòng sổ, gạch chân ô nhập, viền ô trống.
- **Kẻ ô ly** (`oly-line`, `oly-line-strong`): lưới nền, rất nhạt để không tranh với chữ.
- **Bìa sổ** (`notebook-cover`): chỗ đặt màu thương hiệu Combi Home; hiện dùng màu mực xanh đậm.
- **Giấy than** (`carbon-paper`, `carbon-label`, `carbon-ink`, `carbon-print`, `carbon-red`): bộ màu chế độ tối.

### Named Rules
**The One Ink Rule - Luật một mực.** Dữ liệu và thao tác chỉ viết bằng mực bi xanh. Không thêm màu xanh lá cho "thành công" hay màu cam cho "cảnh báo": thành công là mực xanh kèm dấu tích, lỗi là bút đỏ kèm dấu chéo.

**The Three Red Jobs Rule - Luật ba việc của bút đỏ.** Bút đỏ chỉ kẻ lề, gạch số cũ và báo lỗi, đóng dấu "Shop thật". Nút xóa, nút bỏ khỏi danh sách không dùng màu đỏ.

**The Visible Environment Rule - Luật nhìn là biết môi trường.** Shop thật và shop thử nghiệm phải khác nhau bằng con dấu có chữ, màu mực, màu bìa và tiền tố tiêu đề tab trình duyệt; màu không bao giờ là tín hiệu duy nhất.

## Typography

**Display Font:** Be Vietnam Pro (dự phòng system-ui)
**Body Font:** Be Vietnam Pro (dự phòng system-ui)

**Character:** Một phông chữ làm việc được vẽ riêng cho tiếng Việt: dấu thanh rõ ở cỡ nhỏ trên điện thoại, số dạng bảng thẳng cột. Phông lưu ngay trong `public/fonts/` (chỉ bộ latin và vietnamese, 400 đến 700) để trang chạy được cả khi không vào mạng ngoài.

### Hierarchy
- **Headline** (700, 24px, 1.25; 20px trên điện thoại): tên shop trên nhãn vở.
- **Title** (700, 20px, 1.3; 18px trên điện thoại): tiêu đề trang sổ ("Sản phẩm đang bán", "Đang đẩy 3/5 ô").
- **Body** (400, 15px, 1.6): tên sản phẩm (600), lời giải thích tối đa 72 ký tự mỗi dòng.
- **Figure** (600, 16px, 1.3, số dạng bảng; 17px trên điện thoại): số trong ô sửa giá và tồn.
- **Label** (500-600, 12px): tên cột, tên trường trên nhãn vở, mã sản phẩm (13px).
- **Stamp** (700, 12px, giãn chữ 0,06em, chữ hoa): chỉ cho con dấu môi trường.

### Named Rules
**The Tabular Figures Rule - Luật số thẳng cột.** Mọi con số (giá, tồn, số phút, số trang) dùng số dạng bảng và căn phải trong cột.

## Layout

Trên máy tính: bìa sổ trải ngang toàn màn hình, nội dung giới hạn 1120px ở giữa. Nhãn vở và nội dung cùng bắt đầu cách mép trái vùng nội dung 72px; đường lề đỏ ở 48px. Thẻ chuyển trang nằm ở mép dưới bìa như các thẻ phân trang nhô lên, thẻ đang mở nối liền với trang giấy. Bảng sổ có cột ảnh 72px, tên sản phẩm co giãn, giá 220px, tồn 190px, giá đang bán 130px, cột Đẩy 104px.

Từ 720px trở xuống (điện thoại): bìa và nhãn gọn lại (lề 16px), thẻ chuyển trang thành thanh cố định ở đáy màn hình cao 60px có tính vùng an toàn, trong tầm ngón cái. Đường lề đỏ dời vào 14px, nội dung cách trái 28px. Mỗi dòng sổ thành một khối: ảnh và tên, rồi từng dòng "Giá gốc ..... số", "Tồn kho ..... số" nối bằng dòng chấm dẫn, cuối cùng là giá đang bán và ô "Đẩy tự động". Năm ô đẩy xếp dọc, mỗi ô một dòng.

Khoảng cách theo bội số 4px (4, 8, 12, 16, 24, 32): nhóm chặt bên trong dòng sổ, cách rộng giữa các phần (32px giữa các khu).

## Elevation & Depth

Trang phẳng như giấy. Chiều sâu duy nhất là nhãn vở dán trên bìa (bóng mềm hai lớp) và núm của công tắc. Các dòng sổ, ô đẩy, bảng không đổ bóng: chúng phân tách bằng dòng kẻ.

### Shadow Vocabulary
- **Nhãn dán** (`box-shadow: 0 1px 2px rgba(15, 20, 60, .2), 0 8px 20px rgba(15, 20, 60, .18)`): chỉ cho nhãn vở trên bìa.
- **Núm công tắc** (`box-shadow: 0 1px 2px rgba(0, 0, 0, .25)`): núm tròn của công tắc bật tắt.

### Named Rules
**The Paper Is Flat Rule - Luật giấy phẳng.** Không thêm bóng cho thẻ, ô hay bảng trên trang giấy. Muốn tách, dùng dòng kẻ.

## Shapes

Góc gần vuông như giấy và dụng cụ văn phòng: 2px cho dấu trạng thái, 3px cho con dấu, ô đánh dấu và ảnh nhỏ, 4px cho nút và ô đẩy, 6px cho nhãn vở và góc trên thẻ chuyển trang. Viền mảnh 1-1,5px; con dấu dùng viền đôi 3px nghiêng -4 độ. Ô đẩy đang dùng viền liền mực xanh, ô trống viền đứt nét màu dòng kẻ đậm.

## Components

### Buttons
- **Shape:** góc vuông nhẹ (4px), cao 40px trên máy tính (nút nhỏ 32px), 44px trên điện thoại.
- **Primary:** nền mực bi xanh, chữ trắng 600 14px, đệm ngang 16px. Dùng cho "Lưu giá", "Lưu tồn", "Kết nối shop Shopee".
- **Hover / Focus:** nền chuyển mực bi đậm trong 0,15 giây; vòng tập trung 2px mực xanh cách 2px.
- **Line:** nền trong, viền 1,5px và chữ mực xanh; rê chuột phủ nền mực rất nhạt. Dùng cho "Đẩy ngay", "Trang trước", "Trang sau", "Thử lại".
- **Text link:** chữ in nhạt có gạch chân cách 3px, rê chuột chuyển mực xanh. Dùng cho "Hủy", "Tải lại", "Bỏ khỏi danh sách", "Ủy quyền lại".

### Inputs / Fields
- **Style:** không khung, chỉ một dòng kẻ dưới 1,5px như dòng điền trong sổ; số căn phải, số dạng bảng.
- **Focus:** dòng kẻ dưới dày 2px mực xanh, nền phủ mực rất nhạt.
- **Error / Disabled:** lỗi hiện dòng ghi chú bút đỏ kèm dấu chéo ngay dưới ô, nói nguyên văn lý do của Shopee; đang lưu thì khóa ô và nút đổi chữ "Đang lưu...".

### Navigation
- **Máy tính:** thẻ phân trang ở mép dưới bìa, cao 44px, chữ 600 14px kèm biểu tượng nét 1,75px; thẻ chưa mở nền trắng mờ trên bìa, thẻ đang mở nền giấy và biểu tượng mực xanh.
- **Điện thoại:** thanh cố định ở đáy, mỗi thẻ biểu tượng trên chữ 12px; thẻ đang mở có vạch mực xanh 2px ở cạnh trên.

### Notebook Label (nhãn vở)
Nhãn trắng góc 6px, khung trong 1px cách mép 6px, bóng nhãn dán. Dòng đầu: tên trường "Shop" nhỏ in nhạt rồi tên shop mực xanh trên dòng chấm điền. Dòng sau: "Mã shop", "Ủy quyền còn N ngày" (bút đỏ khi còn từ 3 ngày trở xuống), liên kết "Ủy quyền lại". Con dấu môi trường ở góc phải.

### Correction Field (ô chữa sổ)
Thành phần đặc trưng. Khi số trong ô khác số đã lưu: số cũ hiện bên trái, bị gạch bằng một nét bút đỏ vẽ ra từ trái sang phải trong 0,26 giây (`cubic-bezier(.16, 1, .3, 1)`), số mới chuyển mực xanh, hiện nút "Hủy" và nút lưu. Enter để lưu, Esc để trả lại số cũ. Shopee nhận: dấu tích mực xanh "Shopee đã nhận lúc HH:MM", số cũ vẫn gạch làm dấu vết chữa. Shopee từ chối: dấu chéo bút đỏ kèm lý do nguyên văn, giữ số đang sửa để thử lại.

### Boost Slots (năm ô đẩy)
Hàng năm ô cố định bằng giới hạn của Shopee. Ô đang đẩy: viền mực xanh, số thứ tự ô, tên sản phẩm (tối đa 2 dòng), thời gian còn lại và thanh 4px vơi dần theo 4 giờ. Ô trống: viền đứt nét, chữ "Ô trống". Điện thoại: mỗi ô một dòng, thanh nằm dưới.

### Status Marks
Trạng thái luôn có chữ kèm dấu hình: ô vuông đặc mực xanh cho "Đang đẩy, còn ...", ô vuông rỗng cho "Chờ lượt"; dấu tích và dấu chéo vẽ bằng nét, không dùng ký tự hay biểu tượng cảm xúc.

## Do's and Don'ts

### Do:
- **Do** viết mọi chữ bằng tiếng Việt có dấu, từ thông dụng; nhãn nút nói đúng việc sẽ xảy ra ("Lưu giá", "Bỏ khỏi danh sách").
- **Do** giữ nút lưu nằm ngay trong dòng sổ và nói kết quả của từng dòng.
- **Do** hiện nguyên văn lý do Shopee từ chối, kèm dấu chéo bút đỏ.
- **Do** cho mọi vùng bấm trên điện thoại cao ít nhất 44px.
- **Do** tôn trọng `prefers-reduced-motion`: tắt nét gạch và chuyển động công tắc.
- **Do** thay màu bìa (`notebook-cover`) và đặt logo vào nhãn vở khi có nhận diện Combi Home.

### Don't:
- **Don't** dùng gạch dài hay gạch vừa; chỉ dùng dấu gạch ngắn `-`.
- **Don't** dùng biểu tượng cảm xúc hay ký tự thay biểu tượng; biểu tượng vẽ bằng SVG nét 1,75px.
- **Don't** dựng trang bằng thẻ số liệu lớn, thanh bên hay màu cam nhái Kênh Người Bán.
- **Don't** thêm màu thứ ba cho trạng thái; thành công là mực xanh, lỗi là bút đỏ.
- **Don't** dùng màu làm tín hiệu duy nhất cho trạng thái hay môi trường.
- **Don't** tự bịa logo hay màu thương hiệu Combi Home.
