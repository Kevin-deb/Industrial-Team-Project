import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Encounter, EncounterContext, SavedEncounterRecord } from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { EncountersPage } from './index';

const saved: SavedEncounterRecord = {
  id: 'SAVED-1',
  title: '本次问诊记录',
  savedAt: '2026-09-28T01:00:00Z',
  mode: 'video',
  messageCount: 1,
  audioSaved: false,
  videoSaved: false,
};
function data(value: unknown) {
  return new Response(JSON.stringify({ data: value, meta: { requestId: 'test', mode: 'demo' } }));
}
function failed(message: string, status = 500) {
  return new Response(JSON.stringify({ error: { message } }), { status });
}
function fixture(type: 'video' | 'text' = 'video', completed = false) {
  const encounter: Encounter = {
    id: 'ENC-TEST',
    patientId: 'PAT-001',
    patientName: '演示患者',
    type,
    status: completed ? 'completed' : 'waiting',
    scheduledAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    reason: '合成演示',
    durationMinutes: 20,
  };
  const context: EncounterContext = {
    brief: {
      chiefComplaint: '真实服务器摘要',
      presentIllness: '合成现病史',
      pastHistory: '合成既往史',
      surgicalHistory: '合成手术史',
      medicationHistory: '合成用药史',
      allergyHistory: '合成过敏史',
    },
    savedRecords: [],
    historyRecords: [],
    messages: [],
  };
  return { encounter, context };
}
async function enter() {
  render(
    <I18nProvider>
      <EncountersPage />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '查看接诊详情' }));
  fireEvent.click(screen.getByRole('button', { name: '进入诊间' }));
  await screen.findByRole('button', { name: '返回接诊列表' });
  await screen.findByText('真实服务器摘要');
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:encounter-test'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it('camera denial never reports a connected patient; successful capture only starts a local preview', async () => {
  const { encounter, context } = fixture();
  const stop = vi.fn();
  const getUserMedia = vi
    .fn()
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/context') ? data(context) : data([encounter]),
    ),
  );
  await enter();
  expect(screen.getByRole('button', { name: '麦克风未接入' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '开启本机预览' }));
  expect(await screen.findByText('摄像头未开启，请允许浏览器访问摄像头')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '停止本机预览' })).not.toBeInTheDocument();
  expect(screen.queryByText('患者已接入视频')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '开启本机预览' }));
  expect(await screen.findByRole('button', { name: '停止本机预览' })).toBeInTheDocument();
  expect(screen.getByText('仅预览本机画面；尚未连接患者，未录音录像。')).toBeInTheDocument();
  expect(getUserMedia).toHaveBeenLastCalledWith({ video: true, audio: false });
  fireEvent.click(screen.getByRole('button', { name: '停止本机预览' }));
  expect(stop).toHaveBeenCalledOnce();
});

it('message submission is guarded against double clicks and preserves the draft after failure', async () => {
  const { encounter, context } = fixture('text');
  let finishRequest: (response: Response) => void = () => undefined;
  let sends = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/messages')) {
        sends++;
        return new Promise<Response>((resolve) => {
          finishRequest = resolve;
        });
      }
      return String(url).endsWith('/context') ? data(context) : data([encounter]);
    }),
  );
  await enter();
  fireEvent.change(screen.getByLabelText('输入回复患者的内容'), {
    target: { value: '发送失败也要保留此输入' },
  });
  const button = screen.getByRole('button', { name: '发送' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(sends).toBe(1);
  expect(button).toBeDisabled();
  finishRequest(failed('消息未保存，请重试'));
  expect(await screen.findByRole('alert')).toHaveTextContent('消息未保存，请重试');
  expect(screen.getByLabelText('输入回复患者的内容')).toHaveValue('发送失败也要保留此输入');
  expect(button).toBeEnabled();
});

it('ending a video visit never claims media retention and failure does not mark it complete', async () => {
  const { encounter, context } = fixture();
  let finishRequest: (response: Response) => void = () => undefined;
  const payloads: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/complete')) {
        payloads.push(JSON.parse(String(init?.body)));
        return new Promise<Response>((resolve) => {
          finishRequest = resolve;
        });
      }
      return String(url).endsWith('/context') ? data(context) : data([encounter]);
    }),
  );
  await enter();
  const button = screen.getByRole('button', { name: '结束问诊' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).not.toHaveProperty('audioSaved');
  expect(payloads[0]).not.toHaveProperty('videoSaved');
  finishRequest(failed('问诊保存失败'));
  expect(await screen.findByRole('alert')).toHaveTextContent('问诊保存失败');
  expect(screen.getByRole('button', { name: '结束问诊' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '问诊已结束' })).not.toBeInTheDocument();
});

it('a completed visit without a persisted record has no fabricated export fallback', async () => {
  const { encounter, context } = fixture('video', true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/context') ? data(context) : data([encounter]),
    ),
  );
  await enter();
  expect(screen.getByRole('button', { name: '导出记录' })).toBeDisabled();
  expect(screen.getByText('问诊已结束，未找到已保存的问诊记录。')).toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('export rechecks access and refuses to download stale cached data after denial', async () => {
  const { encounter, context } = fixture('video', true);
  context.savedRecords = [saved];
  let deny = false;
  let contextReads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/context')) {
        contextReads++;
        return deny ? failed('访问权限已失效', 403) : data(context);
      }
      return data([encounter]);
    }),
  );
  await enter();
  const before = contextReads;
  deny = true;
  fireEvent.click(screen.getByRole('button', { name: '导出记录' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('访问权限已失效');
  expect(contextReads).toBe(before + 1);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('export uses the latest saved snapshot and never reports unrecorded audio or video', async () => {
  const { encounter, context } = fixture('video', true);
  context.savedRecords = [saved];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/context') ? data(context) : data([encounter]),
    ),
  );
  await enter();
  context.messages = [
    {
      id: 'latest',
      sender: 'doctor',
      body: '导出时服务器新增的文字',
      sentAt: '2026-09-28T02:00:00Z',
    },
  ];
  context.savedRecords = [{ ...saved, savedAt: '2026-09-28T02:00:00Z' }];
  fireEvent.click(screen.getByRole('button', { name: '导出记录' }));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(text).toContain('导出时服务器新增的文字');
  expect(text).toContain('录音留存：否');
  expect(text).toContain('录像留存：否');
  expect(text).toContain('不包含图片、音频或视频文件');
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
});
