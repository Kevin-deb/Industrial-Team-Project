export const recordPhotoMessages: Record<string, string> = {
  拍照识别病历: 'Import record photo',
  '请先选择患者，再识别纸质病历。': 'Select the patient before importing a paper record.',
  关闭识别: 'Close photo import',
  当前患者: 'Current patient',
  '在本机识别图片，不上传到云端。识别后请对照原图核对，再填入草稿。':
    'Images are recognized on this device and are not uploaded to a cloud service. Compare the result with the photo before filling the draft.',
  '支持清晰的中英文印刷病历；手写、模糊或复杂表格可能无法准确识别。':
    'Supports clear printed Chinese and English records. Handwriting, blur and complex tables may not be recognized correctly.',
  打开摄像头: 'Open camera',
  '正在请求摄像头…': 'Requesting camera…',
  关闭摄像头: 'Close camera',
  拍摄病历: 'Take record photo',
  病历摄像头预览: 'Record camera preview',
  上传病历图片: 'Upload record image',
  'JPG / PNG / WebP，最大 12 MB。手机可直接选择拍摄的照片。':
    'JPG / PNG / WebP, up to 12 MB. You can select a photo taken on your phone.',
  病历原图: 'Original record photo',
  '顺时针旋转 90°': 'Rotate 90° clockwise',
  '正在处理图片…': 'Processing image…',
  开始识别: 'Recognize image',
  重新识别: 'Recognize again',
  '正在本机识别…': 'Recognizing on this device…',
  取消识别: 'Cancel recognition',
  识别进度: 'Recognition progress',
  '首次加载本地模型可能需要一些时间。': 'Loading the local model may take a moment.',
  识别原文: 'Recognized text',
  '可修正原文后重新提取字段；未匹配到标题的内容仍保留在这里。':
    'Correct the text and extract fields again. Text without a recognized heading remains here.',
  重新提取字段: 'Extract fields again',
  识别置信度: 'OCR confidence',
  '该数值不代表内容准确率，请逐项核对。':
    'This is not a guarantee of accuracy. Review every field.',
  '没有识别出文字，请调整方向、光线或重新拍摄。':
    'No text was recognized. Adjust orientation or lighting, or take another photo.',
  '原文已修改，请先重新提取字段。':
    'The text was edited. Extract fields again before filling the draft.',
  待填入内容: 'Fields to fill',
  '仅勾选的非空内容会填入。已有内容默认保留，需逐项勾选才能替换。':
    'Only selected, non-empty fields will be filled. Existing content is kept unless you explicitly select that field.',
  填入: 'Fill',
  已有内容: 'Existing content',
  将替换已有内容: 'Will replace existing content',
  我已核对当前患者及识别内容: 'I have verified the current patient and recognized content',
  填入病历草稿: 'Fill record draft',
  '填入后仍需点击“保存草稿”；不会自动提交病历或开立医嘱。':
    'After filling, use Save draft to persist it. Importing does not submit the record or issue orders.',
  '所选内容已填入草稿，请核对后保存。':
    'Selected content has been filled into the draft. Review it before saving.',
  '此环境无法打开摄像头，请上传已拍摄的图片。':
    'The camera is unavailable in this environment. Upload a photo instead.',
  '无法使用摄像头，请检查权限或上传图片。':
    'Could not use the camera. Check camera permissions or upload a photo.',
  '画面尚未准备好，请稍候再拍摄。':
    'The camera image is not ready. Please wait before taking a photo.',
  '无法处理图片，请重新拍摄或上传图片。':
    'Could not process this image. Take another photo or upload a different image.',
  '识别失败，请重试或换一张清晰图片。': 'Recognition failed. Retry or select a clearer photo.',
  '仅支持 JPG、PNG 或 WebP 图片。': 'Only JPG, PNG and WebP images are supported.',
  '图片不能超过 12 MB。': 'Images must not exceed 12 MB.',
  '图片为空，请重新选择。': 'The image is empty. Select another image.',
  '无法读取图片，请换用清晰的 JPG、PNG 或 WebP 图片。':
    'Could not read this image. Select a clear JPG, PNG or WebP image.',
  '图片尺寸过大，请缩小后重试。': 'The image dimensions are too large. Resize it and try again.',
  '识别超时，请缩小图片或重新拍摄后重试。':
    'Recognition timed out. Resize the image or take another photo and retry.',
  '本地识别引擎加载失败，请重启软件后重试。':
    'The local recognition engine could not load. Restart the application and retry.',
};
