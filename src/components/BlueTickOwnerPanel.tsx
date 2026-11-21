import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, doc, where } from 'firebase/firestore';
import { BadgeCheck, Clock3, FileCheck2, MessageCircle, Upload } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { Property } from '../types';
import { PaymentProofShare } from './PaymentProofShare';

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
  proofStatus?: string;
  reviewNote?: string;
};

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN') : '—';

export const BlueTickOwnerPanel: React.FC<{ properties: Property[]; selectedPropertyId?: string }> = ({ properties, selectedPropertyId }) => {
  const uid = auth?.currentUser?.uid || '';
  const [applications, setApplications] = useState<Application[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
  const [proofShareTarget, setProofShareTarget] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const ownedProperties = useMemo(
    () => properties.filter((property) => property.ownerUid === uid && property.status === 'active'),
    [properties, uid]
  );

  useEffect(() => {
    if (selectedPropertyId && ownedProperties.some((property) => property.id === selectedPropertyId)) {
      setPropertyId(selectedPropertyId);
    }
  }, [selectedPropertyId, ownedProperties]);

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
    if (!db || !user) {
      setMessage('Pehle apne owner Google account se sign in karein.');
      return;
    }
    const property = ownedProperties.find((item) => item.id === propertyId);
    if (!property) {
      setMessage('Apni property select karein.');
      return;
    }
    if (applications.some((item) => item.propertyId === propertyId && item.status !== 'rejected')) {
      setMessage('Is property ki application pehle se pending ya approved hai.');
      return;
    }

    if (selectedDocuments.length === 0) {
      setMessage('Kam se kam ek property proof document (photo ya PDF) select karein.');
      return;
    }
    if (selectedDocuments.some((file) => !(file.type.startsWith('image/') || file.type === 'application/pdf') && !/\\.(jpe?g|png|webp|heic|pdf)$/i.test(file.name))) {
      setMessage('Sirf image ya PDF documents select karein.');
      return;
    }
    if (selectedDocuments.length > 5 || selectedDocuments.some((file) => file.size > 10 * 1024 * 1024) || selectedDocuments.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setMessage('Maximum 5 files select karein. Har file 10 MB aur total size 20 MB se kam hona chahiye.');
      return;
    }
    setBusy(true);
    try {
      const applicationRef = doc(collection(db, 'verificationApplications'));
      await setDoc(applicationRef, {
        ownerUid: user.uid, propertyId: property.id, propertyTitle: property.title,
        status: 'pending', paymentStatus: 'not_submitted',
        documentCount: selectedDocuments.length, documentPaths: [],
        proofSubmissionMethod: 'device_share', proofStatus: 'awaiting_owner_share',
        submittedAt: serverTimestamp(),
      });
      setProofShareTarget({ id: applicationRef.id, title: property.title });
      setPropertyId('');
      setMessage('Application save ho gayi. ₹500 payment proof aur property documents dono submit karein. Admin bank payment aur documents verify karne ke baad hi Blue Tick activate karega.');
    } catch (error: any) {
      console.error('Blue Tick application failed:', error);
      setMessage(error?.message || 'Application submit nahi ho payi. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const shareProofDocuments = async (applicationId: string, propertyTitle: string) => {
    const files = selectedDocuments;
    const text = `Hello YourThikana Admin, Blue Tick proof documents for application ${applicationId}. Property: ${propertyTitle}. Please review these attached documents manually. I understand that the application is not approved until review is complete.`;
    if (!files.length) { setMessage('Pehle upar documents select karein.'); return; }
    if (!navigator.share || !navigator.canShare || !navigator.canShare({ files })) {
      setMessage('Is browser mein file attachment share supported nahi hai. Android Chrome mein kholkar try karein, ya WhatsApp mein Admin +91 9101280465 ko documents manually attach karein.');
      return;
    }
    try {
      await navigator.share({ files, title: 'YourThikana Blue Tick documents', text });
      if (db && auth?.currentUser?.uid === uid) await updateDoc(doc(db, 'verificationApplications', applicationId), { proofStatus: 'share_sheet_completed', proofSharedAt: serverTimestamp() });
      setMessage('Share complete hua. WhatsApp mein Admin +91 9101280465 ko select karke Send confirm karein. Admin ke receive aur review se pehle application approved nahi hogi.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') setMessage('Share cancel hua. Application saved hai; documents bhejne ke liye dobara button dabayein.');
      else { console.error('Blue Tick document sharing failed:', error); setMessage('Documents share nahi ho paye. Dobara try karein.'); }
    }
  };

  const markPaymentSubmitted = async (application: Application, utr: string) => {
    if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) throw new Error('Please sign in again.');
    await updateDoc(doc(db, 'verificationApplications', application.id), {
      paymentUtr: utr,
      paymentSubmittedAt: serverTimestamp(),
      paymentStatus: 'pending',
      proofSubmissionMethod: 'whatsapp',
      proofStatus: 'share_sheet_opened',
    });
  };

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-3xl border border-blue-200 bg-white p-4 space-y-5 dark:border-blue-900 dark:bg-slate-800 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 dark:bg-blue-950 p-3"><BadgeCheck className="w-6 h-6 text-blue-600" /></div>
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">Optional Blue Tick Verification</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Normal listing bilkul free rahegi. Blue Tick sirf un owners ke liye hai jo optional verification chahte hain.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><strong>1. Apply</strong><p className="mt-1 text-slate-500">Property proof submit karein.</p></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><strong>2. Payment</strong><p className="mt-1 text-slate-500">₹500/month. No free trial; admin verifies payment.</p></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><strong>3. Review</strong><p className="mt-1 text-slate-500">Badge starts only after payment and document approval.</p></div>
      </div>

      <form onSubmit={submitApplication} className="space-y-3 border-t border-slate-100 dark:border-slate-700 pt-4">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Choose your property</label>
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm">
          <option value="">Select a property</option>
          {ownedProperties.map((property) => <option key={property.id} value={property.id}>{property.title} — {property.city}</option>)}
        </select>
        <label htmlFor="blue-tick-proof-files" className="block text-xs font-bold text-slate-700 dark:text-slate-200">Upload property proof documents (photo / PDF)</label>
        <input id="blue-tick-proof-files" type="file" accept="image/*,application/pdf" multiple onChange={(event) => setSelectedDocuments(Array.from(event.target.files || []))} className="block min-h-12 w-full max-w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-2 file:min-h-10 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:font-bold file:text-blue-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:file:bg-slate-800 dark:file:text-blue-300" />
        {selectedDocuments.length > 0 && <p className="break-words text-xs text-emerald-700 dark:text-emerald-300">{selectedDocuments.length} file(s) selected: {selectedDocuments.map((file) => file.name).join(', ')}</p>}
        <p className="text-[11px] leading-5 text-slate-500">Trade licence, property-tax/electricity bill, lease/authorisation letter jaise proof. Maximum 5 files, 10 MB each, 20 MB total. Aadhaar aur unnecessary personal numbers hide karein. Files share sheet se WhatsApp par attach hongi; aapko Admin ko select karke Send dabana hoga.</p>
        <button disabled={busy || !ownedProperties.length || selectedDocuments.length === 0} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"><Upload className="w-4 h-4" />{busy ? 'Submitting…' : 'Apply for Blue Tick'}</button>
      </form>

      {proofShareTarget && <button type="button" onClick={() => shareProofDocuments(proofShareTarget.id, proofShareTarget.title)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-4 text-center text-base font-extrabold text-white"><MessageCircle className="w-4 h-4" />Share selected documents on WhatsApp</button>}
      {message && <p role="status" className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-700 dark:text-slate-200">{message}</p>}

      <div className="space-y-3">
        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Your verification applications</h4>
        {applications.length === 0 && <p className="text-xs text-slate-500">Abhi koi Blue Tick application nahi hai.</p>}
        {applications.map((application) => (
          <div key={application.id} className="min-w-0 space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-bold text-sm text-slate-900 dark:text-white">{application.propertyTitle}</p><p className="text-[11px] text-slate-500">Status: {application.status} · Proof: {application.proofStatus === 'received' ? 'received' : 'send on WhatsApp'}</p></div>
              <span className="text-[10px] uppercase font-black rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1">{application.status}</span>
            </div>
            {application.status === 'pending' && application.proofStatus !== 'received' && <button type="button" onClick={() => shareProofDocuments(application.id, application.propertyTitle)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-3 text-sm font-bold text-white"><MessageCircle className="w-4 h-4" />Select/share proof documents</button>}
            {application.status === 'pending' && application.paymentStatus !== 'verified' && <PaymentProofShare amount={500} title="Blue Tick Verification" applicationId={application.id} propertyTitle={application.propertyTitle} onShared={(utr) => markPaymentSubmitted(application, utr)} initialUtr={application.paymentUtr || ''} disabled={busy} />}
            {application.status === 'approved' && <p className="text-xs text-slate-600 dark:text-slate-300"><Clock3 className="inline w-3.5 h-3.5 mr-1" />Paid Blue Tick validity ends: <strong>{formatDate(application.verifiedUntil)}</strong></p>}
            {application.status === 'rejected' && <p className="text-xs text-rose-600">Review note: {application.reviewNote || 'Please contact support before reapplying.'}</p>}
            {application.status === 'approved' && new Date(application.verifiedUntil || 0).getTime() <= Date.now() && application.paymentStatus !== 'pending' && (
              <PaymentProofShare
                amount={500}
                title="Blue Tick renewal"
                applicationId={application.id}
                propertyTitle={application.propertyTitle}
                onShared={(utr) => markPaymentSubmitted(application, utr)}
                disabled={busy}
              />
            )}
            {application.paymentStatus === 'pending' && <p className="text-xs text-amber-600">Payment UTR admin verification ke liye pending hai.</p>}
            {application.paymentStatus === 'rejected' && <p className="text-xs text-rose-600">Payment verify nahi hua. Correct UTR ke saath dobara submit karein.</p>}
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 flex items-start gap-2"><FileCheck2 className="w-4 h-4 shrink-0" />Blue Tick is a paid optional service, not a government certification. Normal property subscription remains separate.</div>
    </section>
  );
};
