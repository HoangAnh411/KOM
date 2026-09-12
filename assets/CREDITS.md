# Asset credits

## Nội thành 3D đang sử dụng

Runtime hiện dùng bộ asset authored có mã `temp-kenney-v1` tại
`apps/client/public/assets/city3d/temp/kenney-v1/`. Công trình, tường thành, cây,
đạo cụ và cư dân dùng mesh authored từ Kenney Fantasy Town Kit 2.0, Castle Kit
2.0 và Mini Characters 1.0 (CC0 1.0), không phải các khối hộp sinh bằng code.
Danh sách semantic giúp thay art sau này mà không đổi building ID, API hoặc save.
Nguồn, phiên bản và file ship thực tế được ghi tại `THIRD_PARTY_ASSETS.md` và
`apps/client/public/assets/city3d/temp/kenney-v1/asset-index.json`.

Địa hình, đường nối công trình, ánh sáng, camera isometric và vùng đặt công trình
được tạo theo runtime vì chúng phụ thuộc trực tiếp vào layout thành.

Phần bản đồ thế giới vẫn dùng hình được vẽ bằng `PIXI.Graphics` và CSS/SVG trong source.

## Sprite 2D dự phòng

Bốn sprite bitmap trong `apps/client/public/assets/city/` được tạo riêng cho dự án ngày 2026-09-04 bằng công cụ tạo ảnh tích hợp của OpenAI, từ prompt mỹ thuật nguyên bản: công trình isometric nền trong suốt, đá vôi sáng, mái ngói đất nung, điểm nhấn đồng và xanh ngọc, ánh sáng ấm; không logo, watermark hoặc mô phỏng asset của trò chơi hiện có.

- `town-hall.png`: Tòa thị chính kiêm landmark trung tâm.
- `warehouse.png`: Nhà kho và hàng hóa.
- `road-depot.png`: Trạm tiếp tế với xe hàng.
- `barracks.png`: Doanh trại với sân luyện quân.

Không dùng bitmap của bên thứ ba trong bộ sprite này.

### Mô hình 3D GLB debug cũ (không dùng ở runtime)

Các mô hình 3D GLB trong `apps/client/public/assets/city/models/` được tạo tự động bằng mã nguồn nội bộ (`scripts/generate-city-assets.mjs`). Manifest nội thành hiện không tham chiếu các file này; chúng chỉ còn được giữ tạm để đối chiếu/debug và có thể dọn ở một đợt riêng. Bộ cũ bao gồm:
- `town_hall.glb`: Tòa thị chính (3×3) với các cấp manor, council hall, và grand imperial capitol.
- `warehouse.glb`: Nhà kho (2×2) với kho gỗ, kho đá cẩu tời, và hoàng gia ngân khố/vựa lúa có ụ chống.
- `road_depot.glb`: Trạm tiếp tế (3×2) với trạm dừng xe ngựa, văn phòng điều phối cùng chuồng và xe hàng, và trung tâm vận chuyển hoàng gia với tháp bồ câu truyền tin.
- `barracks.glb`: Doanh trại (3×3) với doanh xá gỗ sân tập, đại sảnh quân sự với trường đấu và tháp canh, và pháo đài quân sự có cổng sắt và tháp chỉ huy.
- Các mảnh tường thành và tháp canh: `wall_straight.glb`, `wall_corner.glb`, `wall_gate.glb`, `wall_tower.glb`.
- Đạo cụ môi trường: `props.glb` (cây sồi, bách, cây ăn quả, bụi cây, cột đèn, kiện hàng, xe kéo, giàn giáo thi công).
- Nhân vật dân thành: `citizen.glb` (có animation `Walk` đồng bộ).


Các nguồn tham khảo cho giai đoạn art tiếp theo:

- Kenney, asset pages: CC0/public domain theo [Kenney Support](https://kenney.nl/support). Dự kiến dùng cho city, UI, icon và unit placeholder; ghi pack URL cụ thể khi tải.
- Screaming Brain Studios: CC0/public domain theo [license information](https://screamingbrainstudios.com/). Chỉ thêm asset sau khi ghi rõ pack và URL.
- OpenGameArt: license được kiểm tra riêng cho từng asset theo [FAQ](https://opengameart.org/node/5571). CC-BY sẽ ghi tác giả/attribution; GPL/CC-BY-SA sẽ ghi nghĩa vụ phân phối tương ứng.

Không dùng asset có điều khoản `NC`, `ND`, license không rõ hoặc chỉ cho phép sử dụng phi thương mại.
