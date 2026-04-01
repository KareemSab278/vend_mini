import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ProductCard } from '../Components/ProductCard';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

const baseProduct = { product_name: 'Test Cola', product_price: 1.5 };

describe('ProductCard', () => {
  it('renders the product name and price', () => {
    render(<ProductCard product={baseProduct} onClick={null} onRemove={null} />, { wrapper });
    expect(screen.getByText(/Test Cola/)).toBeInTheDocument();
    expect(screen.getByText(/£1\.50/)).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(
      <ProductCard product={baseProduct} title="My Override Title" onClick={null} onRemove={null} />,
      { wrapper },
    );
    expect(screen.getByText(/My Override Title/)).toBeInTheDocument();
  });

  it('truncates names longer than 20 characters', () => {
    const longProduct = { product_name: 'A Very Long Product Name Here', product_price: 2.0 };
    render(<ProductCard product={longProduct} onClick={null} onRemove={null} />, { wrapper });
    expect(screen.getByText(/A Very Long Product .../)).toBeInTheDocument();
  });

  it('does not truncate names that are exactly 20 characters', () => {
    const exactProduct = { product_name: '12345678901234567890', product_price: 1.0 };
    render(<ProductCard product={exactProduct} onClick={null} onRemove={null} />, { wrapper });
    expect(screen.getByText(/12345678901234567890/)).toBeInTheDocument();
  });

  it('calls onClick with the product when the card is clicked', () => {
    const onClick = vi.fn();
    render(<ProductCard product={baseProduct} onClick={onClick} onRemove={null} />, { wrapper });
    fireEvent.click(screen.getByText(/Test Cola/));
    expect(onClick).toHaveBeenCalledWith(baseProduct, '+');
  });

  it('does not throw when onClick is null', () => {
    render(<ProductCard product={baseProduct} onClick={null} onRemove={null} />, { wrapper });
    expect(() => fireEvent.click(screen.getByText(/Test Cola/))).not.toThrow();
  });

  it('shows the QuantityBadge when count > 0', () => {
    render(<ProductCard product={baseProduct} onClick={null} onRemove={null} count={3} />, { wrapper });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not show the QuantityBadge when count is 0', () => {
    render(<ProductCard product={baseProduct} onClick={null} onRemove={null} count={0} />, { wrapper });
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows the RemoveButton when selected=true, showRemoveButton=true, and onRemove is provided', () => {
    const onRemove = vi.fn();
    const { container } = render(
      <ProductCard
        product={baseProduct}
        onClick={null}
        onRemove={onRemove}
        selected
        showRemoveButton
      />,
      { wrapper },
    );
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('does not show the RemoveButton when selected is false', () => {
    const { container } = render(
      <ProductCard
        product={baseProduct}
        onClick={null}
        onRemove={vi.fn()}
        selected={false}
        showRemoveButton
      />,
      { wrapper },
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('does not show the RemoveButton when showRemoveButton is false', () => {
    const { container } = render(
      <ProductCard
        product={baseProduct}
        onClick={null}
        onRemove={vi.fn()}
        selected
        showRemoveButton={false}
      />,
      { wrapper },
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('calls onRemove with the product when the RemoveButton is clicked', () => {
    const onRemove = vi.fn();
    const { container } = render(
      <ProductCard
        product={baseProduct}
        onClick={null}
        onRemove={onRemove}
        selected
        showRemoveButton
      />,
      { wrapper },
    );
    fireEvent.click(container.querySelector('button')!);
    expect(onRemove).toHaveBeenCalledWith(baseProduct, '-');
  });

  it('renders optional children', () => {
    render(
      <ProductCard product={baseProduct} onClick={null} onRemove={null}>
        <span>Extra child content</span>
      </ProductCard>,
      { wrapper },
    );
    expect(screen.getByText('Extra child content')).toBeInTheDocument();
  });
});
