export type RendererChoice<T> = { renderer: T; fallback: boolean; failure?: unknown };

/** Keep dynamic-module and synchronous constructor failures on one tested path. */
export async function chooseRenderer<T>(
  loadPreferred: () => Promise<() => T>,
  createFallback: () => T,
  onFailure: (failure: unknown) => void,
  isCancelled: () => boolean = () => false,
): Promise<RendererChoice<T> | undefined> {
  if (isCancelled()) return undefined;
  try {
    const createPreferred = await loadPreferred();
    if (isCancelled()) return undefined;
    return { renderer: createPreferred(), fallback: false };
  } catch (failure) {
    if (isCancelled()) return undefined;
    onFailure(failure);
    return { renderer: createFallback(), fallback: true, failure };
  }
}
