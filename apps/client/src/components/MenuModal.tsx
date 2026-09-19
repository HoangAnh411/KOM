import { useState } from "react";
import { readAudioSettings, setAudioSettings, type AudioSettings } from "../audio.js";
import { graphicsQuality, setGraphicsQuality, type GraphicsQuality } from "../graphics.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";

const labels: Record<GraphicsQuality, string> = { high: "Cao", balanced: "Cân bằng", low: "Thấp" };

export function MenuModal({ onClose }: { onClose: () => void }) {
  const { state, logout } = useGame();
  const [quality, setQuality] = useState<GraphicsQuality>(graphicsQuality());
  const [audio, setAudio] = useState<AudioSettings>(readAudioSettings);
  const chooseQuality = (value: GraphicsQuality) => { setQuality(value); setGraphicsQuality(value); };
  const chooseAudio = (value: AudioSettings) => setAudio(setAudioSettings(value));
  const secondsLeft = Math.max(0, Math.ceil((Date.parse(state.snapshot?.season.endsAt ?? "") - Date.now()) / 1000));

  // The × in the modal header closes; a second "Đóng" beside "Đăng xuất" was
  // two ways to say the same thing, and a duplicate name for every "Đóng" lookup.
  return <Modal title="Trình đơn" onClose={onClose} className="player-menu-modal" actions={<Button variant="destructive" onClick={() => { onClose(); logout(); }}>Đăng xuất</Button>}>
    <section className="menu-section"><h3>Độ nét</h3><p>Lựa chọn được lưu trên thiết bị và áp dụng sau khi tải lại cảnh.</p><div className="hub-tabs">{(Object.keys(labels) as GraphicsQuality[]).map(value => <Button key={value} variant={quality === value ? "secondary" : "ghost"} density="compact" aria-pressed={quality === value} onClick={() => chooseQuality(value)}>{labels[value]}</Button>)}</div></section>
    <section className="menu-section"><h3>Âm thanh</h3><div className="menu-audio-controls"><Button variant="secondary" density="compact" aria-pressed={audio.muted} onClick={() => chooseAudio({ ...audio, muted: !audio.muted })}>{audio.muted ? "Bật âm thanh" : "Tắt âm thanh"}</Button><label><span>Âm lượng: <strong className="kom-num">{Math.round(audio.volume * 100)}%</strong></span><input type="range" min="0" max="100" step="5" value={Math.round(audio.volume * 100)} disabled={audio.muted} onChange={event => chooseAudio({ ...audio, volume: Number(event.currentTarget.value) / 100 })} /></label></div></section>
    <section className="menu-section"><h3>Điều khiển và phím tắt</h3><p>Kéo để di chuyển bản đồ; lăn chuột hoặc chụm để thu phóng. Nhấp để chọn, kéo từ 4 px trở lên để di chuyển góc nhìn.</p><dl className="menu-shortcuts"><div><dt>Tab / Shift + Tab</dt><dd>Di chuyển giữa các nút điều khiển.</dd></div><div><dt>Phím mũi tên</dt><dd>Di chuyển giữa các ô trên bản đồ nội thành 2D.</dd></div><div><dt>Enter / Space</dt><dd>Kích hoạt nút hoặc ô đang được chọn; Enter xác nhận vị trí xây hợp lệ.</dd></div><div><dt>Escape</dt><dd>Hủy thao tác hiện tại hoặc trở về bản đồ thế giới.</dd></div></dl></section>
    <section className="menu-section"><h3>Mùa giải</h3><p>Còn lại: <strong className="kom-num">{secondsLeft} giây</strong></p></section>
  </Modal>;
}
