import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Timestamp } from 'firebase/firestore';
import { CalendarClock, CheckCircle2, Clock3, MessageCircle, XCircle } from 'lucide-react';

type Application = {
  id: string;
  ownerUid: string;
  propertyId: string;
  propertyTitle: string;
  amount: number;
  status: 'awaiting_payment' | 'pending' | 'approved' | 'rejected';
  paymentStatus: 'pending' | 'verified' | 'rejected';
  paymentUtr?: string;
  submittedAt?: any;
  verifiedUntil?: string;
  reviewNote?: string;
};

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export const MonthlySubscriptionAdminPanel: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [proofChecked, setProofChecked] = useState<Record<string, boolean>>({});
  const [paymentChecked, setPaymentChecked] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'subscriptionApplications'), snapshot => {
      const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Application));
      rows.sort((a, b) => {
        const time = (v: any) => typeof v?.toDate === 'function' ? v.toDate().getTime() : new Date(v || 0).getTime();
        return time(b.submittedAt) - time(a.submittedAt);
      });
      setApplications(rows);
    }, error => {
      console.error('Subscription applications listener failed:', error);
      setMessage('Subscription applications load nahi hui. Firestore rules check karein.');
    });
  }, []);

  const verifyPayment = async (application: Application, approve: boolean) => {
    if (!db || !auth?.currentUser || !application.paymentUtr) return;
    if (approve && !paymentChecked[application.id]) {
      setMessage('WhatsApp screenshot check karke actual ₹1,000 bank/UPI credit independently confirm karein.');
      return;
    }
    setBusyId(application.id); setMessage('');
    try {
      await updateDoc(doc(db, 'subscriptionApplications', application.id), approve
        ? { paymentStatus: 'verified', paymentVerifiedAt: serverTimestamp(), paymentVerifiedBy: auth.currentUser.uid }
        : { status: 'rejected', paymentStatus: 'rejected', reviewNote: 'Payment credit could not be confirmed. Please share a new screenshot on WhatsApp and resubmit the UTR.', paymentReviewedAt: serverTimestamp(), paymentReviewedBy: auth.currentUser.uid });
      setMessage(approve ? '₹1,000 bank credit verified. Final approval can now be completed.' : 'Payment rejected. Owner can resubmit a corrected UTR.');
    } catch (error: any) {
      console.error('Subscription payment review failed:', error);
      setMessage(error?.message || 'Payment review failed.');
    } finally { setBusyId(''); }
  };

  const approveSubscription = async (application: Application) => {
    if (!db || !auth?.currentUser || application.paymentStatus !== 'verified' || !proofChecked[application.id]) return;
    setBusyId(application.id); setMessage('');
    try {
      const propertyRef = doc(db, 'properties', application.propertyId);
      const propertySnapshot = await getDoc(propertyRef);
      if (!propertySnapshot.exists() || propertySnapshot.data().ownerUid !== application.ownerUid || !['active', 'hidden_expired'].includes(propertySnapshot.data().status)) {
        setMessage('Property missing, not active, or owner mismatch. Subscription cannot be approved.');
        return;
      }
      const property = propertySnapshot.data();
      const now = new Date();
      const existingExpiry = property.subscriptionExpiresAt || property.subscriptionExpiryDate;
      const parsedExpiry = property.subscriptionExpiresAtTimestamp?.toDate?.() || (existingExpiry ? new Date(existingExpiry) : now);
      const renewalBase = Number.isFinite(parsedExpiry.getTime()) && parsedExpiry.getTime() > now.getTime() ? parsedExpiry : now;
      const nextExpiry = addCalendarMonths(renewalBase, 1).toISOString();
      const batch = writeBatch(db);
      batch.update(doc(db, 'subscriptionApplications', application.id), {
        status: 'approved', verifiedUntil: nextExpiry, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser.uid,
      });
      batch.update(propertyRef, {
        status: 'active',
        subscriptionStatus: 'active', subscriptionPlan: 'standard_1000', subscriptionPrice: 1000,
        subscriptionExpiresAt: nextExpiry, subscriptionExpiresAtTimestamp: Timestamp.fromDate(new Date(nextExpiry)), subscriptionExpiryDate: nextExpiry,
      });
      batch.set(doc(db, 'transactions', `subscription-${application.id}`), {
        id: `subscription-${application.id}`, ownerId: application.ownerUid,
        ownerName: property.ownerName || 'Property owner', propertyId: application.propertyId,
        propertyName: application.propertyTitle, type: 'standard_1000',
        planName: 'Monthly Platform Subscription', amount: 1000,
        date: now.toLocaleDateString('en-IN'), validUntil: nextExpiry, createdAt: now.toISOString(),
      });
      await batch.commit();
      setMessage('Monthly subscription approved for one calendar month after WhatsApp proof and bank-credit checks.');
    } catch (error: any) {
      console.error('Subscription activation failed:', error);
      setMessage(error?.message || 'Subscription activation failed.');
    } finally { setBusyId(''); }
  };

  const rejectApplication = async (application: Application) => {
    if (!db || !auth?.currentUser) return;
    setBusyId(application.id); setMessage('');
    try {
      await updateDoc(doc(db, 'subscriptionApplications', application.id), {
        status: 'rejected', reviewNote: 'Application needs correction. Please contact YourThikana support.',
        reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser.uid,
      });
      setMessage('Subscription application rejected.');
    } catch (error: any) {
      setMessage(error?.message || 'Application reject nahi hui.');
    } finally { setBusyId(''); }
  };

  const reviewable = applications.filter(application => application.status !== 'awaiting_payment');

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-200 bg-white p-5 shadow-md dark:border-emerald-900 dark:bg-slate-800">
      <header className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-3 dark:bg-emerald-950"><CalendarClock className="h-6 w-6 text-emerald-700 dark:text-emerald-300" /></div><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Monthly Subscription Review</h2><p className="text-xs text-slate-500">₹1,000 per property per calendar month · {reviewable.filter(a => a.status === 'pending').length} awaiting review</p></div></header>
      {message && <p role="status" aria-live="polite" className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">{message}</p>}
      {!reviewable.length && <p className="text-sm text-slate-500">No monthly subscription requests awaiting review.</p>}
      {reviewable.map(application => (
        <article key={application.id} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{application.propertyTitle}</h3><p className="mt-1 break-all text-[10px] text-slate-500">Property: {application.propertyId} · Owner: {application.ownerUid}</p><p className="mt-1 break-all text-[10px] text-slate-500">Application: {application.id}</p><p className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300">Payment UTR: {application.paymentUtr || 'Not submitted'}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black uppercase dark:bg-slate-700">{application.status} · {application.paymentStatus}</span></div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700 space-y-2">
            <p className="text-xs font-bold">Payment screenshot — WhatsApp only</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">Screenshot Firebase Storage mein save nahi hota. Owner se WhatsApp par aaya screenshot application ID aur UTR se match karein.</p>
            <a href={`https://wa.me/919101280465?text=${encodeURIComponent('Please check Monthly Subscription payment proof for application '+application.id+' / '+application.propertyTitle)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"><MessageCircle className="h-4 w-4" />Open WhatsApp Support</a>
          </div>
          {(application.status === 'pending' || application.status === 'approved') && application.paymentStatus === 'pending' && <div className="space-y-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
            <label className="flex items-start gap-2 text-xs font-semibold"><input type="checkbox" checked={!!paymentChecked[application.id]} onChange={event => setPaymentChecked(old => ({ ...old, [application.id]: event.target.checked }))} />I checked the screenshot received on WhatsApp and independently confirmed ₹1,000 credit in bank/UPI.</label>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === application.id || !paymentChecked[application.id] || !application.paymentUtr} onClick={() => verifyPayment(application, true)} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40">Confirm ₹1,000 bank credit</button><button type="button" disabled={busyId === application.id} onClick={() => verifyPayment(application, false)} className="min-h-10 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-40">Reject payment</button></div>
          </div>}
          {application.status === 'pending' && application.paymentStatus === 'verified' && <div className="space-y-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30"><label className="flex items-start gap-2 text-xs font-semibold"><input type="checkbox" checked={!!proofChecked[application.id]} onChange={event => setProofChecked(old => ({ ...old, [application.id]: event.target.checked }))} />I checked the WhatsApp payment proof and property ownership details.</label><button type="button" disabled={busyId === application.id || !proofChecked[application.id]} onClick={() => approveSubscription(application)} className="min-h-11 w-full rounded-xl bg-emerald-600 px-3 text-sm font-extrabold text-white disabled:opacity-40"><CheckCircle2 className="mr-1 inline h-4 w-4" />Activate one paid month</button></div>}
          {application.status === 'pending' && <button type="button" disabled={busyId === application.id} onClick={() => rejectApplication(application)} className="min-h-10 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white"><XCircle className="mr-1 inline h-4 w-4" />Reject application</button>}
          {application.status === 'approved' && <p className="text-xs text-emerald-700 dark:text-emerald-300">Subscription active until {application.verifiedUntil ? new Date(application.verifiedUntil).toLocaleDateString('en-IN') : '—'}.</p>}
          {application.status === 'rejected' && <p className="text-xs text-rose-600">{application.reviewNote || 'Rejected'}</p>}
        </article>
      ))}
      <p className="text-[11px] text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />UTR is not payment confirmation. Check the actual bank credit before activating the subscription.</p>
    </section>
  );
};
