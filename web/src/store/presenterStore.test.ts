import { describe, expect, it, beforeEach, vi } from 'vitest';
import { usePresenterStore } from './presenterStore';

describe('presenterStore', () => {
  beforeEach(() => {
    usePresenterStore.setState({
      slideIndex: 0,
      blanked: false,
      laserOn: false,
      laserPos: null,
      overviewOpen: false,
      notesOpen: false,
      elapsedSec: 0,
      startedAt: Date.now()
    });
  });

  it('defaults match a fresh presenting session', () => {
    const s = usePresenterStore.getState();
    expect(s.slideIndex).toBe(0);
    expect(s.blanked).toBe(false);
    expect(s.laserOn).toBe(false);
    expect(s.laserPos).toBeNull();
    expect(s.overviewOpen).toBe(false);
    expect(s.notesOpen).toBe(false);
    expect(s.elapsedSec).toBe(0);
  });

  it('setSlideIndex updates the slide index', () => {
    usePresenterStore.getState().setSlideIndex(3);
    expect(usePresenterStore.getState().slideIndex).toBe(3);
  });

  it('setBlanked/setLaserOn/setOverviewOpen/setNotesOpen each toggle independently', () => {
    const s = usePresenterStore.getState();
    s.setBlanked(true);
    s.setLaserOn(true);
    s.setOverviewOpen(true);
    s.setNotesOpen(true);
    const after = usePresenterStore.getState();
    expect(after.blanked).toBe(true);
    expect(after.laserOn).toBe(true);
    expect(after.overviewOpen).toBe(true);
    expect(after.notesOpen).toBe(true);
  });

  it('setLaserPos stores the last mouse position', () => {
    usePresenterStore.getState().setLaserPos({ x: 12, y: 34 });
    expect(usePresenterStore.getState().laserPos).toEqual({ x: 12, y: 34 });
  });

  it('enterPresenting resets every field to a fresh-session default, even mid-presentation', () => {
    const s = usePresenterStore.getState();
    s.setSlideIndex(5);
    s.setBlanked(true);
    s.setLaserOn(true);
    s.setLaserPos({ x: 1, y: 2 });
    s.setOverviewOpen(true);
    s.setNotesOpen(true);
    usePresenterStore.setState({ elapsedSec: 42 });

    s.enterPresenting();
    const after = usePresenterStore.getState();
    expect(after.slideIndex).toBe(0);
    expect(after.blanked).toBe(false);
    expect(after.laserOn).toBe(false);
    expect(after.laserPos).toBeNull();
    expect(after.overviewOpen).toBe(false);
    expect(after.notesOpen).toBe(false);
    expect(after.elapsedSec).toBe(0);
  });

  it('tickElapsed recomputes elapsedSec from startedAt against the current clock', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    usePresenterStore.getState().enterPresenting();

    vi.setSystemTime(now + 5000);
    usePresenterStore.getState().tickElapsed();
    expect(usePresenterStore.getState().elapsedSec).toBe(5);

    vi.setSystemTime(now + 65000);
    usePresenterStore.getState().tickElapsed();
    expect(usePresenterStore.getState().elapsedSec).toBe(65);
    vi.useRealTimers();
  });
});
