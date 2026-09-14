import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithEProviders } from '../../e-shared/test-utils';
import { MixedContentComposer, type ComposerValue } from './MixedContentComposer';

function Harness() {
  const [value, setValue] = useState<ComposerValue>({ body: '', items: [] });
  return <MixedContentComposer label="讨论内容" value={value} onChange={setValue} />;
}

describe('MixedContentComposer', () => {
  it('rejects an image over 5 MiB before starting an upload', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithEProviders(<Harness />);
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"][accept^="image/"]',
    )!;
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-large.png', {
      type: 'image/png',
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('图片不能超过 5 MB');
  });
});
