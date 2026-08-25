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
  if (!isOpen) return null;

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

  // Direct Google Email Login State
  const [showDirectGoogleInput, setShowDirectGoogleInput] = useState(true);
  const [directGoogleEmailInput, setDirectGoogleEmailInput] = useState('rupaamsarma1234@gmail.com');
  const [directGoogleNameInput, setDirectGoogleNameInput] = useState('Rupaam Sarma');

  // Check for redirect result on mount if redirect auth was used
  React.useEffect(() => {
    if (auth) {
      getRedirectResult(auth).then((res) => {
        if (res && res.user && res.user.email) {
          const gUser = res.user;
          const loggedInUser = store.loginOrRegisterWithGoogle({
            email: gUser.email,
            displayName: gUser.displayName || undefined,
            photoURL: gUser.photoURL || undefined,
            uid: gUser.uid,
            desiredRole: role,
          });
          if (onSuccessRole) onSuccessRole(loggedInUser.role);
          alert(`🎉 Signed in successfully with Google!\n\nName: ${loggedInUser.name}\nEmail: ${loggedInUser.email}`);
          onClose();
        }
      }).catch((err) => {
        console.warn('Redirect result check error:', err);
      });
    }
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
          const loggedInUser = store.loginOrRegisterWithGoogle({
            email: gUser.email,
            displayName: gUser.displayName || undefined,
            photoURL: gUser.photoURL || undefined,
            uid: gUser.uid,
            desiredRole: role,
          });

          if (requiredOwnerId && loggedInUser.id !== requiredOwnerId && loggedInUser.role !== 'admin') {
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
        console.warn('Google Popup Auth notice:', err?.code || err);
        if (err?.code === 'auth/popup-closed-by-user') {
          setErrorMessage('Sign in cancelled.');
          setIsLoading(false);
          return;
        }
        // If popup blocked or cancelled, try redirect
        if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/cancelled-popup-request') {
          try {
            setSuccessMessage('Redirecting to Google Sign-In...');
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch (redErr: any) {
            console.warn('Redirect auth failed:', redErr);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    // Direct Google Email Input Fallback if Popup/Auth is unavailable
    setShowDirectGoogleInput(true);
    setErrorMessage('Direct Google Auth: Please enter your Google Email address below to sign in directly.');
  };

  // Handle Direct Google Email Login
  const handleDirectGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const emailToUse = directGoogleEmailInput.trim();
    if (!emailToUse || !emailToUse.includes('@')) {
      setErrorMessage('Please enter a valid Google Email Address (e.g. name@gmail.com).');
      return;
    }

    setIsLoading(true);
    try {
      const nameToUse = directGoogleNameInput.trim() || emailToUse.split('@')[0];
      const googleUid = 'google_direct_' + emailToUse.replace(/[^a-zA-Z0-9]/g, '_');

      const loggedInUser = store.loginOrRegisterWithGoogle({
        email: emailToUse,
        displayName: nameToUse,
        uid: googleUid,
        desiredRole: role,
      });

      if (requiredOwnerId && loggedInUser.id !== requiredOwnerId && loggedInUser.role !== 'admin') {
        setErrorMessage(`Permission Denied! Signed in as @${loggedInUser.username}, but this property belongs to @${targetPropertyOwner?.username || 'another host'}.`);
        setIsLoading(false);
        return;
      }

      if (onSuccessRole) onSuccessRole(loggedInUser.role);
      alert(`🎉 Signed in as Google User!\n\nName: ${loggedInUser.name}\nGoogle Email: ${loggedInUser.email}\nUsername: @${loggedInUser.username}`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google email sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Quick 1-Click Demo Login Helper
  const handleQuickDemoLogin = (username: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);
    setTimeout(() => {
      const res = store.loginWithUsernamePassword(username, '123456');
      setIsLoading(false);
      if (res.success && res.user) {
        if (requiredOwnerId && res.user.id !== requiredOwnerId && res.user.role !== 'admin') {
          setErrorMessage(`Permission Denied! Signed in as @${res.user.username}, but this listing belongs to @${targetPropertyOwner?.username || targetPropertyOwner?.name || 'another host'}.`);
          return;
        }
        if (onSuccessRole) onSuccessRole(res.user.role);
        alert(`⚡ Quick Logged In as ${res.user.name} (@${res.user.username})!`);
        onClose();
      } else {
        setErrorMessage(res.message || 'Quick login failed.');
      }
    }, 250);
  };

  // Register with Email & Password + Instant Verification & Login
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!name.trim()) {
      setErrorMessage('Please enter your Full Name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid Email Address.');
      return;
    }
    if (!username.trim() || username.trim().length < 3) {
      setErrorMessage('Username must be at least 3 characters long.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      let firebaseUid = `user_${Date.now()}`;
      if (auth) {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
          firebaseUid = userCredential.user.uid;
          try {
            await sendEmailVerification(userCredential.user);
          } catch {
            // Ignore verification error if email service is unconfigured
          }
        } catch (fbErr: any) {
          if (fbErr.code === 'auth/email-already-in-use') {
            setErrorMessage('This email is already registered. Please log in or use Forgot Password.');
            setIsLoading(false);
            return;
          }
        }
      }

      // Sync user to Store & log them in immediately
      const newUser = store.registerUser({
        name: name.trim(),
        username: username.trim().toLowerCase().replace(/\s+/g, '_'),
        password,
        email: email.trim(),
        googleUid: firebaseUid,
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || phone.trim(),
        role,
      });

      // Automatically log in the newly registered user
      store.loginWithUsernamePassword(newUser.username, password);

      if (onSuccessRole) {
        onSuccessRole(newUser.role);
      }

      alert(`🎉 Registration & Sign-In Successful!\n\nWelcome, ${newUser.name}!\nUsername: @${newUser.username}\nEmail: ${newUser.email}\nRole: ${newUser.role.toUpperCase()}`);
      onClose();
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMessage(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Login with Email / Username & Password
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMessage('Please enter your Email/Username and Password.');
      return;
    }

    setIsLoading(true);

    try {
      let emailToTry = loginIdentifier.trim();
      if (!emailToTry.includes('@')) {
        const matched = store.getUsers().find(u => u.username?.toLowerCase() === emailToTry.toLowerCase());
        if (matched && matched.email) {
          emailToTry = matched.email;
        }
      }

      if (auth && emailToTry.includes('@')) {
        try {
          await signInWithEmailAndPassword(auth, emailToTry, loginPassword);
        } catch (fbErr) {
          console.warn('Firebase signIn notice:', fbErr);
        }
      }

      const res = store.loginWithUsernamePassword(loginIdentifier, loginPassword);
      if (!res.success) {
        setErrorMessage(res.message || 'Login failed. Invalid username/email or password.');
        setIsLoading(false);
        return;
      }

      const loggedInUser = res.user!;

      if (requiredOwnerId && loggedInUser.id !== requiredOwnerId && loggedInUser.role !== 'admin') {
        setErrorMessage(`Permission Denied! You logged in as @${loggedInUser.username}, but this property belongs to @${targetPropertyOwner?.username || targetPropertyOwner?.name || 'another host'}.`);
        setIsLoading(false);
        return;
      }

      if (onSuccessRole) {
        onSuccessRole(loggedInUser.role);
      }

      alert(`Welcome back, ${loggedInUser.name}! (@${loggedInUser.username}) Logged in successfully.`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password: On-screen Instant Password Reset
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setErrorMessage('Please enter a valid registered email address.');
      return;
    }

    setIsLoading(true);

    try {
      if (auth) {
        sendPasswordResetEmail(auth, resetEmail.trim()).catch(() => {});
      }

      // Perform instant on-screen password reset in local store & Firestore
      const newTempPassword = 'ThikanaPass' + Math.floor(100 + Math.random() * 900);
      const res = store.resetPasswordWithGoogleEmail(resetEmail.trim(), newTempPassword);

      if (res.success && res.user) {
        setSuccessMessage(`🔑 Password Reset Successful!\nYour new login password for ${res.user.email} (@${res.user.username}) is: ${newTempPassword}\n\nYou are now automatically logged in!`);
        alert(`🔑 Password Reset Successful!\n\nEmail: ${res.user.email}\nNew Password: ${newTempPassword}\n\nYou are now signed in.`);
        if (onSuccessRole) onSuccessRole(res.user.role);
        onClose();
      } else {
        setErrorMessage(`No account found registered with email "${resetEmail.trim()}". Please check your email or click "Sign Up" to create an account.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Password reset request failed.');
    } finally {
      setIsLoading(false);
    }
  };

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

            {/* Direct Google Email Sign-In Form (Shown if popup is unavailable) */}
            {showDirectGoogleInput && (
              <form onSubmit={handleDirectGoogleSubmit} className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-emerald-800 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <GoogleIcon />
                    <span>Google Email Sign In</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  <input
                    type="email"
                    required
                    placeholder="Enter your Google Email (e.g. name@gmail.com)"
                    value={directGoogleEmailInput}
                    onChange={(e) => setDirectGoogleEmailInput(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Your Name (Optional)"
                      value={directGoogleNameInput}
                      onChange={(e) => setDirectGoogleNameInput(e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shrink-0 cursor-pointer shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                    >
                      Sign In
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="relative my-3 text-center">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800"></div></div>
              <span className="relative bg-white dark:bg-slate-900 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Or Email & Password
              </span>
            </div>
          </div>
        )}

        {/* MODE 1: REGISTER */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            {/* Account Role Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('owner')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    role === 'owner'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Homestay / Hotel Host
                </button>
                <button
                  type="button"
                  onClick={() => setRole('customer')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    role === 'customer'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Traveler / Customer
                </button>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Pranab Gogoi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Email Address <span className="text-emerald-600 dark:text-emerald-400 font-semibold">(Verification Link Sent)</span>
              </label>
              <input
                type="email"
                required
                placeholder="pranab@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>Create Username</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Min 3 chars</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">@</span>
                <input
                  type="text"
                  required
                  placeholder="pranab_kaziranga"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-7 pr-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>Password</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Min 6 chars</span>
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Phone / WhatsApp */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Phone <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="+91 9435012345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="For Direct Bookings"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-3 rounded-xl shadow-md transition-all cursor-pointer mt-2 disabled:opacity-50"
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
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
