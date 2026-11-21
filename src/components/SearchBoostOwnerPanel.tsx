import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { BadgePercent, Clock3, Wallet, ArrowRight } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { Property } from '../types';
import { PaymentProofShare } from './PaymentProofShare';

type SearchBoostApplication = {
  id: string;
  ownerUid: string;
  propertyId: string;
  propertyTitle: string;
  status: 'awaiting_payment' | 'pending' | 'approved' | 'rejected';
  paymentStatus: 'pending' | 'verified' | 'rejected';
  paymentUtr: string;
  submittedAt?: any;
  featuredUntil?: string;
  reviewNote?: string;
};

const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN') : '—';

export const SearchBoostOwnerPanel: React.FC<{ properties: Property[]; selectedPropertyId?: string }> = ({ properties, selectedPropertyId }) => {
  const uid = auth?.currentUser?.uid || '';
  const [applications, setApplications] = useState<SearchBoostApplication[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const eligibleProperties = useMemo(
    () => properties.filter((property) => property.ownerUid === uid && property.status === 'active' && !(property.isFeatured && property.featuredUntil && Date.parse(property.featuredUntil) > Date.now())),
    [properties, uid]
  );

  useEffect(() => {
    if (selectedPropertyId && eligibleProperties.some((property) => property.id === selectedPropertyId)) {
      setPropertyId(selectedPropertyId);
    }
  }, [selectedPropertyId, eligibleProperties]);

  useEffect(() => {
    if (!db || !uid) {
      setApplications([]);
      return;
    }
    return onSnapshot(query(collection(db, 'searchBoostApplications'), where('ownerUid', '==', uid)), (snapshot) => {
      setApplications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SearchBoostApplication)));
    }, (error) => {
      console.error('Search Boost applications listener failed:', error);
      setMessage('Search Boost requests load nahi hue. Please refresh karein.');
    });
  }, [uid]);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = auth?.currentUser;
    const property = eligibleProperties.find((item) => item.id === propertyId);
    if (!db || !user || !property) {
      setMessage('Sirf apni approved/published property select karein.');
      return;
    }
    if (applications.some((item) =>
      item.propertyId === propertyId &&
      (item.status === 'awaiting_payment' || item.status === 'pending' || item.status === 'rejected' ||
        (item.status === 'approved' && !!item.featuredUntil && Date.parse(item.featuredUntil) > Date.now()))
    )) {
      setMessage('Is property ka Search Boost request pehle se bana hua hai. Payment ya review ke liye neeche usi request ka card use karein.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const applicationRef = doc(collection(db, 'searchBoostApplications'));
      await setDoc(applicationRef, {
        ownerUid: user.uid, propertyId: property.id, propertyTitle: property.title,
        status: 'awaiting_payment', paymentStatus: 'pending', paymentUtr: '',
        proofSubmissionMethod: 'whatsapp', proofStatus: 'awaiting_payment',
        submittedAt: serverTimestamp(),
      });
      setPropertyId('');
      setMessage('Request ban gayi. Neeche apne request card mein alag Pay ₹500 button dabayein.');
    } catch (error: any) {
      console.error('Search Boost request failed:', error);
      setMessage(error?.message || 'Request submit nahi ho payi.');
    } finally {
      setBusy(false);
    }
  };

  const markPaymentSubmitted = async (application: SearchBoostApplication, utrValue: string) => {
    if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) throw new Error('Please sign in again.');
    await updateDoc(doc(db, 'searchBoostApplications', application.id), {
      paymentUtr: utrValue,
      paymentSubmittedAt: serverTimestamp(),
      status: 'pending',
      paymentStatus: 'pending',
      proofSubmissionMethod: 'whatsapp',
      proofStatus: 'share_sheet_opened',
    });
  };

  const paymentApplication = applications.find((application) =>
    application.status === 'awaiting_payment' || application.status === 'pending' || application.status === 'rejected'
  );

  return (
    <section className="w-full min-w-0 space-y-5 overflow-hidden rounded-[24px] border border-slate-700 bg-[#0B1220] p-4 text-[#E5EAF3] shadow-xl sm:p-5">
      <header className="flex min-w-0 items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#3A2A0B]">
          <BadgePercent className="h-6 w-6 text-[#FBBF24]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-black leading-tight text-white">Search Boost</h3>
          <p className="mt-1 text-sm font-bold text-[#FBBF24]">₹500 / month</p>
          <p className="mt-1 text-sm leading-5 text-[#9AA7BD]">Apni approved property ko search results mein highlight karein.</p>
        </div>
      </header>

      <div className="rounded-2xl border border-[#3A2A0B] bg-[#131C2E] p-3">
        <p className="flex items-center gap-2 text-sm font-bold text-[#FBBF24]"><Wallet className="h-5 w-5 shrink-0" />One-time monthly boost payment: ₹500</p>
        <p className="mt-1 text-xs leading-5 text-[#9AA7BD]">UPI se payment karein. Screenshot aur asli UTR share karne ke baad admin bank credit verify karega. Verification se pehle boost active nahi hoga.</p>
      </div>

      {paymentApplication && (
        <div id="search-boost-payment" className="scroll-mt-4 space-y-3 rounded-2xl border border-[#14B8A6] bg-[#131C2E] p-3 sm:p-4">
          <h4 className="text-base font-black text-white">Payment required — {paymentApplication.propertyTitle}</h4>
          <p className="text-xs leading-5 text-[#9AA7BD]">Pay button yahin sabse upar milega; kisi menu ya hidden tab ke andar nahi.</p>
          <PaymentProofShare
            key={paymentApplication.id + '-' + paymentApplication.status}
            amount={500}
            title="Search Boost"
            applicationId={paymentApplication.id}
            propertyTitle={paymentApplication.propertyTitle}
            onShared={(utrValue) => markPaymentSubmitted(paymentApplication, utrValue)}
            initialUtr={paymentApplication.paymentUtr || ''}
            disabled={busy}
          />
        </div>
      )}

      <form onSubmit={submitRequest} className="space-y-3 rounded-2xl border border-[#243049] bg-[#131C2E] p-3 sm:p-4">
        <label htmlFor="search-boost-property" className="block text-sm font-bold text-[#E5EAF3]">1. Approved property choose karein</label>
        <select id="search-boost-property" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required className="min-h-12 w-full min-w-0 rounded-xl border border-[#3A4866] bg-[#0B1220] p-3 text-base text-white">
          <option value="">Select property</option>
          {eligibleProperties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
        </select>
        <button type="submit" disabled={busy || !eligibleProperties.length || !propertyId} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FBBF24] px-4 py-4 text-center text-base font-extrabold text-[#241800] shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? 'Creating request…' : '2. Create Search Boost request'}
          {!busy && <ArrowRight className="h-5 w-5" />}
        </button>
        {!eligibleProperties.length && <p className="text-xs leading-5 text-slate-500">Abhi koi eligible approved/published property available nahi hai.</p>}
      </form>

      {message && <p role="status" aria-live="polite" className="break-words rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-700 dark:bg-slate-900 dark:text-slate-200">{message}</p>}

      <div className="space-y-3">
        <div>
          <h4 className="text-base font-extrabold text-white">Your Search Boost requests</h4>
          <p className="mt-1 text-xs text-[#9AA7BD]">Payment aur proof har request ke neeche alag-alag dikhte hain.</p>
        </div>
        {applications.length === 0 && <p className="rounded-xl border border-dashed border-[#3A4866] p-4 text-sm text-[#9AA7BD]">Abhi koi Search Boost request nahi hai.</p>}
        {applications.map((application) => (
          <article key={application.id} className="w-full min-w-0 space-y-3 rounded-2xl border border-[#3A4866] bg-[#131C2E] p-3 sm:p-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-base font-bold text-white">{application.propertyTitle}</p>
                <p className="mt-1 break-all text-xs text-[#9AA7BD]">{application.paymentUtr ? `UTR submitted: ${application.paymentUtr}` : 'Payment not submitted yet'}</p>
              </div>
              <span className={`inline-flex min-h-8 w-fit max-w-full items-center rounded-full px-3 py-1 text-xs font-bold ${application.status === 'approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : application.status === 'rejected' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
                {application.status === 'approved' ? 'Boost active' : application.status === 'rejected' ? 'Rejected — payment required to retry' : application.status === 'awaiting_payment' ? 'Payment required' : 'Admin review pending'}
              </span>
            </div>
            {application.featuredUntil && <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4 shrink-0" />Active until {dateLabel(application.featuredUntil)}</p>}
            {application.status === 'approved' && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">Search Boost active hai.</p>}
            {application.reviewNote && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">Admin note: {application.reviewNote}</p>}
          </article>
        ))}
      </div>
    </section>
  );
};
