import { createWorker, OEM, PSM } from 'tesseract.js';

// The enclosing worker owns the OCR worker, so cancel/timeout also ends initialization.
self.onmessage = async (event: MessageEvent<{ image: Blob; assetBase: string }>) => {
  let engine: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const base = event.data.assetBase;
    engine = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
      logger: ({ status, progress }) =>
        self.postMessage({
          type: 'progress',
          progress: status === 'recognizing text' ? 0.3 + progress * 0.7 : progress * 0.25,
        }),
      errorHandler: () => self.postMessage({ type: 'error' }),
    });
    await engine.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: '300' });
    const { data } = await engine.recognize(event.data.image, { rotateAuto: true }, { text: true });
    self.postMessage({ type: 'result', text: data.text, confidence: data.confidence });
  } catch {
    // Never forward OCR internals (which may contain the scanned text) to logs or telemetry.
    self.postMessage({ type: 'error' });
  } finally {
    await engine?.terminate();
  }
};
