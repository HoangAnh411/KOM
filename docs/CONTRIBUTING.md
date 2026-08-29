# Hướng dẫn đóng góp

## Workflow

1. Đọc `docs/ROADMAP.md` và tài liệu domain liên quan.
2. Chọn một task nhỏ có acceptance criteria rõ ràng.
3. Giữ thay đổi trong đúng domain; không trộn refactor lớn nếu không cần.
4. Cập nhật test, docs và roadmap cùng pull request.
5. Chạy typecheck, build và test trước khi gửi.

## Quy tắc code

- TypeScript strict mode.
- Tên domain/API/schema/event dùng tiếng Anh; giải thích sản phẩm dùng tiếng Việt.
- Không đặt logic authoritative trong client.
- Không tin timestamp, cost, score hoặc kết quả do client gửi.
- Command write cần validation, ownership, idempotency và rate-limit.
- Không thêm dependency hoặc engine mới nếu chưa ghi trade-off trong architecture docs.

## Pull request checklist

- [ ] Có mô tả behavior và lý do thay đổi.
- [ ] Có test cho happy path và unauthorized/invalid path.
- [ ] Không có secret hoặc dữ liệu thật.
- [ ] Schema/protocol docs đã cập nhật nếu cần.
- [ ] `docs/ROADMAP.md` đã cập nhật.
- [ ] `npm run typecheck` pass.
- [ ] `npm run build` pass.
- [ ] `npm test` pass.

## Monetization review

Mọi item shop mới phải chứng minh không tăng power combat, resource generation, queue speed, score hoặc alliance voting power. Nếu không chứng minh được, không đưa vào sản phẩm.
