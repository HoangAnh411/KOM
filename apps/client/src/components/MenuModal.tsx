import { useState } from "react";
import { graphicsQuality, setGraphicsQuality, type GraphicsQuality } from "../graphics.js";
import { useGame } from "../state.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";

const labels: Record<GraphicsQuality, string> = { high: "Cao", balanced: "Can bang", low: "Thap" };

export function MenuModal({ onClose }: { onClose: () => void }) {
  const { state, logout } = useGame();
  const [quality, setQuality] = useState<GraphicsQuality>(graphicsQuality());
  const chooseQuality = (value: GraphicsQuality) => { setQuality(value); setGraphicsQuality(value); };
  return <Modal title="Menu" onClose={onClose} className="player-menu-modal" actions={<Button variant="ghost" onClick={onClose}>Dong</Button>}>
    <section className="menu-section"><h3>Do net</h3><p>Lua chon duoc luu tren thiet bi va ap dung cho lan tai canh tiep theo.</p><div className="hub-tabs">{(Object.keys(labels) as GraphicsQuality[]).map(value => <Button key={value} variant={quality === value ? "secondary" : "ghost"} density="compact" aria-pressed={quality === value} onClick={() => chooseQuality(value)}>{labels[value]}</Button>)}</div></section>
    <section className="menu-section"><h3>Dieu khien</h3><p>Keo de di chuyen ban do. Lan chuot va pinch giu diem duoi con tro. Click don chon thuc the; keo tu 4 px tro len la pan.</p></section>
    <section className="menu-section"><h3>Mua giai</h3><p>Con lai: <strong className="kom-num">{Math.max(0, Math.ceil((Date.parse(state.snapshot?.season.endsAt ?? "") - Date.now()) / 1000))} giay</strong></p></section>
    <Button variant="destructive" onClick={() => { onClose(); logout(); }}>Dang xuat</Button>
  </Modal>;
}
