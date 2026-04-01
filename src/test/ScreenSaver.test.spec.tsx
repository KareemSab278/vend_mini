import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenSaver } from '../Components/ScreenSaver';

vi.mock('../imageImporter', () => ({
  default: {
    'slide1.jpg': 'slide1.jpg',
    'slide2.jpg': 'slide2.jpg',
    'slide3.jpg': 'slide3.jpg',
  },
}));

const TEST_IMAGES = ['img-a.jpg', 'img-b.jpg', 'img-c.jpg'];

describe('ScreenSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an img element when slides are provided', () => {
    render(<ScreenSaver images={TEST_IMAGES} onClose={() => {}} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('displays the first slide initially', () => {
    render(<ScreenSaver images={TEST_IMAGES} onClose={() => {}} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'img-a.jpg');
  });

  it('advances to the next slide after the interval', () => {
    render(<ScreenSaver images={TEST_IMAGES} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'img-b.jpg');
  });

  it('wraps back to the first slide after the last one', () => {
    render(<ScreenSaver images={TEST_IMAGES} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(8000 * 3); });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'img-a.jpg');
  });

  it('calls onClose when the screen is tapped', () => {
    const onClose = vi.fn();
    const { container } = render(<ScreenSaver images={TEST_IMAGES} onClose={onClose} />);
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops the slide timer after a tap', () => {
    const onClose = vi.fn();
    const { container } = render(<ScreenSaver images={TEST_IMAGES} onClose={onClose} />);
    fireEvent.click(container.firstChild as HTMLElement);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing (no img) when images array is empty', () => {
    render(<ScreenSaver images={[]} onClose={() => {}} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses the default imported images when no images prop is provided', () => {
    render(<ScreenSaver onClose={() => {}} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders a full-screen overlay container', () => {
    const { container } = render(<ScreenSaver images={TEST_IMAGES} onClose={() => {}} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.zIndex).toBe('9999');
  });
});
