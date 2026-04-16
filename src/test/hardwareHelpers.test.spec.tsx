import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  unlockDoor,
  isDoorClosed,
  setLightsColor,
  listenToMotionSensor,
  listenToNfcAdminFound,
  listenToNfcUnknownTag,
} from '../hardwareHelpers';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockResolvedValue({ status: 200, ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// unlockDoor
// ---------------------------------------------------------------------------
describe('unlockDoor', () => {
  it('calls fetch exactly once', async () => {
    await unlockDoor();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('calls fetch with the POST method', async () => {
    await unlockDoor();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('calls fetch with a URL that ends with /open', async () => {
    await unlockDoor();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/open$/);
  });

  it('returns the fetch response on success', async () => {
    const mockResponse = { status: 200, ok: true };
    mockFetch.mockResolvedValueOnce(mockResponse);
    const result = await unlockDoor();
    expect(result).toEqual(mockResponse);
  });

  it('returns undefined and does not throw on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    await expect(unlockDoor()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setLightsColor
// ---------------------------------------------------------------------------
describe('setLightsColor', () => {
  it('calls fetch exactly once per invocation', async () => {
    await setLightsColor('green');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sets green=255, red=0, blue=0 for the green colour', async () => {
    await setLightsColor('green');
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.green).toBe(255);
    expect(body.red).toBe(0);
    expect(body.blue).toBe(0);
  });

  it('sets red=255, green=0, blue=0 for the red colour', async () => {
    await setLightsColor('red');
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.red).toBe(255);
    expect(body.green).toBe(0);
    expect(body.blue).toBe(0);
  });

  it('sets blue=255, red=0, green=0 for the blue colour', async () => {
    await setLightsColor('blue');
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.blue).toBe(255);
    expect(body.red).toBe(0);
    expect(body.green).toBe(0);
  });

  it('sends Content-Type: application/json header', async () => {
    await setLightsColor('green');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toContain('application/json');
  });

  it('sets on=true and brightness=100 in the payload', async () => {
    await setLightsColor('blue');
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.on).toBe(true);
    expect(body.brightness).toBe(100);
  });

  it('returns undefined and does not throw on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    await expect(setLightsColor('green')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isDoorClosed
// ---------------------------------------------------------------------------
describe('isDoorClosed', () => {
  it('calls invoke with get_door_status', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify({ lock_state: 'closed' }));
    await isDoorClosed();
    expect(invoke).toHaveBeenCalledWith('get_door_status');
  });

  it('returns true when lock_state is "closed"', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify({ lock_state: 'closed' }));
    expect(await isDoorClosed()).toBe(true);
  });

  it('returns false when lock_state is "open"', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify({ lock_state: 'open' }));
    expect(await isDoorClosed()).toBe(false);
  });

  it('returns false when lock_state is missing', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify({}));
    expect(await isDoorClosed()).toBe(false);
  });

  it('accepts a plain object (non-string) response from invoke', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ lock_state: 'closed' });
    expect(await isDoorClosed()).toBe(true);
  });

  it('returns false and does not throw when invoke rejects', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('IPC failure'));
    await expect(isDoorClosed()).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listenToMotionSensor
// ---------------------------------------------------------------------------
describe('listenToMotionSensor', () => {
  it('calls listen with the "motion-detected" event', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);
    await listenToMotionSensor(vi.fn());
    expect(listen).toHaveBeenCalledWith('motion-detected', expect.any(Function));
  });

  it('returns the unlisten function provided by listen()', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);
    const result = await listenToMotionSensor(vi.fn());
    expect(result).toBe(mockUnlisten);
  });

  it('invokes the onMotion callback when the event callback fires', async () => {
    const onMotion = vi.fn();
    let capturedHandler: (...args: unknown[]) => void = () => {};

    vi.mocked(listen).mockImplementationOnce(async (_event, handler) => {
      capturedHandler = handler as (...args: unknown[]) => void;
      return (() => {}) as () => void;
    });

    await listenToMotionSensor(onMotion);
    capturedHandler();
    expect(onMotion).toHaveBeenCalledTimes(1);
  });

  it('does not call onMotion before the event fires', async () => {
    const onMotion = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(vi.fn());
    await listenToMotionSensor(onMotion);
    expect(onMotion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listenToNfcAdminFound
// ---------------------------------------------------------------------------
describe('listenToNfcAdminFound', () => {
  it('calls listen with the "nfc-admin-found" event', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);
    await listenToNfcAdminFound(vi.fn());
    expect(listen).toHaveBeenCalledWith('nfc-admin-found', expect.any(Function));
  });

  it('returns the unlisten function provided by listen()', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);
    const result = await listenToNfcAdminFound(vi.fn());
    expect(result).toBe(mockUnlisten);
  });

  it('invokes the onAdminFound callback when the event fires', async () => {
    const onAdminFound = vi.fn();
    let capturedHandler: (...args: unknown[]) => void = () => {};

    vi.mocked(listen).mockImplementationOnce(async (_event, handler) => {
      capturedHandler = handler as (...args: unknown[]) => void;
      return (() => {}) as () => void;
    });

    await listenToNfcAdminFound(onAdminFound);
    capturedHandler();
    expect(onAdminFound).toHaveBeenCalledTimes(1);
  });

  it('does not call onAdminFound before the event fires', async () => {
    const onAdminFound = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(vi.fn());
    await listenToNfcAdminFound(onAdminFound);
    expect(onAdminFound).not.toHaveBeenCalled();
  });

  it('calls onAdminFound each time the event fires', async () => {
    const onAdminFound = vi.fn();
    let capturedHandler: (...args: unknown[]) => void = () => {};

    vi.mocked(listen).mockImplementationOnce(async (_event, handler) => {
      capturedHandler = handler as (...args: unknown[]) => void;
      return (() => {}) as () => void;
    });

    await listenToNfcAdminFound(onAdminFound);
    capturedHandler();
    capturedHandler();
    capturedHandler();
    expect(onAdminFound).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// listenToNfcUnknownTag
// ---------------------------------------------------------------------------
describe('listenToNfcUnknownTag', () => {
  it('calls listen with the "nfc-unknown-tag" event', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);
    await listenToNfcUnknownTag(vi.fn());
    expect(listen).toHaveBeenCalledWith('nfc-unknown-tag', expect.any(Function));
  });

  it('returns the unlisten function provided by listen()', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);
    const result = await listenToNfcUnknownTag(vi.fn());
    expect(result).toBe(mockUnlisten);
  });

  it('invokes the onUnknown callback when the event fires', async () => {
    const onUnknown = vi.fn();
    let capturedHandler: (...args: unknown[]) => void = () => {};

    vi.mocked(listen).mockImplementationOnce(async (_event, handler) => {
      capturedHandler = handler as (...args: unknown[]) => void;
      return (() => {}) as () => void;
    });

    await listenToNfcUnknownTag(onUnknown);
    capturedHandler({ payload: 'test-tag-id' });
    expect(onUnknown).toHaveBeenCalledTimes(1);
  });

  it('does not call onUnknown before the event fires', async () => {
    const onUnknown = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(vi.fn());
    await listenToNfcUnknownTag(onUnknown);
    expect(onUnknown).not.toHaveBeenCalled();
  });

  it('calls onUnknown each time the event fires', async () => {
    const onUnknown = vi.fn();
    let capturedHandler: (...args: unknown[]) => void = () => {};

    vi.mocked(listen).mockImplementationOnce(async (_event, handler) => {
      capturedHandler = handler as (...args: unknown[]) => void;
      return (() => {}) as () => void;
    });

    await listenToNfcUnknownTag(onUnknown);
    capturedHandler({ payload: 'test-tag-id' });
    capturedHandler({ payload: 'test-tag-id' });
    capturedHandler({ payload: 'test-tag-id' });
    expect(onUnknown).toHaveBeenCalledTimes(3);
  });
});

