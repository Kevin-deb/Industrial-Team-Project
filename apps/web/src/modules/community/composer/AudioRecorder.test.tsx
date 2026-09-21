import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioRecorder } from './AudioRecorder';
import { I18nProvider } from '../../../shared/i18n';

function renderRecorder(onSelect: (file: File) => void) {
  return render(
    <I18nProvider>
      <AudioRecorder onSelect={onSelect} onClose={() => undefined} />
    </I18nProvider>,
  );
}

describe('AudioRecorder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects an uploaded audio file over 10 MiB before sending it', () => {
    const onSelect = vi.fn();
    renderRecorder(onSelect);
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'too-large.wav', {
      type: 'audio/wav',
    });

    fireEvent.change(screen.getByLabelText(/上传已有音频/), { target: { files: [file] } });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('音频不能超过 10 MB');
  });

  it('starts and stops the microphone, then returns a playable audio file', async () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
    class Recorder {
      static isTypeSupported() {
        return true;
      }
      mimeType = 'audio/webm;codecs=opus';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    const onSelect = vi.fn();
    renderRecorder(onSelect);

    fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
    expect(await screen.findByText(/录音中/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '停止录音' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBeInstanceOf(File);
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });
});
