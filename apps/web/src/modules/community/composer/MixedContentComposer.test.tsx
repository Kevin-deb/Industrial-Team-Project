import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, translate } from '../../../shared/i18n';
import { renderWithEProviders } from '../../e-shared/test-utils';
import { MixedContentComposer, type ComposerValue } from './MixedContentComposer';

function Harness() {
  const [value, setValue] = useState<ComposerValue>({ body: '', items: [] });
  return <MixedContentComposer label="讨论内容" value={value} onChange={setValue} />;
}

describe('MixedContentComposer', () => {
  beforeEach(() => localStorage.clear());

  it('rejects an image over 5 MiB before starting an upload', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithEProviders(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );
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

  it('localizes the complete composer surface in English mode', () => {
    localStorage.setItem('carelink-language', 'en');
    renderWithEProviders(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );

    expect(
      screen.getByPlaceholderText('Type text or add images, audio, and de-identified medical data…'),
    ).toBeInTheDocument();
    for (const name of ['Add image', 'Record or upload audio', 'Add emoji', 'Add medical data'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByText(/Images 0\/4 · Audio 0\/1 · Data cards 0\/2/)).toBeInTheDocument();
    expect(translate('删除', 'en')).toBe('Delete');
    expect(translate('删除帖子', 'en')).toBe('Delete post');
  });
});
