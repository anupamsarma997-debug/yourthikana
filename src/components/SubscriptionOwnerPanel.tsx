import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Property } from '../types';
import { PaymentProofPanel } from './PaymentProofPanel';

type PlanId = 'standard_1000' | 'standard_1500';
type Application = { id:string; ownerUid:string; propertyId:string; propertyTitle:string; planId:PlanId; planName:string; amount:number; status:'pending'|'approved'|'rejected'; paymentStatus:'pending'|'verified'|'rejected'; paymentUtr:string; paymentProofPath:string; expiresAt?:string; submittedAt?:any };

export const SubscriptionOwnerPanel: React.FC<{properties:Property[]}> = ({properties}) => {
  const uid=auth?.currentUser?.uid||'';
  const [apps,setApps]=useState<Application[]>([]);
  const [propertyId,setPropertyId]=useState('');
  const [planId,setPlanId]=useState<PlanId>('standard_1000');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const plans = useMemo(()=>({standard_1000:{name:'Standard Listing',amount:1000},standard_1500:{name:'Prime Location Listing',amount:1500}}),[]);
  const owned=useMemo(()=>properties.filter(p=>p.ownerUid===uid&&p.status==='active'),[properties,uid]);

  useEffect(()=>{
    if(!db||!uid){setApps([]);return;}
    return onSnapshot(query(collection(db,'subscriptionApplications'),where('ownerUid','==',uid)),snap=>setApps(snap.docs.map(d=>({id:d.id,...d.data()} as Application))),error=>{console.error('Subscription requests listener failed:',error);setMessage('Subscription status load nahi hua. Refresh karein.');});
  },[uid]);

  const submit=async(utr:string,proofPath:string)=>{
    const user=auth?.currentUser, property=owned.find(p=>p.id===propertyId), plan=plans[planId];
    if(!db||!user||user.uid!==uid||!property)throw new Error('Apni active property select karein aur sign in check karein.');
    if(apps.some(a=>a.propertyId===propertyId&&a.status==='pending'))throw new Error('Is property ka subscription payment pehle se review mein hai.');
    setBusy(true);setMessage('');
    try{
      await setDoc(doc(collection(db,'subscriptionApplications')),{ownerUid:user.uid,propertyId:property.id,propertyTitle:property.title,planId,planName:plan.name,amount:plan.amount,billingPeriod:'month',status:'pending',paymentStatus:'pending',paymentUtr:utr,paymentProofPath:proofPath,submittedAt:serverTimestamp()});
      setMessage('Subscription request submit ho gayi. Admin bank payment verify karke plan activate karega.');
    }finally{setBusy(false);}
  };

  const plan=plans[planId];
  return <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm dark:border-emerald-900 dark:bg-slate-800 space-y-4">
    <div><h2 className="text-lg font-black text-slate-950 dark:text-white">Property Subscription</h2><p className="text-xs text-slate-500">Har property ke liye monthly listing plan. Activation admin payment verification ke baad.</p></div>
    <label className="block space-y-1 text-sm font-bold">Choose your active property
      <select value={propertyId} onChange={e=>setPropertyId(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900"><option value="">Select property</option>{owned.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select>
    </label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button type="button" onClick={()=>setPlanId('standard_1000')} className={`rounded-xl border p-3 text-left ${planId==='standard_1000'?'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30':'border-slate-200 dark:border-slate-700'}`}><span className="block text-xs font-bold">Standard Listing</span><strong className="text-xl">₹1,000/month</strong></button>
      <button type="button" onClick={()=>setPlanId('standard_1500')} className={`rounded-xl border p-3 text-left ${planId==='standard_1500'?'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30':'border-slate-200 dark:border-slate-700'}`}><span className="block text-xs font-bold">Prime Location</span><strong className="text-xl">₹1,500/month</strong></button>
    </div>
    {propertyId?<PaymentProofPanel key={propertyId+planId} serviceName={plan.name} amount={plan.amount} billingLabel="/ month" disabled={busy} onSubmit={submit}/>:<p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900">Property select karne ke baad payment options khulenge.</p>}
    {message&&<p role="status" className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">{message}</p>}
    <div className="space-y-2"><h3 className="text-sm font-extrabold">Subscription requests & status</h3>
      {apps.length===0&&<p className="text-xs text-slate-500">Abhi koi subscription request nahi hai.</p>}
      {apps.map(a=><article key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div><p className="text-sm font-bold">{a.propertyTitle}</p><p className="text-xs text-slate-500">{a.planName} · ₹{a.amount}/month</p><p className="text-[11px] text-slate-500">UTR: {a.paymentUtr}</p>{a.expiresAt&&<p className="text-[11px] text-slate-500">Valid until: {new Date(a.expiresAt).toLocaleDateString('en-IN')}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-bold ${a.status==='approved'?'bg-emerald-100 text-emerald-800':a.status==='rejected'?'bg-rose-100 text-rose-800':'bg-amber-100 text-amber-800'}`}>{a.status==='approved'?'Active':a.status==='rejected'?'Rejected':'Payment review pending'}</span></article>)}
    </div>
  </section>;
};
