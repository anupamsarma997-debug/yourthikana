import React, { useState } from 'react';
import { Smartphone, Copy, ImagePlus, CheckCircle2, Share2 } from 'lucide-react';
import { auth, storage } from '../lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';

const UPI_ID = 'anupamsarma997-1@okhdfcbank';

type Props = {
  amount: number;
  title: string;
  applicationId: string;
  propertyTitle: string;
  storageFolder: 'verification-documents' | 'search-boost-documents';
  onShared: (utr: string) => Promise<void>;
  disabled?: boolean;
  initialUtr?: string;
};

export const PaymentProofShare: React.FC<Props> = ({ amount, title, applicationId, propertyTitle, storageFolder, onShared, disabled, initialUtr = '' }) => {
  const [file, setFile] = useState<File | null>(null);
  const [utr, setUtr] = useState(initialUtr);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [proofUploaded, setProofUploaded] = useState(false);
  const cleanUtr = utr.trim();
  const validUtr = /^[A-Za-z0-9-]{8,30}$/.test(cleanUtr);
  const encodedQuery = new URLSearchParams({ pa: UPI_ID, pn: 'YourThikana', am: String(amount), cu: 'INR', tn: `${title} - ${propertyTitle}` }).toString();
  const upiIntent = `intent://pay?${encodedQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

  const openUpi = () => {
    setMessage('UPI app chooser khulna chahiye. App na khule to UPI ID copy karke GPay / PhonePe mein manually pay karein.');
    window.location.href = upiIntent;
  };

  const uploadProof = async () => {
    const user = auth?.currentUser;
    if (!user || !storage) { setMessage('Sign in ya Firebase Storage available nahi hai.'); return; }
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setMessage('JPG, PNG ya WEBP payment screenshot select karein.'); return; }
    if (file.size > 8 * 1024 * 1024) { setMessage('Screenshot 8 MB se chhota hona chahiye.'); return; }
    if (!validUtr) { setMessage('Payment app se asli 8–30 character UTR / Transaction ID dalein.'); return; }
    setBusy(true); setMessage('');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${storageFolder}/${user.uid}/${applicationId}/payment-${Date.now()}-${safeName}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      await onShared(cleanUtr);
      setProofUploaded(true);
      setMessage('Payment screenshot securely upload ho gaya aur UTR submit ho gaya. Ab WhatsApp par proof share kar sakte hain. Admin bank credit verify karega; tab tak payment Pending rahega.');
    } catch (error: any) {
      console.error('Payment proof upload failed:', error);
      setMessage(error?.message || 'Screenshot upload nahi hua. Firebase Storage rules check karke retry karein.');
    } finally { setBusy(false); }
  };

  const shareProof = async () => {
    if (!file || !proofUploaded) return;
    const messageText = `Hello YourThikana Support, I submitted ${title} payment of ₹${amount} for ${propertyTitle}. Application ID: ${applicationId}. UTR: ${cleanUtr}. Please verify the payment proof.`;
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'YourThikana payment proof', text: messageText, files: [file] });
        return;
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
    }
    window.open(`https://wa.me/919101280465?text=${encodeURIComponent(messageText + ' Please attach the payment screenshot from your phone gallery.')}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section aria-label="Payment and screenshot upload" className="w-full min-w-0 space-y-4 rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 text-[#E5EAF3]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#5EEAD4]">UPI payment</p>
        <h4 className="mt-1 text-xl font-black text-white">Pay ₹{amount}</h4>
        <p className="mt-1 text-sm leading-5 text-[#9AA7BD]">Pay button se UPI app kholein. Payment hone ke baad screenshot yahin upload karein.</p>
      </div>
      <button type="button" onClick={openUpi} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#14B8A6] px-4 py-3 text-base font-extrabold text-[#04201C]">
        <Smartphone className="h-5 w-5" /> Open GPay / PhonePe / UPI App
      </button>
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#3A4866] bg-[#0B1220] p-3">
        <div className="min-w-0 flex-1"><p className="text-xs text-[#9AA7BD]">UPI ID</p><p className="break-all text-sm font-bold text-white">{UPI_ID}</p></div>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(UPI_ID); setCopied(true); } catch { setMessage('UPI ID ko long-press karke copy karein.'); } }} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-[#3A4866] px-3 text-xs font-bold text-[#5EEAD4]"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy ID'}</button>
      </div>
      <div className="space-y-2">
        <label htmlFor={`payment-proof-${applicationId}`} className="block text-sm font-bold">1. Payment screenshot upload <span className="text-rose-400">*Required</span></label>
        <input id={`payment-proof-${applicationId}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} disabled={disabled || busy || proofUploaded} className="block min-h-12 w-full rounded-xl border border-dashed border-[#3A4866] bg-[#0B1220] p-2 text-sm file:mr-2 file:min-h-10 file:rounded-lg file:border-0 file:bg-[#243049] file:px-3 file:font-bold file:text-[#5EEAD4]" />
        {file && <p className="flex items-center gap-2 break-all text-xs text-[#5EEAD4]"><CheckCircle2 className="h-4 w-4 shrink-0" />{file.name}</p>}
        <label htmlFor={`payment-utr-${applicationId}`} className="block pt-2 text-sm font-bold">2. UTR / Transaction ID <span className="text-rose-400">*Required</span></label>
        <input id={`payment-utr-${applicationId}`} value={utr} onChange={e => setUtr(e.target.value.replace(/\s/g, '').slice(0, 30))} disabled={disabled || busy || proofUploaded} maxLength={30} placeholder="GPay / PhonePe se actual UTR dalein" className="min-h-12 w-full rounded-xl border border-[#3A4866] bg-[#0B1220] p-3 text-base text-white" />
        <button type="button" disabled={disabled || busy || !file || !validUtr} onClick={uploadProof} className="flex min-h-12 w-full items-center justify-center rounded-[14px] bg-[#2563EB] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40">{busy ? 'Uploading…' : 'Upload Payment Screenshot & Submit UTR'}</button>
      </div>
        {proofUploaded && <button type="button" onClick={shareProof} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#25D366] bg-[#123B2B] px-4 py-3 text-sm font-extrabold text-[#86EFAC]"><Share2 className="h-5 w-5" />Share Payment Proof on WhatsApp</button>}
      <p className="text-xs leading-5 text-[#9AA7BD]">Payment sirf admin ke bank statement mein credit confirm hone ke baad verified hoga. Screenshot ya UTR se automatic approval nahi milega.</p>
      {message && <p role="status" aria-live="polite" className="break-words rounded-xl bg-[#30250F] p-3 text-sm text-[#FBBF24]">{message}</p>}
    </section>
  );
};
