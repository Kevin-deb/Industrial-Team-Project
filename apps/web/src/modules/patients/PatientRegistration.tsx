import { useCallback, useState } from 'react';
import type { PatientArchive } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { FeatureDialog } from '../ui';
import { PatientEditor } from './PatientEditor';

const initialPatient: PatientArchive = {
  id: '',
  name: '',
  gender: '女',
  age: NaN,
  phone: '',
  diagnosis: '',
  tags: [],
  status: 'follow-up',
  lastVisit: '',
  nextFollowUp: '',
  assignedDoctorId: '',
  allergies: [],
  medicalHistory: [],
  careSummary: '',
  symptoms: [],
  allergyStatus: 'unknown',
  version: 1,
  canEdit: true,
};

export function PatientRegistration({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (patient: PatientArchive) => void;
}) {
  const { t } = useI18n();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (!busy && (!dirty || window.confirm(t('放弃尚未保存的建档内容？')))) onClose();
  }, [busy, dirty, onClose, t]);
  return (
    <FeatureDialog title={t('新建患者档案')} onClose={close} wide>
      <PatientEditor
        patient={initialPatient}
        etag={null}
        registrationKey={requestKey}
        onDirty={setDirty}
        onBusy={setBusy}
        onCancel={close}
        onReload={close}
        onSaved={(patient) => onCreated(patient)}
      />
    </FeatureDialog>
  );
}
