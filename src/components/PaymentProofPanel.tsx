import React, { useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, Copy, ImagePlus, Share2, Upload, Wallet } from 'lucide-react';
import { auth, storage } from '../lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';

const UPI_ID = 'anupamsarma997-1@okhdfcbank';

type Props = {
  serviceName: string;
  amount: number;
  billingLabel: string;
  disabled?: boolean;
  onSubmit: (utr: string, proofPath: string) => Promise<void>;
};

export const PaymentProofPanel: React.FC<Props> = ({ serviceName, amount, billingLabel, disabled, onSubmit }) => {
  const [file, setFile] = useState<File | null>(null);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [proofPath, setProofPath] = useState('');
  const [message, setMessage] = useState('');
  const user = auth?.currentUser;

  const validFile = (candidate: File) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type) &&
    candidate.size > 0 && candidate.size <= 10 * 1024 * 1024;

  const payUrl = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('YourThikana')}&am=${amount}&cu=INR&tn=${encodeURIComponent(serviceName)}`;

  const handleSubmit = async () => {
    const cleanUtr = utr.trim();
    if (!user || !storage) { setMessage('Please owner account se sign in karein.'); return; }
    if (!file || !validFile(file)) { setMessage('Payment screenshot PNG, JPG ya WEBP mein (maximum 10 MB) upload karein.'); return; }
    if (!/^[A-Za-z0-9-]{8,30}$/.test(cleanUtr)) { setMessage('Asli UTR / Transaction ID 8–30 characters mein enter karein.'); return; }
    setBusy(true); setMessage('');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-70) || 'payment-proof';
      const path = `payment-proofs/${user.uid}/${Date.now()}-${safeName}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type, customMetadata: { ownerUid: user.uid, serviceName } });
      await onSubmit(cleanUtr, path);
      setProofPath(path);
      setMessage('Payment proof submit ho gaya. Admin bank/UPI credit verify karega; approval se pehle service activate nahi hogi.');
    } catch (error: any) {
      setMessage(error?.message || 'Payment proof submit nahi ho paya. Dobara try karein.');
    } finally { setBusy(false); }
  };

  const share = () => {
    const text = `Hi YourThikana, I submitted ${serviceName} payment of ₹${amount}. UTR: ${utr.trim()}. Payment screenshot has been uploaded in my application. Please verify it. I will attach the same screenshot here if required.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6 space-y-4">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-green-50 p-4 dark:from-emerald-950/50 dark:to-green-950/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">{serviceName}</p><h3 className="mt-1 text-xl font-black text-slate-950 dark:text-white">₹{amount.toLocaleString('en-IN')} <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{billingLabel}</span></h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Your listing service starts only after admin confirms payment.</p></div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"><Clock3 className="h-4 w-4"/> Payment pending</span>
        </div>
      </div>

      <a href={payUrl} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-700 px-4 py-4 text-base font-extrabold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-300">
        <Wallet className="h-5 w-5"/> Pay ₹{amount.toLocaleString('en-IN')} with UPI <ArrowUpRight className="h-5 w-5"/>
      </a>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
        <div className="min-w-0"><p className="text-[11px] text-slate-500">UPI ID</p><p className="break-all text-sm font-bold text-slate-900 dark:text-white">{UPI_ID}</p></div>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(UPI_ID); setMessage('UPI ID copied.'); }} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-emerald-700 px-3 text-xs font-bold text-emerald-800 dark:text-emerald-300"><Copy className="h-4 w-4"/> Copy</button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {['Pay', 'Upload proof', 'Admin review'].map((step, index) => <div key={step} className="space-y-1"><div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${index === 0 ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'}`}>{index + 1}</div><p className={`text-[11px] font-bold sm:text-xs ${index === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>{step}</p></div>)}
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-700">
        <div><h4 className="text-lg font-extrabold text-slate-950 dark:text-white">Payment proof</h4><p className="text-sm text-slate-500">Upload payment screenshot and enter real UTR.</p></div>
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-600 bg-emerald-50/50 px-3 text-center dark:bg-emerald-950/20">
          {file ? <CheckCircle2 className="h-8 w-8 text-emerald-700"/> : <ImagePlus className="h-8 w-8 text-emerald-800 dark:text-emerald-300"/>}
          <span className="text-sm font-bold text-slate-900 dark:text-white">{file ? file.name : 'Add payment screenshot'}</span>
          <span className="text-xs text-slate-500">PNG, JPG, WEBP up to 10 MB</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next && validFile(next) ? next : null); if (next && !validFile(next)) setMessage('Only PNG, JPG or WEBP up to 10 MB allowed.'); }} />
        </label>
        <label className="block space-y-1"><span className="text-sm font-bold text-slate-900 dark:text-white">UPI Transaction ID (UTR) *</span><input value={utr} onChange={(event) => setUtr(event.target.value)} minLength={8} maxLength={30} autoComplete="off" placeholder="Enter your real UTR number" className="min-h-14 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"/></label>
        <button type="button" disabled={busy || disabled || !file || !utr.trim() || Boolean(proofPath)} onClick={() => void handleSubmit()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-5 w-5"/>{busy ? 'Uploading securely…' : proofPath ? 'Payment proof submitted' : 'Submit payment proof'}</button>
        <button type="button" disabled={!proofPath} onClick={share} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 bg-white px-4 text-sm font-extrabold text-emerald-800 disabled:opacity-50 dark:bg-slate-800 dark:text-emerald-300"><Share2 className="h-5 w-5"/> Share payment proof on WhatsApp</button>
        {message && <p role="status" className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">{message}</p>}
      </div>
      <p className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 className="mr-1 inline h-4 w-4"/> Service activates only after admin verifies the payment in the bank/UPI account.</p>
    </section>
  );
};
