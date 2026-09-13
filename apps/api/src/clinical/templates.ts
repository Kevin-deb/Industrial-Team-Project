import type { MedicalRecordTemplateId } from '@doctor/contracts';

export const clinicalTemplateFields: Record<MedicalRecordTemplateId, readonly string[]> = {
  outpatient: [
    'chiefComplaint',
    'presentIllness',
    'medicalAndAllergyHistory',
    'examinationAndInvestigations',
    'assessmentAndPlan',
  ],
  followup: [
    'followUpPurpose',
    'healthMonitoringData',
    'currentMedicationAndAdherence',
    'lifestyleAndCare',
    'nextFollowUpArrangement',
  ],
  consult: [
    'consultationRequestAndPurpose',
    'participatingClinicians',
    'caseSummary',
    'discussionNotes',
    'combinedOpinionAndNextSteps',
  ],
};
