import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PrimaryButton, RemoveButton } from '../Components/Button';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('PrimaryButton', () => {
  it('renders with the given title', () => {
    render(<PrimaryButton title="Test Button" onClick={() => {}} />, { wrapper });
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<PrimaryButton title="Click Me" onClick={onClick} />, { wrapper });
    fireEvent.click(screen.getByText('Click Me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not crash without an onDoubleClick handler', () => {
    render(<PrimaryButton title="No DblClick" onClick={() => {}} />, { wrapper });
    expect(screen.getByText('No DblClick')).toBeInTheDocument();
  });

  it('calls onDoubleClick when double-clicked', () => {
    const onDoubleClick = vi.fn();
    render(
      <PrimaryButton title="Double Me" onClick={() => {}} onDoubleClick={onDoubleClick} />,
      { wrapper },
    );
    fireEvent.doubleClick(screen.getByText('Double Me'));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom color prop without crashing', () => {
    render(<PrimaryButton title="Colored" onClick={() => {}} color="#ff0000" />, { wrapper });
    expect(screen.getByText('Colored')).toBeInTheDocument();
  });

  it('renders multiple buttons independently', () => {
    const onClick1 = vi.fn();
    const onClick2 = vi.fn();
    render(
      <>
        <PrimaryButton title="First" onClick={onClick1} />
        <PrimaryButton title="Second" onClick={onClick2} />
      </>,
      { wrapper },
    );
    fireEvent.click(screen.getByText('First'));
    expect(onClick1).toHaveBeenCalledTimes(1);
    expect(onClick2).not.toHaveBeenCalled();
  });
});

describe('RemoveButton', () => {
  it('renders without crashing', () => {
    const { container } = render(<RemoveButton onClick={() => {}} />, { wrapper });
    expect(container.firstChild).toBeTruthy();
  });

  it('calls onClick when the button is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<RemoveButton onClick={onClick} />, { wrapper });
    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a button element', () => {
    const { container } = render(<RemoveButton onClick={() => {}} />, { wrapper });
    expect(container.querySelector('button')).not.toBeNull();
  });
});
