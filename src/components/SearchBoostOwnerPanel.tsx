import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { BadgePercent, Clock3, Wallet, ArrowLeft, ArrowRight, MessageCircle, CheckCircle2, Circle, ShieldCheck } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { Property } from '../types';
import { PaymentProofShare } from './PaymentProofShare';
import { isSearchBoostActive } from '../utils/propertyBadges';

type SearchBoostApplication = {
  id: string;
  ownerUid: string;
  propertyId: string;
  propertyTitle: string;
  status: 'awaiting_payment' | 'pending' | 'approved' | 'rejected';
  paymentStatus: 'pending' | 'verified' | 'rejected';
  paymentUtr: string;
  submittedAt?: any;
  featuredUntil?: string;
  reviewNote?: string;
};

type Screen = 'create' | 'payment' | 'status';
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN') : '—';
const supportLink = (application: SearchBoostApplication) => `https://wa.me/919101280465?text=${encodeURIComponent(`Hello YourThikana Support, please help with Search Boost request ${application.id} for ${application.propertyTitle}.`)}`;

export const SearchBoostOwnerPanel: React.FC<{ properties: Property[]; selectedPropertyId?: string }> = ({ properties, selectedPropertyId }) => {
  const uid = auth?.currentUser?.uid || '';
  const [applications, setApplications] = useState<SearchBoostApplication[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [screen, setScreen] = useState<Screen>('create');
  const [activeApplicationId, setActiveApplicationId] = useState('');

  const eligibleProperties = useMemo(
    () => properties.filter(property => property.ownerUid === uid && property.status === 'active' && !isSearchBoostActive(property)),
    [properties, uid]
  );

  useEffect(() => {
    if (selectedPropertyId && eligibleProperties.some(property => property.id === selectedPropertyId)) setPropertyId(selectedPropertyId);
  }, [selectedPropertyId, eligibleProperties]);

  useEffect(() => {
    if (!db || !uid) { setApplications([]); return; }
    return onSnapshot(query(collection(db, 'searchBoostApplications'), where('ownerUid', '==', uid)), snapshot => {
      const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as SearchBoostApplication));
      rows.sort((a, b) => {
        const time = (v: any) => typeof v?.toDate === 'function' ? v.toDate().getTime() : new Date(v || 0).getTime();
        return time(b.submittedAt) - time(a.submittedAt);
      });
      setApplications(rows);
    }, error => {
      console.error('Search Boost applications listener failed:', error);
      setMessage('Requests load nahi hue. Account sign-in aur Firestore owner-read permission check karein.');
    });
  }, [uid]);

  const activeApplication = applications.find(item => item.id === activeApplicationId);
  const openApplication = (application: SearchBoostApplication, next: Screen) => {
    setActiveApplicationId(application.id);
    setMessage('');
    setScreen(next);
  };

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = auth?.currentUser;
    const property = eligibleProperties.find(item => item.id === propertyId);
    if (!db || !user || !property) { setMessage('Apne owner account se sign in karke apni published property select karein.'); return; }
    if (applications.some(item => item.propertyId === propertyId && (item.status === 'awaiting_payment' || item.status === 'pending' || (item.status === 'approved' && !!item.featuredUntil && Date.parse(item.featuredUntil) > Date.now())))) {
      setMessage('Is property ka active request pehle se hai. My Requests se uska payment ya status kholein.');
      setScreen('status');
      return;
    }
    setBusy(true); setMessage('');
    try {
      // Refresh the property record so stale owner/listing data cannot create a denied request.
      const propertySnapshot = await getDoc(doc(db, 'properties', property.id));
      if (!propertySnapshot.exists() || propertySnapshot.data().ownerUid !== user.uid || propertySnapshot.data().status !== 'active') {
        setMessage('Property ownership ya published status verify nahi hua. My Listings mein property status refresh karein.');
        return;
      }
      const applicationRef = doc(collection(db, 'searchBoostApplications'));
      await setDoc(applicationRef, {
        ownerUid: user.uid, propertyId: property.id, propertyTitle: property.title,
        status: 'awaiting_payment', paymentStatus: 'pending', paymentUtr: '',
        proofSubmissionMethod: 'whatsapp_share', proofStatus: 'awaiting_payment',
        submittedAt: serverTimestamp(),
      });
      setActiveApplicationId(applicationRef.id);
      setPropertyId('');
      setScreen('payment');
      setMessage('Request create ho gayi. Payment screenshot WhatsApp par share karein aur UTR submit karein.');
    } catch (error: any) {
      console.error('Search Boost request failed:', error);
      const code = error?.code || '';
      setMessage(code === 'permission-denied' || /insufficient permissions/i.test(error?.message || '')
        ? 'Firebase ne request reject ki. Check karein: aap logged-in owner hon, selected property aapki ho aur Firestore searchBoostApplications rule latest published ho.'
        : error?.message || 'Request submit nahi ho payi. Please retry karein.');
    } finally { setBusy(false); }
  };

  const markPaymentSubmitted = async (application: SearchBoostApplication, utrValue: string) => {
    if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) throw new Error('Please sign in again.');
    await updateDoc(doc(db, 'searchBoostApplications', application.id), {
      paymentUtr: utrValue, paymentSubmittedAt: serverTimestamp(),
      status: 'pending', paymentStatus: 'pending',
      proofSubmissionMethod: 'whatsapp_share', proofStatus: 'awaiting_manual_review',
    });
    setScreen('status');
  };

  const statusBadge = (application: SearchBoostApplication) => application.status === 'approved' ? 'Boost Active' : application.status === 'rejected' ? 'Rejected' : application.status === 'awaiting_payment' ? 'Payment Required' : 'Admin Review Pending';

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-[18px] border border-[#243049] bg-[#0B1220] p-4 text-[#E5EAF3] shadow-xl sm:p-4">
      <header className="mb-4 flex min-w-0 items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#3A2A0B]"><BadgePercent className="h-6 w-6 text-[#FBBF24]" /></div>
        <div className="min-w-0 flex-1"><h3 className="text-xl font-black leading-tight text-white">Search Boost</h3><p className="mt-1 text-sm font-bold text-[#FBBF24]">₹500 / month</p><p className="mt-1 text-sm leading-5 text-[#9AA7BD]">Apni approved property ko search results mein highlight karein.</p></div>
      </header>

      <nav aria-label="Search Boost pages" className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-[#131C2E] p-1">
        <button type="button" onClick={() => { setScreen('create'); setMessage(''); }} className={`min-h-11 rounded-lg px-2 text-xs font-bold ${screen === 'create' ? 'bg-[#26344D] text-white' : 'text-[#9AA7BD]'}`}>Create Request</button>
        <button type="button" onClick={() => { setScreen('payment'); setMessage(''); if (!activeApplicationId) { const item = applications.find(a => a.status === 'awaiting_payment' || a.status === 'rejected'); if (item) setActiveApplicationId(item.id); } }} className={`min-h-11 rounded-lg px-2 text-xs font-bold ${screen === 'payment' ? 'bg-[#26344D] text-white' : 'text-[#9AA7BD]'}`}>Payment</button>
        <button type="button" onClick={() => { setScreen('status'); setMessage(''); }} className={`min-h-11 rounded-lg px-2 text-xs font-bold ${screen === 'status' ? 'bg-[#26344D] text-white' : 'text-[#9AA7BD]'}`}>My Status</button>
      </nav>

      {screen === 'create' && (
        <div className="space-y-4">
          <div className="rounded-[18px] border border-[#3A2A0B] bg-[#131C2E] p-4"><p className="flex items-center gap-2 text-sm font-bold text-[#FBBF24]"><Wallet className="h-5 w-5 shrink-0" />Monthly boost payment: ₹500</p><p className="mt-1 text-xs leading-5 text-[#9AA7BD]">Request submit karne ke baad payment ke liye alag page khulega. Admin bank credit verify karne ke baad hi boost active hoga.</p></div>
          <form onSubmit={submitRequest} className="space-y-3 rounded-[18px] border border-[#243049] bg-[#131C2E] p-4">
            <label htmlFor="search-boost-property" className="block text-sm font-bold text-[#E5EAF3]">Approved property choose karein</label>
            <select id="search-boost-property" value={propertyId} onChange={event => setPropertyId(event.target.value)} required className="min-h-12 w-full min-w-0 rounded-xl border border-[#3A4866] bg-[#0B1220] p-3 text-base text-white"><option value="">Select property</option>{eligibleProperties.map(property => <option key={property.id} value={property.id}>{property.title}</option>)}</select>
            <button type="submit" disabled={busy || !eligibleProperties.length || !propertyId} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FBBF24] px-4 py-4 text-center text-base font-extrabold text-[#241800] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Creating request…' : 'Create Search Boost request'} {!busy && <ArrowRight className="h-5 w-5" />}</button>
            {!eligibleProperties.length && <p className="text-xs leading-5 text-slate-500">Abhi koi eligible approved/published property available nahi hai.</p>}
          </form>
          <button type="button" onClick={() => setScreen('status')} className="min-h-11 w-full rounded-xl border border-[#3A4866] text-sm font-bold text-white">View existing requests</button>
        </div>
      )}

      {screen === 'payment' && (
        <div className="space-y-4">
          <button type="button" onClick={() => setScreen('create')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3A4866] px-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" />Back to Create Request</button>
          {!activeApplication && <div className="rounded-xl border border-dashed border-[#3A4866] p-4 text-sm text-[#9AA7BD]">Payment ke liye pehle Create Request karein ya My Status mein apni request select karein.</div>}
          {activeApplication && (
            <>
              <div className="rounded-[18px] border border-[#14B8A6] bg-[#131C2E] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#5EEAD4]">Payment page</p><h4 className="mt-1 break-words text-lg font-extrabold text-white">{activeApplication.propertyTitle}</h4><p className="mt-1 text-xs text-[#9AA7BD]">Request ID: {activeApplication.id}</p></div>
              {activeApplication.status === 'approved' && <p className="rounded-xl bg-emerald-950 p-3 text-sm text-emerald-200">Search Boost already active hai.</p>}
              {activeApplication.status !== 'approved' && <PaymentProofShare key={activeApplication.id} amount={500} title="Search Boost" applicationId={activeApplication.id} propertyTitle={activeApplication.propertyTitle} onSubmitted={utr => markPaymentSubmitted(activeApplication, utr)} initialUtr={activeApplication.paymentUtr || ''} disabled={busy || activeApplication.status === 'pending'} />}
              {activeApplication.status === 'pending' && <p className="rounded-xl bg-[#30250F] p-3 text-sm text-[#FBBF24]">Payment proof submitted. Admin bank verification pending hai. Status page par tracking dekhein.</p>}
            </>
          )}
          <div className="rounded-xl border border-[#243049] bg-[#131C2E] p-3 text-xs leading-5 text-[#9AA7BD]">Payment UTR aur screenshot admin ko review ke liye jayenge. Sirf bank credit confirm hone par payment verified hoga.</div>
        </div>
      )}

      {screen === 'status' && (
        <div className="space-y-3">
          <button type="button" onClick={() => setScreen('create')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3A4866] px-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" />Create another request</button>
          <h4 className="text-base font-extrabold text-white">Your Search Boost requests</h4>
          {applications.length === 0 && <p className="rounded-xl border border-dashed border-[#3A4866] p-4 text-sm text-[#9AA7BD]">Abhi koi Search Boost request nahi hai.</p>}
          {applications.map(application => (
            <article key={application.id} className="space-y-3 rounded-[18px] border border-[#243049] bg-[#131C2E] p-4">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-base font-bold text-white">{application.propertyTitle}</p><p className="mt-1 break-all text-[10px] text-[#64748B]">ID: {application.id}</p><p className="mt-1 text-xs text-[#9AA7BD]">Applied: {application.submittedAt?.toDate ? application.submittedAt.toDate().toLocaleString('en-IN') : '—'}</p></div><span className="shrink-0 rounded-full bg-[#49350E] px-3 py-1.5 text-xs font-bold text-[#FBBF24]">{statusBadge(application)}</span></div>
              <div className="rounded-xl border border-[#243049] bg-[#0B1220] p-3"><p className="mb-2 text-xs font-bold text-white">Progress</p><div className="space-y-2"><p className="flex items-center gap-2 text-xs text-[#CBD5E1]"><CheckCircle2 className="h-4 w-4 text-[#14B8A6]" />Request submitted</p><p className="flex items-center gap-2 text-xs text-[#CBD5E1]">{application.paymentStatus === 'verified' ? <CheckCircle2 className="h-4 w-4 text-[#14B8A6]" /> : <Circle className="h-4 w-4 text-[#FBBF24]" />}Payment: {application.paymentStatus === 'verified' ? 'Verified' : application.paymentStatus === 'pending' && application.status === 'pending' ? 'Submitted / review pending' : 'Required'}</p><p className="flex items-center gap-2 text-xs text-[#CBD5E1]">{application.status === 'approved' ? <CheckCircle2 className="h-4 w-4 text-[#14B8A6]" /> : <Clock3 className="h-4 w-4 text-[#FBBF24]" />}Admin decision: {statusBadge(application)}</p></div></div>
              {application.featuredUntil && <p className="text-xs text-[#9AA7BD]">Active until {dateLabel(application.featuredUntil)}</p>}
              {application.reviewNote && <p className="rounded-xl bg-[#0B1220] p-3 text-xs text-[#CBD5E1]">Admin note: {application.reviewNote}</p>}
              <div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => openApplication(application, 'payment')} disabled={application.status === 'approved' || (application.status === 'pending' && application.paymentStatus !== 'rejected')} className="min-h-11 flex-1 rounded-xl bg-[#243049] px-3 text-sm font-bold text-white disabled:opacity-40">{application.status === 'pending' ? 'Payment under review' : application.status === 'approved' ? 'Boost Active' : 'Open Payment Page'}</button><a href={supportLink(application)} target="_blank" rel="noreferrer" className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 text-sm font-extrabold text-[#052E16]"><MessageCircle className="h-4 w-4" />WhatsApp Support</a></div>
            </article>
          ))}
        </div>
      )}

      {message && <p role="status" aria-live="polite" className="mt-4 break-words rounded-xl border border-[#3A4866] bg-[#131C2E] p-3 text-sm leading-5 text-[#E5EAF3]">{message}</p>}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#243049] bg-[#131C2E] p-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" /><p className="text-[11px] leading-5 text-[#9AA7BD]">₹500/month. Boost payment admin ke bank-credit verification ke baad hi confirm hoga.</p></div>
    </section>
  );
};
