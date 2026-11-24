import React, { useEffect, useState } from 'react';
import { getDownloadURL, listAll, ref } from 'firebase/storage';
import { FileImage } from 'lucide-react';
import { storage } from '../lib/firebase';

export const SearchBoostEvidenceFiles: React.FC<{ ownerUid: string; applicationId: string; onCount: (count: number) => void }> = ({ ownerUid, applicationId, onCount }) => {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!storage) { setError('Firebase Storage is unavailable.'); return; }
    listAll(ref(storage, `search-boost-documents/${ownerUid}/${applicationId}`))
      .then(async result => {
        const entries = await Promise.all(result.items.map(async item => ({
          name: item.name,
          url: await getDownloadURL(item),
        })));
        if (active) { setFiles(entries); onCount(entries.filter(file => file.name.startsWith('payment-')).length); }
      })
      .catch(error => {
        console.error('Could not load Search Boost payment evidence:', error);
        if (active) { setError('Payment screenshot load nahi hua. Admin Storage permission check karein.'); onCount(0); }
      });
    return () => { active = false; };
  }, [ownerUid, applicationId, onCount]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <p className="text-xs font-bold">Uploaded payment screenshot</p>
      {files.map(file => <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 break-all text-xs font-semibold text-blue-700 dark:text-blue-300"><FileImage className="h-4 w-4 shrink-0" />{file.name}</a>)}
      {!files.length && !error && <p className="text-[11px] text-slate-500">No payment screenshot uploaded yet.</p>}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
};
