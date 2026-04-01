import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PriceStatusPill } from '../Components/PriceStatusPill';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('PriceStatusPill', () => {
  it('renders the "View Cart" button', () => {
    render(<PriceStatusPill onModalOpen={() => {}} onCheckout={() => {}} totalPrice={0} />, { wrapper });
    expect(screen.getByText('View Cart')).toBeInTheDocument();
  });

  it('renders the Checkout button with formatted price', () => {
    render(<PriceStatusPill onModalOpen={() => {}} onCheckout={() => {}} totalPrice={3.5} />, { wrapper });
    expect(screen.getByText('Checkout (£3.50)')).toBeInTheDocument();
  });

  it('shows £0.00 when totalPrice is 0', () => {
    render(<PriceStatusPill onModalOpen={() => {}} onCheckout={() => {}} totalPrice={0} />, { wrapper });
    expect(screen.getByText('Checkout (£0.00)')).toBeInTheDocument();
  });

  it('defaults to £0.00 when totalPrice prop is omitted', () => {
    render(<PriceStatusPill onModalOpen={() => {}} onCheckout={() => {}} />, { wrapper });
    expect(screen.getByText('Checkout (£0.00)')).toBeInTheDocument();
  });

  it('calls onModalOpen when "View Cart" is clicked', () => {
    const onModalOpen = vi.fn();
    render(<PriceStatusPill onModalOpen={onModalOpen} onCheckout={() => {}} totalPrice={0} />, { wrapper });
    fireEvent.click(screen.getByText('View Cart'));
    expect(onModalOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onCheckout when the Checkout button is clicked', () => {
    const onCheckout = vi.fn();
    render(<PriceStatusPill onModalOpen={() => {}} onCheckout={onCheckout} totalPrice={1.0} />, { wrapper });
    fireEvent.click(screen.getByText('Checkout (£1.00)'));
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('does not call onCheckout when "View Cart" is clicked', () => {
    const onCheckout = vi.fn();
    render(<PriceStatusPill onModalOpen={() => {}} onCheckout={onCheckout} totalPrice={0} />, { wrapper });
    fireEvent.click(screen.getByText('View Cart'));
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('formats large prices correctly', () => {
    render(<PriceStatusPill onModalOpen={() => {}} onCheckout={() => {}} totalPrice={123.456} />, { wrapper });
    expect(screen.getByText('Checkout (£123.46)')).toBeInTheDocument();
  });
});
