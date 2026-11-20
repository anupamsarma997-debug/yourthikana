import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { BadgeCheck, Clock3, FileCheck2, Upload, Wallet } from 'lucide-react';
import { auth, db, storage } from '../lib/firebase';
import { Property } from '../types';

type Application = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt?: any;
  approvedAt?: string;
  freeTrialEndsAt?: string;
  verifiedUntil?: string;
  paymentStatus?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  paymentUtr?: string;
  documentPaths?: string[];
  reviewNote?: string;
};

const UPI_ID = 'anupamsarma997-1@okhdfcbank';
const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN') : '—';

export const BlueTickOwnerPanel: React.FC<{ properties: Property[] }> = ({ properties }) => {
  const uid = auth?.currentUser?.uid || '';
  const [applications, setApplications] = useState<Application[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [utrById, setUtrById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const ownedProperties = useMemo(
    () => properties.filter((property) => property.ownerUid === uid),
    [properties, uid]
  );

  useEffect(() => {
    if (!db || !uid) {
      setApplications([]);
      return;
    }
    const applicationsQuery = query(collection(db, 'verificationApplications'), where('ownerUid', '==', uid));
    return onSnapshot(applicationsQuery, (snapshot) => {
      setApplications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Application)));
    }, (error) => {
      console.error('Blue Tick application listener failed:', error);
      setMessage('Verification status load nahi ho paya. Please refresh karke dobara try karein.');
    });
  }, [uid]);

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    const user = auth?.currentUser;
    if (!db || !storage || !user) {
      setMessage('Pehle apne owner Google account se sign in karein.');
      return;
    }
    const property = ownedProperties.find((item) => item.id === propertyId);
    if (!property) {
      setMessage('Apni property select karein.');
      return;
    }
    if (files.length < 1 || files.length > 3) {
      setMessage('1 se 3 supporting documents upload karein.');
      return;
    }
    const invalid = files.find((file) =>
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) ||
      file.size <= 0 || file.size > 8 * 1024 * 1024
    );
    if (invalid) {
      setMessage('Sirf JPG, PNG, WEBP ya PDF file chalegi; har file 8 MB se chhoti honi chahiye.');
      return;
    }
    if (applications.some((item) => item.propertyId === propertyId && item.status !== 'rejected')) {
      setMessage('Is property ki application pehle se pending ya approved hai.');
      return;
    }

    setBusy(true);
    try {
      const applicationRef = await addDoc(collection(db, 'verificationApplications'), {
        ownerUid: user.uid,
        propertyId: property.id,
        propertyTitle: property.title,
        status: 'pending',
        paymentStatus: 'not_submitted',
        documentCount: files.length,
        documentPaths: files.map((file, index) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || `document-${index + 1}`;
          return `verification-documents/${user.uid}/APPLICATION_ID/${index}-${safeName}`;
        }),
        submittedAt: serverTimestamp(),
      });
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || `document-${index + 1}`;
        const path = `verification-documents/${user.uid}/${applicationRef.id}/${index}-${safeName}`;
        await uploadBytes(ref(storage, path), file, { contentType: file.type });
      }
      await updateDoc(applicationRef, {
        documentPaths: files.map((file, index) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || `document-${index + 1}`;
          return `verification-documents/${user.uid}/${applicationRef.id}/${index}-${safeName}`;
        }),
      });
      setFiles([]);
      setPropertyId('');
      setMessage('Application submit ho gayi. Admin documents review karke approval dega.');
    } catch (error: any) {
      console.error('Blue Tick application failed:', error);
      setMessage(error?.message || 'Application submit nahi ho payi. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async (application: Application) => {
    if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) return;
    const utr = (utrById[application.id] || '').trim();
    if (!/^[A-Za-z0-9-]{8,30}$/.test(utr)) {
      setMessage('Valid UTR / transaction ID enter karein (8–30 characters).');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await updateDoc(doc(db, 'verificationApplications', application.id), {
        paymentUtr: utr,
        paymentSubmittedAt: serverTimestamp(),
        paymentStatus: 'pending',
      });
      setUtrById((current) => ({ ...current, [application.id]: '' }));
      setMessage('Payment details admin ko bhej di gayi hain. Admin confirm karega tabhi Blue Tick renew hoga.');
    } catch (error: any) {
      console.error('Blue Tick payment submission failed:', error);
      setMessage(error?.message || 'Payment details submit nahi ho payi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-800 rounded-3xl border border-blue-200 dark:border-blue-900 p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 dark:bg-blue-950 p-3"><BadgeCheck className="w-6 h-6 text-blue-600" /></div>
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">Optional Blue Tick Verification</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Normal listing bilkul free rahegi. Blue Tick sirf un owners ke liye hai jo optional verification chahte hain.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><strong>1. Apply</strong><p className="mt-1 text-slate-500">Property proof submit karein.</p></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><strong>2. Free trial</strong><p className="mt-1 text-slate-500">Approval date se 3 calendar months free.</p></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><strong>3. Renewal</strong><p className="mt-1 text-slate-500">Uske baad ₹1,000 per month.</p></div>
      </div>

      <form onSubmit={submitApplication} className="space-y-3 border-t border-slate-100 dark:border-slate-700 pt-4">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Choose your property</label>
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm">
          <option value="">Select a property</option>
          {ownedProperties.map((property) => <option key={property.id} value={property.id}>{property.title} — {property.city}</option>)}
        </select>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Supporting proof (1–3 files, JPG/PNG/WEBP/PDF, max 8 MB each)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 3))} className="w-full text-xs text-slate-600 dark:text-slate-300" />
        <p className="text-[11px] text-slate-500">Business/property ownership proof use karein. Aadhaar number ya unnecessary personal details ko hide karke upload karein. Documents private rahenge aur sirf authorized admin review karega.</p>
        <button disabled={busy || !ownedProperties.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-extrabold text-white disabled:opacity-50"><Upload className="w-4 h-4" />{busy ? 'Submitting…' : 'Apply for Blue Tick'}</button>
      </form>

      {message && <p role="status" className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-700 dark:text-slate-200">{message}</p>}

      <div className="space-y-3">
        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Your verification applications</h4>
        {applications.length === 0 && <p className="text-xs text-slate-500">Abhi koi Blue Tick application nahi hai.</p>}
        {applications.map((application) => (
          <div key={application.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-bold text-sm text-slate-900 dark:text-white">{application.propertyTitle}</p><p className="text-[11px] text-slate-500">Status: {application.status} · {application.documentPaths?.length || 0} private documents</p></div>
              <span className="text-[10px] uppercase font-black rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1">{application.status}</span>
            </div>
            {application.status === 'approved' && <p className="text-xs text-slate-600 dark:text-slate-300"><Clock3 className="inline w-3.5 h-3.5 mr-1" />Free trial / current validity ends: <strong>{formatDate(application.verifiedUntil || application.freeTrialEndsAt)}</strong></p>}
            {application.status === 'rejected' && <p className="text-xs text-rose-600">Review note: {application.reviewNote || 'Please contact support before reapplying.'}</p>}
            {application.status === 'approved' && new Date(application.verifiedUntil || application.freeTrialEndsAt || 0).getTime() <= Date.now() && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-3 space-y-2">
                <p className="text-xs font-bold text-blue-900 dark:text-blue-200"><Wallet className="inline w-4 h-4 mr-1" />Renew Blue Tick — ₹1,000/month</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">UPI ID: <strong>{UPI_ID}</strong></p>
                <p className="text-[11px] text-slate-500">UPI payment ke baad UTR enter karein. Sirf UTR submit karne se badge activate nahi hoga; admin payment confirm karega.</p>
                <input value={utrById[application.id] || ''} onChange={(event) => setUtrById((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="UPI UTR / transaction ID" className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 text-xs" />
                <button type="button" disabled={busy || application.paymentStatus === 'pending'} onClick={() => submitPayment(application)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{application.paymentStatus === 'pending' ? 'Payment under review' : 'Submit payment reference'}</button>
              </div>
            )}
            {application.paymentStatus === 'pending' && <p className="text-xs text-amber-600">Payment UTR admin verification ke liye pending hai.</p>}
            {application.paymentStatus === 'rejected' && <p className="text-xs text-rose-600">Payment verify nahi hua. Correct UTR ke saath dobara submit karein.</p>}
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 flex items-start gap-2"><FileCheck2 className="w-4 h-4 shrink-0" />Blue Tick ka matlab YourThikana ne submitted proof review kiya hai; yeh government certification nahi hai. Badge expiry par normal listing active rahegi.</div>
    </section>
  );
};
