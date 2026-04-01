import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuantityBadge } from '../Components/QuantityBadge';

describe('QuantityBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<QuantityBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when count is negative', () => {
    const { container } = render(<QuantityBadge count={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when count prop is omitted (defaults to 0)', () => {
    const { container } = render(<QuantityBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the count when it is positive', () => {
    render(<QuantityBadge count={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders count of 1 correctly', () => {
    render(<QuantityBadge count={1} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders large counts correctly', () => {
    render(<QuantityBadge count={99} />);
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('applies the default red background colour', () => {
    const { container } = render(<QuantityBadge count={2} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.style.backgroundColor).toBe('rgb(229, 57, 53)');
  });

  it('applies a custom color when provided', () => {
    const { container } = render(<QuantityBadge count={2} color="#00ff00" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.style.backgroundColor).toBe('rgb(0, 255, 0)');
  });
});
