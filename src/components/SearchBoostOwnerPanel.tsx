import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { BadgePercent, Clock3, Wallet } from 'lucide-react';
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

export const SearchBoostOwnerPanel: React.FC<{ properties: Property[] }> = ({ properties }) => {
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
      setMessage('Payment step ready hai. ₹500 pay karke screenshot aur asli UTR share karein; uske baad hi request admin review mein jayegi.');
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

  return (
    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-amber-200 dark:border-amber-900 p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-100 dark:bg-amber-950 p-3"><BadgePercent className="w-6 h-6 text-amber-600" /></div>
        <div><h3 className="text-lg font-black text-slate-900 dark:text-white">Search Boost — ₹500 / month</h3><p className="text-xs text-slate-500">Only approved and published properties can request a boost.</p></div>
      </div>
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
        <p className="text-xs font-bold text-amber-900 dark:text-amber-200"><Wallet className="inline w-4 h-4 mr-1" />One-time monthly boost payment: ₹500.</p>
        <p className="text-[11px] text-slate-600 dark:text-slate-300">Pay using any UPI app, then share the payment screenshot and real UTR. Boost starts only after admin verifies the bank credit.</p>
      </div>
      <form onSubmit={submitRequest} className="grid sm:grid-cols-[1fr_auto] gap-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Approved property
          <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm">
            <option value="">Select property</option>
            {eligibleProperties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
          </select>
        </label>
        <button disabled={busy || !eligibleProperties.length} className="self-end rounded-xl bg-amber-500 px-4 py-3 text-xs font-extrabold text-slate-950 disabled:opacity-50">{busy ? 'Submitting…' : 'Create Search Boost request'}</button>
      </form>
      {message && <p role="status" className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs">{message}</p>}
      <div className="space-y-2">
        <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">Your Search Boost requests</h4>
        {applications.length === 0 && <p className="text-xs text-slate-500">No Search Boost requests yet.</p>}
        {applications.map((application) => (
          <article key={application.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-bold text-slate-900 dark:text-white">{application.propertyTitle}</p><p className="text-[11px] text-slate-500">{application.paymentUtr ? `UTR submitted: ${application.paymentUtr}` : 'Payment not submitted yet'}</p></div>
              <div className="text-right text-xs font-bold"><span className={application.status === 'approved' ? 'text-emerald-600' : application.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'}>{application.status === 'approved' ? 'Boost active' : application.status === 'rejected' ? 'Rejected' : 'Admin review pending'}</span>{application.featuredUntil && <p className="text-[10px] text-slate-500"><Clock3 className="inline w-3 h-3 mr-1" />Until {dateLabel(application.featuredUntil)}</p>}</div>
            </div>
            {(application.status === 'awaiting_payment' || application.status === 'pending' || application.status === 'rejected') && (
              <PaymentProofShare amount={500} title="Search Boost" applicationId={application.id} propertyTitle={application.propertyTitle} onShared={(utrValue) => markPaymentSubmitted(application, utrValue)} initialUtr={application.paymentUtr || ''} disabled={busy} />
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
