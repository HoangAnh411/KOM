# Assets và license

## Hiện trạng

MVP dùng placeholder code-native trong PixiJS Graphics cho tile, city, caravan, hero và army. Các thư mục chuẩn đã có tại:

- `assets/heroes/`
- `assets/units/`
- `assets/buildings/`
- `assets/icons/`

## Thứ tự ưu tiên

1. Asset CC0/public domain hoặc license thương mại rõ ràng.
2. SVG/CSS/PixiJS Graphics cho icon, UI, effect và placeholder.
3. AI-generated portrait chỉ dùng làm concept placeholder sau khi có art direction.
4. Blender low-poly chỉ thêm nếu gameplay cần 3D thật.

## Nguồn dự kiến

- Kenney: asset pages public domain/CC0 theo [Kenney Support](https://kenney.nl/support).
- Screaming Brain Studios: các pack CC0 theo [trang license](https://screamingbrainstudios.com/).
- OpenGameArt: kiểm tra license riêng từng file theo [FAQ](https://opengameart.org/node/5571).

## Quy trình tích hợp

- Không dùng asset `NC`, `ND`, license mơ hồ hoặc chỉ cho phi thương mại.
- Ghi pack name, file, tác giả, URL, license, version và ngày tải trong `assets/CREDITS.md`.
- Không commit file nhị phân lớn nếu chưa có quyết định asset budget.
- Giữ texture atlas và naming ổn định để mobile/desktop dùng cùng pipeline.
- Kiểm tra attribution/copying obligations trước khi phát hành thương mại.
