import React, { useEffect, useState } from 'react';
import { ImagePlus, Smartphone, CheckCircle2, ShieldCheck } from 'lucide-react';

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

  const sendProof = async (fileToShare: File | null = file) => {
    setMessage('');
    if (!fileToShare || !fileToShare.type.startsWith('image/')) {
      setMessage('Pehle payment ka asli screenshot select karein.');
      return;
    }
    if (fileToShare.size > 10 * 1024 * 1024) {
      setMessage('Screenshot 10 MB se chhota hona chahiye.');
      return;
    }
    if (!validUtr) {
      setMessage('Apne UPI app se asli 8–30 character ka UTR / transaction ID bharein. Koi UTR khud se generate nahi hoga.');
      return;
    }
    if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [fileToShare] })) {
      setMessage('Image attachment share is browser mein supported nahi hai. Android Chrome mein website kholkar try karein.');
      return;
    }

    const text = `YourThikana ${title} payment proof\nApplication ID: ${applicationId}\nProperty: ${propertyTitle}\nAmount: ₹${amount}\nUPI UTR: ${cleanUtr}\nPlease verify the screenshot and bank credit manually. Admin WhatsApp: +91 9101280465.`;
    setBusy(true);
    try {
      await navigator.share({ files: [fileToShare], title: 'YourThikana payment screenshot', text });
      await onShared(cleanUtr);
      setMessage('Share options khul gaye. WhatsApp select karein, Admin +91 9101280465 choose karein aur Send dabayein. Payment admin bank credit verify karne ke baad hi confirm hoga.');
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
    <section aria-label="Payment and proof" className="w-full min-w-0 overflow-hidden rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 shadow-sm text-[#E5EAF3]">
      <div className="mb-4 flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B3A33] text-[#5EEAD4]">
          <Smartphone className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#5EEAD4]">Secure UPI payment</p>
          <h4 className="mt-0.5 text-xl font-black leading-tight text-white">Pay ₹{amount}</h4>
          <p className="mt-1 text-sm leading-5 text-[#9AA7BD]">Payment button alag hai. Pay karne ke baad screenshot aur asli UTR share karein.</p>
        </div>
      </div>

      <a
        href={upiLink}
        aria-label={`Pay ₹${amount} using UPI`}
        className="mb-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#14B8A6] px-4 py-3 text-center text-base font-extrabold text-[#04201C] shadow-md transition-colors hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-emerald-300"
      >
        <Smartphone className="h-5 w-5 shrink-0" />
        <span>Pay ₹{amount} now</span>
      </a>

      <div className="mb-4 rounded-xl bg-[#0B1220] p-3">
        <p className="text-xs font-semibold text-[#9AA7BD]">UPI ID</p>
        <p className="mt-1 break-all text-sm font-bold text-white">{UPI_ID}</p>
      </div>

      <div className="space-y-4">
        <div className="min-w-0">
          <label htmlFor={`payment-file-${applicationId}`} className="mb-2 block text-[13px] font-bold text-[#E5EAF3]">
            1. Payment screenshot <span className="text-rose-600">*Required</span>
          </label>
          <input
            id={`payment-file-${applicationId}`}
            type="file"
            accept="image/*"
            onChange={(event) => { const selected = event.target.files?.[0] || null; setFile(selected); if (selected && validUtr) void sendProof(selected); }}
            className="block min-h-12 w-full max-w-full cursor-pointer rounded-xl border border-dashed border-[#3A4866] bg-[#0B1220] p-2 text-sm text-[#E5EAF3] file:mr-2 file:min-h-10 file:rounded-lg file:border-0 file:bg-[#243049] file:px-3 file:font-bold file:text-[#5EEAD4]"
          />
          {file && <p className="mt-2 flex items-start gap-2 break-all text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />Selected: {file.name}</p>}
          <p className="mt-1 text-xs leading-5 text-[#9AA7BD]">Image file only, maximum 10 MB.</p>
        </div>

        <div className="min-w-0">
          <label htmlFor={`utr-${applicationId}`} className="mb-2 block text-sm font-bold text-slate-900 dark:text-white">
            2. UPI UTR / Transaction ID <span className="text-rose-600">*Required</span>
          </label>
          <input
            id={`utr-${applicationId}`}
            value={utr}
            onChange={(event) => setUtr(event.target.value.replace(/\s/g, '').slice(0, 30))}
            placeholder="GPay / PhonePe se actual UTR paste karein"
            maxLength={30}
            autoComplete="off"
            className="min-h-12 w-full min-w-0 rounded-xl border border-[#3A4866] bg-[#0B1220] p-3 text-base text-white outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
          />
          <p className="mt-1 text-xs leading-5 text-[#9AA7BD]">Blank ya fake UTR accept nahi hoga. UTR apne payment app ke transaction details se copy karein.</p>
        </div>

        <p className="text-xs leading-5 text-slate-500">Screenshot select karte hi (agar UTR pehle se bhara hai) Android share sheet khul jayegi. WhatsApp choose karke Admin +91 9101280465 ko select karein aur Send dabayein.</p>

        <button
          type="button"
          disabled={disabled || busy || !file || !validUtr}
          onClick={sendProof}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-4 text-center text-base font-extrabold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <ImagePlus className="h-5 w-5 shrink-0" />
          <span>{busy ? 'Opening WhatsApp share…' : file ? 'Share screenshot & UTR now' : 'Select screenshot to share'}</span>
        </button>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#13264F] p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
        <p className="text-xs leading-5 text-[#BFDBFE]">WhatsApp share sheet mein Admin +91 9101280465 select karke Send dabana hoga. Payment sirf admin ke bank-credit verification ke baad confirm hoga.</p>
      </div>
      {message && <p role="status" aria-live="polite" className="mt-3 break-words rounded-xl bg-[#3A2A0B] p-3 text-sm leading-5 text-[#FBBF24]">{message}</p>}
    </section>
  );
};
