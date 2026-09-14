import { Mic, Square, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function AudioRecorder({
  disabled,
  onSelect,
  onClose,
}: {
  disabled?: boolean;
  onSelect: (file: File) => void;
  onClose: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current >= 179) recorder.current?.stop();
        return Math.min(180, current + 1);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => stopTracks(stream.current), []);

  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前环境不能直接录音，请上传已有音频。');
      return;
    }
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.current = activeStream;
      const mimeType = preferredMimeType();
      const activeRecorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream);
      chunks.current = [];
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      activeRecorder.onstop = () => {
        const type = activeRecorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        stopTracks(activeStream);
        stream.current = null;
        recorder.current = null;
        setRecording(false);
        if (blob.size > 10 * 1024 * 1024) setError('音频不能超过 10 MB。请缩短录音后重试。');
        else if (blob.size) onSelect(new File([blob], recordingName(type), { type }));
      };
      recorder.current = activeRecorder;
      setSeconds(0);
      activeRecorder.start(500);
      setRecording(true);
    } catch {
      stopTracks(stream.current);
      stream.current = null;
      setError('未获得麦克风权限。你仍可上传已有音频文件。');
    }
  }

  return (
    <div className="community-audio-recorder">
      <div>
        <strong>{recording ? `录音中 ${formatTime(seconds)}` : '录一段语音'}</strong>
        <small>最长 3 分钟，发送前可以试听和删除</small>
      </div>
      {recording ? (
        <button type="button" onClick={() => recorder.current?.stop()} aria-label="停止录音">
          <Square size={14} /> 停止
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={disabled}
          aria-label="开始录音"
        >
          <Mic size={14} /> 开始录音
        </button>
      )}
      <label className={disabled ? 'is-disabled' : ''}>
        <Upload size={14} /> 上传已有音频
        <input
          type="file"
          accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg"
          disabled={disabled || recording}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file?.size && file.size > 10 * 1024 * 1024) setError('音频不能超过 10 MB。');
            else if (file) {
              setError('');
              onSelect(file);
            }
            event.currentTarget.value = '';
          }}
        />
      </label>
      <button type="button" onClick={onClose} aria-label="关闭录音工具">
        <X size={14} />
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function preferredMimeType() {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}
function recordingName(type: string) {
  if (type.includes('ogg')) return 'carelink-recording.ogg';
  if (type.includes('mp4')) return 'carelink-recording.m4a';
  return 'carelink-recording.webm';
}
function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function stopTracks(value: MediaStream | null) {
  value?.getTracks().forEach((track) => track.stop());
}
