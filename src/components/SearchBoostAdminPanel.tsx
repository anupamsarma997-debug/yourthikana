import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { BadgePercent, CheckCircle2, XCircle } from 'lucide-react';
import { auth, db, storage } from '../lib/firebase';

type SearchBoostApplication = {
  id: string;
  ownerUid: string;
  propertyId: string;
  propertyTitle: string;
  status: 'pending' | 'approved' | 'rejected';
  paymentStatus: 'pending' | 'verified' | 'rejected';
  paymentUtr: string;
  submittedAt?: any;
  featuredUntil?: string;
};

function addCalendarMonth(date: Date): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + 1);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

export const SearchBoostAdminPanel: React.FC = () => {
  const [applications, setApplications] = useState<SearchBoostApplication[]>([]);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'searchBoostApplications'), (snapshot) => {
      setApplications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SearchBoostApplication)));
    }, (error) => {
      console.error('Search Boost admin listener failed:', error);
      setMessage('Search Boost requests load nahi hue. Admin claim / Firestore rules check karein.');
    });
  }, []);

  useEffect(() => {
    if (!storage || !auth?.currentUser) return;
    let cancelled = false;
    const loadProofs = async () => {
      const entries = await Promise.all(applications.map(async (application) => {
        try {
          const url = await getDownloadURL(storageRef(storage, `search-boost-documents/${application.ownerUid}/${application.id}/proof`));
          return [application.id, url] as const;
        } catch {
          return [application.id, ''] as const;
        }
      }));
      if (!cancelled) setProofUrls(Object.fromEntries(entries.filter((entry) => entry[1])));
    };
    if (applications.length) void loadProofs();
    return () => { cancelled = true; };
  }, [applications]);

  const review = async (application: SearchBoostApplication, approve: boolean) => {
    if (!db || !auth?.currentUser) return;
    setBusyId(application.id);
    setMessage('');
    try {
      const propertyRef = doc(db, 'properties', application.propertyId);
      const propertySnapshot = await getDoc(propertyRef);
      if (approve && (!propertySnapshot.exists() || propertySnapshot.data().status !== 'active')) {
        setMessage('Property abhi approved/published nahi hai. Pehle property approval check karein.');
        return;
      }
      const now = new Date();
      const batch = writeBatch(db);
      const applicationRef = doc(db, 'searchBoostApplications', application.id);
      if (approve) {
        const currentFeaturedUntil = propertySnapshot.data().featuredUntil ? new Date(propertySnapshot.data().featuredUntil) : now;
        const renewalBase = currentFeaturedUntil.getTime() > now.getTime() ? currentFeaturedUntil : now;
        const featuredUntil = addCalendarMonth(renewalBase).toISOString();
        batch.update(applicationRef, {
          status: 'approved',
          paymentStatus: 'verified',
          reviewedAt: now.toISOString(),
          reviewedBy: auth.currentUser.uid,
          featuredUntil,
        });
        batch.update(propertyRef, {
          isFeatured: true,
          featuredUntil,
        });
      } else {
        batch.update(applicationRef, {
          status: 'rejected',
          paymentStatus: 'rejected',
          reviewedAt: now.toISOString(),
          reviewedBy: auth.currentUser.uid,
        });
      }
      await batch.commit();
      setMessage(approve ? 'Payment verified. Search Boost is active for one calendar month.' : 'Search Boost request rejected.');
    } catch (error: any) {
      console.error('Search Boost review failed:', error);
      setMessage(error?.message || 'Review failed. Check admin claim and Firestore rules.');
    } finally {
      setBusyId('');
    }
  };

  const pending = applications.filter((item) => item.status === 'pending');
  const active = applications.filter((item) => item.status === 'approved' && item.featuredUntil && Date.parse(item.featuredUntil) > Date.now());
  return (
    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-amber-200 dark:border-amber-900 p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-100 dark:bg-amber-950 p-3"><BadgePercent className="w-6 h-6 text-amber-600" /></div><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Search Boost Review</h2><p className="text-xs text-slate-500">Pending: {pending.length} · Active: {active.length} · Price: ₹500 / month</p></div></div>
      {message && <p role="status" className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs">{message}</p>}
      {applications.length === 0 && <p className="text-xs text-slate-500">No Search Boost requests received yet.</p>}
      {applications.map((application) => (
        <article key={application.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{application.propertyTitle}</h3><p className="text-[11px] text-slate-500">Property: {application.propertyId} · Owner UID: {application.ownerUid}</p><p className="text-xs font-bold text-amber-700 dark:text-amber-300">Payment UTR: {application.paymentUtr}</p></div><span className="rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1 text-[10px] font-black uppercase">{application.status} / {application.paymentStatus}</span></div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs"><p className="font-bold text-slate-700 dark:text-slate-200">Property proof document</p>{proofUrls[application.id] ? <a href={proofUrls[application.id]} target="_blank" rel="noreferrer" className="mt-1 inline-block font-bold text-blue-600 underline">Open uploaded proof document</a> : <p className="mt-1 text-rose-600">Proof document missing or inaccessible — do not approve until checked.</p>}</div>
          {application.status === 'pending' && <div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === application.id} onClick={() => review(application, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />Confirm ₹500 credit & activate</button><button type="button" disabled={busyId === application.id} onClick={() => review(application, false)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><XCircle className="w-4 h-4" />Reject</button></div>}
          {application.featuredUntil && <p className="text-xs text-slate-500">Boost valid until: {new Date(application.featuredUntil).toLocaleDateString('en-IN')}</p>}
        </article>
      ))}
      <p className="text-[11px] text-slate-500">Proof document ko property details se match karein. UTR sirf reference hai, Approve karne se pehle apne UPI/bank account mein ₹500 credit independently confirm karein.</p>
    </section>
  );
};
