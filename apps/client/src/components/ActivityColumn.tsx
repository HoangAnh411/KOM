import { surfaceElementIds } from "../layout.js";
import { Icon } from "../ui/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";

/** How many skeleton rows the placeholder draws. PR4 replaces the whole
 *  `<ActivityFeed />` slot below with client-derived events; nothing outside this
 *  file needs to change when it does. */
const placeholderRows = [0, 1, 2, 3];

/** The right column: the surface PR4's activity stream will live on.
 *
 *  It is a placeholder on purpose. Inventing rows that look like real events
 *  would be worse than an empty state — a player cannot tell a fake "quân địch
 *  áp sát" from a real one, and the shell has no event source yet. So the column
 *  ships as honest scaffolding: correct landmarks, correct headings, correct
 *  density, and text that says what will appear here. */
export function ActivityColumn({ open }: { open: boolean }) {
  return <aside
    id={surfaceElementIds.activity}
    className="activity-column"
    aria-label="Dòng hoạt động"
    hidden={!open}
  >
    <Panel density="compact" accent="slate" className="activity-panel" aria-label="Hoạt động gần đây">
      <PanelHeader title={<><Icon name="clock" size="sm" /> Hoạt động gần đây</>} level={3} />
      <PanelBody>
        <p className="hint">Dòng sự kiện của vương quốc sẽ hiện ở đây: lệnh đã xác nhận, quân đến, caravan cập bến, báo cáo trận đánh.</p>
        <ul className="activity-skeleton" aria-hidden="true">
          {placeholderRows.map(row => <li key={row}><span className="activity-skeleton__dot" /><span className="activity-skeleton__line" /></li>)}
        </ul>
      </PanelBody>
    </Panel>
    <Panel density="compact" accent="amber" className="activity-panel" aria-label="Cần chú ý">
      <PanelHeader title={<><Icon name="alert" size="sm" /> Cần chú ý</>} level={3} />
      <PanelBody>
        <p className="hint">Những việc cần bạn quyết: tiếp tế cạn, thành bị vây, hiệp ước sắp hết hạn.</p>
        <p className="activity-empty">Chưa có gì cần chú ý.</p>
      </PanelBody>
    </Panel>
  </aside>;
}
