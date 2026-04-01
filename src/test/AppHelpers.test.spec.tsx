import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { totalPrice, filteredProducts, statusIcon, getProductIcon } from '../AppHelpers';

// ---------------------------------------------------------------------------
// totalPrice
// ---------------------------------------------------------------------------
describe('totalPrice', () => {
  it('returns 0 for an empty basket', () => {
    expect(totalPrice([])).toBe(0);
  });

  it('returns the price of a single item with qty 1', () => {
    expect(totalPrice([{ product_price: 1.5, count: 1 }])).toBeCloseTo(1.5);
  });

  it('multiplies price by count for each item', () => {
    expect(totalPrice([{ product_price: 2.0, count: 3 }])).toBeCloseTo(6.0);
  });

  it('sums across multiple items', () => {
    const basket = [
      { product_price: 1.0, count: 2 },
      { product_price: 0.5, count: 4 },
    ];
    expect(totalPrice(basket)).toBeCloseTo(4.0);
  });

  it('handles floating point prices correctly', () => {
    const basket = [
      { product_price: 1.99, count: 1 },
      { product_price: 0.99, count: 2 },
    ];
    expect(totalPrice(basket)).toBeCloseTo(3.97);
  });

  it('handles a zero-price item', () => {
    expect(totalPrice([{ product_price: 0, count: 5 }])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filteredProducts
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { product_id: 1, product_name: 'Cola',       product_category: 'Drinks', product_availability: true  },
  { product_id: 2, product_name: 'Crisps',     product_category: 'Snacks', product_availability: true  },
  { product_id: 3, product_name: 'Sandwich',   product_category: 'Food',   product_availability: true  },
  { product_id: 4, product_name: 'OldCola',    product_category: 'Drinks', product_availability: false },
  { product_id: 5, product_name: 'HiddenItem', product_category: 'Snacks', product_availability: false },
];

describe('filteredProducts', () => {
  it('returns all available products when category is "All"', () => {
    const result = filteredProducts(PRODUCTS, 'All');
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.product_availability)).toBe(true);
  });

  it('excludes unavailable products in "All" mode', () => {
    const result = filteredProducts(PRODUCTS, 'All');
    expect(result.find((p) => p.product_id === 4)).toBeUndefined();
    expect(result.find((p) => p.product_id === 5)).toBeUndefined();
  });

  it('filters by category and excludes unavailable products', () => {
    const result = filteredProducts(PRODUCTS, 'Drinks');
    expect(result).toHaveLength(1);
    expect(result[0].product_name).toBe('Cola');
  });

  it('returns an empty array when no products match the category', () => {
    const result = filteredProducts(PRODUCTS, 'Questionable');
    expect(result).toHaveLength(0);
  });

  it('returns an empty array when all products are unavailable', () => {
    const unavailable = PRODUCTS.map((p) => ({ ...p, product_availability: false }));
    expect(filteredProducts(unavailable, 'All')).toHaveLength(0);
  });

  it('returns an empty array when the products list is empty', () => {
    expect(filteredProducts([], 'All')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// statusIcon
// ---------------------------------------------------------------------------
describe('statusIcon', () => {
  const statuses = ['paying', 'dispensing', 'done', 'waiting_door', 'error'] as const;

  it.each(statuses)('renders a non-null icon for status "%s"', (status) => {
    const icon = statusIcon(status);
    expect(icon).not.toBeNull();
  });

  it('returns a fallback credit-card icon for "idle" (null coalesces to default)', () => {
    expect(statusIcon('idle')).not.toBeNull();
  });

  it('each status renders without throwing', () => {
    statuses.forEach((s) => {
      expect(() => render(<>{statusIcon(s)}</>)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// getProductIcon
// ---------------------------------------------------------------------------
describe('getProductIcon', () => {
  it('returns a non-null icon for any recognised drink name', () => {
    expect(getProductIcon('Cola', '')).not.toBeNull();
    expect(getProductIcon('Water Bottle', '')).not.toBeNull();
  });

  it('returns a non-null icon for a sandwich name', () => {
    expect(getProductIcon('Chicken Sandwich', '')).not.toBeNull();
  });

  it('returns a non-null icon for a snack/crisp name', () => {
    expect(getProductIcon('Pringles', '')).not.toBeNull();
  });

  it('returns a non-null icon for a sweet/chocolate name', () => {
    expect(getProductIcon('Kit Kat', '')).not.toBeNull();
  });

  it('falls back to category when name is not recognised', () => {
    const icon = getProductIcon('Unknown Item', 'drinks');
    expect(icon).not.toBeNull();
  });

  it('returns an icon (bag fallback) for fully unrecognised name and category', () => {
    expect(getProductIcon('XYZ', 'XYZ')).not.toBeNull();
  });

  it('renders each icon without throwing', () => {
    const inputs: [string, string][] = [
      ['Cola', ''],
      ['Sandwich', ''],
      ['Crisps', ''],
      ['Chocolate', ''],
      ['Unknown', 'drink'],
      ['Unknown', 'snack'],
      ['Unknown', 'sandwich'],
      ['Unknown', 'sweet'],
      ['Unknown', ''],
    ];
    inputs.forEach(([name, cat]) => {
      expect(() => render(<>{getProductIcon(name, cat)}</>)).not.toThrow();
    });
  });
});
