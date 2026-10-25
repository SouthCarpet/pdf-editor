// Oracle: K4 / R32. Carry the actual image only, after render; no motion when
// reduced motion is set or the API is absent. Cancellation cannot select stale pages.
import { afterEach, expect, it, vi } from "vitest";
import { carryThumbnail, PAGE_IMAGE_READY } from "../thumbnailCarry";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as Partial<Document>).startViewTransition;
  document.documentElement.style.viewTransitionName = "";
  delete document.documentElement.dataset.kMotion;
  document.body.replaceChildren();
});

function surfaces() {
  const source = document.createElement("canvas");
  source.dataset.renderedPage = "2";
  const host = document.createElement("main");
  const target = document.createElement("canvas");
  target.dataset.pageImage = "2";
  host.append(target);
  document.body.append(source, host);
  return { source, host, target };
}

function transitionApi() {
  let update: () => Promise<void> = async () => { };
  let finish: () => void = () => { };
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const skipTransition = vi.fn();
  document.startViewTransition = vi.fn((callback: () => Promise<void>) => {
    update = callback;
    return { ready: Promise.resolve(), finished, skipTransition } as unknown as ViewTransition;
  }) as Document["startViewTransition"];
  return { update: () => update(), finish, skipTransition };
}

it("selects immediately when view transitions are unavailable", () => {
  const { source, host } = surfaces();
  const select = vi.fn();
  carryThumbnail(source, host, 2, select);
  expect(select).toHaveBeenCalledOnce();
  expect(source.style.viewTransitionName).toBe("");
});

it("selects immediately with reduced motion and never snapshots", () => {
  const api = transitionApi();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const { source, host } = surfaces();
  const select = vi.fn();
  carryThumbnail(source, host, 2, select);
  expect(select).toHaveBeenCalledOnce();
  expect(document.startViewTransition).not.toHaveBeenCalled();
  api.finish();
});

it("selects immediately when the app motion setting is reduced", () => {
  const api = transitionApi();
  document.documentElement.dataset.kMotion = "reduce";
  const { source, host } = surfaces();
  const select = vi.fn();
  carryThumbnail(source, host, 2, select);
  expect(select).toHaveBeenCalledOnce();
  expect(document.startViewTransition).not.toHaveBeenCalled();
  api.finish();
});

it("selects without a carry if the thumbnail image has not rendered", () => {
  const api = transitionApi();
  const { source, host } = surfaces();
  delete source.dataset.renderedPage;
  const select = vi.fn();
  carryThumbnail(source, host, 2, select);
  expect(select).toHaveBeenCalledOnce();
  expect(document.startViewTransition).not.toHaveBeenCalled();
  api.finish();
});

it("uses an already rendered facing page without waiting for a new render", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const api = transitionApi();
  const { source, host, target } = surfaces();
  target.dataset.renderedPage = "2";
  carryThumbnail(source, host, 2, () => { });
  await api.update();
  expect(target.style.viewTransitionName).toBe("pdf-page-carry");
  api.finish();
});

it("carries the thumbnail into the rendered page image, leaving the shell still", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const api = transitionApi();
  const { source, host, target } = surfaces();
  const select = vi.fn();
  carryThumbnail(source, host, 2, select);
  expect(source.style.viewTransitionName).toBe("pdf-page-carry");
  expect(document.documentElement.style.viewTransitionName).toBe("none");
  const updating = api.update();
  expect(select).toHaveBeenCalledOnce();
  expect(source.style.viewTransitionName).toBe("");
  expect(target.style.viewTransitionName).toBe("");
  target.dataset.renderedPage = "2";
  target.dispatchEvent(new Event(PAGE_IMAGE_READY, { bubbles: true }));
  await updating;
  expect(target.style.viewTransitionName).toBe("pdf-page-carry");
  expect(host.style.viewTransitionName).toBe("");
  api.finish();
  await Promise.resolve();
  expect(target.style.viewTransitionName).toBe("");
  expect(document.documentElement.style.viewTransitionName).toBe("");
});

it("a second click cancels a queued carry before it can select a stale page", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const api = transitionApi();
  const { source, host } = surfaces();
  const select = vi.fn();
  const cancel = carryThumbnail(source, host, 2, select);
  cancel();
  await api.update();
  expect(select).not.toHaveBeenCalled();
  expect(api.skipTransition).toHaveBeenCalledOnce();
  api.finish();
});

it("falls back to selection if the transition API rejects the start", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  document.startViewTransition = vi.fn(() => { throw new Error("unavailable"); });
  const { source, host } = surfaces();
  const select = vi.fn();
  carryThumbnail(source, host, 2, select);
  expect(select).toHaveBeenCalledOnce();
  expect(source.style.viewTransitionName).toBe("");
});
