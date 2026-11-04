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
        if (
          requiredOwnerId &&
          loggedInUser.id !== requiredOwnerId &&
          loggedInUser.googleUid !== requiredOwnerId &&
          loggedInUser.role !== 'admin'
        ) {
          setErrorMessage(`Permission denied. This property belongs to @${targetPropertyOwner?.username || targetPropertyOwner?.name || 'another host'}.`);
          return;
        }
        if (onSuccessRole) onSuccessRole(loggedInUser.role);
        alert(`🎉 Signed in successfully with Google!\\n\\nName: ${loggedInUser.name}\\nEmail: ${loggedInUser.email}`);
        onClose();
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

          if (requiredOwnerId && loggedInUser.id !== requiredOwnerId && loggedInUser.googleUid !== requiredOwnerId && loggedInUser.role !== 'admin') {
            setErrorMessage(`Permission Denied! Signed in as @${loggedInUser.username}, but this property belongs to @${targetPropertyOwner?.username || 'another host'}.`);
            setIsLoading(false);
            return;
          }

          if (onSuccessRole) onSuccessRole(loggedInUser.role);
          alert(`🎉 Signed in successfully with Google!\n\nName: ${loggedInUser.name}\nEmail: ${loggedInUser.email}`);
          onClose();
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

  // Email/password account creation is disabled; use verified Google sign-in only.
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('Email/password registration is disabled. Please use Continue with Google.');
    setSuccessMessage('');
  };

  // Login with Email / Username & Password
  // Username/password login is intentionally disabled. A verified Google
  // Firebase session is the only supported sign-in method for this app.
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('Username and password login is disabled. Please use Continue with Google to sign in with your Google account.');
    setSuccessMessage('');
    setLoginPassword('');
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
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

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
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 text-xs font-bold">
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
        </div>

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
        {mode !== 'forgot_password' && (
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
                Or Email & Password
              </span>
            </div>
          </div>
        )}

        {/* MODE 1: REGISTER — Google-only */}
        {mode === 'register' && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-center">
            <ShieldCheck className="w-7 h-7 mx-auto mb-2 text-emerald-600" />
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">Google Account Required</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Create your account using Continue with Google above. Email/password registration is disabled.</p>
          </div>
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
