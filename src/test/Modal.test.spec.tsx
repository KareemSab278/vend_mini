import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../Components/Modal';

describe('Modal', () => {
  it('does not render anything when opened is false', () => {
    render(
      <Modal opened={false} closed={() => {}} title="Hidden Modal">
        <div>Should not appear</div>
      </Modal>,
    );
    expect(screen.queryByText('Hidden Modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });

  it('renders the modal when opened is true', () => {
    render(
      <Modal opened={true} closed={() => {}} title="Visible Modal">
        <div>Content here</div>
      </Modal>,
    );
    expect(screen.getByText('Visible Modal')).toBeInTheDocument();
    expect(screen.getByText('Content here')).toBeInTheDocument();
  });

  it('displays the title correctly', () => {
    render(
      <Modal opened={true} closed={() => {}} title="My Custom Title">
        <span>child</span>
      </Modal>,
    );
    expect(screen.getByText('My Custom Title')).toBeInTheDocument();
  });

  it('renders arbitrary children', () => {
    render(
      <Modal opened={true} closed={() => {}} title="Test">
        <button>Action</button>
        <p>Paragraph</p>
      </Modal>,
    );
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Paragraph')).toBeInTheDocument();
  });

  it('calls closed when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal opened={true} closed={onClose} title="Close Test">
        <div>Inner</div>
      </Modal>,
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call closed when the inner body content is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal opened={true} closed={onClose} title="Stop Prop Test">
        <span>Inner Content</span>
      </Modal>,
    );
    fireEvent.click(screen.getByText('Inner Content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call closed when the title is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal opened={true} closed={onClose} title="Click Title">
        <div>body</div>
      </Modal>,
    );
    fireEvent.click(screen.getByText('Click Title'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies a custom innerStyle when provided', () => {
    const { container } = render(
      <Modal
        opened={true}
        closed={() => {}}
        title="Styled"
        innerStyle={{ backgroundColor: 'red' }}
      >
        <div>styled content</div>
      </Modal>,
    );
    const innerBody = container.querySelector('[style*="background"]');
    expect(innerBody).toBeTruthy();
  });
});
