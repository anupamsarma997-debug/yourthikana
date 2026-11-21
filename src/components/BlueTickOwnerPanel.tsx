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
  const [whatsappUrl, setWhatsappUrl] = useState('');
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

    setBusy(true);
    try {
      const applicationRef = doc(collection(db, 'verificationApplications'));
      await setDoc(applicationRef, {
        ownerUid: user.uid, propertyId: property.id, propertyTitle: property.title,
        status: 'pending', paymentStatus: 'not_submitted',
        documentCount: 0, documentPaths: [],
        proofSubmissionMethod: 'whatsapp', proofStatus: 'awaiting_whatsapp',
        submittedAt: serverTimestamp(),
      });
      const proofMessage = `Hello YourThikana Admin, Blue Tick proof documents for application ${applicationRef.id}. Property: ${property.title}. Owner UID: ${user.uid}. I am sending the property proof documents for manual review.`;
      setWhatsappUrl(`https://wa.me/919101280465?text=${encodeURIComponent(proofMessage)}`);
      setPropertyId('');
      setMessage('Application submit ho gayi. Ab WhatsApp par property proof documents bhejein. Approval manual document review ke baad hi hoga.');
    } catch (error: any) {
      console.error('Blue Tick application failed:', error);
      setMessage(error?.message || 'Application submit nahi ho payi. Please try again.');
    } finally {
      setBusy(false);
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
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><strong>3. Renewal</strong><p className="mt-1 text-slate-500">Uske baad ₹500 per month.</p></div>
      </div>

      <form onSubmit={submitApplication} className="space-y-3 border-t border-slate-100 dark:border-slate-700 pt-4">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Choose your property</label>
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm">
          <option value="">Select a property</option>
          {ownedProperties.map((property) => <option key={property.id} value={property.id}>{property.title} — {property.city}</option>)}
        </select>
        <p className="text-[11px] text-slate-500">Trade licence, property-tax/electricity bill, lease/authorisation letter jaise proof WhatsApp par bhejein. Aadhaar aur unnecessary personal numbers hide karein.</p>
        <button disabled={busy || !ownedProperties.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-extrabold text-white disabled:opacity-50"><Upload className="w-4 h-4" />{busy ? 'Submitting…' : 'Apply for Blue Tick'}</button>
      </form>

      {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-xs font-extrabold text-white"><MessageCircle className="w-4 h-4" />Send proof documents on WhatsApp</a>}
      {message && <p role="status" className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-700 dark:text-slate-200">{message}</p>}

      <div className="space-y-3">
        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Your verification applications</h4>
        {applications.length === 0 && <p className="text-xs text-slate-500">Abhi koi Blue Tick application nahi hai.</p>}
        {applications.map((application) => (
          <div key={application.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-bold text-sm text-slate-900 dark:text-white">{application.propertyTitle}</p><p className="text-[11px] text-slate-500">Status: {application.status} · Proof: {application.proofStatus === 'received' ? 'received' : 'send on WhatsApp'}</p></div>
              <span className="text-[10px] uppercase font-black rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1">{application.status}</span>
            </div>
            {application.status === 'approved' && <p className="text-xs text-slate-600 dark:text-slate-300"><Clock3 className="inline w-3.5 h-3.5 mr-1" />Free trial / current validity ends: <strong>{formatDate(application.verifiedUntil || application.freeTrialEndsAt)}</strong></p>}
            {application.status === 'rejected' && <p className="text-xs text-rose-600">Review note: {application.reviewNote || 'Please contact support before reapplying.'}</p>}
            {application.status === 'approved' && new Date(application.verifiedUntil || application.freeTrialEndsAt || 0).getTime() <= Date.now() && application.paymentStatus !== 'pending' && (
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
      <div className="text-[11px] text-slate-500 flex items-start gap-2"><FileCheck2 className="w-4 h-4 shrink-0" />Blue Tick ka matlab YourThikana ne submitted proof review kiya hai; yeh government certification nahi hai. Badge expiry par normal listing active rahegi.</div>
    </section>
  );
};
