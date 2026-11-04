import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from '../lib/firebase';
import { supabase } from '../lib/supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // Keep client limit aligned with Firebase Storage rules (5MB)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

/**
 * Helper to compress and resize an image file into an optimized Data URL.
 * Keeps maximum dimension at 1200px and JPEG quality at 0.82 for super fast loading.
 */
function compressImageToDataUrl(file: File, maxDimension = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    // 1.5s timeout guarantee so it never hangs
    const timeout = setTimeout(() => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    }, 1500);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timeout);
        try {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
            return;
          }
        } catch (e) {
          console.warn('Canvas compression failed, falling back to raw data URL:', e);
        }
        resolve((event.target?.result as string) || '');
      };
      img.onerror = () => {
        clearTimeout(timeout);
        resolve((event.target?.result as string) || '');
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      const r = new FileReader();
      r.onloadend = () => resolve((r.result as string) || '');
      r.onerror = () => resolve('');
      r.readAsDataURL(file);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a property image to Firebase Storage using the authenticated owner account.
 */
export async function uploadPropertyPhoto(
  file: File,
  ownerUid: string,
  propertyId: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  if (!file) {
    throw new Error('No file selected for upload.');
  }

  // Validate File Type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`Invalid file format (${file.type || 'unknown'}). Please upload a JPEG, PNG, WEBP, AVIF, or GIF image.`);
  }

  // Validate File Size
  if (file.size > MAX_FILE_SIZE) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`File "${file.name}" (${sizeInMB} MB) exceeds the maximum allowed size of 5 MB.`);
  }

  if (!storage) {
    throw new Error('Firebase Storage is not configured.');
  }

  if (!auth?.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('Please sign in with the account that owns this property before uploading photos.');
  }

  if (onProgress) onProgress(20);

  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanFileName}`;
  const storagePath = `properties/${ownerUid}/${propertyId}/${uniqueName}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: { ownerUid, propertyId, originalName: file.name }
  });

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      uploadTask.cancel();
      reject(new Error('Image upload timed out. Please check your internet connection and try again.'));
    }, 30000);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const progress = Math.min(95, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          onProgress(progress);
        }
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
      async () => {
        if (settled) return;
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          settled = true;
          clearTimeout(timeout);
          if (onProgress) onProgress(100);
          resolve(downloadUrl);
        } catch (error) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      }
    );
  });
}

/**
 * Deletes a property photo given its URL.
 */
export async function deletePropertyPhoto(downloadUrl: string): Promise<void> {
  if (!downloadUrl) return;

  if (storage && (downloadUrl.includes('firebasestorage.googleapis.com') || downloadUrl.includes('firebasestorage'))) {
    try {
      const photoRef = ref(storage, downloadUrl);
      await deleteObject(photoRef);
    } catch (err: any) {
      console.warn(`Could not delete Firebase storage object:`, err?.message || err);
    }
  }

  if (supabase && downloadUrl.includes('supabase.co')) {
    try {
      const parts = downloadUrl.split('/properties/');
      if (parts[1]) {
        await supabase.storage.from('properties').remove([`properties/${parts[1]}`]);
      }
    } catch (err: any) {
      console.warn(`Could not delete Supabase storage object:`, err?.message || err);
    }
  }
}


