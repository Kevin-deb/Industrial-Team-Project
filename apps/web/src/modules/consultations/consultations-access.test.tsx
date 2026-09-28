import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Consultation, ConsultationContext } from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { ConsultationsPage } from './index';

const consultation: Consultation = {
  id: 'CON-TEST',
  patientId: 'PAT-001',
  patientName: '演示患者',
  title: '权限回归会诊',
  specialty: '全科',
  status: 'scheduled',
  scheduledAt: '2026-09-28T10:00:00Z',
  summary: '测试摘要',
  participants: ['演示医生'],
  direction: 'received',
  canReview: true,
  reviewerId: 'doctor-demo-002',
  reviewerName: '演示医生',
};
function api(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, meta: { mode: 'demo', requestId: 'test' } }), {
    status,
  });
}
function room(item: Consultation): ConsultationContext {
  return {
    consultation: item,
    participants: [],
    materials: [],
    messages: [
      {
        id: 'msg-test',
        authorId: 'doctor-demo-001',
        authorName: '测试医生',
        body: '需要随权限清除的讨论',
        sentAt: '2026-09-28T10:00:00Z',
      },
    ],
    report: null,
    access: '按本次会诊任务共享必要资料',
    accessUntil: '2026-09-28T14:00:00Z',
  };
}
async function enter() {
  render(
    <I18nProvider>
      <ConsultationsPage />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '查看详情' }));
  fireEvent.click(screen.getByRole('button', { name: '进入诊室' }));
  await screen.findByText('需要随权限清除的讨论');
}
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => vi.restoreAllMocks());

it('an invited reviewer exits after completion without requesting its newly forbidden room', async () => {
  let completed = false;
  let readsAfterCompletion = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      if (value.endsWith('/complete')) {
        completed = true;
        return api({ id: 'report' });
      }
      if (value.endsWith('/context')) {
        if (completed) {
          readsAfterCompletion++;
          return new Response('{}', { status: 404 });
        }
        return api(room(consultation));
      }
      if (value.endsWith('/session')) return api({ doctor: { id: 'doctor-demo-002' } });
      return api(completed ? [] : [consultation]);
    }),
  );
  await enter();
  fireEvent.click(screen.getByRole('button', { name: '结束并生成报告' }));
  fireEvent.click(await screen.findByRole('button', { name: '确认结束' }));
  await waitFor(() => expect(screen.queryByText('需要随权限清除的讨论')).not.toBeInTheDocument());
  expect(completed).toBe(true);
  expect(readsAfterCompletion).toBe(0);
});

it('an ordinary invited expert has no complete action', async () => {
  const expertItem = { ...consultation, canReview: false };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/context')
        ? api(room(expertItem))
        : String(url).endsWith('/session')
          ? api({ doctor: { id: 'expert' } })
          : api([expertItem]),
    ),
  );
  await enter();
  expect(screen.queryByRole('button', { name: '结束并生成报告' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '发送讨论消息' })).toBeEnabled();
});

it('downloads a completed consultation report from the detail dialog without room access', async () => {
  localStorage.setItem('carelink-language', 'en');
  const click = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:report');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true,
    value: click,
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL,
  });
  const completedItem: Consultation = {
    ...consultation,
    status: 'completed',
    canReview: false,
    report: {
      id: 'CR-TEST',
      body: [
        '联合会诊报告',
        '',
        '会诊编号：CON-TEST',
        '会诊主题：老年心血管多学科会诊',
        '患者姓名：张淑兰',
        '一、会诊材料',
        '- 近三个月血压趋势：患者家庭血压监测汇总。',
        '三、会诊意见',
        '已查阅近三个月血压趋势等资料。',
        '五、报告说明',
        '本报告由系统根据当前会诊资料、参会人员和诊室讨论记录自动生成；后续如接入真实签署流程，可继续补充审核人与签名信息。',
      ].join('\n'),
      status: 'confirmed',
      createdAt: '2026-09-28T11:00:00Z',
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => api([completedItem])),
  );
  render(
    <I18nProvider>
      <ConsultationsPage />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'View details' }));
  expect(screen.getByRole('button', { name: 'Enter room' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  const [[downloadedBlob]] = createObjectURL.mock.calls as unknown as [[Blob]];
  const content = await downloadedBlob.text();
  expect(content).toContain('Joint consultation report');
  expect(content).toContain('Consultation title: Geriatric cardiovascular consultation');
  expect(content).toContain('Summary of home blood pressure monitoring.');
  expect(content).not.toContain('联合会诊报告');
  expect(content).not.toContain('患者家庭血压监测汇总');
  expect(click).toHaveBeenCalled();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
});

it('failed completion stays visible with an error so the doctor can retry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      if (value.endsWith('/complete'))
        return new Response(JSON.stringify({ error: { message: '报告暂时无法保存' } }), {
          status: 500,
        });
      if (value.endsWith('/context')) return api(room(consultation));
      if (value.endsWith('/session')) return api({ doctor: { id: 'doctor-demo-002' } });
      return api([consultation]);
    }),
  );
  await enter();
  fireEvent.click(screen.getByRole('button', { name: '结束并生成报告' }));
  fireEvent.click(await screen.findByRole('button', { name: '确认结束' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('报告暂时无法保存');
  expect(screen.getByRole('button', { name: '确认结束' })).toBeEnabled();
});

it('a denied refresh removes cached discussion content and offers a return to the list', async () => {
  let revoked = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      if (value.endsWith('/context'))
        return revoked
          ? new Response(JSON.stringify({ error: { message: '不可访问' } }), { status: 404 })
          : api(room(consultation));
      if (value.endsWith('/session')) return api({ doctor: { id: 'doctor-demo-002' } });
      return api([consultation]);
    }),
  );
  await enter();
  revoked = true;
  fireEvent(window, new Event('focus'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '会诊已结束或访问权限已变更，请返回列表。',
  );
  expect(screen.queryByText('需要随权限清除的讨论')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '返回会诊列表' })).toBeInTheDocument();
});
