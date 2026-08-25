import { describe, expect, it, beforeEach } from 'vitest';
import { installAudienceBridge, isAudienceWindowLive } from './audienceBridge';
import { usePresenterStore } from '../store/presenterStore';

describe('audienceBridge', () => {
  beforeEach(() => {
    usePresenterStore.setState({
      slideIndex: 0,
      blanked: false,
      laserOn: false,
      laserPos: null,
      overviewOpen: false,
      notesOpen: false,
      audienceWindowOpen: false
    });
    delete window.__sakuraAudience;
  });

  it('installAudienceBridge exposes window.__sakuraAudience.setSyncState', () => {
    expect(window.__sakuraAudience).toBeUndefined();
    installAudienceBridge();
    expect(typeof window.__sakuraAudience?.setSyncState).toBe('function');
  });

  it('setSyncState applies the pushed subset directly onto this window\'s own presenterStore', () => {
    installAudienceBridge();
    window.__sakuraAudience!.setSyncState({ slideIndex: 3, blanked: true, laserOn: true, laserPos: { x: 5, y: 9 } });
    const s = usePresenterStore.getState();
    expect(s.slideIndex).toBe(3);
    expect(s.blanked).toBe(true);
    expect(s.laserOn).toBe(true);
    expect(s.laserPos).toEqual({ x: 5, y: 9 });
  });

  it('setSyncState never touches fields outside the synced subset (e.g. overviewOpen, audienceWindowOpen)', () => {
    installAudienceBridge();
    usePresenterStore.setState({ overviewOpen: true, audienceWindowOpen: true });
    window.__sakuraAudience!.setSyncState({ slideIndex: 1, blanked: false, laserOn: false, laserPos: null });
    const s = usePresenterStore.getState();
    expect(s.overviewOpen).toBe(true);
    expect(s.audienceWindowOpen).toBe(true);
  });

  it('isAudienceWindowLive is false before any window has been opened', () => {
    expect(isAudienceWindowLive()).toBe(false);
  });
});
