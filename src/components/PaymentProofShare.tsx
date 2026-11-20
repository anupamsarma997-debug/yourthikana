import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, MessageCircle, Smartphone, CheckCircle2 } from 'lucide-react';

const UPI_ID = 'anupamsarma997-1@okhdfcbank';

type Props = {
  amount: number;
  title: string;
  applicationId: string;
  propertyTitle: string;
  onShared: (utr: string) => Promise<void>;
  disabled?: boolean;
  initialUtr?: string;
};

export const PaymentProofShare: React.FC<Props> = ({ amount, title, applicationId, propertyTitle, onShared, disabled, initialUtr = '' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [utr, setUtr] = useState(initialUtr);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (initialUtr) setUtr(initialUtr);
  }, [initialUtr]);

  const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('YourThikana')}&am=${amount}&cu=INR&tn=${encodeURIComponent(`${title} - ${propertyTitle}`)}`;
  const cleanUtr = utr.trim();
  const validUtr = /^[A-Za-z0-9-]{8,30}$/.test(cleanUtr);

  const sendProof = async () => {
    setMessage('');
    if (!file || !file.type.startsWith('image/')) {
      setMessage('Pehle payment ka asli screenshot select karein.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage('Screenshot 10 MB se chhota hona chahiye.');
      return;
    }
    if (!validUtr) {
      setMessage('Apne UPI app se asli 8–30 character ka UTR / transaction ID bharein. Koi UTR khud se generate nahi hoga.');
      return;
    }
    if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [file] })) {
      setMessage('Image attachment share is browser mein supported nahi hai. Android Chrome mein website kholkar try karein.');
      return;
    }

    const text = `YourThikana ${title} payment proof\nApplication ID: ${applicationId}\nProperty: ${propertyTitle}\nAmount: ₹${amount}\nUPI UTR: ${cleanUtr}\nPlease verify the screenshot and bank credit manually. Admin WhatsApp: +91 9101280465.`;
    setBusy(true);
    try {
      await navigator.share({ files: [file], title: 'YourThikana payment screenshot', text });
      await onShared(cleanUtr);
      setMessage('Share options opened. Select WhatsApp, choose Admin +91 9101280465 and tap Send. This does not confirm payment; admin will verify the bank credit.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessage('Share cancel hua. WhatsApp par bhejne ke liye dobara try karein.');
      } else {
        console.error('Payment proof sharing failed:', error);
        setMessage('Screenshot share nahi ho paya. Please dobara try karein.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3"><p className="text-base font-black text-slate-900 dark:text-white">Pay ₹{amount}</p><span className="rounded-full bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">UPI payment</span></div>
        <p className="text-xs text-slate-500 mt-1">Pay, add your screenshot and transaction ID, then share with admin.</p>
      </div>
      <a href={upiLink} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm">
        <Smartphone className="h-5 w-5" /> Continue to Google Pay / PhonePe / UPI
      </a>
      <p className="text-[11px] text-slate-600 dark:text-slate-300">UPI ID: <strong>{UPI_ID}</strong></p>

      <div className="space-y-1">
        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Payment screenshot <span className="text-red-600">*Required</span></label>
        <input ref={inputRef} type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-xs file:font-bold dark:file:bg-slate-700" />
        {file && <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Selected: {file.name}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor={`utr-${applicationId}`} className="block text-xs font-bold text-slate-800 dark:text-slate-200">UPI UTR / Transaction ID <span className="text-red-600">*Required</span></label>
        <input id={`utr-${applicationId}`} value={utr} onChange={(event) => setUtr(event.target.value.replace(/\s/g, '').slice(0, 30))} placeholder="Enter actual UTR from GPay / PhonePe" maxLength={30} autoComplete="off" className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm" />
        <p className="text-[10px] text-slate-500">UTR payment app ke transaction details se copy karein. Blank UTR accept nahi hoga; fake UTR generate nahi hota.</p>
      </div>

      <button type="button" disabled={disabled || busy || !file || !validUtr} onClick={sendProof} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">
        <MessageCircle className="h-5 w-5" /><ImagePlus className="h-5 w-5" />{busy ? 'Opening share options…' : 'Share payment proof'}
      </button>
      <p className="text-[10px] text-slate-500">Your screenshot is shared only after you choose WhatsApp and tap Send. Admin manually checks the bank credit before approval.</p>
      {message && <p role="status" className="rounded-lg bg-blue-50 dark:bg-slate-800 p-3 text-xs text-blue-800 dark:text-blue-200">{message}</p>}
    </div>
  );
};
