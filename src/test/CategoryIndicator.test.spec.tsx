import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { CategoryIndicator } from '../Components/CategoryIndicator';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

const CATEGORIES = ['All', 'Drinks', 'Snacks', 'Food'];

describe('CategoryIndicator', () => {
  it('renders a button for every category', () => {
    render(
      <CategoryIndicator
        categories={CATEGORIES}
        activeCategory="All"
        onCategoryClick={() => {}}
      />,
      { wrapper },
    );
    CATEGORIES.forEach((cat) => {
      expect(screen.getByText(cat)).toBeInTheDocument();
    });
  });

  it('calls onCategoryClick with the correct value when a button is clicked', () => {
    const onCategoryClick = vi.fn();
    render(
      <CategoryIndicator
        categories={CATEGORIES}
        activeCategory="All"
        onCategoryClick={onCategoryClick}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByText('Drinks'));
    expect(onCategoryClick).toHaveBeenCalledWith('Drinks');
  });

  it('calls onCategoryClick once per click', () => {
    const onCategoryClick = vi.fn();
    render(
      <CategoryIndicator
        categories={CATEGORIES}
        activeCategory="All"
        onCategoryClick={onCategoryClick}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByText('Snacks'));
    expect(onCategoryClick).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when categories is empty', () => {
    const { container } = render(
      <CategoryIndicator categories={[]} activeCategory="" onCategoryClick={() => {}} />,
      { wrapper },
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders a single category correctly', () => {
    render(
      <CategoryIndicator categories={['All']} activeCategory="All" onCategoryClick={() => {}} />,
      { wrapper },
    );
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('clicking each category fires the handler with the right argument', () => {
    const onCategoryClick = vi.fn();
    render(
      <CategoryIndicator
        categories={CATEGORIES}
        activeCategory="All"
        onCategoryClick={onCategoryClick}
      />,
      { wrapper },
    );
    CATEGORIES.forEach((cat) => {
      fireEvent.click(screen.getByText(cat));
    });
    CATEGORIES.forEach((cat, i) => {
      expect(onCategoryClick).toHaveBeenNthCalledWith(i + 1, cat);
    });
  });
});
