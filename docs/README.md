# Tài liệu Kingdoms of Meridian

Đây là mục lục tài liệu chính của dự án. Mọi quyết định kiến trúc, gameplay và vận hành cần được cập nhật ở đây hoặc trong tài liệu chuyên trách tương ứng.

## Bắt đầu nhanh

- [Roadmap và tiến trình](ROADMAP.md) — trạng thái hiện tại, phase, checklist và bước kế tiếp.
- [Kiến trúc hệ thống](ARCHITECTURE.md) — boundary client/server/domain, realtime và scaling.
- [Game design](GAME-DESIGN.md) — ba trục thắng, logistics, faction và anti-pay-to-win.
- [API và realtime protocol](API.md) — REST endpoints, WebSocket messages và quy tắc command.
- [Database](DATABASE.md) — schema, ownership, persistence và migration policy.
- [Vận hành local](OPERATIONS.md) — Docker, environment, health check và troubleshooting.
- [Kiểm thử](TESTING.md) — test layers, acceptance criteria và CI.
- [Assets](ASSETS.md) — nguồn asset, license và quy trình placeholder.
- [Đóng góp](CONTRIBUTING.md) — workflow branch, code style và Definition of Done.

## Thứ tự đọc đề xuất

1. `ROADMAP.md`
2. `ARCHITECTURE.md`
3. `GAME-DESIGN.md`
4. `DATABASE.md` và `API.md`
5. `TESTING.md` và `OPERATIONS.md`

## Quy tắc tài liệu

- Tài liệu dùng tiếng Việt; tên code, API, schema và event giữ tiếng Anh.
- Không ghi quyết định đã lỗi thời như thể đang có hiệu lực.
- Thay đổi schema/protocol phải cập nhật tài liệu trong cùng pull request.
- Không đưa secret, token thật, dữ liệu người chơi hoặc thông tin production vào tài liệu.
