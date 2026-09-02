import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";
import type { Density, PanelAccent } from "./tokens.js";
import { panelClass } from "./variants.js";

/** The one panel shape: header / body / footer, composed by the caller rather
 *  than driven by a dozen props. Anything the caller passes lands on the
 *  `<section>`, which is how `aria-label` keeps working — a `<section>` is only
 *  a landmark once it has an accessible name, so the name has to stay the
 *  caller's decision.
 *
 *  `panelRef` rather than `forwardRef`: the only consumer is `usePanelAnchor`,
 *  and a plain prop keeps this file free of a wrapper type. */
export function Panel({ children, density, accent, flush, className, panelRef, ...rest }: {
  children: ReactNode;
  density?: Density;
  accent?: PanelAccent;
  flush?: boolean;
  panelRef?: Ref<HTMLElement>;
} & Omit<ComponentPropsWithoutRef<"section">, "children">) {
  return <section ref={panelRef} className={panelClass({ density, accent, flush, className })} {...rest}>
    {children}
  </section>;
}

/** `level` exists because a panel nested inside another panel must not restart
 *  the heading outline at h2. Default h2: every panel on the shipped screens is
 *  a sibling under the page's h1. */
export function PanelHeader({ title, meta, actions, level = 2, className }: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${level}` as "h2";
  return <div className={className ? `kom-panel__header ${className}` : "kom-panel__header"}>
    <Heading className="kom-panel__heading">{title}</Heading>
    {meta ? <span className="kom-panel__meta">{meta}</span> : null}
    {actions ? <div className="kom-panel__actions">{actions}</div> : null}
  </div>;
}

export function PanelBody({ children, className, ...rest }: ComponentPropsWithoutRef<"div">) {
  return <div className={className ? `kom-panel__body ${className}` : "kom-panel__body"} {...rest}>{children}</div>;
}

export function PanelFooter({ children, className, ...rest }: ComponentPropsWithoutRef<"div">) {
  return <div className={className ? `kom-panel__footer ${className}` : "kom-panel__footer"} {...rest}>{children}</div>;
}
