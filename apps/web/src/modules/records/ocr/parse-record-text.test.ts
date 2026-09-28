import type { MedicalRecordTemplateDefinition } from '@doctor/contracts';
import { describe, expect, it } from 'vitest';
import { parseRecordText } from './parse-record-text';

function template(
  id: MedicalRecordTemplateDefinition['id'],
  titleKey: string,
  fields: [string, string][],
): MedicalRecordTemplateDefinition {
  return {
    id,
    version: 1,
    titleKey,
    subtitleKey: '',
    fields: fields.map(([key, labelKey]) => ({
      key,
      labelKey,
      maxLength: 5000,
      requiredOnSubmit: true,
    })),
  };
}

const outpatient = template('outpatient', '门诊病历', [
  ['chiefComplaint', '主诉'],
  ['presentIllness', '现病史'],
  ['medicalAndAllergyHistory', '既往史与过敏史'],
  ['examinationAndInvestigations', '查体与辅助检查'],
  ['assessmentAndPlan', '评估及诊疗计划'],
]);
const followup = template('followup', '慢病随访记录', [
  ['followUpPurpose', '本次随访目的'],
  ['healthMonitoringData', '健康监测数据'],
  ['currentMedicationAndAdherence', '当前用药与依从性'],
  ['lifestyleAndCare', '生活方式与照护情况'],
  ['nextFollowUpArrangement', '下次随访安排'],
]);
const consultation = template('consult', '会诊记录', [
  ['consultationRequestAndPurpose', '会诊申请与目的'],
  ['participatingClinicians', '参与科室与医生'],
  ['caseSummary', '病情摘要'],
  ['discussionNotes', '会诊讨论记录'],
  ['combinedOpinionAndNextSteps', '综合意见与后续安排'],
]);

describe('parseRecordText', () => {
  it('extracts explicit outpatient fields and replaces a generic page title with an explicit title', () => {
    const result = parseRecordText(
      '门诊病历\n姓名：测试患者\n病历标题：发热复查\n主诉：发热3天\n现病史：昨日最高38.2℃\n既往史与过敏史：无已知过敏\n查体与辅助检查：咽红\n诊断：急性上呼吸道感染？\n评估及诊疗计划：复诊，待检查后评估',
      outpatient,
    );
    expect(result).toEqual({
      title: '发热复查',
      diagnosis: '急性上呼吸道感染？',
      body: {
        chiefComplaint: '发热3天',
        presentIllness: '昨日最高38.2℃',
        medicalAndAllergyHistory: '无已知过敏',
        examinationAndInvestigations: '咽红',
        assessmentAndPlan: '复诊，待检查后评估',
      },
    });
  });

  it('does not guess a diagnosis, title or target field from free text', () => {
    expect(
      parseRecordText(
        '测试医院\n张某，男，55岁。血糖升高，服用二甲双胍。\n考虑糖尿病。',
        outpatient,
      ),
    ).toEqual({ title: '', diagnosis: '', body: {} });
    expect(
      parseRecordText(
        '主诉：发热、咳嗽3天\n现病史：家属提及诊断为流感\n治疗方案：按原医嘱服药',
        outpatient,
      ).diagnosis,
    ).toBe('');
  });

  it('stops fields at patient metadata, signatures and medical sections outside the selected template', () => {
    const result = parseRecordText(
      '主诉：咳嗽\n姓名：测试患者\n性别：女\n联系电话：13800000000\n随访目的：复查血压\n现病史：咳嗽3天\n家族史：家属患高血压\n诊断：待查\n医生签名：测试医生',
      outpatient,
    );
    expect(result.body).toEqual({ chiefComplaint: '咳嗽', presentIllness: '咳嗽3天' });
    expect(result.diagnosis).toBe('待查');
    expect(JSON.stringify(result)).not.toContain('13800000000');
    expect(JSON.stringify(result)).not.toContain('测试医生');
  });

  it('handles same-line labeled sections and metadata without copying patient identity', () => {
    const result = parseRecordText(
      '姓名：测试患者 年龄：43 主诉：发热3天 现病史：最高38.2℃\n诊断：待查 医师：测试医生',
      outpatient,
    );
    expect(result.body).toEqual({ chiefComplaint: '发热3天', presentIllness: '最高38.2℃' });
    expect(result.diagnosis).toBe('待查');
  });

  it('treats metadata with a missing OCR colon as a boundary', () => {
    const result = parseRecordText(
      '主诉：发热\n姓名 测试患者\n联系电话 13800000000\n现病史：昨日开始',
      outpatient,
    );
    expect(result.body).toEqual({ chiefComplaint: '发热', presentIllness: '昨日开始' });
  });

  it('does not carry metadata before an inline clinical heading into a previous section', () => {
    const result = parseRecordText('主诉：发热\n姓名 测试患者 现病史：昨日开始', outpatient);
    expect(result.body).toEqual({ chiefComplaint: '发热', presentIllness: '昨日开始' });
  });

  it('supports spaced Chinese headings, enumerated headings, full-width colon and standalone headings', () => {
    const result = parseRecordText(
      '\uFEFF门 诊 病 历\r\n一、主 诉 ： 咳嗽\r\n（二）现 病 史\r\n3天前开始\r\n初 步 诊 断：待查',
      outpatient,
    );
    expect(result.title).toBe('门诊病历');
    expect(result.body).toEqual({ chiefComplaint: '咳嗽', presentIllness: '3天前开始' });
    expect(result.diagnosis).toBe('待查');
  });

  it('preserves numeric values, units, dosage, uncertainty and multiline lists exactly', () => {
    const result = parseRecordText(
      '查体与辅助检查：\n血压：120/80 mmHg\n体温：37.8℃\n\nHbA1c 6.5%\n诊断：肺炎？（待排）\n评估及诊疗计划：\n1. 原记录剂量 0.25 mg，每日2次\n2. 3天后复诊',
      outpatient,
    );
    expect(result.body.examinationAndInvestigations).toBe(
      '血压：120/80 mmHg\n体温：37.8℃\n\nHbA1c 6.5%',
    );
    expect(result.diagnosis).toBe('肺炎？（待排）');
    expect(result.body.assessmentAndPlan).toBe('1. 原记录剂量 0.25 mg，每日2次\n2. 3天后复诊');
  });

  it('keeps sub-section labels when combining history, examination and plan fields', () => {
    const result = parseRecordText(
      '既往史：高血压5年\n过敏史：青霉素过敏\n体格检查：咽红\n辅助检查：待查\n处理意见：休息\n医嘱：3天后复查',
      outpatient,
    );
    expect(result.body).toEqual({
      medicalAndAllergyHistory: '既往史：高血压5年\n过敏史：青霉素过敏',
      examinationAndInvestigations: '体格检查：咽红\n辅助检查：待查',
      assessmentAndPlan: '处理意见：休息\n医嘱：3天后复查',
    });
  });

  it('extracts follow-up headings without importing outpatient or consultation fields', () => {
    const result = parseRecordText(
      '慢病随访记录\n随访目的：血压复查\n健康监测数据：家庭血压130/80\n当前用药与依从性：按时服药\n生活方式与照护情况：每日步行20分钟\n下次随访：2周后\n主诉：这一段不是随访模板字段\n会诊意见：这一段也不应进入随访',
      followup,
    );
    expect(result.body).toEqual({
      followUpPurpose: '血压复查',
      healthMonitoringData: '家庭血压130/80',
      currentMedicationAndAdherence: '按时服药',
      lifestyleAndCare: '每日步行20分钟',
      nextFollowUpArrangement: '2周后',
    });
  });

  it('extracts consultation fields while keeping clinician names in their explicit clinical field', () => {
    const result = parseRecordText(
      '会诊记录\n会诊申请与目的：协助诊断\n参与科室与医生：心内科，测试医生\n病情摘要：胸闷2天\n会诊讨论记录：进一步检查\n综合意见与后续安排：完成检查后复评',
      consultation,
    );
    expect(result.body).toEqual({
      consultationRequestAndPurpose: '协助诊断',
      participatingClinicians: '心内科，测试医生',
      caseSummary: '胸闷2天',
      discussionNotes: '进一步检查',
      combinedOpinionAndNextSteps: '完成检查后复评',
    });
  });

  it('supports English headings without changing the case or spelling of their contents', () => {
    const result = parseRecordText(
      'RECORD TITLE: Follow-up\nchief complaint: Fever for 3 days\nHPI: T 38.2 C\nPast medical history: None recorded\nALLERGIES: Penicillin\nDiagnosis: Pneumonia?\nAssessment and plan: Review in 3 days',
      outpatient,
    );
    expect(result.title).toBe('Follow-up');
    expect(result.diagnosis).toBe('Pneumonia?');
    expect(result.body.chiefComplaint).toBe('Fever for 3 days');
    expect(result.body.medicalAndAllergyHistory).toBe(
      'Past medical history：None recorded\nALLERGIES：Penicillin',
    );
    expect(result.body.assessmentAndPlan).toBe('Review in 3 days');
  });

  it('uses the selected catalogue as an allow-list and recognizes new catalogue labels', () => {
    const custom = template('outpatient', '门诊病历', [['localField', '专科检查（补充）']]);
    const result = parseRecordText(
      '主诉：发热\n诊疗计划：复查\n专科检查（补充）：测试内容',
      custom,
    );
    expect(result.body).toEqual({ localField: '测试内容' });
  });

  it('keeps repeated sections and overlong text for review instead of silently deleting or truncating it', () => {
    const value = '详细病史'.repeat(1500);
    const result = parseRecordText('现病史：' + value + '\n现病史：补充说明', outpatient);
    expect(result.body.presentIllness).toBe(value + '\n补充说明');
  });

  it('does not append unrecognized standalone section contents to the preceding field', () => {
    const result = parseRecordText(
      '主诉：发热\n未识别章节：\n未经分类的内容\n诊断：待查\n医师签名：',
      outpatient,
    );
    expect(result.body).toEqual({ chiefComplaint: '发热' });
    expect(result.diagnosis).toBe('待查');
  });

  it('ignores empty headings and documents instead of manufacturing values', () => {
    expect(parseRecordText('主诉：\n现病史：\n诊断：\n姓名：测试患者', outpatient)).toEqual({
      title: '',
      diagnosis: '',
      body: {},
    });
    expect(parseRecordText('', outpatient)).toEqual({ title: '', diagnosis: '', body: {} });
  });
});
