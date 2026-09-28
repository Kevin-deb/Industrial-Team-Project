import { expect, type BrowserContext, type Page } from '@playwright/test';

/** Printed synthetic content only. No patient photograph or external image dependency. */
export async function syntheticRecordPhoto(page: Page): Promise<Buffer> {
  const encoded = await page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1300;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.font = '48px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    context.textBaseline = 'top';
    const lines = [
      '合成测试病历',
      '病历标题：纸质门诊记录',
      '诊断：上呼吸道感染',
      '主诉：咳嗽三天',
      '现病史：咳嗽，无发热',
      '既往史与过敏史：无过敏史',
      '查体与辅助检查：体温正常',
      '评估及诊疗计划：休息，多饮水',
    ];
    lines.forEach((line, index) => context.fillText(line, 90, 70 + index * 125));
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(encoded, 'base64');
}

/** Fail any attempted external download, including OCR worker/language-model requests. */
export async function observeLocalOcr(context: BrowserContext, allowedOrigin?: string) {
  const external: string[] = [];
  const assets: string[] = [];
  context.on('request', (request) => {
    const url = request.url();
    if (/traineddata|tesseract.*wasm|worker\.min\.js/.test(url)) assets.push(url);
  });
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    if (allowedOrigin && new URL(url).origin === allowedOrigin) await route.continue();
    else {
      external.push(url);
      await route.abort('blockedbyclient');
    }
  });
  return { external, assets };
}

export async function recognizeSyntheticRecord(page: Page) {
  const photo = await syntheticRecordPhoto(page);
  await page.getByTestId('record-photo-open').click();
  await page.getByTestId('record-photo-file').setInputFiles({
    name: 'synthetic-paper-record.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  await page.getByTestId('record-photo-recognize').click();
  await expect(page.getByTestId('record-photo-raw')).toHaveValue(/咳\s*嗽/, {
    timeout: 120000,
  });
  await expect(page.getByTestId('record-photo-field-chiefComplaint')).toHaveValue(/咳\s*嗽/);
  await expect(page.getByTestId('record-photo-field-diagnosis')).toHaveValue(/上\s*呼\s*吸\s*道/);
  return photo;
}
