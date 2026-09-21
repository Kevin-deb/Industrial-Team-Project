import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Languages, LockKeyhole, Mail, Stethoscope, Upload } from 'lucide-react';
import { useI18n } from '../shared/i18n';
import './auth.css';

type BeginResult = { challengeId: string; emailHint: string; demoCode?: string };
type VerifyResult = { photoTicket: string };

export function LoginPage({
  beginLogin,
  verifyEmail,
  completePhotoCheck,
}: {
  beginLogin: (input: { account: string; password: string }) => Promise<BeginResult>;
  verifyEmail: (input: { challengeId: string; code: string }) => Promise<VerifyResult>;
  completePhotoCheck: (input: {
    ticket: string;
    captureMethod: 'camera' | 'upload';
    photoDataUrl: string;
  }) => Promise<void>;
}) {
  const { t, language, setLanguage } = useI18n();
  const [step, setStep] = useState<'password' | 'email' | 'photo'>('password');
  const [account, setAccount] = useState('lin.zhiyuan');
  const [password, setPassword] = useState('123456');
  const [challenge, setChallenge] = useState<BeginResult | null>(null);
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [photo, setPhoto] = useState('');
  const [method, setMethod] = useState<'camera' | 'upload'>('camera');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('验证失败，请重试。'));
    } finally {
      setBusy(false);
    }
  }

  async function openCamera() {
    await perform(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    });
  }

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth, 720);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL('image/jpeg', 0.82));
    setMethod('camera');
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }

  function upload(file?: File) {
    if (!file || !/^image\/(png|jpeg)$/.test(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result));
      setMethod('upload');
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <header className="auth-brand">
          <div className="auth-mark"><Stethoscope size={25} /></div>
          <div><strong>Care<span>Link</span></strong><small>{t('医生服务工作台')}</small></div>
          <button className="auth-language" onClick={() => setLanguage(language === 'en' ? 'zh-CN' : 'en')}>
            <Languages size={16} /> {language === 'en' ? '中文' : 'EN'}
          </button>
        </header>
        <div className="auth-heading">
          <p>{t('医院人员身份验证')}</p>
          <h1>{t('登录 CareLink')}</h1>
          <span>{t('仅限已审核的医生与授权人员使用')}</span>
        </div>
        <div className="auth-steps" aria-label={t('登录进度')}>
          {['password', 'email', 'photo'].map((item, index) => (
            <span key={item} className={step === item ? 'active' : ''}>{index + 1}</span>
          ))}
        </div>
        {step === 'password' && (
          <form onSubmit={(event) => { event.preventDefault(); void perform(async () => {
            const next = await beginLogin({ account, password }); setChallenge(next); setStep('email');
          }); }}>
            <label>{t('账号或邮箱')}<input aria-label={t('账号或邮箱')} value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="username" /></label>
            <label>{t('密码')}<div className="auth-input-icon"><LockKeyhole size={17} /><input aria-label={t('密码')} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" /></div></label>
            <button className="auth-primary" disabled={busy}>{t('继续')}</button>
          </form>
        )}
        {step === 'email' && challenge && (
          <form onSubmit={(event) => { event.preventDefault(); void perform(async () => {
            const next = await verifyEmail({ challengeId: challenge.challengeId, code }); setTicket(next.photoTicket); setStep('photo');
          }); }}>
            <div className="auth-message"><Mail size={20} /><div><strong>{t('验证工作邮箱')}</strong><p>{t('验证码已发送至')} {challenge.emailHint}</p></div></div>
            {challenge.demoCode && <div className="demo-code">{t('本地演示邮件验证码')}：<b>{challenge.demoCode}</b></div>}
            <label>{t('邮箱验证码')}<input aria-label={t('邮箱验证码')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
            <button className="auth-primary" disabled={busy || code.length !== 6}>{t('验证邮箱')}</button>
          </form>
        )}
        {step === 'photo' && (
          <div>
            <div className="auth-message"><Camera size={20} /><div><strong>{t('演示拍照核验')}</strong><p>{t('本步骤仅采集演示照片，不执行真实人脸识别或活体检测。')}</p></div></div>
            <div className="photo-stage">
              {photo ? <img src={photo} alt={t('待提交的演示照片')} /> : <video ref={videoRef} autoPlay playsInline muted />}
            </div>
            <div className="photo-actions">
              <button type="button" onClick={() => void openCamera()}><Camera size={17} />{t('打开摄像头')}</button>
              <button type="button" onClick={capture}>{t('拍照')}</button>
              <label className="photo-upload"><Upload size={17} />{t('上传照片')}<input type="file" accept="image/png,image/jpeg" onChange={(e) => upload(e.target.files?.[0])} /></label>
            </div>
            <button className="auth-primary" disabled={busy || !photo} onClick={() => void perform(() => completePhotoCheck({ ticket, captureMethod: method, photoDataUrl: photo }))}>
              <CheckCircle2 size={18} />{t('完成演示核验')}
            </button>
          </div>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <footer>{t('所有账号与患者资料均为合成演示数据')}</footer>
      </section>
    </main>
  );
}
