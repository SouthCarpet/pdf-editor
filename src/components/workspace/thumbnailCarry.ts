import { flushSync } from "react-dom";

const IMAGE_NAME = "pdf-page-carry";
export const PAGE_IMAGE_READY = "pdf-page-image-ready";

/** Carry only the page raster. The toolbar, overlays and focus stay in place. */
export function carryThumbnail(
  source: HTMLCanvasElement | null,
  pageHost: HTMLElement | null,
  page: number,
  select: () => void,
): () => void {
  const doc = source?.ownerDocument;
  if (!doc?.startViewTransition || !pageHost || source?.dataset.renderedPage !== String(page) ||
    reducedMotion(doc)) {
    select();
    return () => { };
  }
  const root = doc.documentElement;
  const rootName = root.style.viewTransitionName;
  let destination: HTMLCanvasElement | null = null;
  let transition: ViewTransition | undefined;
  let cancelled = false;
  let cleared = false;
  let named = false;
  const ready = waitForPageImage(pageHost, page);

  function clear() {
    if (cleared) return;
    cleared = true;
    ready.cancel();
    if (named) {
      source!.style.viewTransitionName = "";
      if (destination) destination.style.viewTransitionName = "";
      root.style.viewTransitionName = rootName;
    }
  }

  async function prepare() {
    // PDF display renders need animation frames. Finish them before the
    // browser pauses frames to take the transition's new snapshot.
    flushSync(select);
    ready.readExisting();
    destination = await ready.image;
    if (!destination || cancelled) {
      clear();
      return;
    }
    source!.style.viewTransitionName = IMAGE_NAME;
    root.style.viewTransitionName = "none";
    named = true;
    try {
      transition = doc!.startViewTransition(() => {
        if (cancelled) return;
        source!.style.viewTransitionName = "";
        destination!.style.viewTransitionName = IMAGE_NAME;
      });
    } catch {
      clear();
      return;
    }
    // Skipped snapshots still leave the clicked page selected.
    void transition.ready.catch(() => { });
    void transition.finished.then(clear, clear);
  }
  void prepare();
  return () => {
    cancelled = true;
    transition?.skipTransition();
    clear();
  };
}

function waitForPageImage(host: HTMLElement, page: number) {
  let finish: (image: HTMLCanvasElement | null) => void = () => { };
  const image = new Promise<HTMLCanvasElement | null>((resolve) => { finish = resolve; });
  const timer = window.setTimeout(() => cancel(), 200);
  function onReady(event: Event) {
    const canvas = event.target;
    if (!(canvas instanceof HTMLCanvasElement) || canvas.dataset.pageImage !== String(page)) return;
    finish(canvas.dataset.renderedPage === String(page) ? canvas : null);
    cancel();
  }
  function cancel() {
    host.removeEventListener(PAGE_IMAGE_READY, onReady);
    window.clearTimeout(timer);
    finish(null);
  }
  host.addEventListener(PAGE_IMAGE_READY, onReady);
  function readExisting() {
    const canvas = Array.from(host.querySelectorAll("canvas")).find((item) =>
      item.dataset.pageImage === String(page) && item.dataset.renderedPage === String(page));
    if (!canvas) return;
    finish(canvas);
    cancel();
  }
  return { image, cancel, readExisting };
}

function reducedMotion(doc: Document): boolean {
  return doc.documentElement.dataset.kMotion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
