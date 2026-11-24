import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Property } from '../types';
import { CalendarClock, CheckCircle2, Clock3, ArrowLeft, ArrowRight } from 'lucide-react';
import { PaymentProofShare } from './PaymentProofShare';

type Application = {
  id: string;
  ownerUid: string;
  propertyId: string;
  propertyTitle: string;
  amount: number;
  status: 'awaiting_payment' | 'pending' | 'approved' | 'rejected';
  paymentStatus: 'pending' | 'verified' | 'rejected';
  paymentUtr: string;
  submittedAt?: any;
  verifiedUntil?: string;
  reviewNote?: string;
};

type Screen = 'apply' | 'payment' | 'status';

const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN') : '—';

export const MonthlySubscriptionOwnerPanel: React.FC<{ properties: Property[] }> = ({ properties }) => {
  const uid = auth?.currentUser?.uid || '';
  const [applications, setApplications] = useState<Application[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [activeApplicationId, setActiveApplicationId] = useState('');
  const [screen, setScreen] = useState<Screen>('apply');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const ownedProperties = useMemo(
    () => properties.filter(property => property.ownerUid === uid && property.status === 'active'),
    [properties, uid]
  );

  useEffect(() => {
    if (!db || !uid) { setApplications([]); return; }
    return onSnapshot(query(collection(db, 'subscriptionApplications'), where('ownerUid', '==', uid)), snapshot => {
      const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Application));
      rows.sort((a, b) => {
        const time = (v: any) => typeof v?.toDate === 'function' ? v.toDate().getTime() : new Date(v || 0).getTime();
        return time(b.submittedAt) - time(a.submittedAt);
      });
      setApplications(rows);
    }, error => {
      console.error('Monthly subscription listener failed:', error);
      setMessage('Subscription requests load nahi hue. Sign-in aur Firestore rules check karein.');
    });
  }, [uid]);

  const activeApplication = applications.find(item => item.id === activeApplicationId);
  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = auth?.currentUser;
    const property = ownedProperties.find(item => item.id === propertyId);
    if (!db || !user || !property) { setMessage('Apne owner account se sign in karke apni active property select karein.'); return; }
    if (applications.some(item => item.propertyId === propertyId && (item.status === 'awaiting_payment' || item.status === 'pending'))) {
      setMessage('Is property ka subscription payment request pehle se pending hai. My Requests mein status dekhein.');
      setScreen('status');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const current = await getDoc(doc(db, 'properties', property.id));
      if (!current.exists() || current.data().ownerUid !== user.uid || current.data().status !== 'active') {
        setMessage('Property ownership ya active status verify nahi hua. My Listings refresh karein.');
        return;
      }
      const applicationRef = doc(collection(db, 'subscriptionApplications'));
      await setDoc(applicationRef, {
        ownerUid: user.uid,
        propertyId: property.id,
        propertyTitle: property.title,
        amount: 1000,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        paymentUtr: '',
        proofSubmissionMethod: 'whatsapp',
        proofStatus: 'awaiting_payment',
        submittedAt: serverTimestamp(),
      });
      setActiveApplicationId(applicationRef.id);
      setPropertyId('');
      setScreen('payment');
      setMessage('Monthly subscription request create ho gayi. Ab ₹1,000 payment aur proof submit karein.');
    } catch (error: any) {
      console.error('Monthly subscription request failed:', error);
      setMessage(error?.message || 'Subscription request submit nahi hui. Please retry karein.');
    } finally { setBusy(false); }
  };

  const markPaymentSubmitted = async (application: Application, utr: string) => {
    if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) throw new Error('Please sign in again.');
    await updateDoc(doc(db, 'subscriptionApplications', application.id), {
      paymentUtr: utr,
      paymentSubmittedAt: serverTimestamp(),
      status: 'pending',
      paymentStatus: 'pending',
      proofSubmissionMethod: 'whatsapp',
      proofStatus: 'share_sheet_opened',
    });
    setScreen('status');
  };

  return (
    <section className="w-full min-w-0 space-y-4 rounded-[18px] border border-[#243049] bg-[#0B1220] p-4 text-[#E5EAF3] shadow-xl">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#123B2B]"><CalendarClock className="h-6 w-6 text-[#5EEAD4]" /></div>
        <div className="min-w-0 flex-1"><h2 className="text-xl font-extrabold text-white">Monthly Platform Subscription</h2><p className="mt-1 text-sm font-bold text-[#5EEAD4]">₹1,000 / property / month</p><p className="mt-1 text-xs leading-5 text-[#9AA7BD]">Payment admin ke bank-credit verification ke baad hi subscription renew/activate hoga.</p></div>
      </header>

      <nav aria-label="Monthly subscription pages" className="grid grid-cols-3 gap-2 rounded-xl bg-[#131C2E] p-1">
        <button type="button" onClick={() => { setScreen('apply'); setMessage(''); }} className={`min-h-11 rounded-lg px-2 text-xs font-bold ${screen === 'apply' ? 'bg-[#26344D] text-white' : 'text-[#9AA7BD]'}`}>New Request</button>
        <button type="button" onClick={() => { setScreen('payment'); setMessage(''); if (!activeApplicationId) { const item = applications.find(a => a.status === 'awaiting_payment' || a.status === 'rejected'); if (item) setActiveApplicationId(item.id); } }} className={`min-h-11 rounded-lg px-2 text-xs font-bold ${screen === 'payment' ? 'bg-[#26344D] text-white' : 'text-[#9AA7BD]'}`}>Payment</button>
        <button type="button" onClick={() => { setScreen('status'); setMessage(''); }} className={`min-h-11 rounded-lg px-2 text-xs font-bold ${screen === 'status' ? 'bg-[#26344D] text-white' : 'text-[#9AA7BD]'}`}>My Status</button>
      </nav>

      {screen === 'apply' && (
        <form onSubmit={submitRequest} className="space-y-3 rounded-[18px] border border-[#243049] bg-[#131C2E] p-4">
          <label htmlFor="monthly-subscription-property" className="block text-sm font-bold">Select your active property</label>
          <select id="monthly-subscription-property" value={propertyId} onChange={event => setPropertyId(event.target.value)} required className="min-h-12 w-full rounded-xl border border-[#3A4866] bg-[#0B1220] p-3 text-base text-white">
            <option value="">Choose property</option>
            {ownedProperties.map(property => <option key={property.id} value={property.id}>{property.title} — {property.city}</option>)}
          </select>
          <p className="text-xs leading-5 text-[#9AA7BD]">₹1,000 per property for one calendar month. Admin verifies the actual bank credit before changing the property subscription.</p>
          <button type="submit" disabled={busy || !propertyId} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#14B8A6] px-4 py-3 text-base font-extrabold text-[#04201C] disabled:opacity-40">{busy ? 'Creating request…' : 'Create ₹1,000 Subscription Request'} <ArrowRight className="h-5 w-5" /></button>
          <button type="button" onClick={() => setScreen('status')} className="min-h-11 w-full rounded-xl border border-[#3A4866] text-sm font-bold text-white">View existing requests</button>
        </form>
      )}

      {screen === 'payment' && (
        <div className="space-y-3">
          <button type="button" onClick={() => setScreen('apply')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#3A4866] px-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" /> Back</button>
          {activeApplication ? (
            activeApplication.status === 'awaiting_payment' || activeApplication.status === 'rejected' ? (
              <PaymentProofShare amount={1000} title="Monthly Platform Subscription" applicationId={activeApplication.id} propertyTitle={activeApplication.propertyTitle} storageFolder="subscription-documents" onShared={utr => markPaymentSubmitted(activeApplication, utr)} initialUtr={activeApplication.paymentUtr || ''} disabled={busy} />
            ) : <p className="rounded-xl border border-[#243049] bg-[#131C2E] p-4 text-sm text-[#9AA7BD]">Payment proof submit ho chuka hai. Status page par admin review dekhein.</p>
          ) : <p className="rounded-xl border border-dashed border-[#3A4866] p-4 text-sm text-[#9AA7BD]">Payment request load ho raha hai. Agar request nahi dikhe to My Status kholkar select karein.</p>}
        </div>
      )}

      {screen === 'status' && (
        <div className="space-y-3">
          <button type="button" onClick={() => setScreen('apply')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#3A4866] px-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" /> New request</button>
          {!applications.length && <p className="rounded-xl border border-dashed border-[#3A4866] p-4 text-sm text-[#9AA7BD]">No subscription requests yet.</p>}
          {applications.map(application => (
            <article key={application.id} className="space-y-2 rounded-xl border border-[#243049] bg-[#131C2E] p-4">
              <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-white">{application.propertyTitle}</p><p className="mt-1 text-[11px] text-[#9AA7BD]">₹1,000 · Application {application.id}</p></div><span className="rounded-full bg-[#243049] px-3 py-1 text-xs font-bold text-white">{application.status === 'approved' ? 'Active' : application.status === 'rejected' ? 'Rejected' : application.status === 'awaiting_payment' ? 'Payment Required' : 'Admin Review'}</span></div>
              <p className="text-xs text-[#9AA7BD]">Payment: {application.paymentStatus} · Valid until: {dateLabel(application.verifiedUntil)}</p>
              {application.reviewNote && <p className="text-xs text-rose-300">{application.reviewNote}</p>}
              {application.status === 'awaiting_payment' || application.status === 'rejected' ? <button type="button" onClick={() => { setActiveApplicationId(application.id); setScreen('payment'); }} className="min-h-11 w-full rounded-xl bg-[#2563EB] px-3 text-sm font-bold text-white">Continue Payment</button> : null}
            </article>
          ))}
        </div>
      )}

      {message && <p role="status" aria-live="polite" className="break-words rounded-xl bg-[#30250F] p-3 text-sm text-[#FBBF24]">{message}</p>}
      <div className="flex items-center gap-2 rounded-xl border border-[#243049] bg-[#131C2E] p-3 text-xs text-[#9AA7BD]"><Clock3 className="h-4 w-4 shrink-0 text-[#5EEAD4]" />Subscription is activated only after the admin confirms ₹1,000 bank credit.</div>
    </section>
  );
};
