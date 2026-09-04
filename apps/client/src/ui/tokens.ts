// The design system's vocabulary, kept free of React and the DOM so the client's
// bare `node --test` runner can assert it (see `ui-primitives.test.ts`).
//
// Names live here, colours live in `styles/tokens.css`, and nothing holds both.
// That is the whole anti-duplication rule: TypeScript can tell you a state
// exists, only CSS can tell you what colour it is.

export const uiStates = [
  "pending", "uncertain", "rejected", "frozen", "protocol-blocked", "success", "warning", "hostile",
] as const;
export type UiState = (typeof uiStates)[number];

export const buttonVariants = ["primary", "secondary", "ghost", "destructive"] as const;
export type ButtonVariant = (typeof buttonVariants)[number];

export const densities = ["default", "compact"] as const;
export type Density = (typeof densities)[number];

/** Allegiance accents a panel can carry on its left rule. Named after the hue
 *  rather than the meaning because one hue serves several meanings: brass is
 *  both "primary" and "the player's own", teal both "allied" and "succeeded". */
export const panelAccents = ["brass", "teal", "amber", "crimson", "violet", "slate"] as const;
export type PanelAccent = (typeof panelAccents)[number];

/** Two groups in one list: the first eight are the semantic-state glyphs
 *  (`stateIcons` below), the last five are the HUD's own subjects — a city, an
 *  army, a caravan, a treaty, an alliance. They are in the same registry because
 *  the pairing test is what stops `iconPaths` and this list from drifting, and
 *  a second registry would need a second one. */
export const iconNames = [
  "clock", "alert", "ban", "lock", "link-off", "check", "crosshair", "eye",
  "city", "sword", "caravan", "treaty", "banner",
] as const;
export type IconName = (typeof iconNames)[number];

/** The three custom properties every state defines. Asserted against
 *  `tokens.css`, so adding a state without its colours fails the test run. */
export const stateTokens = (state: UiState): { fill: string; border: string; text: string } => ({
  fill: `--kom-state-${state}-fill`,
  border: `--kom-state-${state}-border`,
  text: `--kom-state-${state}-text`,
});

/** One wording per state. Two surfaces calling the same state "đang gửi" and
 *  "chưa xác nhận" is how a player concludes they are different things. */
export const stateLabels: Record<UiState, string> = {
  pending: "Đang gửi",
  uncertain: "Chưa xác nhận",
  rejected: "Bị từ chối",
  frozen: "Đã đóng băng",
  "protocol-blocked": "Phiên bản lệch",
  success: "Thành công",
  warning: "Cảnh báo",
  hostile: "Đối địch",
};

export const stateIcons: Record<UiState, IconName> = {
  pending: "clock",
  uncertain: "alert",
  rejected: "ban",
  frozen: "lock",
  "protocol-blocked": "link-off",
  success: "check",
  warning: "alert",
  hostile: "crosshair",
};
