# Acceptance Phase 7C — phiên chơi tay 30–60 phút

Mục cuối chưa tick của Phase 7C là một phiên nghiệm thu **do người chạy**: automated gate không chứng minh được "không jank", "không raw ID", "onboarding đọc hiểu được". File này là kịch bản cho phiên đó — chạy theo thứ tự, ghi kết quả vào mục "Kết quả phiên" ở cuối, rồi mới tick mục Manual acceptance trong `docs/ROADMAP.md`.

Cái gì đã được test tự động thì **không** nằm trong danh sách này. Cụ thể: dedupe double-submit, send fail → uncertain + "Thử lại" cùng `commandId`, reload khôi phục pending, battle report chỉ tới participant, treaty modal focus trap/Escape, band layout 1920/1440/1280/1024, không còn `prompt(`/`confirm(`/`alert(` trong source (`apps/client/src/no-native-dialogs.test.ts`). Phiên tay chỉ đi những thứ máy không đo được.

## Chuẩn bị

1. `npm run dev:web` (server + client một lệnh). Nếu cần world sạch: `POST /api/dev/reset` trước khi bắt đầu.
2. Mở DevTools → tab Console và tab Network, để mở suốt phiên. **Bất kỳ** error đỏ trong console là blocker.
3. Ghi lại: giờ bắt đầu, độ phân giải, browser + version.
4. Không mở Situation Room ở nhiều tab cùng player trong phần A–E; tab thứ hai chỉ dùng ở phần F.

## A. Onboarding — đi hết 8 bước không cần đọc code

Thứ tự bước theo `onboardingSteps` trong `packages/shared`: `city_inspected` → `depot_built` → `resource_harvested` → `market_exported` → `barracks_built` → `army_recruited` → `raider_defeated` → `score_viewed`.

- [ ] Tài khoản mới: checklist onboarding hiện ngay, bước đầu tiên nói rõ phải làm gì
- [ ] Nút "Đi tới" của mỗi bước đưa đúng tới chỗ làm được việc đó (không chỉ mở panel rồi để người tự tìm)
- [ ] Hoàn thành từng bước làm checklist tự tick, **không** cần reload
- [ ] Hai bước ack từ client (`city_inspected`, `score_viewed`) tick khi đã thực sự xem, không tick trước
- [ ] Đi hết 8 bước mà không phải mở docs, không phải đoán tên tài nguyên/toà nhà
- [ ] Ghi lại thời gian đi hết 8 bước: ______ phút

## B. Không lộ raw ID hoặc thuật ngữ nội bộ

Quét mọi bề mặt: header, hai column, command tray, các panel (city/army/logistics/espionage), drawer nâng cao, battle report modal, toast lỗi.

- [ ] Không chỗ nào hiển thị UUID hoặc id dạng `city-…`, `army-…`, `route-…` cho người chơi
- [ ] Không chỗ nào hiển thị code máy (`INSUFFICIENT_RESOURCES`, `QUEUE_LIMIT_REACHED`, …) — mọi lỗi đã qua bảng dịch tiếng Việt
- [ ] Tên toà nhà/đơn vị/tài nguyên là tên người đọc, không phải key (`road_depot`, `warehouse`)
- [ ] Số liệu có đơn vị hoặc nhãn, không phải số trần trụi
- [ ] Toast lỗi nói được **phải làm gì tiếp**, không chỉ "thất bại"

## C. Không native dialog, mọi nhập liệu là form trong app

Automated test chặn source, nhưng nó không thấy dialog do thư viện hoặc browser tự dựng.

- [ ] Không lần nào browser dựng hộp thoại xám của chính nó
- [ ] Mọi chỗ cần nhập số (cargo, số quân tuyển, số harvest) là input có validate trước khi gửi
- [ ] Hành động phá huỷ (phá hiệp ước, huỷ lệnh) đi qua modal trong app, Escape huỷ được
- [ ] Tab/Shift-Tab không nhảy ra khỏi modal đang mở
- [ ] Toast tự đóng và không chặn click vào UI phía dưới

## D. Map và cảm giác điều khiển

- [ ] Pan/zoom mượt, zoom neo đúng con trỏ, không giật khi giữ chuột kéo liên tục
- [ ] Chọn entity trên map mở đúng inspector; bỏ chọn được
- [ ] Ra lệnh trực tiếp từ map (di chuyển / tấn công / hợp nhất) chạy đúng entity đã chọn
- [ ] Thu nhỏ/mở lại hai column không làm map nhảy vị trí hay mất scene
- [ ] Resize cửa sổ qua các mốc 1024 / 1440 không làm map méo, không phải reload
- [ ] Không jank thấy được khi tick server cập nhật (mỗi ~1 s) trong lúc đang pan

## E. Vòng chơi thật, 20–30 phút liên tục

- [ ] Kinh tế: harvest → route → caravan → giao hàng, xem được cargo và tiến độ
- [ ] Xây: hai queue build + một queue research chạy song song, đếm ngược đúng
- [ ] Quân: tuyển → đội hình → tấn công raider → đọc battle report
- [ ] Chợ: xuất tài nguyên ở Thương cảng Meridian
- [ ] Drawer nâng cao: alliance vote, spy mission, season archive mở được và không trắng panel
- [ ] Sau 20–30 phút: console vẫn không error, bộ nhớ không phình bất thường (DevTools → Memory)

## F. Bền vững phiên

- [ ] Reload giữa phiên: state trở lại đúng, không mất lệnh đang bay
- [ ] Ngắt mạng (DevTools → Offline) rồi bật lại: connection pill đổi trạng thái, tự kết nối lại, có thông báo phục hồi đúng một lần
- [ ] Tab thứ hai cùng player: cả hai nhận cùng snapshot sau cùng một lệnh
- [ ] Đăng xuất rồi đăng nhập lại: không rơi vào onboarding đã hoàn thành

## Kết quả phiên

Điền khi chạy xong. Nếu có blocker thì mục Manual acceptance của Phase 7C **không** được tick.

- Ngày / người chạy:
- Browser + độ phân giải:
- Thời lượng thực tế:
- Thời gian đi hết onboarding:
- Console errors:
- Blocker (chặn đóng phase):
- Việc nhỏ ghi nhận (không chặn):
