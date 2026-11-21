import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, serverTimestamp, setDoc, updateDoc, doc, where } from 'firebase/firestore';
import { BadgeCheck, Clock3, FileCheck2, MessageCircle, Upload, CheckCircle2, Circle, ClipboardList, CreditCard, ShieldCheck } from 'lucide-react';
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

const formatDateTime = (value?: any) => {
  if (!value) return 'Submission time unavailable';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Submission time unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
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
  const [activeTab, setActiveTab] = useState<'apply' | 'status'>('apply');

  const ownedProperties = useMemo(
    () => properties.filter((property) => property.ownerUid === uid && property.status === 'active'),
    [properties, uid]
  );

  useEffect(() => {
    if (selectedPropertyId && ownedProperties.some((property) => property.id === selectedPropertyId)) setPropertyId(selectedPropertyId);
  }, [selectedPropertyId, ownedProperties]);

  useEffect(() => {
    if (!db || !uid) { setApplications([]); return; }
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
    if (!db || !user) { setMessage('Pehle apne owner Google account se sign in karein.'); return; }
    const property = ownedProperties.find((item) => item.id === propertyId);
    if (!property) { setMessage('Apni property select karein.'); return; }
    if (applications.some((item) => item.propertyId === propertyId && item.status !== 'rejected')) {
      setMessage('Is property ki application pehle se pending ya approved hai.'); return;
    }
    if (selectedDocuments.length === 0) { setMessage('Kam se kam ek property proof document (photo ya PDF) select karein.'); return; }
    if (selectedDocuments.some((file) => !(file.type.startsWith('image/') || file.type === 'application/pdf') && !/\.(jpe?g|png|webp|heic|pdf)$/i.test(file.name))) {
      setMessage('Sirf image ya PDF documents select karein.'); return;
    }
    if (selectedDocuments.length > 5 || selectedDocuments.some((file) => file.size > 10 * 1024 * 1024) || selectedDocuments.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setMessage('Maximum 5 files select karein. Har file 10 MB aur total size 20 MB se kam hona chahiye.'); return;
    }
    setBusy(true);
    try {
      const applicationRef = doc(collection(db, 'verificationApplications'));
      const shareFiles = [...selectedDocuments];
      const shareText = `Hello YourThikana Admin, Blue Tick proof documents for application ${applicationRef.id}. Property: ${property.title}. Please review these attached documents manually. I understand that the application is not approved until review is complete.`;
      const sharePromise = navigator.share && navigator.canShare && navigator.canShare({ files: shareFiles })
        ? navigator.share({ files: shareFiles, title: 'YourThikana Blue Tick documents', text: shareText })
        : null;
      await setDoc(applicationRef, {
        ownerUid: user.uid, propertyId: property.id, propertyTitle: property.title,
        status: 'pending', paymentStatus: 'not_submitted',
        documentCount: shareFiles.length, documentPaths: [],
        proofSubmissionMethod: 'device_share', proofStatus: sharePromise ? 'share_sheet_opened' : 'awaiting_owner_share',
        submittedAt: serverTimestamp(),
      });
      setProofShareTarget({ id: applicationRef.id, title: property.title });
      setPropertyId('');
      setActiveTab('status');
      if (sharePromise) {
        try {
          await sharePromise;
          await updateDoc(applicationRef, { proofStatus: 'share_sheet_completed', proofSharedAt: serverTimestamp() });
          setMessage('Documents share sheet mein khul gaye. WhatsApp mein Admin +91 9101280465 choose karke Send dabayein. Payment proof alag se submit karein.');
        } catch (shareError) {
          if (shareError instanceof Error && shareError.name === 'AbortError') setMessage('Application save ho gayi. Document sharing cancel hui; neeche Share documents button se dobara try karein.');
          else { console.error('Blue Tick document sharing failed:', shareError); setMessage('Application save ho gayi, lekin share sheet nahi khuli. Neeche Share documents button dabayein.'); }
        }
      } else setMessage('Application save ho gayi. Neeche Share documents button se Android Chrome mein try karein.');
    } catch (error: any) {
      console.error('Blue Tick application failed:', error);
      setMessage(error?.message || 'Application submit nahi ho payi. Please try again.');
    } finally { setBusy(false); }
  };

  const shareProofDocuments = async (applicationId: string, propertyTitle: string) => {
    const files = selectedDocuments;
    const text = `Hello YourThikana Admin, Blue Tick proof documents for application ${applicationId}. Property: ${propertyTitle}. Please review these attached documents manually. I understand that the application is not approved until review is complete.`;
    if (!files.length) { setMessage('Pehle property proof documents select karein.'); return; }
    if (!navigator.share || !navigator.canShare || !navigator.canShare({ files })) {
      setMessage('Is browser mein file attachment share supported nahi hai. Android Chrome mein kholkar try karein, ya WhatsApp mein Admin +91 9101280465 ko documents manually attach karein.'); return;
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
      paymentUtr: utr, paymentSubmittedAt: serverTimestamp(), paymentStatus: 'pending',
      proofSubmissionMethod: 'whatsapp', proofStatus: 'share_sheet_opened',
    });
  };

  const latestApplication = applications[0];
  const statusLabel = (application: Application) => application.status === 'approved' ? 'Approved' : application.status === 'rejected' ? 'Rejected' : 'Pending';
  const statusTone = (application: Application) => application.status === 'approved' ? 'border-[#14B8A6] bg-[#0B302D]' : application.status === 'rejected' ? 'border-[#7F1D32] bg-[#351522]' : 'border-[#6B4B12] bg-[#30250F]';

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-[18px] border border-[#243049] bg-[#0B1220] p-4 text-[#E5EAF3] shadow-xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#243049]"><BadgeCheck className="h-6 w-6 text-[#93C5FD]" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-extrabold leading-tight text-white">Blue Tick Verification</h2>
          <p className="mt-1 text-[13px] leading-5 text-[#9AA7BD]">Apply karein, required proof share karein aur application status track karein.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-1 rounded-[14px] border border-[#243049] bg-[#131C2E] p-1">
        <button type="button" onClick={() => setActiveTab('apply')} className={`min-h-11 rounded-[11px] px-3 text-sm font-bold ${activeTab === 'apply' ? 'bg-[#243049] text-white' : 'text-[#9AA7BD]'}`}>Apply & Pay</button>
        <button type="button" onClick={() => setActiveTab('status')} className={`min-h-11 rounded-[11px] px-3 text-sm font-bold ${activeTab === 'status' ? 'bg-[#243049] text-white' : 'text-[#9AA7BD]'}`}>Application Status</button>
      </div>

      {activeTab === 'apply' && (
        <div className="space-y-3">
          <div className="rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2"><h3 className="text-[17px] font-bold text-white">Apply for Blue Tick</h3><span className="rounded-full bg-[#243049] px-3 py-1 text-[11px] font-bold text-[#BFDBFE]">Verification</span></div>
            <p className="text-[13px] leading-5 text-[#9AA7BD]">Property ownership/authorisation proof submit karein. Admin review ke baad hi Blue Tick activate hoga.</p>
          </div>

          <div className="rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 space-y-3">
            <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#243049] text-xs font-extrabold text-white">1</span><h3 className="text-sm font-bold text-white">Apni details</h3></div>
            <p className="text-xs text-[#9AA7BD]">Apne account se linked property choose karein.</p>
            <label htmlFor="blue-tick-property" className="block text-[13px] font-semibold text-[#E5EAF3]">Property select karein</label>
            <select id="blue-tick-property" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required className="min-h-12 w-full rounded-xl border border-[#3A4866] bg-[#0B1220] px-3 text-base text-white">
              <option value="">Select your property</option>
              {ownedProperties.map((property) => <option key={property.id} value={property.id}>{property.title} — {property.city}</option>)}
            </select>
            {!ownedProperties.length && <p className="text-xs text-[#9AA7BD]">Koi active property nahi mili. Pehle apni listing add/publish karein.</p>}
          </div>

          <form onSubmit={submitApplication} className="space-y-3">
            <div className="rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 space-y-3">
              <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#243049] text-xs font-extrabold text-white">2</span><h3 className="text-sm font-bold text-white">Property document</h3></div>
              <p className="text-xs leading-5 text-[#9AA7BD]">Trade licence, property tax, electricity bill ya lease/authorisation proof. Aadhaar jaise personal numbers hide karein.</p>
              <label htmlFor="blue-tick-proof-files" className="block text-[13px] font-semibold text-[#E5EAF3]">Document upload (photo / PDF)</label>
              <input id="blue-tick-proof-files" type="file" accept="image/*,application/pdf" multiple onChange={(event) => setSelectedDocuments(Array.from(event.target.files || []))} className="block min-h-12 w-full max-w-full rounded-xl border border-dashed border-[#3A4866] bg-[#0B1220] p-2 text-sm text-[#E5EAF3] file:mr-2 file:min-h-10 file:rounded-lg file:border-0 file:bg-[#243049] file:px-3 file:font-bold file:text-[#5EEAD4]" />
              {selectedDocuments.length > 0 && <p className="break-words text-xs text-[#5EEAD4]"><CheckCircle2 className="mr-1 inline h-4 w-4" />{selectedDocuments.length} file(s): {selectedDocuments.map((file) => file.name).join(', ')}</p>}
              <p className="text-[11px] leading-5 text-[#9AA7BD]">Maximum 5 files, 10 MB each, 20 MB total. Files share sheet se WhatsApp par attach hongi; Admin ko select karke Send dabana hoga.</p>
            </div>
            <div className="rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 space-y-2">
              <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#243049] text-xs font-extrabold text-white">3</span><h3 className="text-sm font-bold text-white">Payment</h3></div>
              <p className="text-xs leading-5 text-[#9AA7BD]">Application submit hone ke baad isi application ke andar current Blue Tick payment option dikhega. Payment admin ke bank-credit verification ke baad hi confirm hoga.</p>
            </div>
            <button type="submit" disabled={busy || !ownedProperties.length || !propertyId || selectedDocuments.length === 0} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#3B82F6] px-4 py-3 text-base font-extrabold text-white disabled:opacity-50"><Upload className="h-4 w-4" />{busy ? 'Submitting…' : 'Submit application'}</button>
          </form>
          <div className="rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 space-y-2">
            <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#243049] text-xs font-extrabold text-white">4</span><h3 className="text-sm font-bold text-white">WhatsApp share</h3></div>
            <p className="text-xs leading-5 text-[#9AA7BD]">Application save hone ke baad document share sheet khul sakti hai. WhatsApp mein Admin +91 9101280465 ko select karke Send dabayein.</p>
          </div>
        </div>
      )}

      {activeTab === 'status' && (
        <div className="space-y-3">
          {!latestApplication && <div className="rounded-[18px] border border-dashed border-[#3A4866] bg-[#131C2E] p-4 text-sm text-[#9AA7BD]">Abhi koi application nahi hai. Apply & Pay tab se shuru karein.</div>}
          {applications.map((application) => (
            <article key={application.id} className="space-y-3">
              <div className={`rounded-[18px] border p-4 space-y-2 ${statusTone(application)}`}>
                <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-[#9AA7BD]">Property</p><h3 className="text-base font-bold text-white break-words">{application.propertyTitle}</h3></div><span className="rounded-full bg-black/20 px-3 py-1.5 text-xs font-extrabold text-white">{statusLabel(application)}</span></div>
                <p className="text-xs text-[#C2CBD9]">Submitted: {formatDateTime(application.submittedAt)}</p>
              </div>

              <div className="rounded-[18px] border border-[#243049] bg-[#131C2E] p-4 space-y-3">
                <h3 className="text-sm font-bold text-white">Application progress</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#14B8A6]" /><div><p className="text-sm font-semibold text-white">Form submitted</p><p className="text-xs text-[#9AA7BD]">{formatDateTime(application.submittedAt)}</p></div></div>
                  <div className="ml-2 h-4 border-l border-dashed border-[#3A4866]" />
                  <div className="flex items-start gap-3">{application.status === 'pending' ? <Clock3 className="h-5 w-5 shrink-0 text-[#FBBF24]" /> : application.status === 'approved' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#14B8A6]" /> : <Circle className="h-5 w-5 shrink-0 text-[#F87171]" />}<div><p className="text-sm font-semibold text-white">Admin review</p><p className="text-xs text-[#9AA7BD]">{application.status === 'pending' ? 'Documents aur payment details review mein hain.' : application.status === 'approved' ? 'Admin ne application approve kar di.' : 'Admin ne application reject ki hai.'}</p></div></div>
                  <div className="ml-2 h-4 border-l border-dashed border-[#3A4866]" />
                  <div className="flex items-start gap-3">{application.status === 'approved' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#14B8A6]" /> : <Circle className="h-5 w-5 shrink-0 text-[#64748B]" />}<div><p className="text-sm font-semibold text-white">Result</p><p className="text-xs text-[#9AA7BD]">{application.status === 'approved' ? 'Blue Tick approved.' : application.status === 'rejected' ? 'Changes karke dobara apply kar sakte hain.' : 'Admin decision ke baad yahan result dikhega.'}</p></div></div>
                </div>
              </div>

              {application.status === 'pending' && (
                <div className="rounded-[18px] border border-[#6B4B12] bg-[#30250F] p-4 space-y-2">
                  <span className="inline-flex rounded-full bg-[#49350E] px-3 py-1 text-xs font-bold text-[#FBBF24]">Pending</span>
                  <h3 className="text-sm font-bold text-white">Admin review chal raha hai</h3>
                  <p className="text-xs leading-5 text-[#E8D5A7]">Document, screenshot aur UTR ko manually verify kiya jayega. Payment bank mein confirm hone se pehle approval nahi milega.</p>
                  {application.proofStatus !== 'received' && <button type="button" onClick={() => shareProofDocuments(application.id, application.propertyTitle)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#25D366] px-3 py-3 text-sm font-bold text-[#052E16]"><MessageCircle className="h-4 w-4" />Share property documents on WhatsApp</button>}
                  {application.paymentStatus !== 'verified' && <PaymentProofShare amount={500} title="Blue Tick Verification" applicationId={application.id} propertyTitle={application.propertyTitle} onShared={(utr) => markPaymentSubmitted(application, utr)} initialUtr={application.paymentUtr || ''} disabled={busy} />}
                  {application.paymentStatus === 'pending' && <p className="text-xs text-[#FBBF24]">Payment UTR admin verification ke liye pending hai.</p>}
                </div>
              )}

              {application.status === 'approved' && (
                <div className="rounded-[18px] border border-[#14B8A6] bg-[#0B302D] p-4 space-y-2">
                  <span className="inline-flex rounded-full bg-[#075B50] px-3 py-1 text-xs font-bold text-[#99F6E4]">Approved</span>
                  <h3 className="text-sm font-bold text-white">Blue Tick approved</h3>
                  <p className="text-xs leading-5 text-[#B8F3E9]">Validity ends: {formatDate(application.verifiedUntil)}. Listing dashboard mein check karein.</p>
                </div>
              )}

              {application.status === 'rejected' && (
                <div className="rounded-[18px] border border-[#7F1D32] bg-[#351522] p-4 space-y-3">
                  <span className="inline-flex rounded-full bg-[#5B1D31] px-3 py-1 text-xs font-bold text-[#FDA4AF]">Rejected</span>
                  <h3 className="text-sm font-bold text-white">Application mein correction zaroori hai</h3>
                  <p className="text-xs leading-5 text-[#FBC6CF]">Reason: {application.reviewNote || 'Admin se WhatsApp par contact karke required correction poochhein.'}</p>
                  <button type="button" onClick={() => { setActiveTab('apply'); setPropertyId(application.propertyId); }} className="min-h-12 w-full rounded-[14px] bg-[#3B82F6] px-3 py-3 text-sm font-bold text-white">Dobara apply karein</button>
                  <a href="https://wa.me/919101280465?text=Hello%20YourThikana%20Admin%2C%20please%20help%20with%20my%20rejected%20Blue%20Tick%20application." target="_blank" rel="noreferrer" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#FCA5B5] px-3 py-3 text-sm font-bold text-[#FBC6CF]"><MessageCircle className="h-4 w-4" />Support ko WhatsApp karein</a>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {message && <p role="status" aria-live="polite" className="break-words rounded-[14px] border border-[#3A4866] bg-[#131C2E] p-3 text-sm leading-5 text-[#E5EAF3]">{message}</p>}
      <div className="flex items-start gap-2 rounded-[14px] border border-[#243049] bg-[#131C2E] p-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" /><p className="text-[11px] leading-5 text-[#9AA7BD]">Blue Tick ek paid optional service hai, government certification nahi. Normal property subscription aur doosre revenue models alag rahenge.</p></div>
    </section>
  );
};
