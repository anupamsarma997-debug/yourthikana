import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { BadgePercent, Clock3 } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { Property } from '../types';
import { PaymentProofPanel } from './PaymentProofPanel';

type SearchBoostApplication = {
  id: string; ownerUid: string; propertyId: string; propertyTitle: string;
  status: 'pending' | 'approved' | 'rejected';
  paymentStatus: 'pending' | 'verified' | 'rejected';
  paymentUtr: string; paymentProofPath?: string; submittedAt?: any; featuredUntil?: string; reviewNote?: string;
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
    if (!db || !uid) { setApplications([]); return; }
    return onSnapshot(query(collection(db, 'searchBoostApplications'), where('ownerUid', '==', uid)), (snapshot) => {
      setApplications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SearchBoostApplication)));
    }, (error) => {
      console.error('Search Boost applications listener failed:', error);
      setMessage('Search Boost requests load nahi hue. Please refresh karein.');
    });
  }, [uid]);

  const submitPayment = async (utr: string, proofPath: string) => {
    const user = auth?.currentUser;
    const property = eligibleProperties.find((item) => item.id === propertyId);
    if (!db || !user || user.uid !== uid || !property) throw new Error('Apni approved/published property select karein aur dobara try karein.');
    if (applications.some((item) => item.propertyId === propertyId && item.status === 'pending')) throw new Error('Is property ka Search Boost request pehle se review mein hai.');
    setBusy(true); setMessage('');
    try {
      await setDoc(doc(collection(db, 'searchBoostApplications')), {
        ownerUid: user.uid, propertyId: property.id, propertyTitle: property.title,
        status: 'pending', paymentStatus: 'pending', paymentUtr: utr,
        paymentProofPath: proofPath, amount: 500, billingPeriod: 'month',
        submittedAt: serverTimestamp(),
      });
      setMessage('Application submit ho gayi. Admin payment verify karega; tabhi Search Boost activate hoga.');
    } catch (error: any) { throw error; }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-3 dark:bg-emerald-950"><BadgePercent className="h-6 w-6 text-emerald-700"/></div><div><h2 className="text-lg font-black text-slate-950 dark:text-white">Search Boost</h2><p className="text-xs text-slate-500">Get more visibility in search results.</p></div></div>
      <label className="block space-y-1 text-sm font-bold text-slate-800 dark:text-slate-200">Choose your approved property
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900" required>
          <option value="">Select property</option>{eligibleProperties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
        </select>
      </label>
      {propertyId ? <PaymentProofPanel serviceName="Search Boost" amount={500} billingLabel="/ month" disabled={busy} onSubmit={submitPayment}/> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">Select an approved property to continue with payment.</p>}
      {message && <p role="status" className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">{message}</p>}
      <div className="space-y-2"><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Your Search Boost requests</h3>
        {applications.length === 0 && <p className="text-xs text-slate-500">No Search Boost requests yet.</p>}
        {applications.map((application) => <article key={application.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div><p className="text-sm font-bold text-slate-900 dark:text-white">{application.propertyTitle}</p><p className="text-[11px] text-slate-500">UTR: {application.paymentUtr}</p></div><div className="text-right text-xs font-bold"><span className={application.status === 'approved' ? 'text-emerald-600' : application.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'}>{application.status === 'approved' ? 'Boost active' : application.status === 'rejected' ? 'Rejected' : 'Payment pending review'}</span>{application.featuredUntil && <p className="text-[10px] text-slate-500"><Clock3 className="mr-1 inline h-3 w-3"/>Until {dateLabel(application.featuredUntil)}</p>}</div></article>)}
      </div>
    </section>
  );
};
