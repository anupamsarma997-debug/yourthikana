import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, serverTimestamp, setDoc, updateDoc, doc, where } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { BadgeCheck, Clock3, CheckCircle2, Circle, ShieldCheck, Upload, MessageCircle, ArrowLeft, FileCheck2 } from 'lucide-react';
import { auth, db, storage } from '../lib/firebase';
import { Property } from '../types';
import { PaymentProofShare } from './PaymentProofShare';

type Application = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  status: 'awaiting_payment' | 'pending' | 'approved' | 'rejected';
  submittedAt?: any;
  verifiedUntil?: string;
  paymentStatus?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  paymentUtr?: string;
  proofStatus?: string;
  reviewNote?: string;
  paymentReviewNote?: string;
};

const formatDateTime = (value?: any) => {
  if (!value) return 'Submission time unavailable';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Submission time unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};
const statusText = (application: Application) => application.status === 'approved' ? 'Approved' : application.status === 'rejected' ? 'Rejected' : 'Pending';
const supportUrl = (application: Application) => `https://wa.me/919101280465?text=${encodeURIComponent(`Hello YourThikana Support, I need help with Blue Tick application ${application.id} for ${application.propertyTitle}.`)}`;

export const BlueTickOwnerPanel: React.FC<{ properties: Property[]; selectedPropertyId?: string }> = ({ properties, selectedPropertyId }) => {
  const uid = auth?.currentUser?.uid || '';
  const [applications, setApplications] = useState<Application[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [screen, setScreen] = useState<'apply' | 'status'>('apply');

  const ownedProperties = useMemo(() => properties.filter(p => p.ownerUid === uid && p.status === 'active'), [properties, uid]);

  useEffect(() => {
    if (selectedPropertyId && ownedProperties.some(p => p.id === selectedPropertyId)) setPropertyId(selectedPropertyId);
  }, [selectedPropertyId, ownedProperties]);

  useEffect(() => {
    if (!db || !uid) { setApplications([]); return; }
    return onSnapshot(query(collection(db, 'verificationApplications'), where('ownerUid', '==', uid)), snapshot => {
      const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Application));
      rows.sort((a, b) => {
        const time = (v: any) => typeof v?.toDate === 'function' ? v.toDate().getTime() : new Date(v || 0).getTime();
        return time(b.submittedAt) - time(a.submittedAt);
      });
      setApplications(rows);
    }, error => {
      console.error('Blue Tick listener failed:', error);
      setMessage('Application status load nahi hua. Internet / Firestore rules check karein.');
    });
  }, [uid]);

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    const user = auth?.currentUser;
    const property = ownedProperties.find(p => p.id === propertyId);
    if (!db || !user || !property) { setMessage('Apne owner account se sign in karke apni active property select karein.'); return; }
    if (applications.some(a => a.propertyId === propertyId && a.status !== 'rejected')) {
      setMessage('Is property ki application pehle se pending ya approved hai. Neeche status dekhein.'); return;
    }
    setBusy(true);
    try {
      const applicationRef = doc(collection(db, 'verificationApplications'));
      // The form is saved first. Evidence is uploaded separately on the next screen.
      await setDoc(applicationRef, {
        ownerUid: user.uid, propertyId: property.id, propertyTitle: property.title,
        status: 'awaiting_payment', paymentStatus: 'not_submitted',
        documentCount: 1, documentPaths: [],
        proofSubmissionMethod: 'whatsapp_share', proofStatus: 'awaiting_payment',
        submittedAt: serverTimestamp(),
      });
      setPropertyId('');
      setDocumentFiles([]);
      setScreen('status');
      setMessage('Application draft ban gaya. Pehle screenshot WhatsApp par bhejein aur UTR submit karein; property documents alag se upload karein.');
    } catch (error: any) {
      console.error('Blue Tick submit failed:', error);
      setMessage(error?.message || 'Application submit nahi hui. Please retry karein.');
    } finally { setBusy(false); }
  };

  const uploadPropertyDocuments = async (application: Application) => {
    const user = auth?.currentUser;
    if (!storage || !db || !user || user.uid !== uid) { setMessage('Sign in / Firebase Storage unavailable.'); return; }
    if (!documentFiles.length) { setMessage('Property proof ke photo ya PDF select karein.'); return; }
    if (documentFiles.length > 5 || documentFiles.some(f => f.size <= 0 || f.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type))) {
      setMessage('Maximum 5 files. Sirf JPG, PNG, WEBP ya PDF; har file 8 MB se kam honi chahiye.'); return;
    }
    setBusy(true); setMessage('');
    try {
      for (const file of documentFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `verification-documents/${uid}/${application.id}/property-${Date.now()}-${safeName}`;
        await uploadBytes(ref(storage, path), file, { contentType: file.type });
      }
      await updateDoc(doc(db, 'verificationApplications', application.id), { proofStatus: 'documents_uploaded', documentsUploadedAt: serverTimestamp() });
      setDocumentFiles([]);
      setMessage('Property documents securely upload ho gaye. Admin review karega. WhatsApp support se bhi contact kar sakte hain.');
    } catch (error: any) {
      console.error('Property document upload failed:', error);
      setMessage(error?.message || 'Document upload fail hua. Storage rules / connection check karein.');
    } finally { setBusy(false); }
  };

  const markPaymentSubmitted = async (application: Application, utr: string) => {
    if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) throw new Error('Please sign in again.');
    await updateDoc(doc(db, 'verificationApplications', application.id), {
      paymentUtr: utr, paymentSubmittedAt: serverTimestamp(), paymentStatus: 'pending', status: 'pending', proofSubmissionMethod: 'whatsapp_share', proofStatus: 'awaiting_manual_review',
    });
  };

  const latest = applications[0];

  return (
    <section className="w-full min-w-0 space-y-4 overflow-hidden rounded-[18px] border border-[#243049] bg-[#0B1220] p-4 text-[#E5EAF3] shadow-xl">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#243049]"><BadgeCheck className="h-6 w-6 text-[#93C5FD]" /></div>
        <div className="min-w-0 flex-1"><h2 className="text-xl font-extrabold text-white">Blue Tick Verification</h2><p className="mt-1 text-xs leading-5 text-[#9AA7BD]">₹500 one-time · Apply, upload proofs and track status</p></div>
      </header>

      {screen === 'apply' ? (
        <div className="space-y-3">
          <div className="rounded-[16px] border border-[#243049] bg-[#131C2E] p-4">
            <h3 className="font-bold text-white">New application form</h3>
            <p className="mt-1 text-sm leading-5 text-[#9AA7BD]">Property select karke Apply dabayein. Agle page par payment aur property documents ke do alag upload sections milenge.</p>
          </div>
          <form onSubmit={submitApplication} className="space-y-3 rounded-[16px] border border-[#243049] bg-[#131C2E] p-4">
            <label htmlFor="blue-tick-property" className="block text-sm font-bold">Your property</label>
            <select id="blue-tick-property" value={propertyId} onChange={e => setPropertyId(e.target.value)} required className="min-h-12 w-full rounded-xl border border-[#3A4866] bg-[#0B1220] px-3 text-base text-white">
              <option value="">Select your property</option>
              {ownedProperties.map(p => <option key={p.id} value={p.id}>{p.title} — {p.city}</option>)}
            </select>
            {!ownedProperties.length && <p className="text-xs text-[#9AA7BD]">Koi active property nahi mili. Pehle listing publish karein.</p>}
            <button type="submit" disabled={busy || !propertyId || !ownedProperties.length} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#2563EB] px-4 py-3 text-base font-extrabold text-white disabled:opacity-40">{busy ? 'Submitting…' : 'Apply & Continue'} <Upload className="h-5 w-5" /></button>
          </form>
          {applications.length > 0 && <button type="button" onClick={() => setScreen('status')} className="min-h-12 w-full rounded-xl border border-[#3A4866] px-4 font-bold text-white">View my application status</button>}
        </div>
      ) : (
        <div className="space-y-4">
          <button type="button" onClick={() => setScreen('apply')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#3A4866] px-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" /> New application</button>
          {!latest && <p className="rounded-xl border border-dashed border-[#3A4866] p-4 text-sm text-[#9AA7BD]">No application yet.</p>}
          {applications.map(application => (
            <article key={application.id} className="space-y-3 rounded-[18px] border border-[#243049] bg-[#131C2E] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-xs text-[#9AA7BD]">Application Status</p><h3 className="break-words text-base font-extrabold text-white">{application.propertyTitle}</h3><p className="mt-1 text-xs text-[#9AA7BD]">Applied: {formatDateTime(application.submittedAt)}</p><p className="mt-1 break-all text-[10px] text-[#64748B]">ID: {application.id}</p></div>
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${application.status === 'approved' ? 'bg-[#075B50] text-[#99F6E4]' : application.status === 'rejected' ? 'bg-[#5B1D31] text-[#FDA4AF]' : 'bg-[#49350E] text-[#FBBF24]'}`}>{statusText(application)}</span>
              </div>

              <div className="rounded-xl border border-[#243049] bg-[#0B1220] p-3">
                <h4 className="mb-3 text-sm font-bold text-white">Application progress</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-[#14B8A6]" /><span className="text-sm text-white">Application form submitted</span></div>
                  <div className="flex items-center gap-3">{application.status === 'pending' ? <Clock3 className="h-5 w-5 text-[#FBBF24]" /> : <CheckCircle2 className="h-5 w-5 text-[#14B8A6]" />}<span className="text-sm text-white">Admin review: {statusText(application)}</span></div>
                  <div className="flex items-center gap-3">{application.status === 'approved' ? <CheckCircle2 className="h-5 w-5 text-[#14B8A6]" /> : <Circle className="h-5 w-5 text-[#64748B]" />}<span className="text-sm text-white">Final decision: {application.status === 'approved' ? 'Blue Tick active' : application.status === 'rejected' ? 'Correction required' : 'Waiting for admin'}</span></div>
                </div>
              </div>

              {application.status === 'pending' && (
                <>
                  <div className="space-y-3 rounded-xl border border-[#3A4866] bg-[#0B1220] p-3">
                    <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-[#93C5FD]" /><h4 className="text-sm font-bold text-white">Property Documents Upload</h4></div>
                    <p className="text-xs leading-5 text-[#9AA7BD]">Trade licence, property tax, electricity bill, lease ya authorisation proof. Personal ID numbers hide karein.</p>
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setDocumentFiles(Array.from(e.target.files || []))} className="block min-h-12 w-full rounded-xl border border-dashed border-[#3A4866] bg-[#131C2E] p-2 text-xs file:mr-2 file:min-h-10 file:rounded-lg file:border-0 file:bg-[#243049] file:px-3 file:font-bold file:text-[#5EEAD4]" />
                    {documentFiles.length > 0 && <p className="break-words text-xs text-[#5EEAD4]">{documentFiles.length} file(s) selected</p>}
                    <button type="button" disabled={busy || !documentFiles.length} onClick={() => uploadPropertyDocuments(application)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-3 py-3 text-sm font-extrabold text-white disabled:opacity-40">{busy ? 'Uploading…' : 'Upload Property Documents'}</button>
                    {application.proofStatus === 'documents_uploaded' && <p className="text-xs text-[#5EEAD4]">Property documents uploaded.</p>}
                  </div>
                  {application.paymentStatus !== 'verified' && (
                    <PaymentProofShare amount={500} title="Blue Tick Verification" applicationId={application.id} propertyTitle={application.propertyTitle} onSubmitted={utr => markPaymentSubmitted(application, utr)} initialUtr={application.paymentUtr || ''} disabled={busy} />
                  )}
                  {application.paymentStatus === 'pending' && <p className="rounded-xl bg-[#30250F] p-3 text-xs leading-5 text-[#FBBF24]">Payment proof submitted. Admin bank verification pending hai.</p>}
                </>
              )}

              {application.status === 'approved' && <div className="rounded-xl border border-[#14B8A6] bg-[#0B302D] p-3 text-sm text-[#99F6E4]"><CheckCircle2 className="mr-2 inline h-4 w-4" />Blue Tick verification permanently active for this property.</div>}
              {application.status === 'rejected' && <div className="rounded-xl border border-[#7F1D32] bg-[#351522] p-3 text-sm text-[#FDA4AF]">Application rejected: {application.reviewNote || 'Please contact support for correction.'}</div>}

              <a href={supportUrl(application)} target="_blank" rel="noreferrer" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-[#052E16]"><MessageCircle className="h-5 w-5" />WhatsApp Support</a>
            </article>
          ))}
        </div>
      )}

      {message && <p role="status" aria-live="polite" className="break-words rounded-xl border border-[#3A4866] bg-[#131C2E] p-3 text-sm leading-5 text-[#E5EAF3]">{message}</p>}
      <div className="flex items-start gap-2 rounded-xl border border-[#243049] bg-[#131C2E] p-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" /><p className="text-[11px] leading-5 text-[#9AA7BD]">₹500 one-time payment admin ke bank-credit verification ke baad hi confirm hoga. Blue Tick paid optional service hai, government certification nahi.</p></div>
    </section>
  );
};
