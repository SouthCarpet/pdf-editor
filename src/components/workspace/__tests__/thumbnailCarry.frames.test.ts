import { afterEach, expect, it, vi } from "vitest";
import { carryThumbnail, PAGE_IMAGE_READY } from "../thumbnailCarry";

// Oracle: 119-K5 finding 3. Browsers pause animation frames while the
// transition update is pending. PDF display renders need those frames.
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as Partial<Document>).startViewTransition;
  document.documentElement.style.viewTransitionName = "";
  document.body.replaceChildren();
});

function framePausedBrowser() {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  let updating = false;
  let completed = false;
  let oldName = "";
  let namedAtSnapshot = "";
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const source = document.createElement("canvas");
  source.dataset.renderedPage = "2";
  const host = document.createElement("main");
  const target = document.createElement("canvas");
  target.dataset.pageImage = "2";
  host.append(target);
  document.body.append(source, host);
  const start = vi.fn((update: () => void | Promise<void>) => {
    oldName = source.style.viewTransitionName;
    void Promise.resolve().then(async () => {
      updating = true;
      await update();
      namedAtSnapshot = target.style.viewTransitionName;
      completed = true;
      updating = false;
    });
    return { ready: Promise.resolve(), finished, skipTransition: finish } as unknown as ViewTransition;
  });
  document.startViewTransition = start as Document["startViewTransition"];
  function renderFrame() {
    if (updating) {
      window.setTimeout(renderFrame, 16);
      return;
    }
    target.dataset.renderedPage = "2";
    target.dispatchEvent(new Event(PAGE_IMAGE_READY, { bubbles: true }));
  }
  return { source, host, target, start, renderFrame, finish,
    snapshot: () => ({ completed, oldName, namedAtSnapshot }) };
}

it("shows the clicked page and completes its named snapshot within 250 ms when frames pause during updates", async () => {
  const browser = framePausedBrowser();
  let shownPage = 0;
  carryThumbnail(browser.source, browser.host, 2, () => {
    shownPage = 2;
    window.setTimeout(browser.renderFrame, 16);
  });
  await vi.advanceTimersByTimeAsync(250);
  expect(shownPage).toBe(2);
  expect(browser.snapshot()).toEqual({ completed: true, oldName: "pdf-page-carry", namedAtSnapshot: "pdf-page-carry" });
  expect(browser.source.style.viewTransitionName).toBe("");
  browser.finish();
  await Promise.resolve();
  expect(browser.target.style.viewTransitionName).toBe("");
});

it("shows the clicked page instantly without snapshots when system motion is reduced", () => {
  const browser = framePausedBrowser();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  let shownPage = 0;
  carryThumbnail(browser.source, browser.host, 2, () => { shownPage = 2; });
  expect(shownPage).toBe(2);
  expect(browser.start).not.toHaveBeenCalled();
  expect(browser.target.style.viewTransitionName).toBe("");
});

it("shows the clicked page instantly without an API and leaves no transition name", () => {
  const browser = framePausedBrowser();
  delete (document as Partial<Document>).startViewTransition;
  let shownPage = 0;
  expect(() => carryThumbnail(browser.source, browser.host, 2, () => { shownPage = 2; })).not.toThrow();
  expect(shownPage).toBe(2);
  expect(browser.start).not.toHaveBeenCalled();
  expect(browser.source.style.viewTransitionName).toBe("");
});

it("keeps the clicked page selected without errors or names when its render fails", async () => {
  const browser = framePausedBrowser();
  let shownPage = 0;
  carryThumbnail(browser.source, browser.host, 2, () => {
    shownPage = 2;
    window.setTimeout(() => browser.target.dispatchEvent(new Event(PAGE_IMAGE_READY, { bubbles: true })), 16);
  });
  await vi.advanceTimersByTimeAsync(250);
  expect(shownPage).toBe(2);
  expect(browser.start).not.toHaveBeenCalled();
  expect(browser.source.style.viewTransitionName).toBe("");
  expect(browser.target.style.viewTransitionName).toBe("");
  expect(document.documentElement.style.viewTransitionName).toBe("");
});

it("skips the carry after 200 ms if the destination never renders", async () => {
  const browser = framePausedBrowser();
  let shownPage = 0;
  carryThumbnail(browser.source, browser.host, 2, () => { shownPage = 2; });
  await vi.advanceTimersByTimeAsync(200);
  browser.renderFrame();
  await Promise.resolve();
  expect(shownPage).toBe(2);
  expect(browser.start).not.toHaveBeenCalled();
  expect(browser.source.style.viewTransitionName).toBe("");
  expect(browser.target.style.viewTransitionName).toBe("");
});
