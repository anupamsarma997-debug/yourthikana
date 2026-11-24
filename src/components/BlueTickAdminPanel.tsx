import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { getDownloadURL, listAll, ref } from 'firebase/storage';
import { BadgeCheck, CheckCircle2, MessageCircle, RefreshCw, XCircle, FileImage } from 'lucide-react';
import { auth, db, storage } from '../lib/firebase';

type VerificationApplication = {
  id: string;
  ownerUid: string;
  propertyId: string;
  propertyTitle: string;
  status: 'pending' | 'approved' | 'rejected';
  paymentStatus?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  paymentUtr?: string;
  paymentSubmittedAt?: any;
  submittedAt?: any;
  verifiedUntil?: string;
  freeTrialEndsAt?: string;
};

function EvidenceFiles({ application, onPropertyDocsCount }: { application: VerificationApplication; onPropertyDocsCount: (count: number) => void }) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!storage) return;
    const folder = ref(storage, `verification-documents/${application.ownerUid}/${application.id}`);
    listAll(folder).then(async result => {
      const items = await Promise.all(result.items.map(async item => ({ name: item.name, url: await getDownloadURL(item) })));
      if (active) { setFiles(items); onPropertyDocsCount(items.filter(item => item.name.startsWith('property-')).length); }
    }).catch(err => {
      console.error('Could not load private verification evidence:', err);
      if (active) { setError('Evidence list available nahi hai. Admin Storage permission check karein.'); onPropertyDocsCount(0); }
    });
    return () => { active = false; };
  }, [application.ownerUid, application.id, onPropertyDocsCount]);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <p className="text-xs font-bold">Uploaded payment screenshot & property documents</p>
      {files.map(file => <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 break-all text-xs font-semibold text-blue-700 dark:text-blue-300"><FileImage className="h-4 w-4 shrink-0" />{file.name}</a>)}
      {!files.length && !error && <p className="text-[11px] text-slate-500">No uploaded files yet.</p>}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

const dateLabel = (value?: string) => value ? new Date(value).toLocaleString('en-IN') : '—';

export const BlueTickAdminPanel: React.FC = () => {
  const [applications, setApplications] = useState<VerificationApplication[]>([]);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [proofChecked, setProofChecked] = useState<Record<string, boolean>>({});
  const [propertyDocCounts, setPropertyDocCounts] = useState<Record<string, number>>({});
  const updatePropertyDocsCount = React.useCallback((id: string, count: number) => {
    setPropertyDocCounts(old => old[id] === count ? old : { ...old, [id]: count });
  }, []);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'verificationApplications'), snapshot => {
      setApplications(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as VerificationApplication)));
    }, error => {
      console.error('Verification applications listener failed:', error);
      setMessage('Applications load nahi hui. Firestore rules / connection check karein.');
    });
  }, []);

  const review = async (application: VerificationApplication, action: 'approve' | 'reject') => {
    if (!db || !auth?.currentUser) return;
    if (action === 'approve' && !(propertyDocCounts[application.id] > 0)) {
      setMessage('Property documents pehle upload aur admin ke dwara check hone chahiye.');
      return;
    }
    setBusyId(application.id); setMessage('');
    try {
      const propertyRef = doc(db, 'properties', application.propertyId);
      const propertySnapshot = await getDoc(propertyRef);
      if (action === 'approve' && (!propertySnapshot.exists() || propertySnapshot.data().status !== 'active')) {
        setMessage('Property deleted or not published. Blue Tick cannot be approved.'); return;
      }
      if (action === 'approve' && application.paymentStatus !== 'verified') {
        setMessage('Verify the ₹500 payment first. Blue Tick has no free trial.'); return;
      }
      const batch = writeBatch(db);
      const applicationRef = doc(db, 'verificationApplications', application.id);
      if (action === 'approve') {
        const approvedAt = new Date();
        const paidUntil = addCalendarMonths(approvedAt, 1).toISOString();
        batch.update(applicationRef, { status: 'approved', approvedAt: approvedAt.toISOString(), verifiedUntil: paidUntil, reviewedBy: auth.currentUser.uid });
        batch.update(propertyRef, { isVerified: true, verifiedUntil: paidUntil });
      } else {
        batch.update(applicationRef, { status: 'rejected', reviewNote: 'Application not approved. Please contact YourThikana support for clarification.', reviewedBy: auth.currentUser.uid, reviewedAt: new Date().toISOString() });
      }
      await batch.commit();
      setMessage(action === 'approve' ? 'Payment and property proof approved. Blue Tick activated for one paid month.' : 'Application rejected.');
    } catch (error: any) {
      console.error('Verification review failed:', error);
      setMessage(error?.message || 'Review action failed. Check admin claim and property record.');
    } finally { setBusyId(''); }
  };

  const verifyPayment = async (application: VerificationApplication, approve: boolean) => {
    if (!db || !auth?.currentUser || !application.paymentUtr) return;
    setBusyId(application.id); setMessage('');
    try {
      if (approve && application.status === 'approved') {
        const propertySnapshot = await getDoc(doc(db, 'properties', application.propertyId));
        if (!propertySnapshot.exists() || propertySnapshot.data().status !== 'active') {
          setMessage('Property deleted or not published. Blue Tick renewal cannot be activated.'); return;
        }
      }
      const batch = writeBatch(db);
      const applicationRef = doc(db, 'verificationApplications', application.id);
      if (approve) {
        const now = new Date();
        batch.update(applicationRef, { paymentStatus: 'verified', paymentVerifiedAt: now.toISOString(), paymentVerifiedBy: auth.currentUser.uid });
        if (application.status === 'approved') {
          const existingExpiry = application.verifiedUntil ? new Date(application.verifiedUntil) : now;
          const renewalBase = existingExpiry.getTime() > now.getTime() ? existingExpiry : now;
          const nextExpiry = addCalendarMonths(renewalBase, 1).toISOString();
          batch.update(applicationRef, { verifiedUntil: nextExpiry });
          batch.update(doc(db, 'properties', application.propertyId), { isVerified: true, verifiedUntil: nextExpiry });
        }
      } else {
        batch.update(applicationRef, { paymentStatus: 'rejected', paymentReviewNote: 'Payment reference could not be confirmed. Please check UTR and resubmit.', paymentReviewedAt: new Date().toISOString(), paymentReviewedBy: auth.currentUser.uid });
      }
      await batch.commit();
      setMessage(approve ? 'Payment verified. Blue Tick renewed for one calendar month.' : 'Payment reference rejected; owner can submit a corrected UTR.');
    } catch (error: any) {
      console.error('Payment verification failed:', error);
      setMessage(error?.message || 'Payment review failed.');
    } finally { setBusyId(''); }
  };

  const pending = applications.filter(item => item.status === 'pending');
  const paymentPending = applications.filter(item => (item.status === 'pending' || item.status === 'approved') && item.paymentStatus === 'pending');

  return (
    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-blue-200 dark:border-blue-900 p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-blue-100 dark:bg-blue-950 p-3"><BadgeCheck className="w-6 h-6 text-blue-600" /></div><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Blue Tick Verification Review</h2><p className="text-xs text-slate-500">Pending applications: {pending.length} · Payment checks: {paymentPending.length}</p></div></div>
      {message && <p role="status" className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs">{message}</p>}
      {applications.length === 0 && <p className="text-xs text-slate-500">No verification applications received yet.</p>}
      {applications.map(application => (
        <article key={application.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div><h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{application.propertyTitle}</h3><p className="text-[11px] text-slate-500">Property ID: {application.propertyId} · Owner UID: {application.ownerUid}</p><p className="text-[11px] text-slate-500">Applied: {application.submittedAt?.toDate ? dateLabel(application.submittedAt.toDate().toISOString()) : 'Timestamp pending'}</p><p className="text-[11px] text-slate-500">Application ID: {application.id}</p></div><span className="rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1 text-[10px] font-black uppercase">{application.status}{application.paymentStatus === 'pending' ? ' · PAYMENT PENDING' : ''}</span></div>
          <EvidenceFiles application={application} onPropertyDocsCount={count => updatePropertyDocsCount(application.id, count)} />
          <p className="text-[11px] text-slate-500">Property documents uploaded: {propertyDocCounts[application.id] || 0}</p>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 space-y-2"><p className="text-xs font-bold">WhatsApp Support</p><a href={`https://wa.me/919101280465?text=${encodeURIComponent('Please check Blue Tick proof for application '+application.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-green-700"><MessageCircle className="w-4 h-4" />Open WhatsApp</a>{application.status === 'pending' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!proofChecked[application.id]} onChange={event => setProofChecked(old => ({...old,[application.id]:event.target.checked}))} />I received and checked the property proof documents.</label>}</div>
          {application.status === 'pending' && <div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === application.id || !proofChecked[application.id] || application.paymentStatus !== 'verified' || !(propertyDocCounts[application.id] > 0)} onClick={() => review(application, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />Approve paid Blue Tick</button><button type="button" disabled={busyId === application.id} onClick={() => review(application, 'reject')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><XCircle className="w-4 h-4" />Reject</button></div>}
          {application.status === 'approved' && <p className="text-xs text-slate-600 dark:text-slate-300">Blue Tick valid until: <strong>{dateLabel(application.verifiedUntil || application.freeTrialEndsAt)}</strong></p>}
          {(application.status === 'pending' || application.status === 'approved') && application.paymentStatus === 'pending' && <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2"><p className="text-xs font-bold text-amber-900 dark:text-amber-200">Payment UTR: {application.paymentUtr}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === application.id} onClick={() => verifyPayment(application, true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Confirm ₹500 bank credit</button><button type="button" disabled={busyId === application.id} onClick={() => verifyPayment(application, false)} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Reject UTR</button></div></div>}
        </article>
      ))}
      <p className="text-[11px] text-slate-500"><RefreshCw className="inline w-3.5 h-3.5 mr-1" />Payment UTR is not proof by itself. Verify ₹500 credit in bank/UPI account before approving.</p>
    </section>
  );
};
