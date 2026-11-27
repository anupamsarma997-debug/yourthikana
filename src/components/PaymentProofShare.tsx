import React, { useState } from 'react';
import { Smartphone, Copy, CheckCircle2, MessageCircle } from 'lucide-react';

const UPI_ID = 'anupamsarma997-1@okhdfcbank';
const SUPPORT_NUMBER = '+91 9101280465';

type Props = {
  amount: number;
  title: string;
  applicationId: string;
  propertyTitle: string;
  onSubmitted: (utr: string) => Promise<void>;
  disabled?: boolean;
  initialUtr?: string;
};

export const PaymentProofShare: React.FC<Props> = ({ amount, title, applicationId, propertyTitle, onSubmitted, disabled, initialUtr = '' }) => {
  const [file, setFile] = useState<File | null>(null);
  const [utr, setUtr] = useState(initialUtr);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const cleanUtr = utr.trim();
  const validUtr = /^[A-Za-z0-9-]{8,30}$/.test(cleanUtr);
  const validFile = !!file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 8 * 1024 * 1024;
  const encodedQuery = new URLSearchParams({ pa: UPI_ID, pn: 'YourThikana', am: String(amount), cu: 'INR', tn: `${title} - ${propertyTitle}` }).toString();
  const upiIntent = `intent://pay?${encodedQuery}#Intent;scheme=upi;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

  const openUpi = () => {
    setMessage('UPI app chooser khulna chahiye. App na khule to UPI ID copy karke GPay / PhonePe mein manually pay karein.');
    window.location.href = upiIntent;
  };

  const shareProof = () => {
    if (!validFile || !file) {
      setMessage('JPG, PNG ya WEBP payment screenshot select karein (maximum 8 MB).');
      return;
    }
    if (!validUtr) {
      setMessage('WhatsApp par bhejne se pehle actual UTR / Transaction ID dalein.');
      return;
    }

    const messageText = [
      'YourThikana payment proof',
      `Service: ${title}`,
      `Amount: ₹${amount}`,
      `Property: ${propertyTitle}`,
      `Application ID: ${applicationId}`,
      `UTR: ${cleanUtr}`,
      'Please find my payment screenshot attached.'
    ].join('\n');

    // Open the configured support number directly; do not show Android's generic share chooser.
    // A wa.me URL cannot attach a locally selected file, so the user attaches it in WhatsApp.
    setShareNotice('Direct Admin WhatsApp chat khul rahi hai. Chat mein attachment (+) > Gallery se payment screenshot select karke Send dabayein.');
    const whatsappNumber = SUPPORT_NUMBER.replace(/\\D/g, '');
    window.location.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(messageText)}`;
  };

  const submitUtr = async () => {
    if (!validFile) { setMessage('Pehle payment screenshot select karein. Screenshot Storage mein upload nahi hoga; WhatsApp chat mein manually attach karein.'); return; }
    if (!validUtr) { setMessage('Payment app se asli 8–30 character UTR / Transaction ID dalein.'); return; }
    setBusy(true); setMessage('');
    try {
      await onSubmitted(cleanUtr);
      setMessage('UTR admin review ke liye submit ho gaya. Screenshot WhatsApp par manually Send karna zaroori hai. Admin actual bank credit independently verify karega.');
    } catch (error: any) {
      console.error('Payment UTR submission failed:', error);
      setMessage(error?.message || 'UTR submit nahi hua. Please retry karein.');
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="UPI payment and WhatsApp proof sharing" className="w-full min-w-0 space-y-4 rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 text-[#E5EAF3]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#5EEAD4]">UPI payment</p>
        <h4 className="mt-1 text-xl font-black text-white">Pay ₹{amount}</h4>
        <p className="mt-1 text-sm leading-5 text-[#9AA7BD]">Payment karne ke baad screenshot select karein, WhatsApp par bhejein aur UTR submit karein. Screenshot Firebase Storage mein save nahi hoga.</p>
      </div>
      <button type="button" onClick={openUpi} disabled={disabled || busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#14B8A6] px-4 py-3 text-base font-extrabold text-[#04201C] disabled:opacity-40">
        <Smartphone className="h-5 w-5" /> Open GPay / PhonePe / UPI App
      </button>
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#3A4866] bg-[#0B1220] p-3">
        <div className="min-w-0 flex-1"><p className="text-xs text-[#9AA7BD]">UPI ID</p><p className="break-all text-sm font-bold text-white">{UPI_ID}</p></div>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(UPI_ID); setCopied(true); } catch { setMessage('UPI ID ko long-press karke copy karein.'); } }} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-[#3A4866] px-3 text-xs font-bold text-[#5EEAD4]"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy ID'}</button>
      </div>
      <div className="space-y-2">
        <label htmlFor={`payment-proof-${applicationId}`} className="block text-sm font-bold">1. Select payment screenshot <span className="text-rose-400">*Required</span></label>
        <input id={`payment-proof-${applicationId}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { setFile(e.target.files?.[0] || null); setShareNotice(''); }} disabled={disabled || busy} className="block min-h-12 w-full rounded-xl border border-dashed border-[#3A4866] bg-[#0B1220] p-2 text-sm file:mr-2 file:min-h-10 file:rounded-lg file:border-0 file:bg-[#243049] file:px-3 file:font-bold file:text-[#5EEAD4]" />
        {file && <p className="flex items-center gap-2 break-all text-xs text-[#5EEAD4]"><CheckCircle2 className="h-4 w-4 shrink-0" />{file.name} · {Math.ceil(file.size / 1024)} KB (device only)</p>}
        <label htmlFor={`payment-utr-${applicationId}`} className="block pt-2 text-sm font-bold">2. UTR / Transaction ID <span className="text-rose-400">*Required</span></label>
        <input id={`payment-utr-${applicationId}`} value={utr} onChange={e => setUtr(e.target.value.replace(/\s/g, '').slice(0, 30))} disabled={disabled || busy} maxLength={30} placeholder="GPay / PhonePe se actual UTR dalein" className="min-h-12 w-full rounded-xl border border-[#3A4866] bg-[#0B1220] p-3 text-base text-white" />
        <button type="button" disabled={disabled || busy || !validFile || !validUtr} onClick={shareProof} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#25D366] bg-[#123B2B] px-4 py-3 text-sm font-extrabold text-[#86EFAC] disabled:opacity-40"><MessageCircle className="h-5 w-5" />Open Admin WhatsApp</button>
        {shareNotice && <p role="status" className="rounded-xl bg-[#0B302D] p-3 text-xs leading-5 text-[#99F6E4]">{shareNotice}</p>}
        <button type="button" disabled={disabled || busy || !validFile || !validUtr} onClick={submitUtr} className="flex min-h-12 w-full items-center justify-center rounded-[14px] bg-[#2563EB] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40">{busy ? 'Submitting…' : 'Submit UTR for Admin Review'}</button>
      </div>
      <p className="text-xs leading-5 text-[#9AA7BD]">Button dabane par Admin WhatsApp (+91 9101280465) chat seedhi khulegi aur payment details message mein bhari hongi. Screenshot Firebase Storage par upload nahi hota: WhatsApp mein + > Gallery se screenshot attach karke Send dabayein. Website delivery confirm nahi kar sakti; Admin bank credit verify karega.</p>
      {message && <p role="status" aria-live="polite" className="break-words rounded-xl bg-[#30250F] p-3 text-sm text-[#FBBF24]">{message}</p>}
    </section>
  );
};
