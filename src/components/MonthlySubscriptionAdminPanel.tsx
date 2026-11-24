import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
import { getDownloadURL, listAll, ref } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { CalendarClock, CheckCircle2, Clock3, FileImage, MessageCircle, XCircle } from 'lucide-react';

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

function EvidenceFiles({ application, onCount }: { application: Application; onCount: (count: number) => void }) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!storage) return;
    listAll(ref(storage, `subscription-documents/${application.ownerUid}/${application.id}`)).then(async result => {
      const items = await Promise.all(result.items.map(async item => ({ name: item.name, url: await getDownloadURL(item) })));
      if (active) { setFiles(items); onCount(items.length); }
    }).catch(err => {
      console.error('Could not load subscription evidence:', err);
      if (active) { setError('Payment screenshot load nahi hua. Storage permission check karein.'); onCount(0); }
    });
    return () => { active = false; };
  }, [application.ownerUid, application.id, onCount]);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <p className="text-xs font-bold">Payment evidence</p>
      {files.map(file => <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 break-all text-xs font-semibold text-blue-700 dark:text-blue-300"><FileImage className="h-4 w-4 shrink-0" />{file.name}</a>)}
      {!files.length && !error && <p className="text-[11px] text-slate-500">No payment screenshot uploaded yet.</p>}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}

export const MonthlySubscriptionAdminPanel: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [proofChecked, setProofChecked] = useState<Record<string, boolean>>({});
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

  const updateFileCount = React.useCallback((id: string, count: number) => {
    setFileCounts(old => old[id] === count ? old : { ...old, [id]: count });
  }, []);

  const verifyPayment = async (application: Application, approve: boolean) => {
    if (!db || !auth?.currentUser || !application.paymentUtr) return;
    if (approve && !(fileCounts[application.id] > 0)) {
      setMessage('Payment screenshot pehle upload hona chahiye.');
      return;
    }
    setBusyId(application.id); setMessage('');
    try {
      await updateDoc(doc(db, 'subscriptionApplications', application.id), approve
        ? { paymentStatus: 'verified', paymentVerifiedAt: serverTimestamp(), paymentVerifiedBy: auth.currentUser.uid }
        : { status: 'rejected', paymentStatus: 'rejected', reviewNote: 'Payment credit could not be confirmed. Please upload a new screenshot and UTR.', paymentReviewedAt: serverTimestamp(), paymentReviewedBy: auth.currentUser.uid });
      setMessage(approve ? '₹1,000 bank credit verified. Final approval can now be completed.' : 'Payment rejected. Owner can resubmit a corrected proof.');
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
      if (!propertySnapshot.exists() || propertySnapshot.data().ownerUid !== application.ownerUid || propertySnapshot.data().status !== 'active') {
        setMessage('Property missing, not active, or owner mismatch. Subscription cannot be approved.');
        return;
      }
      const property = propertySnapshot.data();
      const now = new Date();
      const existingExpiry = property.subscriptionExpiresAt || property.subscriptionExpiryDate;
      const parsedExpiry = existingExpiry ? new Date(existingExpiry) : now;
      const renewalBase = Number.isFinite(parsedExpiry.getTime()) && parsedExpiry.getTime() > now.getTime() ? parsedExpiry : now;
      const nextExpiry = addCalendarMonths(renewalBase, 1).toISOString();
      const batch = writeBatch(db);
      batch.update(doc(db, 'subscriptionApplications', application.id), {
        status: 'approved',
        verifiedUntil: nextExpiry,
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser.uid,
      });
      batch.update(propertyRef, {
        subscriptionStatus: 'active',
        subscriptionPlan: 'standard_1000',
        subscriptionPrice: 1000,
        subscriptionExpiresAt: nextExpiry,
        subscriptionExpiryDate: nextExpiry,
      });
      batch.set(doc(db, 'transactions', `subscription-${application.id}`), {
        id: `subscription-${application.id}`,
        ownerId: application.ownerUid,
        ownerName: property.ownerName || 'Property owner',
        propertyId: application.propertyId,
        propertyName: application.propertyTitle,
        type: 'standard_1000',
        planName: 'Monthly Platform Subscription',
        amount: 1000,
        date: now.toLocaleDateString('en-IN'),
        validUntil: nextExpiry,
        createdAt: now.toISOString(),
      });
      await batch.commit();
      setMessage('Monthly subscription approved for one calendar month after bank-credit and property-proof checks.');
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
        status: 'rejected',
        reviewNote: 'Application needs correction. Please contact YourThikana support.',
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser.uid,
      });
      setMessage('Subscription application rejected.');
    } catch (error: any) {
      setMessage(error?.message || 'Application reject nahi hui.');
    } finally { setBusyId(''); }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-200 bg-white p-5 shadow-md dark:border-emerald-900 dark:bg-slate-800">
      <header className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-3 dark:bg-emerald-950"><CalendarClock className="h-6 w-6 text-emerald-700 dark:text-emerald-300" /></div><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Monthly Subscription Review</h2><p className="text-xs text-slate-500">₹1,000 per property per calendar month · {applications.filter(a => a.status === 'pending').length} awaiting review</p></div></header>
      {message && <p role="status" aria-live="polite" className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">{message}</p>}
      {!applications.length && <p className="text-sm text-slate-500">No monthly subscription requests.</p>}
      {applications.map(application => (
        <article key={application.id} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{application.propertyTitle}</h3><p className="mt-1 break-all text-[10px] text-slate-500">Property: {application.propertyId} · Owner: {application.ownerUid}</p><p className="mt-1 break-all text-[10px] text-slate-500">Application: {application.id}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black uppercase dark:bg-slate-700">{application.status} · {application.paymentStatus}</span></div>
          <EvidenceFiles application={application} onCount={count => updateFileCount(application.id, count)} />
          {(application.status === 'pending' || application.status === 'approved') && application.paymentStatus === 'pending' && <div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === application.id || !(fileCounts[application.id] > 0)} onClick={() => verifyPayment(application, true)} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40">Confirm ₹1,000 bank credit</button><button type="button" disabled={busyId === application.id} onClick={() => verifyPayment(application, false)} className="min-h-10 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-40">Reject payment</button></div>}
          {application.status === 'pending' && application.paymentStatus === 'verified' && <div className="space-y-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={!!proofChecked[application.id]} onChange={event => setProofChecked(old => ({ ...old, [application.id]: event.target.checked }))} />I checked the payment screenshot and property ownership.</label><button type="button" disabled={busyId === application.id || !proofChecked[application.id]} onClick={() => approveSubscription(application)} className="min-h-11 w-full rounded-xl bg-emerald-600 px-3 text-sm font-extrabold text-white disabled:opacity-40"><CheckCircle2 className="mr-1 inline h-4 w-4" />Activate one paid month</button></div>}
          {application.status === 'pending' && <button type="button" disabled={busyId === application.id} onClick={() => rejectApplication(application)} className="min-h-10 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white"><XCircle className="mr-1 inline h-4 w-4" />Reject application</button>}
          {application.status === 'approved' && <p className="text-xs text-emerald-700 dark:text-emerald-300">Subscription active until {application.verifiedUntil ? new Date(application.verifiedUntil).toLocaleDateString('en-IN') : '—'}.</p>}
          {application.status === 'rejected' && <p className="text-xs text-rose-600">{application.reviewNote || 'Rejected'}</p>}
          <a href={`https://wa.me/919101280465?text=${encodeURIComponent('Hello YourThikana Support, subscription application '+application.id+' for '+application.propertyTitle)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"><MessageCircle className="h-4 w-4" />WhatsApp support</a>
        </article>
      ))}
      <p className="text-[11px] text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />UTR is not payment confirmation. Check the actual bank credit before activating the subscription.</p>
    </section>
  );
};
