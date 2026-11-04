import { Property, RoomType, BannerAd, User, UserRole, BookingEnquiry, SubscriptionTransaction, PropertyType, PropertyVisit, PropertyLead } from '../types';
import { INITIAL_USERS, INITIAL_PROPERTIES, INITIAL_ROOMS, INITIAL_BANNERS, INITIAL_TRANSACTIONS } from '../data/initialData';
import { db, auth, isFirebaseConfigured, firebaseConfigError } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { deletePropertyPhoto } from './uploadPropertyImage';

const STORAGE_KEYS = {
  USERS: 'thikana_users_v1',
  PROPERTIES: 'thikana_properties_v1',
  ROOMS: 'thikana_rooms_v1',
  BANNERS: 'thikana_banners_v1',
  ENQUIRIES: 'thikana_enquiries_v1',
  TRANSACTIONS: 'thikana_transactions_v1',
  VISITS: 'thikana_visits_v1',
  LEADS: 'thikana_leads_v1',
  CURRENT_USER_ID: 'thikana_current_user_id_v1',
  THEME: 'thikana_theme_v1',
  MOBILE_FRAME: 'thikana_mobile_frame_v1',
};

// Helper for cryptographic SHA-256 password hashing with salt
function rightRotate(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isPrime = (candidate: number) => {
    for (let factor = 2; factor * factor <= candidate; factor++) {
      if (candidate % factor === 0) return false;
    }
    return true;
  };

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 1 / 2) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export function generateSalt(): string {
  return Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
}

export function hashPasswordWithSalt(pwd: string, salt: string, iterations = 10000): string {
  if (!pwd) return '';
  let h = sha256(salt + pwd);
  for (let i = 1; i < iterations; i++) {
    h = sha256(h + salt);
  }
  return h;
}

export function hashPassword(pwd: string, salt?: string): string {
  if (!pwd) return '';
  if (salt) {
    return hashPasswordWithSalt(pwd, salt);
  }
  return sha256('thikana_secure_salt_2026_' + pwd);
}

// Helper to sanitize user object before sending to Firestore (strips password completely)
function sanitizeUserForFirestore(user: User) {
  return {
    id: user.id,
    name: user.name || '',
    username: user.username || '',
    email: user.email || '',
    googleEmail: user.googleEmail || '',
    googleUid: user.googleUid || '',
    phone: user.phone || '',
    whatsapp: user.whatsapp || '',
    role: user.role || 'customer',
    status: user.status || 'active',
    createdAt: user.createdAt || new Date().toISOString(),
  };
}

function sanitizeForFirestore<T>(obj: T): any {
  if (obj === null || obj === undefined) return null;
  return JSON.parse(JSON.stringify(obj));
}

// Sync safe user details to publicly readable public_profiles collection
function syncPublicProfile(user: User) {
  if (!db) return;
  try {
    setDoc(
      doc(db, 'public_profiles', user.googleUid || user.id),
      {
        id: user.id,
        name: user.name || '',
        username: user.username || '',
        role: user.role || 'customer',
      },
      { merge: true }
    ).catch((err) => console.warn('Public profile sync notice:', err));
  } catch (err) {
    console.warn('syncPublicProfile error:', err);
  }
}

const normalizeProperty = (p: any): Property => ({
  ...p,
  rating: typeof p?.rating === 'number' && !isNaN(p.rating) ? p.rating : 5.0,
  reviewsCount: typeof p?.reviewsCount === 'number' && !isNaN(p.reviewsCount) ? p.reviewsCount : 1,
});

class DataStore {
  private users: User[] = [];
  private properties: Property[] = [];
  private rooms: RoomType[] = [];
  private banners: BannerAd[] = [];
  private enquiries: BookingEnquiry[] = [];
  private transactions: SubscriptionTransaction[] = [];
  private visits: PropertyVisit[] = [];
  private leads: PropertyLead[] = [];
  private currentUserId: string = 'customer_1';
  private listeners: Set<() => void> = new Set();
  private isDarkMode: boolean = false;
  private isMobileFrame: boolean = false;
  private isFirebaseSynced: boolean = false;
  public firestoreError: string | null = null;
  private failedLoginAttempts: Map<string, { count: number; lockUntil: number }> = new Map();

  constructor() {
    this.initData();
    this.initFirebaseListeners();
  }

  private initData() {
    try {
      const storedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      const rawUsers: User[] = storedUsers ? JSON.parse(storedUsers) : INITIAL_USERS;
      this.users = rawUsers.map((u) => {
        const userObj = { ...u };
        // Browser storage and bundled seed data are untrusted. A cached role must
        // never grant admin access; the authenticated Firestore profile restores
        // a legitimate admin role after Firebase Auth has verified the session.
        if (userObj.role === 'admin') {
          userObj.role = 'customer';
        }
        // Firebase Authentication is the only supported credential authority.
        // Do not create predictable demo passwords or retain legacy local hashes.
        delete (userObj as any).password;
        delete (userObj as any).passwordHash;
        delete (userObj as any).passwordSalt;
        return userObj;
      });

      const storedProps = localStorage.getItem(STORAGE_KEYS.PROPERTIES);
      const rawProps = storedProps ? JSON.parse(storedProps) : INITIAL_PROPERTIES;
      this.properties = (Array.isArray(rawProps) ? rawProps : INITIAL_PROPERTIES).map(normalizeProperty);

      const storedRooms = localStorage.getItem(STORAGE_KEYS.ROOMS);
      this.rooms = storedRooms ? JSON.parse(storedRooms) : INITIAL_ROOMS;

      const storedBanners = localStorage.getItem(STORAGE_KEYS.BANNERS);
      this.banners = storedBanners ? JSON.parse(storedBanners) : INITIAL_BANNERS;

      const storedEnquiries = localStorage.getItem(STORAGE_KEYS.ENQUIRIES);
      this.enquiries = storedEnquiries ? JSON.parse(storedEnquiries) : [];

      const storedTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      this.transactions = storedTx ? JSON.parse(storedTx) : INITIAL_TRANSACTIONS;

      const storedVisits = localStorage.getItem(STORAGE_KEYS.VISITS);
      this.visits = storedVisits ? JSON.parse(storedVisits) : [];

      const storedLeads = localStorage.getItem(STORAGE_KEYS.LEADS);
      this.leads = storedLeads ? JSON.parse(storedLeads) : [];

      const storedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
      this.currentUserId = storedUserId || 'customer_1';

      const storedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      this.isDarkMode = storedTheme === 'dark';

      const storedFrame = localStorage.getItem(STORAGE_KEYS.MOBILE_FRAME);
      this.isMobileFrame = storedFrame === 'true';

      this.persist();
    } catch (e) {
      console.error('Error loading store data:', e);
      this.users = INITIAL_USERS;
      this.properties = INITIAL_PROPERTIES;
      this.rooms = INITIAL_ROOMS;
      this.banners = INITIAL_BANNERS;
      this.transactions = INITIAL_TRANSACTIONS;
    }
  }

  private privateDataUnsubscribers: Array<() => void> = [];
  private privateDataUid = '';

  private syncOwnerPrivateCollections(uid: string) {
    if (!db || !uid || this.privateDataUid === uid) return;
    this.privateDataUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.privateDataUnsubscribers = [];
    const propertyIds = this.properties.filter((property) => property.ownerUid === uid).map((property) => property.id).filter(Boolean);
    if (propertyIds.length === 0) { this.privateDataUid = ''; return; }
    this.privateDataUid = uid;

    for (let offset = 0; offset < propertyIds.length; offset += 30) {
      const ids = propertyIds.slice(offset, offset + 30);
      const subscribeOwned = <T extends { id: string }>(name: 'enquiries' | 'visits' | 'leads', assign: (records: T[]) => void) => {
        const ownedQuery = query(collection(db!, name), where('propertyId', 'in', ids));
        const unsubscribe = onSnapshot(ownedQuery, (snapshot) => {
          assign(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
          this.persist();
          this.notify(false);
        }, (error) => console.warn(`Firestore ${name} owner sync notice:`, error?.message || error));
        this.privateDataUnsubscribers.push(unsubscribe);
      };
      subscribeOwned<BookingEnquiry>('enquiries', (records) => {
        const merged = new Map(this.enquiries.map((item) => [item.id, item]));
        records.forEach((item) => merged.set(item.id, item));
        this.enquiries = Array.from(merged.values());
      });
      subscribeOwned<PropertyVisit>('visits', (records) => {
        const merged = new Map(this.visits.map((item) => [item.id, item]));
        records.forEach((item) => merged.set(item.id, item));
        this.visits = Array.from(merged.values());
      });
      subscribeOwned<PropertyLead>('leads', (records) => {
        const merged = new Map(this.leads.map((item) => [item.id, item]));
        records.forEach((item) => merged.set(item.id, item));
        this.leads = Array.from(merged.values());
      });
    }
  }

  private initFirebaseListeners() {
    if (!isFirebaseConfigured || !db) {
      console.info('Running in local/standalone mode (Firebase is not configured).');
      return;
    }
    try {
      // Sync Firebase Auth state with DataStore currentUserId & user doc
      if (auth) {
        onAuthStateChanged(auth, (fbUser) => {
          if (!fbUser) {
            this.privateDataUnsubscribers.forEach((unsubscribe) => unsubscribe());
            this.privateDataUnsubscribers = [];
            this.privateDataUid = '';
            return;
          }
          this.syncOwnerPrivateCollections(fbUser.uid);
          if (fbUser) {
            const existing = this.users.find(
              (u) =>
                u.id === fbUser.uid ||
                u.id === `google_${fbUser.uid}` ||
                u.googleUid === fbUser.uid ||
                (fbUser.email && u.email?.toLowerCase() === fbUser.email.toLowerCase())
            );
            if (existing) {
              this.currentUserId = existing.id;
              this.persist();
              this.notify(false);
            }

            // Listen to authenticated user's profile document in Firestore
            if (db) {
              try {
                onSnapshot(doc(db, 'users', fbUser.uid), (docSnap) => {
                  if (docSnap.exists()) {
                    const profileData = docSnap.data();
                    const uData = { ...profileData, id: (profileData.id as string) || docSnap.id } as User;
                    const idx = this.users.findIndex((u) => u.id === uData.id || u.googleUid === fbUser.uid);
                    if (idx !== -1) {
                      this.users[idx] = { ...this.users[idx], ...uData };
                    } else {
                      this.users.push(uData);
                    }
                    this.persist();
                    this.notify(false);
                  }
                }, () => {});
              } catch {}
            }
          }
        });
      }

      // Sync properties collection from Firestore
      onSnapshot(collection(db, 'properties'), (snapshot) => {
        this.firestoreError = null;
        if (!snapshot.empty) {
          const remoteProps: Property[] = [];
          snapshot.forEach((docSnap) => {
            remoteProps.push(normalizeProperty({ id: docSnap.id, ...docSnap.data() }));
          });
          if (remoteProps.length > 0) {
            const propMap = new Map<string, Property>();
            this.properties.forEach((p) => propMap.set(p.id, p));
            remoteProps.forEach((rp) => propMap.set(rp.id, rp));
            this.properties = Array.from(propMap.values());
            if (auth?.currentUser) {
              this.privateDataUid = '';
              this.syncOwnerPrivateCollections(auth.currentUser.uid);
            }
            this.persist();
            this.notify(false);
          }
        }
        this.isFirebaseSynced = true;
      }, (err) => {
        const msg = err?.message || String(err);
        if (err?.code === 'unavailable' || msg.includes('unavailable') || msg.includes('Could not reach')) {
          console.warn('Firestore offline/connecting (using local storage):', msg);
        } else if (msg.includes('not found') || msg.includes('Database')) {
          console.warn(`Firestore unreachable (${msg}). Using local storage fallback.`);
        } else {
          console.warn('Firestore properties sync note:', msg);
        }
        this.notify(false);
      });

      // Sync rooms collection from Firestore
      onSnapshot(collection(db, 'rooms'), (snapshot) => {
        if (!snapshot.empty) {
          const remoteRooms: RoomType[] = [];
          snapshot.forEach((docSnap) => {
            remoteRooms.push({ id: docSnap.id, ...docSnap.data() } as RoomType);
          });
          if (remoteRooms.length > 0) {
            const roomMap = new Map<string, RoomType>();
            this.rooms.forEach((r) => roomMap.set(r.id, r));
            remoteRooms.forEach((rr) => roomMap.set(rr.id, rr));
            this.rooms = Array.from(roomMap.values());
            this.persist();
            this.notify(false);
          }
        }
      }, (err) => {
        console.error('Firestore rooms sync error:', err);
      });

      // Read user profiles individually by authenticated UID; do not scan the users collection.

      // Private collections are synced only with owner-scoped queries.

    } catch (err: any) {
      console.error('Firebase listeners setup error:', err);
      this.firestoreError = err?.message || String(err);
    }
  }

  private persist() {
    try {
      const safeCachedUsers = this.users.map((user) => {
        if (!user.googleUid) return user;
        const safeUser = { ...user } as User & { password?: string; passwordHash?: string; passwordSalt?: string };
        delete safeUser.password;
        delete safeUser.passwordHash;
        delete safeUser.passwordSalt;
        return safeUser as User;
      });
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(safeCachedUsers));
      localStorage.setItem(STORAGE_KEYS.PROPERTIES, JSON.stringify(this.properties));
      localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(this.rooms));
      localStorage.setItem(STORAGE_KEYS.BANNERS, JSON.stringify(this.banners));
      localStorage.setItem(STORAGE_KEYS.ENQUIRIES, JSON.stringify(this.enquiries));
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(this.transactions));
      localStorage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(this.visits));
      localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(this.leads));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
      localStorage.setItem(STORAGE_KEYS.THEME, this.isDarkMode ? 'dark' : 'light');
      localStorage.setItem(STORAGE_KEYS.MOBILE_FRAME, String(this.isMobileFrame));
    } catch (e) {
      console.error('Error persisting store:', e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(syncLocal = true) {
    if (syncLocal) {
      this.persist();
    }
    this.listeners.forEach((fn) => fn());
  }

  // Auth & User Management
  public logout(): void {
    this.currentUserId = '';
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    if (auth) {
      signOut(auth).catch((err) => console.warn('Firebase signOut notice:', err));
    }
    this.notify();
  }

  public loginOrRegisterWithGoogle(googleData: {
    email: string;
    displayName?: string | null;
    photoURL?: string | null;
    uid?: string;
    desiredRole?: UserRole;
  }): User {
    const q = googleData.email.trim().toLowerCase();
    let found = this.users.find(
      (u) =>
        (googleData.uid && (u.googleUid === googleData.uid || u.id === `google_${googleData.uid}`)) ||
        (u.googleEmail && u.googleEmail.toLowerCase() === q) ||
        (u.email && u.email.toLowerCase() === q)
    );

    if (found) {
      if (!found.googleEmail) found.googleEmail = googleData.email;
      if (!found.googleUid && googleData.uid) found.googleUid = googleData.uid;
      if (googleData.photoURL) found.avatar = googleData.photoURL;
      if (googleData.displayName && (!found.name || found.name === 'Host User')) found.name = googleData.displayName;
      this.currentUserId = found.id;
      if (db) {
        setDoc(doc(db, 'users', googleData.uid || found.googleUid || found.id), sanitizeUserForFirestore(found), { merge: true }).catch((err) =>
          console.warn('Firestore sync user error:', err)
        );
      }
      syncPublicProfile(found);
      this.notify();
      return found;
    }

    // Create new user from Google Login
    const baseName = googleData.displayName || googleData.email.split('@')[0];
    const baseUsername = googleData.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');

    // Never promote to admin via Google sign-in unless currentUser is admin
    let targetRole: UserRole = googleData.desiredRole || 'owner';
    if (targetRole === 'admin') {
      const activeUser = this.getCurrentUser();
      if (!activeUser || activeUser.role !== 'admin') {
        targetRole = 'owner';
      }
    }

    const newUser: User = {
      id: googleData.uid || 'user_' + Date.now(),
      name: baseName,
      username: baseUsername || 'user_' + Math.floor(1000 + Math.random() * 9000),
      email: googleData.email,
      googleEmail: googleData.email,
      googleUid: googleData.uid,
      avatar: googleData.photoURL || undefined,
      passwordHash: hashPassword('google_auth_user'),
      phone: '',
      whatsapp: '',
      role: targetRole,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.users.push(newUser);
    this.currentUserId = newUser.id;
    if (db) {
      setDoc(doc(db, 'users', newUser.googleUid || newUser.id), sanitizeUserForFirestore(newUser)).catch((err) =>
        console.warn('Firestore register Google User error:', err)
      );
    }
    syncPublicProfile(newUser);
    this.notify();
    return newUser;
  }

  public async loginWithFirebaseUser(firebaseUser: { uid: string; email: string | null; displayName?: string | null; photoURL?: string | null }): Promise<User> {
    if (!firebaseUser?.uid || !firebaseUser.email || !db) {
      throw new Error('Firebase account profile is unavailable. Please try again.');
    }

    const existing = this.users.find((u) =>
      u.googleUid === firebaseUser.uid ||
      u.id === firebaseUser.uid ||
      (u.email && u.email.toLowerCase() === firebaseUser.email!.toLowerCase())
    );
    const profileRef = doc(db, 'users', firebaseUser.uid);
    const profileSnap = await getDoc(profileRef);
    const remote = profileSnap.exists() ? profileSnap.data() : {};
    const user: User = {
      ...(existing || {} as User),
      ...(remote as Partial<User>),
      id: (remote.id as string) || existing?.id || firebaseUser.uid,
      name: (remote.name as string) || existing?.name || firebaseUser.displayName || firebaseUser.email.split('@')[0],
      username: (remote.username as string) || existing?.username || firebaseUser.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, ''),
      email: firebaseUser.email,
      googleEmail: firebaseUser.email,
      googleUid: firebaseUser.uid,
      avatar: firebaseUser.photoURL || existing?.avatar,
      phone: (remote.phone as string) || existing?.phone || '',
      whatsapp: (remote.whatsapp as string) || existing?.whatsapp || '',
      // Never trust a role cached in localStorage; only a server-authorized profile can grant admin.
      role: (remote.role as UserRole) || (existing?.role === 'customer' ? 'customer' : 'owner'),
      status: (remote.status as User['status']) || existing?.status || 'active',
      createdAt: (remote.createdAt as string) || existing?.createdAt || new Date().toISOString(),
    };

    const idx = this.users.findIndex((u) => u.id === user.id || u.googleUid === firebaseUser.uid);
    if (idx >= 0) this.users[idx] = { ...this.users[idx], ...user };
    else this.users.push(user);
    this.currentUserId = user.id;
    await setDoc(profileRef, sanitizeUserForFirestore(user), { merge: true });
    syncPublicProfile(user);
    this.notify();
    return user;
  }

  public findUserByGoogleUid(uid: string): User | undefined {
    if (!uid) return undefined;
    return this.users.find(
      (u) => u.googleUid === uid || u.id === `google_${uid}`
    );
  }

  public getCurrentUser(): User | undefined {
    return this.users.find((u) => u.id === this.currentUserId);
  }

  public getUsers(): User[] {
    // Never expose legacy local credential material to UI components.
    return this.users.map(({ password, passwordHash, passwordSalt, ...u }) => u as User);
  }

  public setCurrentUserId(id: string) {
    this.currentUserId = id;
    this.notify();
  }

  public registerUser(user: Omit<User, 'id' | 'createdAt' | 'status'> & { username?: string; password?: string; googleEmail?: string; googleUid?: string }): User {
    // Prevent self-promotion to admin unless created by an existing logged-in admin
    let assignedRole: UserRole = user.role || 'owner';
    if (assignedRole === 'admin') {
      const activeUser = this.getCurrentUser();
      if (!activeUser || activeUser.role !== 'admin') {
        assignedRole = 'owner';
      }
    }

    const pwd = user.password || '';
    const salt = generateSalt();
    const newUser: User = {
      ...user,
      role: assignedRole,
      username: user.username || user.email.split('@')[0],
      passwordSalt: pwd ? salt : undefined,
      passwordHash: pwd ? hashPasswordWithSalt(pwd, salt) : undefined,
      googleEmail: user.googleEmail || user.email,
      googleUid: user.googleUid,
      id: user.googleUid || 'user_' + Date.now(),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    delete newUser.password; // Remove plaintext password

    this.users.push(newUser);
    this.currentUserId = newUser.id;
    if (db) {
      setDoc(doc(db, 'users', newUser.googleUid || newUser.id), sanitizeUserForFirestore(newUser)).catch((err) => console.warn('Firestore registerUser error:', err));
    }
    syncPublicProfile(newUser);
    this.notify();
    return newUser;
  }

  public loginWithUsernamePassword(identifier: string, passwordInput: string): { success: boolean; user?: User; message?: string } {
    const q = identifier.trim().toLowerCase();

    // Check rate limiting / lockout
    const attemptInfo = this.failedLoginAttempts.get(q);
    if (attemptInfo && attemptInfo.lockUntil > Date.now()) {
      const remainingMins = Math.ceil((attemptInfo.lockUntil - Date.now()) / 60000);
      return {
        success: false,
        message: `Too many failed login attempts! Account locked for security. Please try again in ${remainingMins} minute(s) or use Google Email password reset.`,
      };
    }

    const found = this.users.find((u) => 
      (u.username && u.username.toLowerCase() === q) ||
      (u.email && u.email.toLowerCase() === q) ||
      (u.googleEmail && u.googleEmail.toLowerCase() === q) ||
      u.phone === identifier.trim()
    );

    if (!found) {
      return { success: false, message: 'No account found with this username, email, or mobile number.' };
    }

    if (!passwordInput || !passwordInput.trim()) {
      return { success: false, message: 'Please enter your password.' };
    }

    // Verify password via user-specific salt hash or legacy hash fallback
    let isValidPassword = false;
    if (found.passwordSalt && found.passwordHash) {
      const computedHash = hashPasswordWithSalt(passwordInput, found.passwordSalt);
      isValidPassword = found.passwordHash === computedHash;
    } else if (found.passwordHash) {
      // Legacy single-round static salt hash fallback
      const legacyHash = hashPassword(passwordInput);
      isValidPassword = found.passwordHash === legacyHash;
    }

    if (!isValidPassword) {
      // Record failed attempt
      const currentCount = (attemptInfo?.count || 0) + 1;
      let lockUntil = 0;
      if (currentCount >= 5) {
        lockUntil = Date.now() + 15 * 60 * 1000; // 15 minute lockout
      }
      this.failedLoginAttempts.set(q, { count: currentCount, lockUntil });

      const attemptsLeft = 5 - currentCount;
      const warningMessage = currentCount >= 5
        ? 'Too many failed login attempts! Account locked for 15 minutes.'
        : `Incorrect password! (${attemptsLeft} attempt(s) remaining before temporary lockout).`;

      return { success: false, message: warningMessage };
    }

    // Login success - clear attempt counter
    this.failedLoginAttempts.delete(q);

    // Auto-migrate legacy user to unique per-user salt + 10,000-round hash
    if (!found.passwordSalt) {
      found.passwordSalt = generateSalt();
      found.passwordHash = hashPasswordWithSalt(passwordInput, found.passwordSalt);
    }
    delete found.password;

    this.currentUserId = found.id;
    this.notify();
    return { success: true, user: found };
  }

  public resetPasswordWithGoogleEmail(googleEmailInput: string, newPassword: string, newUsername?: string): { success: boolean; user?: User; message?: string } {
    const q = googleEmailInput.trim().toLowerCase();
    const found = this.users.find((u) => 
      (u.googleEmail && u.googleEmail.toLowerCase() === q) ||
      (u.email && u.email.toLowerCase() === q)
    );

    if (!found) {
      return { 
        success: false, 
        message: 'No account found matching this Google Email address. Please make sure you enter the email address used during registration.' 
      };
    }

    const salt = generateSalt();
    found.passwordSalt = salt;
    found.passwordHash = hashPasswordWithSalt(newPassword, salt);
    delete found.password;

    if (newUsername && newUsername.trim().length > 0) {
      found.username = newUsername.trim();
    }
    if (!found.googleEmail) {
      found.googleEmail = googleEmailInput.trim();
    }

    // Clear any failed login locks
    if (found.username) this.failedLoginAttempts.delete(found.username.toLowerCase());
    if (found.email) this.failedLoginAttempts.delete(found.email.toLowerCase());

    this.currentUserId = found.id;
    if (db) {
      setDoc(doc(db, 'users', found.id), sanitizeUserForFirestore(found), { merge: true }).catch((err) => console.warn('Firestore resetPassword error:', err));
    }
    syncPublicProfile(found);
    this.notify();
    return { success: true, user: found, message: `Password reset successfully for @${found.username || found.name}! You are now logged in.` };
  }

  public resetPasswordAfterGoogleVerification(userId: string, newPassword: string, newUsername?: string): { success: boolean; user?: User; message?: string } {
    const found = this.users.find((u) => u.id === userId);
    if (!found) {
      return {
        success: false,
        message: 'No matching user account found.',
      };
    }

    const salt = generateSalt();
    found.passwordSalt = salt;
    found.passwordHash = hashPasswordWithSalt(newPassword, salt);
    delete found.password;

    if (newUsername && newUsername.trim().length > 0) {
      found.username = newUsername.trim();
    }

    // Clear any failed login locks
    if (found.username) this.failedLoginAttempts.delete(found.username.toLowerCase());
    if (found.email) this.failedLoginAttempts.delete(found.email.toLowerCase());

    this.currentUserId = found.id;
    if (db) {
      setDoc(doc(db, 'users', found.id), sanitizeUserForFirestore(found), { merge: true }).catch((err) => console.warn('Firestore resetPassword error:', err));
    }
    syncPublicProfile(found);
    this.notify();
    return { success: true, user: found, message: `Password reset successfully for @${found.username || found.name}! You are now logged in.` };
  }

  public isOwnerOfProperty(userId: string | undefined, propertyId: string): boolean {
    if (!userId) return false;
    const user = this.users.find((u) => u.id === userId);
    if (user && user.role === 'admin') return true;
    const prop = this.properties.find((p) => p.id === propertyId);
    if (!prop) return false;
    const firebaseUid = auth?.currentUser?.uid;
    const firebaseEmail = auth?.currentUser?.email;

    const matchesUid =
      prop.ownerId === userId ||
      prop.ownerUid === userId ||
      (!!firebaseUid && (prop.ownerUid === firebaseUid || prop.ownerId === firebaseUid || prop.ownerId === `google_${firebaseUid}`)) ||
      (!!user?.googleUid && (prop.ownerUid === user.googleUid || prop.ownerId === user.googleUid || prop.ownerId === `google_${user.googleUid}`));

    const matchesEmail =
      (!!firebaseEmail && prop.ownerEmail?.toLowerCase() === firebaseEmail.toLowerCase()) ||
      (!!user?.googleEmail && prop.ownerEmail?.toLowerCase() === user.googleEmail.toLowerCase()) ||
      (!!user?.email && prop.ownerEmail?.toLowerCase() === user.email.toLowerCase());

    return matchesUid || matchesEmail;
  }

  public updateUserStatus(userId: string, status: User['status']) {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.status = status;
      this.notify();
    }
  }

  public toggleUserStatus(userId: string) {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.status = user.status === 'active' ? 'blocked' : 'active';
      this.notify();
    }
  }

  // Theme & Frame Mode
  public getTheme() {
    return this.isDarkMode;
  }

  public toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    this.notify();
  }

  public getMobileFrame() {
    return this.isMobileFrame;
  }

  public toggleMobileFrame() {
    this.isMobileFrame = !this.isMobileFrame;
    this.notify();
  }

  // Properties
  public getProperties(): Property[] {
    return this.properties;
  }

  public getPropertyById(id: string): Property | undefined {
    return this.properties.find((p) => p.id === id);
  }

  public getPropertiesByOwner(ownerId: string): Property[] {
    const user = this.users.find((u) => u.id === ownerId);
    return this.properties.filter((p) => {
      if (p.ownerId === ownerId) return true;
      if (p.ownerUid && (p.ownerUid === ownerId || p.ownerUid === user?.googleUid)) return true;
      if (p.ownerEmail && user?.email && p.ownerEmail.toLowerCase() === user.email.toLowerCase()) return true;
      if (p.ownerEmail && user?.googleEmail && p.ownerEmail.toLowerCase() === user.googleEmail.toLowerCase()) return true;
      return false;
    });
  }

  public async addProperty(
    prop: Omit<Property, 'id' | 'createdAt' | 'rating' | 'reviewsCount' | 'isVerified' | 'isFeatured' | 'status' | 'subscriptionPlan' | 'subscriptionPrice' | 'subscriptionExpiresAt' | 'subscriptionExpiryDate'>,
    planType: 'standard_1000' | 'standard_1500' = 'standard_1000'
  ): Promise<Property> {
    const firebaseUid = auth?.currentUser?.uid;
    const firebaseEmail = auth?.currentUser?.email;
    const currentUser = this.getCurrentUser();

    const hasVerifiedOwnerSession = Boolean(
      firebaseUid &&
      currentUser &&
      currentUser.googleUid === firebaseUid &&
      (currentUser.role === 'owner' || currentUser.role === 'admin')
    );
    if (db ? !hasVerifiedOwnerSession : (!currentUser || !['owner', 'admin'].includes(currentUser.role))) {
      throw new Error('Authentication required: Please sign in with your verified owner account to list a new property.');
    }

    const now = new Date();

    const ownerUid = firebaseUid || currentUser?.googleUid || currentUser?.id || 'owner_' + Date.now();
    const ownerEmail = firebaseEmail || currentUser?.googleEmail || currentUser?.email || prop.ownerEmail || '';
    const ownerId = currentUser?.id || firebaseUid || prop.ownerId || ownerUid;

    const newProp: Property = {
      ...prop,
      ownerId,
      ownerUid,
      ownerEmail,
      id: 'prop_' + Date.now(),
      rating: 0,
      reviewsCount: 0,
      isVerified: false,
      isFeatured: false,
      status: 'active',
      // A listing request is not proof of payment. Admin activates paid plans separately.
      subscriptionPlan: 'none',
      subscriptionPrice: 0,
      subscriptionExpiresAt: '',
      subscriptionExpiryDate: '',
      createdAt: now.toISOString(),
    };

    // Save to Firestore if database is active
    if (db) {
      try {
        const { ownerEmail: _privateOwnerEmail, ...publicPropertyData } = newProp;
        await setDoc(doc(db, 'properties', newProp.id), sanitizeForFirestore(publicPropertyData));
      } catch (err: any) {
        console.error('Firestore addProperty failed:', err);
        throw new Error('Property could not be saved to the server. Please check your sign-in and Firebase setup, then try again.');
      }
    }

    const existingIdx = this.properties.findIndex((p) => p.id === newProp.id);
    if (existingIdx === -1) {
      this.properties.push(newProp);
    } else {
      this.properties[existingIdx] = newProp;
    }

    // Do not record revenue until payment is independently confirmed.
    if (firebaseUid) {
      this.privateDataUid = '';
      this.syncOwnerPrivateCollections(firebaseUid);
    }
    this.persist();
    this.notify();
    return newProp;
  }

  public async updateProperty(id: string, updates: Partial<Property>): Promise<{ success: boolean; status?: number; message?: string }> {
    const idx = this.properties.findIndex((p) => p.id === id);
    if (idx === -1) {
      return { success: false, status: 404, message: 'Property not found.' };
    }

    const prop = this.properties[idx];
    const currentUser = this.getCurrentUser();
    const firebaseUid = auth?.currentUser?.uid;

    const isOwner = db
      ? Boolean(
          firebaseUid &&
          currentUser &&
          currentUser.googleUid === firebaseUid &&
          (currentUser.role === 'admin' ||
            (currentUser.role === 'owner' && prop.ownerUid === firebaseUid))
        )
      : Boolean(
          currentUser &&
          (currentUser.role === 'admin' ||
            this.isOwnerOfProperty(currentUser.id, id))
        );

    if (!isOwner) {
      console.error('403 Forbidden: Unauthorized property update blocked for id:', id);
      return { 
        success: false, 
        status: 403, 
        message: '403 Forbidden: Only the property owner can edit this listing.' 
      };
    }

    // Strip ownerId, ownerUid, and ownerEmail to enforce ownership immutability
    const safeUpdates = { ...updates };
    delete safeUpdates.ownerId;
    delete safeUpdates.ownerUid;
    delete safeUpdates.ownerEmail;

    const updatedProp = { ...this.properties[idx], ...safeUpdates };

    if (db) {
      try {
        const { ownerEmail: _privateOwnerEmail, ...publicPropertyData } = updatedProp;
        await setDoc(doc(db, 'properties', id), sanitizeForFirestore(publicPropertyData), { merge: true });
      } catch (err: any) {
        console.error('Firestore updateProperty failed:', err);
        return {
          success: false,
          status: 500,
          message: 'Property could not be updated on the server. Please check your sign-in and try again.',
        };
      }
    }

    this.properties[idx] = updatedProp;
    this.persist();
    this.notify();
    return { success: true, message: 'Property updated successfully.' };
  }

  private async updateAdminPropertyFields(id: string, updates: Partial<Property>): Promise<boolean> {
    const prop = this.getPropertyById(id);
    if (!prop || this.getCurrentUser()?.role !== 'admin') return false;
    try {
      if (db) await setDoc(doc(db, 'properties', id), sanitizeForFirestore(updates), { merge: true });
      Object.assign(prop, updates);
      this.persist();
      this.notify(false);
      return true;
    } catch (error: any) {
      console.error('Admin property update failed:', error);
      this.firestoreError = error?.message || String(error);
      return false;
    }
  }

  public async togglePropertyStatus(id: string): Promise<boolean> {
    const prop = this.getPropertyById(id);
    if (!prop) return false;
    const nextStatus = prop.status === 'active' ? 'blocked' : 'active';
    return this.updateAdminPropertyFields(id, { status: nextStatus });
  }

  public async togglePropertyVerified(id: string, verified?: boolean): Promise<boolean> {
    const prop = this.getPropertyById(id);
    if (!prop) return false;
    const nextValue = verified !== undefined ? verified : !prop.isVerified;
    const saved = await this.updateAdminPropertyFields(id, { isVerified: nextValue });
    if (saved && nextValue) {
      this.addTransaction({
        ownerId: prop.ownerId,
        ownerName: prop.ownerName,
        propertyId: prop.id,
        propertyName: prop.title,
        type: 'verified_badge',
        planName: 'Blue Verified Badge (₹500/month)',
        amount: 500,
        date: new Date().toISOString().split('T')[0],
      });
      this.notify();
    }
    return saved;
  }

  public async togglePropertyFeatured(id: string, featured?: boolean): Promise<boolean> {
    const prop = this.getPropertyById(id);
    if (!prop) return false;
    const nextValue = featured !== undefined ? featured : !prop.isFeatured;
    const saved = await this.updateAdminPropertyFields(id, { isFeatured: nextValue });
    if (saved && nextValue) {
      this.addTransaction({
        ownerId: prop.ownerId,
        ownerName: prop.ownerName,
        propertyId: prop.id,
        propertyName: prop.title,
        type: 'search_boost',
        planName: 'Top Search Placement ⭐ Featured (₹500/month)',
        amount: 500,
        date: new Date().toISOString().split('T')[0],
      });
      this.notify();
    }
    return saved;
  }

  public async deleteProperty(id: string): Promise<{ success: boolean; status?: number; message?: string }> {
    const prop = this.getPropertyById(id);
    if (!prop) {
      return { success: false, status: 404, message: 'Property not found.' };
    }

    const currentUser = this.getCurrentUser();
    const firebaseUid = auth?.currentUser?.uid;
    const isOwner = db
      ? Boolean(
          firebaseUid &&
          currentUser &&
          currentUser.googleUid === firebaseUid &&
          (currentUser.role === 'admin' ||
            (currentUser.role === 'owner' && prop.ownerUid === firebaseUid))
        )
      : Boolean(
          currentUser &&
          (currentUser.role === 'admin' ||
            this.isOwnerOfProperty(currentUser.id, id))
        );

    if (!isOwner) {
      return {
        success: false,
        status: 403,
        message: '403 Forbidden: Only the property owner can delete this listing.',
      };
    }

    // Remove rooms first: Firestore room-delete rules verify ownership through
    // the parent property document, so deleting the property first would block cleanup.
    if (db) {
      try {
        const relatedRooms = this.rooms.filter((room) => room.propertyId === id);
        if (relatedRooms.length > 499) {
          return { success: false, status: 400, message: 'This property has too many room records for a safe single-step deletion. Please contact support.' };
        }
        const batch = writeBatch(db);
        relatedRooms.forEach((room) => batch.delete(doc(db, 'rooms', room.id)));
        batch.delete(doc(db, 'properties', id));
        await batch.commit();
      } catch (error: any) {
        console.error('Firestore deleteProperty failed:', error);
        return {
          success: false,
          status: 500,
          message: 'The property could not be deleted completely on the server. Please retry; your local listing has been kept.',
        };
      }
    }

    // Firebase photo cleanup is best-effort after the database delete succeeds.
    if (Array.isArray(prop.photos)) {
      await Promise.all(prop.photos.map((photoUrl) => deletePropertyPhoto(photoUrl).catch((error) => {
        console.warn('Property photo cleanup notice:', error?.message || error);
      })));
    }

    this.properties = this.properties.filter((property) => property.id !== id);
    this.rooms = this.rooms.filter((room) => room.propertyId !== id);
    this.persist();
    this.notify();
    return { success: true, message: 'Property deleted successfully.' };
  }

  public async renewPropertySubscription(propertyId: string, daysToAdd = 30, planName = 'Standard Listing Plan'): Promise<boolean> {
    const prop = this.getPropertyById(propertyId);
    if (!prop || this.getCurrentUser()?.role !== 'admin') return false;

    const price = 1000;
    const now = new Date();
    const currentExpiry = new Date(prop.subscriptionExpiresAt || prop.subscriptionExpiryDate || now.toISOString());
    const startDate = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startDate);
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);
    const expiryIso = newExpiry.toISOString();

    const saved = await this.updateAdminPropertyFields(propertyId, {
      subscriptionExpiresAt: expiryIso,
      subscriptionExpiryDate: expiryIso,
      status: 'active',
    });
    if (!saved) return false;

    this.addTransaction({
      ownerId: prop.ownerId,
      ownerName: prop.ownerName,
      propertyId: prop.id,
      propertyName: prop.title,
      type: 'standard_1000',
      planName: planName || 'Standard Listing Renewal',
      amount: price,
      date: now.toISOString().split('T')[0],
    });
    this.notify();
    return true;
  }

  // Room Types
  public getRoomsByProperty(propertyId: string): RoomType[] {
    return this.rooms.filter((r) => r.propertyId === propertyId);
  }

  public async addRoom(room: Omit<RoomType, 'id'>): Promise<RoomType> {
    const prop = this.getPropertyById(room.propertyId);
    const firebaseUid = auth?.currentUser?.uid;
    const currentUser = this.getCurrentUser();
    const canManage = firebaseUid
      ? Boolean(prop && prop.ownerUid === firebaseUid)
      : Boolean(!db && currentUser && prop && this.isOwnerOfProperty(currentUser.id, room.propertyId));
    if (!canManage || !prop) {
      throw new Error('Only the owner of this property can add rooms.');
    }

    const newRoom: RoomType = {
      ...room,
      ownerId: prop.ownerId,
      ownerUid: firebaseUid || prop.ownerUid || currentUser?.googleUid || currentUser?.id,
      id: 'room_' + Date.now(),
    };
    if (db) {
      const { ownerEmail: _privateOwnerEmail, ...publicRoomData } = newRoom;
      await setDoc(doc(db, 'rooms', newRoom.id), sanitizeForFirestore(publicRoomData));
    }
    this.rooms.push(newRoom);
    this.notify();
    return newRoom;
  }

  public async addRoomType(room: Omit<RoomType, 'id'>): Promise<RoomType> {
    return this.addRoom(room);
  }

  public async updateRoom(id: string, updates: Partial<RoomType>): Promise<boolean> {
    const idx = this.rooms.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    const room = this.rooms[idx];
    const firebaseUid = auth?.currentUser?.uid;
    const currentUser = this.getCurrentUser();
    const property = this.getPropertyById(room.propertyId);
    const canManage = firebaseUid
      ? Boolean(property && property.ownerUid === firebaseUid && room.ownerUid === firebaseUid)
      : Boolean(!db && currentUser && property && this.isOwnerOfProperty(currentUser.id, room.propertyId));
    if (!canManage || !property) {
      throw new Error('Only the owner of this property can edit its rooms.');
    }
    const updatedRoom = { ...room, ...updates, ownerUid: firebaseUid || room.ownerUid, propertyId: room.propertyId };
    if (db) {
      const { ownerEmail: _privateOwnerEmail, ...publicRoomData } = updatedRoom;
      await setDoc(doc(db, 'rooms', id), sanitizeForFirestore(publicRoomData), { merge: true });
    }
    this.rooms[idx] = updatedRoom;
    this.notify();
    return true;
  }

  public async deleteRoom(id: string): Promise<boolean> {
    const room = this.rooms.find((r) => r.id === id);
    if (!room) return false;
    const firebaseUid = auth?.currentUser?.uid;
    const currentUser = this.getCurrentUser();
    const property = this.getPropertyById(room.propertyId);
    const canManage = firebaseUid
      ? Boolean(property && property.ownerUid === firebaseUid && room.ownerUid === firebaseUid)
      : Boolean(!db && currentUser && property && this.isOwnerOfProperty(currentUser.id, room.propertyId));
    if (!canManage || !property) {
      throw new Error('Only the owner of this property can delete its rooms.');
    }
    if (db) await deleteDoc(doc(db, 'rooms', id));
    this.rooms = this.rooms.filter((r) => r.id !== id);
    this.notify();
    return true;
  }

  public deleteRoomType(id: string) {
    this.deleteRoom(id);
  }

  // Booking Enquiries
  public addEnquiry(enquiry: Omit<BookingEnquiry, 'id' | 'createdAt'>): BookingEnquiry {
    const nowIso = new Date().toISOString();
    const newEnquiry: BookingEnquiry = {
      ...enquiry,
      id: 'enq_' + Date.now(),
      sentAt: nowIso,
      createdAt: nowIso,
    };
    this.enquiries.unshift(newEnquiry);
    if (db) {
      setDoc(doc(db, 'enquiries', newEnquiry.id), newEnquiry).catch((err) => console.warn('Firestore addEnquiry error:', err));
    }
    this.notify();
    return newEnquiry;
  }

  public getEnquiriesByOwner(ownerId: string): BookingEnquiry[] {
    return this.enquiries.filter((e) => e.ownerId === ownerId);
  }

  public getAllEnquiries(): BookingEnquiry[] {
    return this.enquiries;
  }

  public getEnquiries(): BookingEnquiry[] {
    return this.getAllEnquiries();
  }

  // Banner Ads
  public getBanners(position?: BannerAd['position']): BannerAd[] {
    if (!position) return this.banners.filter((b) => b.isActive);
    return this.banners.filter((b) => b.position === position && b.isActive);
  }

  public getAllBanners(): BannerAd[] {
    return this.banners;
  }

  public addBanner(banner: Omit<BannerAd, 'id'>): BannerAd {
    const newBanner: BannerAd = {
      ...banner,
      id: 'banner_' + Date.now(),
    };
    this.banners.push(newBanner);
    this.notify();
    return newBanner;
  }

  public toggleBannerStatus(id: string) {
    const idx = this.banners.findIndex((b) => b.id === id);
    if (idx !== -1) {
      this.banners[idx].isActive = !this.banners[idx].isActive;
      this.notify();
    }
  }

  public updateBanner(id: string, updates: Partial<BannerAd>) {
    const idx = this.banners.findIndex((b) => b.id === id);
    if (idx !== -1) {
      this.banners[idx] = { ...this.banners[idx], ...updates };
      this.notify();
    }
  }

  public deleteBanner(id: string) {
    this.banners = this.banners.filter((b) => b.id !== id);
    this.notify();
  }

  // Transactions & Revenue
  public getTransactions(): SubscriptionTransaction[] {
    return this.transactions;
  }

  public addTransaction(tx: Omit<SubscriptionTransaction, 'id'>) {
    const newTx: SubscriptionTransaction = {
      ...tx,
      id: 'tx_' + Date.now(),
    };
    this.transactions.unshift(newTx);
  }

  public getTotalRevenue(): number {
    return this.transactions.reduce((sum, t) => sum + t.amount, 0);
  }

  // QR Code & Referral Analytics
  public generatePropertyQR(propertyId: string, ownerRefId: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mythikana.vercel.app';
    const trackingUrl = `${origin}/?p=${propertyId}&ref=${encodeURIComponent(ownerRefId)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(trackingUrl)}`;
    return { trackingUrl, qrImageUrl };
  }

  public trackVisit(propertyId: string, refId: string, source: 'qr_referral' | 'direct' | 'search' = 'qr_referral') {
    if (!propertyId || !refId) return;
    const newVisit: PropertyVisit = {
      id: 'visit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      propertyId,
      refId,
      timestamp: new Date().toISOString(),
      source,
    };
    this.visits.unshift(newVisit);
    this.persist();
    try {
      if (db) {
        setDoc(doc(db, 'visits', newVisit.id), newVisit).catch((err) => console.warn('Firestore visit error:', err));
      }
    } catch (err) {
      console.warn('Firestore visit sync error:', err);
    }
    this.notify();
  }

  public trackLead(propertyId: string, refId: string, customerName?: string, source: 'qr_referral' | 'direct' | 'whatsapp' = 'qr_referral') {
    if (!propertyId) return;
    const safeRef = refId || 'direct';
    const newLead: PropertyLead = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      propertyId,
      refId: safeRef,
      customerName: customerName || 'Guest Customer',
      timestamp: new Date().toISOString(),
      source,
    };
    this.leads.unshift(newLead);
    this.persist();
    try {
      if (db) {
        setDoc(doc(db, 'leads', newLead.id), newLead).catch((err) => console.warn('Firestore lead error:', err));
      }
    } catch (err) {
      console.warn('Firestore lead sync error:', err);
    }

    this.notify();
  }

  public getVisitsForProperty(propertyId: string): PropertyVisit[] {
    return this.visits.filter((v) => v.propertyId === propertyId);
  }

  public getVisitsForRefId(refId: string): PropertyVisit[] {
    return this.visits.filter((v) => v.refId === refId);
  }

  public getLeadsForProperty(propertyId: string): PropertyLead[] {
    return this.leads.filter((l) => l.propertyId === propertyId);
  }

  public getLeadsForRefId(refId: string): PropertyLead[] {
    return this.leads.filter((l) => l.refId === refId);
  }

  public getAllVisits(): PropertyVisit[] {
    return this.visits;
  }

  public getAllLeads(): PropertyLead[] {
    return this.leads;
  }
}

export const store = new DataStore();
