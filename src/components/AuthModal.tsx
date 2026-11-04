import React, { useState } from 'react';
import { store } from '../services/store';
import { UserRole } from '../types';
import { X, ShieldCheck, Mail, Lock, CheckCircle2, AlertCircle, RefreshCw, Send, UserCheck, KeyRound } from 'lucide-react';
import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithCustomToken,
  EmailAuthProvider,
  linkWithCredential,
  updateProfile,
  sendEmailVerification, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth, googleProvider, checkFirebaseDiagnostics } from '../lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessRole?: (role: UserRole) => void;
  initialMode?: 'login' | 'register' | 'forgot_password';
  targetPropertyTitle?: string;
  requiredOwnerId?: string;
}

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3h3.88c2.28-2.1 3.665-5.2 3.665-9.12z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
    <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.09c.95-2.85 3.6-4.96 6.72-4.96z" />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccessRole, 
  initialMode = 'register',
  targetPropertyTitle,
  requiredOwnerId
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password'>(initialMode);
  const [role, setRole] = useState<UserRole>('owner');

  // Register Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // Login Fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot Password Field
  const [resetEmail, setResetEmail] = useState('');

  // UI States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [pendingSetup, setPendingSetup] = useState(false);
  const [pendingAuthMethod, setPendingAuthMethod] = useState<'google' | 'email' | null>(null);

  // Runtime Diagnostic Result
  const firebaseDiagnostics = checkFirebaseDiagnostics();

  // Helper notice if editing specific property
  const targetPropertyOwner = requiredOwnerId ? store.getUsers().find(u => u.id === requiredOwnerId) : null;

  // Complete Google sign-in after Firebase redirects back to this page.
  React.useEffect(() => {
    if (!auth) return;
    let active = true;
    getRedirectResult(auth).then(async (res) => {
      if (!active || !res?.user?.email) return;
      setIsLoading(true);
      try {
        const loggedInUser = await store.loginWithFirebaseUser(res.user);
        setUsername(loggedInUser.username || '');
        setPassword('');
        setMode('register');
        setPendingSetup(true);
        setPendingAuthMethod(res.user.providerData.some((provider) => provider.providerId === 'password') ? 'email' : 'google');
        return;
      } catch (error: any) {
        const code = error?.code || 'auth/profile-restore-failed';
        console.error('Google redirect profile restore failed:', code, error?.message || error);
        setErrorMessage(`Google sign-in returned, but account setup failed (${code}). Check Firebase Firestore access and try again.`);
      } finally {
        if (active) setIsLoading(false);
      }
    }).catch((err: any) => {
      if (!active) return;
      const code = err?.code || 'auth/redirect-failed';
      console.error('Google redirect result error:', code, err?.message || err);
      setErrorMessage(
        code === 'auth/unauthorized-domain'
          ? 'This website domain is not authorized in Firebase Authentication → Settings → Authorized domains.'
          : code === 'auth/operation-not-allowed'
            ? 'Google sign-in is disabled in Firebase Authentication → Sign-in method.'
            : `Google redirect sign-in failed (${code}). Check Firebase Authentication settings and try again.`
      );
    });
    return () => { active = false; };
  }, []);

  // 1-Click Google Sign-In
  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (auth) {
      setIsLoading(true);
      try {
        const res = await signInWithPopup(auth, googleProvider);
        const gUser = res.user;
        if (gUser.email) {
          const loggedInUser = await store.loginWithFirebaseUser(gUser);
          setUsername(loggedInUser.username || '');
          setPassword('');
          setMode('register');
          setPendingSetup(true);
          setPendingAuthMethod(gUser.providerData.some((provider) => provider.providerId === 'password') ? 'email' : 'google');
          return;
        }
      } catch (err: any) {
        const code = err?.code || 'auth/unknown';
        console.error('Google Sign-In failed:', code, err?.message || err);

        if (code === 'auth/popup-closed-by-user') {
          setErrorMessage('Google Sign-In was cancelled. Please try again.');
          return;
        }

        // If the browser blocks the popup, use Firebase's redirect flow.
        if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
          try {
            setSuccessMessage('Redirecting to Google Sign-In...');
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch (redirectError: any) {
            const redirectCode = redirectError?.code || 'auth/redirect-failed';
            console.error('Google redirect sign-in failed:', redirectCode, redirectError?.message || redirectError);
            setErrorMessage(
              redirectCode === 'auth/unauthorized-domain'
                ? 'This website domain is not authorized in Firebase Authentication. Add the current Vercel domain under Authentication → Settings → Authorized domains.'
                : redirectCode === 'auth/operation-not-allowed'
                  ? 'Google sign-in is disabled in Firebase Authentication → Sign-in method.'
                  : redirectCode === 'auth/network-request-failed'
                    ? 'Network error while contacting Firebase. Check your internet connection and try again.'
                    : `Google sign-in failed (${redirectCode}): ${redirectError?.message || 'Please check Firebase Authentication settings.'}`
            );
            return;
          }
        }

        setErrorMessage(
          code === 'auth/unauthorized-domain'
            ? 'This website domain is not authorized in Firebase Authentication. Add the current Vercel domain under Authentication → Settings → Authorized domains.'
            : code === 'auth/operation-not-allowed'
              ? 'Google sign-in is disabled in Firebase Authentication → Sign-in method.'
              : code === 'auth/api-key-not-valid'
                ? 'The Firebase API key is invalid for this web app. Check VITE_FIREBASE_API_KEY in Vercel.'
                : code === 'auth/network-request-failed'
                  ? 'Network error while contacting Firebase. Check your internet connection and try again.'
                  : `Google sign-in failed (${code}): ${err?.message || 'Please check Firebase Authentication settings.'}`
        );
        return;
      } finally {
        setIsLoading(false);
      }
    }

    setErrorMessage('Firebase Authentication is not initialized. Check the VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_AUTH_DOMAIN variables, then create a new Vercel deployment.');
  };

  // Email registration uses Firebase Auth; username claims are verified by the server.
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMessage(''); setSuccessMessage('');
    if (!auth) { setErrorMessage('Secure registration is unavailable.'); return; }
    if (!name.trim() || !email.trim() || password.length < 8) {
      setErrorMessage('Enter your name, email and a password of at least 8 characters.'); return;
    }
    setIsLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: name.trim() });
      setUsername(''); setPendingSetup(true); setPendingAuthMethod('email');
      setSuccessMessage('Account created. Now choose your unique username.');
    } catch (err: any) {
      setErrorMessage(err?.code === 'auth/email-already-in-use' ? 'This email already has an account. Please sign in.' : err?.message || 'Registration failed.');
    } finally { setIsLoading(false); }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMessage(''); setSuccessMessage('');
    const firebaseUser = auth?.currentUser;
    const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase();
    if (!firebaseUser) { setErrorMessage('Your sign-in session expired. Please sign in again.'); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
      setErrorMessage('Username must be 3–20 characters using letters, numbers or underscore.'); return;
    }
    if (pendingAuthMethod === 'google' && password.length < 8) {
      setErrorMessage('Create a separate Yourthikana password with at least 8 characters.'); return;
    }
    setIsLoading(true);
    try {
      if (pendingAuthMethod === 'google') {
        const hasPassword = firebaseUser.providerData.some((provider) => provider.providerId === 'password');
        if (!hasPassword) {
          if (!firebaseUser.email) throw new Error('Google account email is unavailable.');
          await linkWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, password));
        }
      }
      const idToken = await auth!.currentUser!.getIdToken(true);
      const response = await fetch('/api/auth/claim-username', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ username: normalizedUsername }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save username.');
      const loggedInUser = await store.loginWithFirebaseUser(auth!.currentUser!);
      if (requiredOwnerId && loggedInUser.id !== requiredOwnerId && loggedInUser.googleUid !== requiredOwnerId && loggedInUser.role !== 'admin') {
        setErrorMessage(`Permission denied. This property belongs to @${targetPropertyOwner?.username || targetPropertyOwner?.name || 'another host'}.`);
        return;
      }
      if (onSuccessRole) onSuccessRole(loggedInUser.role);
      setPendingSetup(false); setPendingAuthMethod(null); onClose();
    } catch (err: any) { setErrorMessage(err?.message || 'Account setup failed.'); }
    finally { setIsLoading(false); }
  };

  // Existing Firebase email/password accounts only; local/demo password auth is never used.
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    if (!auth) {
      setErrorMessage('Secure sign-in is unavailable. Please try again later.');
      return;
    }
    const identifier = loginIdentifier.trim().replace(/^@/, '').toLowerCase();
    if (!identifier || !loginPassword) {
      setErrorMessage('Enter your existing username/email and password.');
      return;
    }
    setIsLoading(true);
    try {
      let credential;
      if (!identifier.includes('@')) {
        const response = await fetch('/api/auth/username-login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: identifier, password: loginPassword }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.customToken) throw new Error(result.error || 'Incorrect username or password.');
        credential = await signInWithCustomToken(auth, result.customToken);
      } else {
        credential = await signInWithEmailAndPassword(auth, identifier, loginPassword);
      }
      if (!credential.user.email) throw new Error('This Firebase account has no email address.');
      const loggedInUser = await store.loginWithFirebaseUser(credential.user);
      if (onSuccessRole) onSuccessRole(loggedInUser.role);
      onClose();
    } catch (err: any) {
      const code = err?.code || '';
      setErrorMessage(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
          ? 'Incorrect username/email or password. Only previously registered accounts can sign in.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Please wait and try again.'
            : err?.message || 'Sign-in failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Password recovery must be completed through Firebase's verified email link.
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setErrorMessage('Please enter a valid registered email address.');
      return;
    }
    if (!auth) {
      setErrorMessage('Secure password recovery is unavailable because Firebase Authentication is not configured.');
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setSuccessMessage('If an account exists for this email, Firebase has sent a password reset link. Check your inbox and spam folder.');
    } catch (err: any) {
      // Avoid revealing whether an email address has an account.
      if (err?.code === 'auth/invalid-email') {
        setErrorMessage('Please enter a valid email address.');
      } else {
        setSuccessMessage('If an account exists for this email, Firebase has sent a password reset link. Check your inbox and spam folder.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        {!pendingSetup && <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>}

        {/* Header Icon */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-2xl flex items-center justify-center mx-auto mb-2 shadow-lg">
            T
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {mode === 'register' 
              ? 'Create Host / Customer Account' 
              : mode === 'login' 
              ? 'Account Sign In' 
              : 'Forgot Password'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {targetPropertyTitle ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                🔒 Login required to manage: "{targetPropertyTitle}"
              </span>
            ) : mode === 'register' ? (
              'Create your account to list or book homestays'
            ) : mode === 'login' ? (
              'Sign in with your Email or Username'
            ) : (
              'Enter your email address to reset your password'
            )}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        {!pendingSetup && <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 text-xs font-bold">
          <button
            onClick={() => { setMode('register'); setErrorMessage(''); setSuccessMessage(''); }}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'register' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Sign Up
          </button>
          <button
            onClick={() => { setMode('login'); setErrorMessage(''); setSuccessMessage(''); }}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'login' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('forgot_password'); setErrorMessage(''); setSuccessMessage(''); }}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'forgot_password' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Forgot Password
          </button>
        </div>}

        {/* Error / Alert Messages */}
        {errorMessage && (
          <div className="mb-4 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 p-3 rounded-2xl text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Notice</p>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && !errorMessage && (
          <div className="mb-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-3 rounded-2xl text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Information</p>
              <p>{successMessage}</p>
            </div>
          </div>
        )}

        {/* Target Property Owner Hint */}
        {targetPropertyOwner && (
          <div className="mb-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 p-2.5 rounded-2xl text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Property Owner</p>
              <p className="font-extrabold">{targetPropertyOwner.name}</p>
            </div>
            <span className="bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
              @{targetPropertyOwner.username || 'owner'}
            </span>
          </div>
        )}

        {/* Google 1-Click Sign In (Available on Login / Register) */}
        {mode !== 'forgot_password' && !(mode === 'register' && pendingSetup) && (
          <div className="mb-4 space-y-3">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 text-slate-800 dark:text-white font-extrabold text-xs py-3 px-4 rounded-2xl shadow-sm hover:shadow transition-all cursor-pointer group disabled:opacity-50"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <div className="relative my-3 text-center">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800"></div></div>
              <span className="relative bg-white dark:bg-slate-900 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Or create account with Email
              </span>
            </div>
          </div>
        )}

        {/* MODE 1: REGISTER — choose Email OR Google */}
        {mode === 'register' && !pendingSetup && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div><label className="block text-xs font-bold mb-1">Full Name</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3 py-2 text-xs" /></div>
            <div><label className="block text-xs font-bold mb-1">Email Address</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3 py-2 text-xs" /></div>
            <div><label className="block text-xs font-bold mb-1">Yourthikana Password</label><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3 py-2 text-xs" /></div>
            <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-extrabold text-xs py-3 rounded-xl disabled:opacity-50">{isLoading ? 'Creating account...' : 'Continue with Email'}</button>
          </form>
        )}
        {mode === 'register' && pendingSetup && (
          <form onSubmit={handleCompleteProfile} className="space-y-3">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs"><p className="font-bold">Choose your unique username</p><p className="mt-1">You can use this username and your Yourthikana password to sign in.</p></div>
            <div><label className="block text-xs font-bold mb-1">Username</label><input required minLength={3} maxLength={20} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. anupam_01" className="w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3 py-2 text-xs" /></div>
            {pendingAuthMethod === 'google' && <div><label className="block text-xs font-bold mb-1">Create Yourthikana Password</label><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3 py-2 text-xs" /></div>}
            <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-extrabold text-xs py-3 rounded-xl disabled:opacity-50">{isLoading ? 'Saving securely...' : 'Finish Account Setup'}</button>
          </form>
        )}

        {/* MODE 2: LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-3">

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Email Address or Username
              </label>
              <input
                type="text"
                required
                placeholder="pranab@example.com or @pranab_kaziranga"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setMode('forgot_password'); setErrorMessage(''); setSuccessMessage(''); }}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-3 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Signing In...' : 'Sign In to Portal'}
              </button>
            </div>
          </form>
        )}

        {/* MODE 3: FORGOT PASSWORD */}
        {mode === 'forgot_password' && (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/50 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800 text-xs">
              <p className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 mb-1">
                <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
                Firebase Password Recovery
              </p>
              <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                Enter your registered account email address. We will send you an official Firebase password reset link to set a new password securely.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Registered Email Address
              </label>
              <input
                type="email"
                required
                placeholder="e.g. host@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-3 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isLoading ? 'Sending Reset Email...' : 'Send Password Reset Link'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs py-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Back to Sign In
            </button>
          </form>
        )}

      </div>
    </div>
  );
};
