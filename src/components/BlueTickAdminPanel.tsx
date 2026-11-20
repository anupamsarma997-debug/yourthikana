import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { getBlob, ref } from 'firebase/storage';
import { BadgeCheck, CheckCircle2, Download, FileText, RefreshCw, XCircle } from 'lucide-react';
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
  documentPaths?: string[];
  verifiedUntil?: string;
  freeTrialEndsAt?: string;
  documentCount?: number;
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

const dateLabel = (value?: string) => value ? new Date(value).toLocaleString('en-IN') : '—';

export const BlueTickAdminPanel: React.FC = () => {
  const [applications, setApplications] = useState<VerificationApplication[]>([]);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'verificationApplications'), (snapshot) => {
      setApplications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as VerificationApplication)));
    }, (error) => {
      console.error('Verification applications listener failed:', error);
      setMessage('Applications load nahi hui. Firestore rules / connection check karein.');
    });
  }, []);

  const review = async (application: VerificationApplication, action: 'approve' | 'reject') => {
    if (!db || !auth?.currentUser) return;
    setBusyId(application.id);
    setMessage('');
    try {
      const batch = writeBatch(db);
      const applicationRef = doc(db, 'verificationApplications', application.id);
      if (action === 'approve') {
        const approvedAt = new Date();
        const freeTrialEndsAt = addCalendarMonths(approvedAt, 3).toISOString();
        batch.update(applicationRef, {
          status: 'approved',
          approvedAt: approvedAt.toISOString(),
          freeTrialEndsAt,
          verifiedUntil: freeTrialEndsAt,
          paymentStatus: 'not_submitted',
          reviewedBy: auth.currentUser.uid,
        });
        batch.update(doc(db, 'properties', application.propertyId), {
          isVerified: true,
          verifiedUntil: freeTrialEndsAt,
        });
      } else {
        batch.update(applicationRef, {
          status: 'rejected',
          reviewNote: 'Application not approved. Please contact YourThikana support for clarification.',
          reviewedBy: auth.currentUser.uid,
          reviewedAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      setMessage(action === 'approve' ? 'Application approved. Three-month free period starts now.' : 'Application rejected.');
    } catch (error: any) {
      console.error('Verification review failed:', error);
      setMessage(error?.message || 'Review action failed. Check admin claim and property record.');
    } finally {
      setBusyId('');
    }
  };

  const verifyPayment = async (application: VerificationApplication, approve: boolean) => {
    if (!db || !auth?.currentUser || !application.paymentUtr) return;
    setBusyId(application.id);
    setMessage('');
    try {
      const batch = writeBatch(db);
      const applicationRef = doc(db, 'verificationApplications', application.id);
      if (approve) {
        const now = new Date();
        const existingExpiry = application.verifiedUntil ? new Date(application.verifiedUntil) : now;
        const renewalBase = existingExpiry.getTime() > now.getTime() ? existingExpiry : now;
        const nextExpiry = addCalendarMonths(renewalBase, 1).toISOString();
        batch.update(applicationRef, {
          paymentStatus: 'verified',
          paymentVerifiedAt: now.toISOString(),
          paymentVerifiedBy: auth.currentUser.uid,
          verifiedUntil: nextExpiry,
        });
        batch.update(doc(db, 'properties', application.propertyId), {
          isVerified: true,
          verifiedUntil: nextExpiry,
        });
      } else {
        batch.update(applicationRef, {
          paymentStatus: 'rejected',
          paymentReviewNote: 'Payment reference could not be confirmed. Please check UTR and resubmit.',
          paymentReviewedAt: new Date().toISOString(),
          paymentReviewedBy: auth.currentUser.uid,
        });
      }
      await batch.commit();
      setMessage(approve ? 'Payment verified. Blue Tick renewed for one calendar month.' : 'Payment reference rejected; owner can submit a corrected UTR.');
    } catch (error: any) {
      console.error('Payment verification failed:', error);
      setMessage(error?.message || 'Payment review failed.');
    } finally {
      setBusyId('');
    }
  };

  const openPrivateDocument = async (path: string) => {
    if (!storage) return;
    try {
      const blob = await getBlob(ref(storage, path));
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const link = document.createElement('a');
        link.href = url;
        link.download = path.split('/').pop() || 'verification-document';
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: any) {
      console.error('Private document retrieval failed:', error);
      setMessage('Private document open nahi hua. Storage rules / bucket CORS check karein.');
    }
  };

  const pending = applications.filter((item) => item.status === 'pending');
  const paymentPending = applications.filter((item) => item.status === 'approved' && item.paymentStatus === 'pending');

  return (
    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-blue-200 dark:border-blue-900 p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-100 dark:bg-blue-950 p-3"><BadgeCheck className="w-6 h-6 text-blue-600" /></div>
        <div><h2 className="text-lg font-black text-slate-900 dark:text-white">Blue Tick Verification Review</h2><p className="text-xs text-slate-500">Pending applications: {pending.length} · Payment checks: {paymentPending.length}</p></div>
      </div>
      {message && <p role="status" className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs">{message}</p>}
      {applications.length === 0 && <p className="text-xs text-slate-500">No verification applications received yet.</p>}
      {applications.map((application) => (
        <article key={application.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div><h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{application.propertyTitle}</h3><p className="text-[11px] text-slate-500">Property ID: {application.propertyId} · Owner UID: {application.ownerUid}</p><p className="text-[11px] text-slate-500">Applied: {application.submittedAt?.toDate ? dateLabel(application.submittedAt.toDate().toISOString()) : 'Timestamp pending'}</p></div>
            <span className="rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1 text-[10px] font-black uppercase">{application.status}{application.paymentStatus === 'pending' ? ' · PAYMENT PENDING' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(application.documentPaths || []).map((path) => (
              <button key={path} type="button" onClick={() => openPrivateDocument(path)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-bold"><FileText className="w-4 h-4" /><Download className="w-3 h-3" />Private proof {((application.documentPaths || []).indexOf(path)) + 1}</button>
            ))}
          </div>
          {application.status === 'pending' && (
            <div className="flex gap-2">
              <button type="button" disabled={busyId === application.id} onClick={() => review(application, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />Approve — start 3-month free trial</button>
              <button type="button" disabled={busyId === application.id} onClick={() => review(application, 'reject')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><XCircle className="w-4 h-4" />Reject</button>
            </div>
          )}
          {application.status === 'approved' && <p className="text-xs text-slate-600 dark:text-slate-300">Blue Tick valid until: <strong>{dateLabel(application.verifiedUntil || application.freeTrialEndsAt)}</strong></p>}
          {application.status === 'approved' && application.paymentStatus === 'pending' && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Payment UTR: {application.paymentUtr}</p>
              <div className="flex gap-2">
                <button type="button" disabled={busyId === application.id} onClick={() => verifyPayment(application, true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Confirm ₹500 and renew</button>
                <button type="button" disabled={busyId === application.id} onClick={() => verifyPayment(application, false)} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Reject UTR</button>
              </div>
            </div>
          )}
        </article>
      ))}
      <p className="text-[11px] text-slate-500"><RefreshCw className="inline w-3.5 h-3.5 mr-1" />Payment UTR is not proof by itself. Verify the ₹500 credit in your UPI/bank account before approving a renewal.</p>
    </section>
  );
};
