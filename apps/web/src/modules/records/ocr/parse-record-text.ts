import type { MedicalRecordTemplateDefinition } from '@doctor/contracts';

export interface RecordOcrDraft {
  title: string;
  diagnosis: string;
  body: Record<string, string>;
}

interface FieldAliases {
  key: string;
  labels: readonly string[];
  sections?: readonly string[];
}

// These are heading aliases, never symptom-to-diagnosis or medication inference rules.
const fieldAliases: readonly FieldAliases[] = [
  { key: 'chiefComplaint', labels: ['主诉', 'Chief complaint'] },
  { key: 'presentIllness', labels: ['现病史', 'History of present illness', 'HPI'] },
  {
    key: 'medicalAndAllergyHistory',
    labels: ['既往史与过敏史', '既往史及过敏史', 'Medical and allergy history'],
    sections: [
      '既往史',
      '既往病史',
      '过敏史',
      '药物过敏史',
      'Past medical history',
      'Medical history',
      'Allergy history',
      'Allergies',
    ],
  },
  {
    key: 'examinationAndInvestigations',
    labels: [
      '查体与辅助检查',
      '查体及辅助检查',
      '体格检查与辅助检查',
      'Examination and investigations',
    ],
    sections: [
      '查体',
      '体格检查',
      '辅助检查',
      '实验室检查',
      '检验结果',
      '影像检查',
      'Physical examination',
      'Investigations',
    ],
  },
  {
    key: 'assessmentAndPlan',
    labels: ['评估及诊疗计划', '评估与诊疗计划', '诊疗计划', 'Assessment and plan'],
    sections: [
      '评估',
      '处理',
      '处理意见',
      '处置',
      '治疗方案',
      '治疗计划',
      '医嘱',
      'Treatment plan',
    ],
  },
  {
    key: 'followUpPurpose',
    labels: ['本次随访目的', '随访目的', 'Follow-up purpose', 'Follow up purpose'],
  },
  {
    key: 'healthMonitoringData',
    labels: ['健康监测数据', '监测数据', 'Health monitoring data'],
    sections: ['健康指标', '血压监测', '血糖监测'],
  },
  {
    key: 'currentMedicationAndAdherence',
    labels: ['当前用药与依从性', '当前用药及依从性', 'Current medication and adherence'],
    sections: ['当前用药', '用药依从性', '服药依从性', 'Medication adherence'],
  },
  {
    key: 'lifestyleAndCare',
    labels: ['生活方式与照护情况', '生活方式及照护情况', 'Lifestyle and care'],
    sections: ['生活方式', '照护情况'],
  },
  {
    key: 'nextFollowUpArrangement',
    labels: ['下次随访安排', '下次随访', 'Next follow-up arrangement', 'Next follow-up'],
  },
  {
    key: 'consultationRequestAndPurpose',
    labels: ['会诊申请与目的', '会诊申请及目的', 'Consultation request and purpose'],
    sections: ['会诊申请', '会诊目的'],
  },
  {
    key: 'participatingClinicians',
    labels: ['参与科室与医生', '参与科室及医生', '会诊科室及医师', 'Participating clinicians'],
  },
  { key: 'caseSummary', labels: ['病情摘要', '病例摘要', 'Case summary'] },
  { key: 'discussionNotes', labels: ['会诊讨论记录', '会诊讨论', 'Discussion notes'] },
  {
    key: 'combinedOpinionAndNextSteps',
    labels: ['综合意见与后续安排', '综合意见及后续安排', 'Combined opinion and next steps'],
    sections: ['综合意见', '会诊意见', '后续安排'],
  },
];

const metadataHeadings = [
  '姓名',
  '患者姓名',
  '病人姓名',
  '性别',
  '年龄',
  '出生日期',
  '出生年月',
  '生日',
  '身份证号',
  '身份证号码',
  '联系电话',
  '联系地址',
  '电话',
  '手机号',
  '地址',
  '住址',
  '门诊号',
  '住院号',
  '病案号',
  '病历号',
  '患者编号',
  '就诊卡号',
  '科室',
  '病区',
  '床号',
  '就诊日期',
  '就诊时间',
  '入院日期',
  '出院日期',
  '记录日期',
  '记录时间',
  '医生签名',
  '医师签名',
  '签名',
  '记录医师',
  '诊疗医师',
  '医师',
  '医生',
  '审核医师',
  '个人史',
  '家族史',
  '婚育史',
  '月经史',
  'Patient name',
  'Name',
  'Sex',
  'Gender',
  'Age',
  'Date of birth',
  'DOB',
  'Phone',
  'Address',
  'Patient ID',
  'Record ID',
  'Date',
  'Signature',
  'Physician',
] as const;

interface Heading {
  kind: 'title' | 'diagnosis' | 'body' | 'boundary';
  key?: string;
  keepLabel?: boolean;
}

function normalizeHeading(value: string): string {
  return value.replace(/[\s\u3000]+/gu, '').toLowerCase();
}

function headingPattern(value: string): string {
  return Array.from(value.trim())
    .map((character) => {
      if (/\s/u.test(character)) return '[ \\t\\u3000]+';
      return character.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
    })
    .join('[ \\t\\u3000]*');
}

/** Extracts review candidates only. Unlabeled text is deliberately left in the OCR transcript. */
export function parseRecordText(
  text: string,
  template: MedicalRecordTemplateDefinition,
): RecordOcrDraft {
  const draft: RecordOcrDraft = { title: '', diagnosis: '', body: {} };
  const allowedFields = new Set(template.fields.map((field) => field.key));
  const headings = new Map<string, Heading>();
  const patterns = new Map<string, string>();
  const add = (labels: readonly string[], heading: Heading) => {
    for (const label of labels) {
      const normalized = normalizeHeading(label);
      if (!normalized) continue;
      headings.set(normalized, heading);
      patterns.set(normalized, headingPattern(label));
    }
  };

  for (const field of fieldAliases) {
    const heading: Heading = allowedFields.has(field.key)
      ? { kind: 'body', key: field.key }
      : { kind: 'boundary' };
    add(field.labels, heading);
    add(field.sections ?? [], { ...heading, keepLabel: true });
  }
  add(metadataHeadings, { kind: 'boundary' });
  add(['病历标题', '病例标题', '记录标题', '标题', 'Record title', 'Title'], { kind: 'title' });
  add(
    ['诊断', '初步诊断', '临床诊断', '诊断意见', '入院诊断', '出院诊断', 'Diagnosis', 'Diagnoses'],
    { kind: 'diagnosis' },
  );
  // The server catalogue wins over aliases, including any future template fields.
  for (const field of template.fields) {
    add([field.labelKey], { kind: 'body', key: field.key });
  }

  const alternatives = [...patterns.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .map(([, pattern]) => pattern)
    .join('|');
  const numbering = '(?:[（(]?[一二三四五六七八九十百0-9]{1,3}[）).、．][ \\t\\u3000]*)?';
  const labeled = new RegExp(
    '(^|[ \\t\\u3000;；])' + numbering + '(' + alternatives + ')[ \\t\\u3000]*[:：]',
    'giu',
  );
  const standalone = new RegExp(
    '^' + numbering + '(' + alternatives + ')[ \\t\\u3000]*[:：]?$',
    'iu',
  );
  const metadataWithoutColon = new RegExp(
    '^(?:' + metadataHeadings.map(headingPattern).join('|') + ')[ \\t\\u3000]+\\S',
    'iu',
  );
  const body = new Map<string, string[]>();
  let section: { heading: Heading; label: string; lines: string[] } | undefined;
  let explicitTitle = false;

  const flush = () => {
    if (!section) return;
    const value = section.lines.join('\n').trim();
    const { heading, label } = section;
    if (value && heading.kind === 'title') {
      draft.title = explicitTitle ? draft.title + '\n' + value : value;
      explicitTitle = true;
    } else if (value && heading.kind === 'diagnosis') {
      draft.diagnosis = [draft.diagnosis, value].filter(Boolean).join('\n');
    } else if (value && heading.kind === 'body' && heading.key && allowedFields.has(heading.key)) {
      const values = body.get(heading.key) ?? [];
      values.push(heading.keepLabel ? label.trim() + '：' + value : value);
      body.set(heading.key, values);
    }
    section = undefined;
  };
  const begin = (label: string, value: string) => {
    flush();
    const heading = headings.get(normalizeHeading(label));
    if (heading && heading.kind !== 'boundary') section = { heading, label, lines: [value.trim()] };
  };
  const append = (value: string) => section?.lines.push(value.trim());

  for (const originalLine of text
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .split('\n')) {
    const line = originalLine.trim();
    if (normalizeHeading(line) === normalizeHeading(template.titleKey)) {
      flush();
      if (!draft.title) draft.title = template.titleKey;
      continue;
    }
    const wholeHeading = standalone.exec(line);
    if (wholeHeading) {
      begin(wholeHeading[1]!, '');
      continue;
    }
    labeled.lastIndex = 0;
    const matches = [...line.matchAll(labeled)];
    if (matches.length) {
      const before = line.slice(0, matches[0]!.index).trim();
      if (before) {
        if (metadataWithoutColon.test(before)) flush();
        else append(before);
      }
      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index]!;
        const end = matches[index + 1]?.index ?? line.length;
        begin(match[2]!, line.slice(match.index + match[0].length, end));
      }
    } else if (metadataWithoutColon.test(line) || /^[^:：]{1,24}[:：]$/u.test(line)) {
      // A separate unknown heading is a boundary; vital signs such as “血压：120/80” remain content.
      flush();
    } else {
      append(line);
    }
  }
  flush();
  draft.body = Object.fromEntries([...body].map(([key, values]) => [key, values.join('\n')]));
  return draft;
}
