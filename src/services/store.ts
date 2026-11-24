import { Property, RoomType, BannerAd, User, UserRole, BookingEnquiry, SubscriptionTransaction, PropertyType, PropertyVisit, PropertyLead } from '../types';
import { INITIAL_USERS, INITIAL_PROPERTIES, INITIAL_ROOMS, INITIAL_BANNERS, INITIAL_TRANSACTIONS } from '../data/initialData';
import { db, auth, isFirebaseConfigured, firebaseConfigError } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDoc, getDocs, runTransaction, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { isSubscriptionAccessActive } from '../utils/subscriptionAccess';

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

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

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
      doc(db, 'public_profiles', user.id),
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

function makePropertyDuplicateKey(value: { title?: string; address?: string; city?: string; state?: string }): string {
  const parts = [value.title, value.address, value.city, value.state].map((part) =>
    String(part || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  );
  return sha256(encodeURIComponent(parts.join('|')));
}

const normalizeProperty = (p: any): Property => ({
  ...p,
  id: String(p?.id || ''),
  title: String(p?.title || 'Untitled property'),
  description: String(p?.description || ''),
  propertyType: p?.propertyType || 'Homestay',
  address: String(p?.address || ''),
  city: String(p?.city || ''),
  state: String(p?.state || ''),
  latitude: typeof p?.latitude === 'number' && Number.isFinite(p.latitude) ? p.latitude : null,
  longitude: typeof p?.longitude === 'number' && Number.isFinite(p.longitude) ? p.longitude : null,
  ownerName: String(p?.ownerName || 'Property Owner'),
  ownerPhone: String(p?.ownerPhone || ''),
  ownerWhatsApp: String(p?.ownerWhatsApp || p?.ownerPhone || ''),
  photos: Array.isArray(p?.photos) ? p.photos.filter((photo: unknown): photo is string => typeof photo === 'string' && photo.trim().length > 0) : (typeof p?.coverImage === 'string' && p.coverImage ? [p.coverImage] : []),
  rating: typeof p?.rating === 'number' && Number.isFinite(p.rating) && p.rating > 0 && p.rating <= 5 ? p.rating : 0,
  reviewsCount: typeof p?.reviewsCount === 'number' && Number.isFinite(p.reviewsCount) ? p.reviewsCount : 0,
});

const normalizeRoom = (room: any): RoomType | null => {
  if (!room || typeof room !== 'object' || !room.id || !room.propertyId) return null;
  const basePrice = Number(room.pricePerNight);
  const discountPrice = Number(room.discountPrice);
  const validBasePrice = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 0;
  const validDiscountPrice = Number.isFinite(discountPrice) && discountPrice > 0 && validBasePrice > 0 && discountPrice < validBasePrice ? discountPrice : undefined;
  const guestCapacity = Number(room.maxGuests);
  return {
    ...room,
    id: String(room.id),
    propertyId: String(room.propertyId),
    roomName: String(room.roomName || 'Room'),
    pricePerNight: validBasePrice,
    discountPrice: validDiscountPrice,
    maxGuests: Number.isFinite(guestCapacity) && guestCapacity > 0 ? guestCapacity : 0,
    description: String(room.description || ''),
    amenities: Array.isArray(room.amenities) ? room.amenities.filter((item: unknown): item is string => typeof item === 'string') : [],
    photos: Array.isArray(room.photos) ? room.photos.filter((photo: unknown): photo is string => typeof photo === 'string') : [],
    roomSize: String(room.roomSize || ''),
    bedType: String(room.bedType || ''),
  } as RoomType;
};

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
    const useLocalDemoData = !(isFirebaseConfigured && db && auth);
    try {
      // Firebase-backed deployments must start from the server as source of truth.
      // Seed/demo accounts and sample properties are only for standalone local mode.
      const storedUsers = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.USERS) : null;
      const rawUsers: User[] = storedUsers ? JSON.parse(storedUsers) : (useLocalDemoData ? INITIAL_USERS : []);
      this.users = rawUsers.map((u) => {
        const userObj = { ...u };
        if ((userObj as any).password) {
          const salt = userObj.passwordSalt || generateSalt();
          userObj.passwordSalt = salt;
          userObj.passwordHash = hashPasswordWithSalt((userObj as any).password, salt);
          delete (userObj as any).password;
        } else if (!userObj.passwordHash) {
          // Seed/demo accounts historically receive the default password 123456.
          // Do not spend 10,000 synchronous SHA-256 rounds for every account at startup.
          // Verify and generate this legacy demo hash only if that account actually logs in.
          userObj.passwordSalt = userObj.passwordSalt || generateSalt();
          (userObj as any)._needsDefaultPasswordHash = true;
        }
        return userObj;
      });

      const storedProps = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.PROPERTIES) : null;
      const rawProps = storedProps ? JSON.parse(storedProps) : (useLocalDemoData ? INITIAL_PROPERTIES : []);
      this.properties = (Array.isArray(rawProps) ? rawProps : (useLocalDemoData ? INITIAL_PROPERTIES : [])).map(normalizeProperty);

      const storedRooms = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.ROOMS) : null;
      const rawRooms = storedRooms ? JSON.parse(storedRooms) : (useLocalDemoData ? INITIAL_ROOMS : []);
      this.rooms = (Array.isArray(rawRooms) ? rawRooms : (useLocalDemoData ? INITIAL_ROOMS : [])).map(normalizeRoom).filter((room): room is RoomType => Boolean(room));

      const storedBanners = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.BANNERS) : null;
      this.banners = storedBanners ? JSON.parse(storedBanners) : (useLocalDemoData ? INITIAL_BANNERS : []);

      const storedEnquiries = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.ENQUIRIES) : null;
      this.enquiries = storedEnquiries ? JSON.parse(storedEnquiries) : [];

      const storedTx = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) : null;
      this.transactions = storedTx ? JSON.parse(storedTx) : (useLocalDemoData ? INITIAL_TRANSACTIONS : []);

      const storedVisits = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.VISITS) : null;
      this.visits = storedVisits ? JSON.parse(storedVisits) : [];

      const storedLeads = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.LEADS) : null;
      this.leads = storedLeads ? JSON.parse(storedLeads) : [];

      const storedUserId = useLocalDemoData ? localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID) : null;
      this.currentUserId = useLocalDemoData ? (storedUserId || 'customer_1') : '';

      const storedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      this.isDarkMode = storedTheme === 'dark';

      const storedFrame = localStorage.getItem(STORAGE_KEYS.MOBILE_FRAME);
      this.isMobileFrame = storedFrame === 'true';

      this.persist();
    } catch (e) {
      console.error('Error loading store data:', e);
      this.users = useLocalDemoData ? INITIAL_USERS : [];
      this.properties = useLocalDemoData ? INITIAL_PROPERTIES : [];
      this.rooms = useLocalDemoData ? INITIAL_ROOMS : [];
      this.banners = useLocalDemoData ? INITIAL_BANNERS : [];
      this.transactions = useLocalDemoData ? INITIAL_TRANSACTIONS : [];
      this.enquiries = [];
      this.visits = [];
      this.leads = [];
      this.currentUserId = useLocalDemoData ? 'customer_1' : '';
    }
  }

  private initFirebaseListeners() {
    if (!isFirebaseConfigured || !db || !auth) {
      console.info('Running in local/standalone mode (Firebase is not configured).');
      return;
    }

    let privateUnsubscribers: Array<() => void> = [];
    let dataUnsubscribers: Array<() => void> = [];
    let propertyUnsubscribers: Array<() => void> = [];
    const roomUnsubscribers = new Map<string, () => void>();
    const remoteRooms = new Map<string, RoomType>();
    const clearDataListeners = () => {
      dataUnsubscribers.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
      });
      dataUnsubscribers = [];
    };
    const clearPropertyListeners = () => {
      propertyUnsubscribers.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
      });
      propertyUnsubscribers = [];
    };
    const clearPrivateListeners = () => {
      clearDataListeners();
      clearPropertyListeners();
      privateUnsubscribers.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
      });
      privateUnsubscribers = [];
    };

    const clearRoomListeners = () => {
      roomUnsubscribers.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
      });
      roomUnsubscribers.clear();
      remoteRooms.clear();
    };

    const syncRoomListeners = (visibleProperties: Property[]) => {
      const propertyIds = new Set(visibleProperties.map((property) => property.id).filter(Boolean));
      for (const [propertyId, unsubscribe] of roomUnsubscribers.entries()) {
        if (!propertyIds.has(propertyId)) {
          try { unsubscribe(); } catch {}
          roomUnsubscribers.delete(propertyId);
          Array.from(remoteRooms.values()).filter((room) => room.propertyId === propertyId).forEach((room) => remoteRooms.delete(room.id));
        }
      }
      propertyIds.forEach((propertyId) => {
        if (roomUnsubscribers.has(propertyId)) return;
        const unsubscribe = onSnapshot(
          query(collection(db, 'rooms'), where('propertyId', '==', propertyId)),
          (snapshot) => {
            Array.from(remoteRooms.values()).filter((room) => room.propertyId === propertyId).forEach((room) => remoteRooms.delete(room.id));
            snapshot.forEach((docSnap) => {
              const normalizedRoom = normalizeRoom({ id: docSnap.id, ...docSnap.data() });
              if (normalizedRoom) remoteRooms.set(docSnap.id, normalizedRoom);
            });
            const allowedLocalRooms = this.rooms.filter((room) => propertyIds.has(room.propertyId));
            const merged = new Map<string, RoomType>();
            allowedLocalRooms.forEach((room) => merged.set(room.id, room));
            remoteRooms.forEach((room) => merged.set(room.id, room));
            this.rooms = Array.from(merged.values());
            this.persist();
            this.notify(false);
          },
          (err) => console.warn(`Firestore rooms sync notice for property ${propertyId}:`, err?.message || err)
        );
        roomUnsubscribers.set(propertyId, unsubscribe);
      });
      const allowedLocalRooms = this.rooms.filter((room) => propertyIds.has(room.propertyId));
      const merged = new Map<string, RoomType>();
      allowedLocalRooms.forEach((room) => merged.set(room.id, room));
      remoteRooms.forEach((room) => merged.set(room.id, room));
      this.rooms = Array.from(merged.values());
      this.persist();
    };

    try {
      // Room listeners are scoped to individually visible properties. Firestore
      // rules can then verify the parent property's active status or ownership.
      onAuthStateChanged(auth, async (fbUser) => {
        clearPrivateListeners();
        clearRoomListeners();
        let activeProperties: Property[] = [];
        let ownedProperties: Property[] = [];
        let allAdminProperties: Property[] | null = null;
        const publishPropertySources = () => {
          const combined = new Map<string, Property>();
          (allAdminProperties || [...activeProperties, ...ownedProperties]).forEach((p) => combined.set(p.id, p));
          this.properties = Array.from(combined.values());
          syncRoomListeners(this.properties);
          this.isFirebaseSynced = true;
          this.firestoreError = null;
          this.persist();
          this.notify(false);
        };
        const activePropertiesUnsub = onSnapshot(
          query(collection(db, 'properties'), where('status', '==', 'active')),
          (snapshot) => {
            activeProperties = snapshot.docs.map((item) => normalizeProperty({ id: item.id, ...item.data() }));
            publishPropertySources();
          },
          (err) => {
            this.firestoreError = err?.message || String(err);
            console.warn('Firestore public properties query notice:', this.firestoreError);
            this.notify(false);
          }
        );
        propertyUnsubscribers.push(activePropertiesUnsub);

        if (!fbUser) {
          this.currentUserId = '';
          this.enquiries = [];
          this.visits = [];
          this.leads = [];
          ownedProperties = [];
          publishPropertySources();
          this.notify(false);
          return;
        }

        const ownedPropertiesUnsub = onSnapshot(
          query(collection(db, 'properties'), where('ownerUid', '==', fbUser.uid)),
          (snapshot) => {
            ownedProperties = snapshot.docs.map((item) => normalizeProperty({ id: item.id, ...item.data() }));
            publishPropertySources();
          },
          (err) => console.warn('Firestore owner properties query notice:', err?.message || err)
        );
        propertyUnsubscribers.push(ownedPropertiesUnsub);

        const localUser = this.users.find((u) =>
          u.id === fbUser.uid ||
          u.id === `google_${fbUser.uid}` ||
          u.googleUid === fbUser.uid ||
          (!!fbUser.email && u.email?.toLowerCase() === fbUser.email.toLowerCase())
        );

        if (localUser) {
          // Firebase UID is the canonical user/document ID from this point onward.
          localUser.id = fbUser.uid;
          localUser.googleUid = fbUser.uid;
          this.currentUserId = fbUser.uid;
          // Migrate a legacy local profile only when no canonical UID document exists.
          // Never overwrite an existing server-side role from stale browser storage.
          try {
            const canonicalProfile = await getDoc(doc(db, 'users', fbUser.uid));
            if (!canonicalProfile.exists()) {
              await setDoc(doc(db, 'users', fbUser.uid), sanitizeUserForFirestore(localUser));
              syncPublicProfile(localUser);
            }
          } catch (err) {
            console.warn('User profile migration notice:', err);
          }
        }

        // Start the platform-owner property listener independently of the owner's
        // Firestore profile document. Admin review must still load if that profile
        // document is missing or delayed.
        if (fbUser.emailVerified && (fbUser.email || '').trim().toLowerCase() === 'anupamsarma997@gmail.com') {
          try {
            const tokenResult = await fbUser.getIdTokenResult(true);
            const verifiedPlatformOwner =
              tokenResult.signInProvider === 'google.com' &&
              tokenResult.claims.email === 'anupamsarma997@gmail.com' &&
              tokenResult.claims.email_verified === true;
            if (verifiedPlatformOwner) {
              const allPropertiesUnsub = onSnapshot(
                collection(db, 'properties'),
                (snapshot) => {
                  allAdminProperties = snapshot.docs.map((item) => normalizeProperty({ id: item.id, ...item.data() }));
                  publishPropertySources();
                },
                (err) => {
                  this.firestoreError = err?.message || String(err);
                  console.warn('Firestore admin properties sync notice:', this.firestoreError);
                  this.notify(false);
                }
              );
              propertyUnsubscribers.push(allPropertiesUnsub);
            }
          } catch (tokenError) {
            console.warn('Admin property sync identity verification failed:', tokenError);
          }
        }

        const userUnsub = onSnapshot(doc(db, 'users', fbUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            const uData = { id: docSnap.id, ...docSnap.data() } as User;
            const idx = this.users.findIndex((u) => u.id === fbUser.uid || u.googleUid === fbUser.uid);
            if (idx >= 0) this.users[idx] = { ...this.users[idx], ...uData, id: fbUser.uid };
            else this.users.push(uData);
            this.currentUserId = fbUser.uid;
            this.persist();
            this.notify(false);

            // Private collections and user accounts are synced only after the
            // authenticated profile exists. Admin property review is bootstrapped
            // above so it does not depend on this profile snapshot.
            clearDataListeners();
            let admin = false;
            try {
              const tokenResult = await fbUser.getIdTokenResult(true);
              admin =
                fbUser.emailVerified &&
                (fbUser.email || '').trim().toLowerCase() === 'anupamsarma997@gmail.com' &&
                tokenResult.signInProvider === 'google.com' &&
                tokenResult.claims.email === 'anupamsarma997@gmail.com' &&
                tokenResult.claims.email_verified === true;
            } catch (tokenError) {
              console.warn('Admin identity verification failed:', tokenError);
            }
            const privateCollections = [
              { name: 'enquiries', apply: (items: BookingEnquiry[]) => { this.enquiries = items; } },
              { name: 'visits', apply: (items: PropertyVisit[]) => { this.visits = items; } },
              { name: 'leads', apply: (items: PropertyLead[]) => { this.leads = items; } },
            ];
            privateCollections.forEach(({ name, apply }) => {
              const source = admin
                ? collection(db, name)
                : query(collection(db, name), where('ownerUid', '==', fbUser.uid));
              const unsubscribe = onSnapshot(source, (snapshot) => {
                const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
                apply(items as any);
                this.persist();
                this.notify(false);
              }, (err) => console.warn(`Firestore ${name} private query notice:`, err?.message || err));
              dataUnsubscribers.push(unsubscribe);
            });

            if (admin) {
              const usersUnsub = onSnapshot(collection(db, 'users'), (snapshot) => {
                const remoteUsers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as User));
                const byId = new Map<string, User>();
                this.users.forEach((user) => byId.set(user.id, user));
                remoteUsers.forEach((user) => byId.set(user.id, user));
                this.users = Array.from(byId.values());
                this.persist();
                this.notify(false);
              }, (err) => console.warn('Admin users sync notice:', err?.message || err));
              dataUnsubscribers.push(usersUnsub);
            }
          }
        }, (err) => console.warn('Own user profile sync notice:', err?.message || err));
        privateUnsubscribers.push(userUnsub);


      });
    } catch (err: any) {
      console.error('Firebase listeners setup error:', err);
      this.firestoreError = err?.message || String(err);
    }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
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

  public async loginOrRegisterWithGoogle(googleData: {
    email: string;
    displayName?: string | null;
    photoURL?: string | null;
    uid?: string;
    desiredRole?: UserRole;
  }): Promise<User> {
    if (!googleData.uid || !db) {
      throw new Error('A valid Firebase account and database connection are required.');
    }

    const uid = googleData.uid;
    const profileRef = doc(db, 'users', uid);
    const profileSnapshot = await getDoc(profileRef);

    if (profileSnapshot.exists()) {
      const remote = { id: uid, ...profileSnapshot.data() } as User;
      const existingIndex = this.users.findIndex((u) =>
        u.id === uid || u.googleUid === uid ||
        u.email?.toLowerCase() === googleData.email.toLowerCase()
      );
      const merged: User = {
        ...(existingIndex >= 0 ? this.users[existingIndex] : {} as User),
        ...remote,
        id: uid,
        googleUid: uid,
        email: remote.email || googleData.email,
        googleEmail: remote.googleEmail || googleData.email,
        name: remote.name || googleData.displayName || googleData.email.split('@')[0],
        avatar: googleData.photoURL || remote.avatar,
      };
      if (existingIndex >= 0) this.users[existingIndex] = merged;
      else this.users.push(merged);
      this.currentUserId = uid;
      syncPublicProfile(merged);
      this.notify();
      return merged;
    }

    const existing = this.users.find((u) =>
      u.googleUid === uid ||
      u.id === `google_${uid}` ||
      u.email?.toLowerCase() === googleData.email.toLowerCase() ||
      u.googleEmail?.toLowerCase() === googleData.email.toLowerCase()
    );

    const requestedRole = googleData.desiredRole || 'owner';
    const safeRole: UserRole = requestedRole === 'admin' ? 'owner' : requestedRole;
    const newUser: User = existing
      ? {
          ...existing,
          id: uid,
          googleUid: uid,
          email: googleData.email,
          googleEmail: googleData.email,
          name: existing.name || googleData.displayName || googleData.email.split('@')[0],
          avatar: googleData.photoURL || existing.avatar,
        }
      : {
          id: uid,
          name: googleData.displayName || googleData.email.split('@')[0],
          username: googleData.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user',
          email: googleData.email,
          googleEmail: googleData.email,
          googleUid: uid,
          avatar: googleData.photoURL || undefined,
          phone: '',
          whatsapp: '',
          role: safeRole,
          status: 'active',
          createdAt: new Date().toISOString(),
        };

    await setDoc(profileRef, sanitizeUserForFirestore(newUser));
    const existingIndex = this.users.findIndex((u) => u.id === existing?.id || u.googleUid === uid);
    if (existingIndex >= 0) this.users[existingIndex] = newUser;
    else this.users.push(newUser);
    this.currentUserId = uid;
    syncPublicProfile(newUser);
    this.notify();
    return newUser;
  }

  public findUserByGoogleUid(uid: string): User | undefined {
    if (!uid) return undefined;
    return this.users.find(
      (u) => u.googleUid === uid || u.id === `google_${uid}`
    );
  }

  public async loadFirebaseUserProfile(uid: string): Promise<User | undefined> {
    if (!db || !uid) return undefined;
    const profileSnapshot = await getDoc(doc(db, 'users', uid));
    if (profileSnapshot.exists()) {
      const remote = { id: uid, ...profileSnapshot.data() } as User;
      const index = this.users.findIndex((u) => u.id === uid || u.googleUid === uid);
      if (index >= 0) this.users[index] = { ...this.users[index], ...remote, id: uid };
      else this.users.push(remote);
      this.currentUserId = uid;
      this.notify();
      return remote;
    }

    const legacy = this.users.find((u) =>
      u.googleUid === uid || u.id === `google_${uid}` ||
      u.email?.toLowerCase() === auth?.currentUser?.email?.toLowerCase()
    );
    if (legacy && legacy.role !== 'admin') {
      legacy.id = uid;
      legacy.googleUid = uid;
      await setDoc(doc(db, 'users', uid), sanitizeUserForFirestore(legacy));
      syncPublicProfile(legacy);
      this.currentUserId = uid;
      this.notify();
      return legacy;
    }
    return undefined;
  }

  public getCurrentUser(): User | undefined {
    return this.users.find((u) => u.id === this.currentUserId);
  }

  public getUsers(): User[] {
    // Strip plaintext & hashed password fields from returned users list for security
    return this.users.map(({ password, passwordHash, ...u }) => u as User);
  }

  public setCurrentUserId(id: string) {
    this.currentUserId = id;
    this.notify();
  }

  public async registerUser(user: Omit<User, 'id' | 'createdAt' | 'status'> & { username?: string; password?: string; googleEmail?: string; googleUid?: string }): Promise<User> {
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

    if (!user.googleUid || !db) throw new Error('Firebase UID and Firestore are required to register securely.');
    await setDoc(doc(db, 'users', user.googleUid), sanitizeUserForFirestore(newUser));
    this.users.push(newUser);
    this.currentUserId = newUser.id;
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
    if ((found as any)._needsDefaultPasswordHash) {
      // Preserve the existing demo-account password without blocking every visitor on page load.
      if (passwordInput === '123456') {
        found.passwordHash = hashPasswordWithSalt(passwordInput, found.passwordSalt || generateSalt());
        (found as any)._needsDefaultPasswordHash = false;
        isValidPassword = true;
      }
    } else if (found.passwordSalt && found.passwordHash) {
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

  private async canManageUserAccounts(): Promise<boolean> {
    const fbUser = auth?.currentUser;
    if (!fbUser || !fbUser.emailVerified || fbUser.email?.trim().toLowerCase() !== 'anupamsarma997@gmail.com') return false;
    try {
      const token = await fbUser.getIdTokenResult(true);
      return token.claims.email === 'anupamsarma997@gmail.com' &&
        token.claims.email_verified === true &&
        token.signInProvider === 'google.com';
    } catch (error) {
      console.warn('Admin identity verification failed for user status change:', error);
      return false;
    }
  }

  public async updateUserStatus(userId: string, status: User['status']): Promise<{ success: boolean; message: string }> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User account not found.' };
    if (!await this.canManageUserAccounts()) return { success: false, message: 'Permission denied: verified platform-owner Google account required.' };
    if (!db) return { success: false, message: 'Secure database is unavailable. User status was not changed.' };

    try {
      await setDoc(doc(db, 'users', userId), { status }, { merge: true });
      user.status = status;
      this.notify();
      return { success: true, message: `User status changed to ${status}.` };
    } catch (error: any) {
      this.firestoreError = error?.message || String(error);
      return { success: false, message: 'Database rejected the user status change. No local change was made.' };
    }
  }

  public async toggleUserStatus(userId: string): Promise<{ success: boolean; message: string }> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User account not found.' };
    return this.updateUserStatus(userId, user.status === 'active' ? 'blocked' : 'active');
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
    // Local storage can contain stale moderation states from an older session.
    // Apply the same visibility boundary in the UI as Firestore enforces remotely.
    if (!isFirebaseConfigured) return this.properties;
    const fbUser = auth?.currentUser;
    if (!fbUser) return this.properties.filter((property) => property.status === 'active' && isSubscriptionAccessActive(property));
    const verifiedPlatformOwner =
      fbUser.emailVerified &&
      (fbUser.email || '').toLowerCase() === 'anupamsarma997@gmail.com';
    const currentUser = this.getCurrentUser();
    if (verifiedPlatformOwner || currentUser?.role === 'admin') return this.properties;
    return this.properties.filter((property) =>
      (property.status === 'active' && isSubscriptionAccessActive(property)) || property.ownerUid === fbUser.uid
    );
  }

  public getRooms(): RoomType[] {
    return Array.isArray(this.rooms) ? this.rooms : [];
  }

  public getPropertyById(id: string): Property | undefined {
    return this.getProperties().find((p) => p.id === id);
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

    if (!currentUser && !firebaseUid) {
      throw new Error('Authentication required: Please sign in with Google or Email to list a new property.');
    }

    const now = new Date();
    // Payment is not integrated yet; new listings remain pending and unbilled.
    if (!firebaseUid) throw new Error('A valid Firebase login is required to create a property.');
    const ownerUid = firebaseUid;
    const ownerEmail = firebaseEmail || currentUser?.googleEmail || currentUser?.email || prop.ownerEmail || '';
    const ownerId = firebaseUid;

    // Build a complete Firestore-safe document. Optional form fields can be
    // undefined on mobile; JSON serialization would drop those keys and cause
    // the secure Firestore create rule (keys().hasAll) to reject the listing.
    const ownerName = String(prop.ownerName || currentUser?.name || auth?.currentUser?.displayName || firebaseEmail?.split('@')[0] || 'Host');
    const duplicateKey = makePropertyDuplicateKey({ title: prop.title, address: prop.address, city: prop.city, state: prop.state });
    if (!String(prop.title || '').trim() || !String(prop.address || '').trim() || !String(prop.city || '').trim() || !String(prop.state || '').trim()) {
      throw new Error('Property name, full address, city and state are required for duplicate-listing protection.');
    }
    const newProp: Property = {
      ...prop,
      title: String(prop.title || '').trim(),
      description: String(prop.description || ''),
      propertyType: prop.propertyType || 'Hotel',
      address: String(prop.address || ''),
      city: String(prop.city || ''),
      state: String(prop.state || ''),
      latitude: Number.isFinite(prop.latitude) ? prop.latitude : null,
      longitude: Number.isFinite(prop.longitude) ? prop.longitude : null,
      photos: Array.isArray(prop.photos) ? prop.photos : [],
      checkInTime: String(prop.checkInTime || ''),
      checkOutTime: String(prop.checkOutTime || ''),
      ownerId,
      ownerUid,
      ownerEmail,
      ownerName,
      duplicateKeys: [duplicateKey],
      ownerPhone: String(prop.ownerPhone || ''),
      ownerWhatsApp: String(prop.ownerWhatsApp || ''),
      id: 'prop_' + Date.now(),
      rating: 0,
      reviewsCount: 0,
      isVerified: false,
      isFeatured: false,
      // Every new listing stays private until the verified platform owner approves it.
      status: 'pending',
      subscriptionPlan: 'none',
      subscriptionPrice: 0,
      subscriptionExpiresAt: '',
      subscriptionExpiryDate: '',
      createdAt: now.toISOString(),
    };

    // Never report success from local-only storage: a real Firestore write is required.
    if (!db) {
      throw new Error('Secure database is not configured. Property was not saved.');
    }
    try {
      // Check only this account's listings. A collection-wide read is not
      // permitted by the privacy rules and is unnecessary because the atomic
      // owner-limit and duplicate-key documents enforce both constraints.
      // Each owner may list multiple distinct properties. The global fingerprint lock
      // still prevents duplicate property submissions across all accounts.
      const duplicateRef = doc(db, 'property_duplicate_keys', duplicateKey);
      const propertyRef = doc(db, 'properties', newProp.id);
      await runTransaction(db, async (transaction) => {
        const duplicateSnapshot = await transaction.get(duplicateRef);
        if (duplicateSnapshot.exists()) {
          throw new Error('DUPLICATE_PROPERTY: This property already appears on THIKANA. Duplicate listings are not allowed.');
        }
        transaction.set(duplicateRef, { ownerUid, propertyId: newProp.id, createdAt: now.toISOString() });
        transaction.set(propertyRef, sanitizeForFirestore(newProp));
      });
    } catch (err: any) {
      this.firestoreError = err?.message || String(err);
      if (err?.message?.startsWith('DUPLICATE_PROPERTY:')) {
        throw new Error(err.message);
      }
      const code = err?.code || 'unknown';
      const detail = err?.message || String(err);
      // Preserve Firebase's structured error code so the UI can display the
      // real permission-denied/network error instead of replacing it with "unknown".
      const wrappedError = new Error(`Firestore save failed [${code}]: ${detail}`);
      (wrappedError as Error & { code?: string; cause?: unknown }).code = code;
      (wrappedError as Error & { cause?: unknown }).cause = err;
      throw wrappedError;
    }

    const existingIdx = this.properties.findIndex((p) => p.id === newProp.id);
    if (existingIdx === -1) {
      this.properties.push(newProp);
    } else {
      this.properties[existingIdx] = newProp;
    }

    // No transaction is recorded until a real payment provider confirms payment.



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

    const isVerifiedPlatformOwner = Boolean(
      auth?.currentUser?.emailVerified &&
      auth.currentUser.email?.trim().toLowerCase() === 'anupamsarma997@gmail.com'
    );
    const isOwner =
      isVerifiedPlatformOwner ||
      currentUser?.role === 'admin' ||
      (!!firebaseUid && prop.ownerUid === firebaseUid) ||
      this.isOwnerOfProperty(currentUser?.id, id);

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
        await setDoc(doc(db, 'properties', id), sanitizeForFirestore(updatedProp), { merge: true });
      } catch (err: any) {
        this.firestoreError = err?.message || String(err);
        return { success: false, status: 403, message: 'Property update was rejected by the secure database. No local success was recorded.' };
      }
    }

    this.properties[idx] = updatedProp;
    this.persist();
    this.notify();
    return { success: true, message: 'Property updated successfully.' };
  }

  public async setPropertyStatus(
    id: string,
    status: Property['status']
  ): Promise<{ success: boolean; message: string }> {
    const fbUser = auth?.currentUser;
    const isVerifiedPlatformOwner = Boolean(
      fbUser?.emailVerified &&
      fbUser.email?.trim().toLowerCase() === 'anupamsarma997@gmail.com'
    );
    if (!isVerifiedPlatformOwner) {
      return { success: false, message: 'Permission denied: verified platform-owner account required.' };
    }

    const prop = this.getPropertyById(id);
    if (!prop) return { success: false, message: 'Property not found.' };
    if (prop.status === 'hidden_expired' && status === 'active') {
      return { success: false, message: 'This listing can be reactivated only after the monthly subscription payment is verified and approved.' };
    }
    if (!db) return { success: false, message: 'Secure database is unavailable. No change was made.' };

    try {
      const update: Partial<Property> = { status };
      if (status === 'active' && (!prop.subscriptionTrialEndsAtTimestamp || !prop.subscriptionExpiresAtTimestamp)) {
        const now = new Date();
        const parsedStart = prop.subscriptionTrialStartedAt
          ? new Date(prop.subscriptionTrialStartedAt)
          : null;
        const parsedEnd = prop.subscriptionTrialEndsAt
          ? new Date(prop.subscriptionTrialEndsAt)
          : prop.subscriptionTrialEndsAtTimestamp?.toDate?.() || null;
        const validStart = parsedStart && Number.isFinite(parsedStart.getTime()) ? parsedStart : null;
        const validEnd = parsedEnd && Number.isFinite(parsedEnd.getTime()) ? parsedEnd : null;

        // Backfill the timestamp for legacy records without extending a valid
        // end date. A start-only record receives its six-calendar-month end;
        // a record with no dates starts its trial at this approval time.
        const trialStart = validStart
          ? validStart
          : validEnd
            ? addCalendarMonths(validEnd, -6)
            : now;
        const trialEnd = validStart
          ? addCalendarMonths(validStart, 6)
          : validEnd
            ? validEnd
            : addCalendarMonths(now, 6);

        update.subscriptionTrialStartedAt = trialStart.toISOString();
        update.subscriptionTrialEndsAt = trialEnd.toISOString();
        update.subscriptionTrialEndsAtTimestamp = Timestamp.fromDate(trialEnd);
        update.subscriptionStatus = trialEnd.getTime() > now.getTime() ? 'trial' : 'expired';
        update.subscriptionPlan = prop.subscriptionPlan || 'standard_1000';
        update.subscriptionPrice = typeof prop.subscriptionPrice === 'number' ? prop.subscriptionPrice : 1000;
        update.subscriptionExpiresAt = trialEnd.toISOString();
        update.subscriptionExpiresAtTimestamp = Timestamp.fromDate(trialEnd);
        update.subscriptionExpiryDate = trialEnd.toISOString();
      }
      await setDoc(doc(db, 'properties', id), update, { merge: true });
      Object.assign(prop, update);
      this.notify();
      return { success: true, message: `"${prop.title}" status changed to ${status}.` };
    } catch (err: any) {
      this.firestoreError = err?.message || String(err);
      this.notify();
      return { success: false, message: 'Database rejected this change. The listing was not updated.' };
    }
  }

  public togglePropertyStatus(id: string) {
    const prop = this.getPropertyById(id);
    if (prop) {
      prop.status = prop.status === 'active' ? 'blocked' : 'active';
      if (db) {
        setDoc(doc(db, 'properties', id), { status: prop.status }, { merge: true }).catch((err) => {
          console.error('Firestore togglePropertyStatus error:', err);
          this.firestoreError = err?.message || String(err);
          this.notify();
        });
      }
      this.notify();
    }
  }

  // Legacy badge toggles are intentionally disabled. Only the separate
  // application workflows may activate or renew paid features after admin review.
  public togglePropertyVerified(_id: string, _verified?: boolean): void {
    console.warn('Direct Blue Tick activation is disabled; use verificationApplications.');
  }

  public togglePropertyFeatured(_id: string, _featured?: boolean): void {
    console.warn('Direct Search Boost activation is disabled; use searchBoostApplications.');
  }

  public async deleteProperty(id: string): Promise<{ success: boolean; status?: number; message?: string }> {
    const prop = this.getPropertyById(id);
    if (!prop) {
      return { success: false, status: 404, message: 'Property not found.' };
    }

    const currentUser = this.getCurrentUser();
    const firebaseUid = auth?.currentUser?.uid;

    const isVerifiedPlatformOwner = Boolean(
      auth?.currentUser?.emailVerified &&
      auth.currentUser.email?.trim().toLowerCase() === 'anupamsarma997@gmail.com'
    );
    const isOwner =
      isVerifiedPlatformOwner ||
      currentUser?.role === 'admin' ||
      (!!firebaseUid && prop.ownerUid === firebaseUid) ||
      this.isOwnerOfProperty(currentUser?.id, id);

    if (!isOwner) {
      console.error('403 Forbidden: Unauthorized property deletion blocked for id:', id);
      return { 
        success: false, 
        status: 403, 
        message: '403 Forbidden: Only the property owner can delete this listing.' 
      };
    }

    if (db) {
      try {
        const ownerUid = prop.ownerUid || firebaseUid || '';
        const duplicateKeys = Array.isArray((prop as any).duplicateKeys)
          ? (prop as any).duplicateKeys as string[]
          : [makePropertyDuplicateKey({ title: prop.title, address: prop.address, city: prop.city, state: prop.state })];
        await runTransaction(db, async (transaction) => {
          transaction.delete(doc(db, 'properties', id));
          if (ownerUid) transaction.delete(doc(db, 'owner_listing_limits', ownerUid));
          duplicateKeys.forEach((key) => transaction.delete(doc(db, 'property_duplicate_keys', key)));
        });
        const deletedRooms = this.rooms.filter((r) => r.propertyId === id);
        for (const r of deletedRooms) {
          await deleteDoc(doc(db, 'rooms', r.id)).catch(() => {});
        }
      } catch (err: any) {
        console.warn('Firestore deleteProperty sync notice:', err);
        return { success: false, status: 403, message: 'Property deletion was rejected by the secure database. No local success was recorded.' };
      }
    }

    // Only begin best-effort photo cleanup after the Firestore transaction succeeds.
    // A failed database delete must never leave an existing listing with missing photos.
    if (prop.photos && Array.isArray(prop.photos) && prop.photos.length > 0) {
      try {
        const { deletePropertyPhoto } = await import('./uploadPropertyImage');
        await Promise.allSettled(prop.photos.map((photoUrl) => deletePropertyPhoto(photoUrl)));
      } catch (err) {
        console.warn('Property photo cleanup could not be completed:', err);
      }
    }

    this.properties = this.properties.filter((p) => p.id !== id);
    this.rooms = this.rooms.filter((r) => r.propertyId !== id);
    this.persist();
    this.notify();
    return { success: true, message: 'Property deleted successfully.' };
  }

  public renewPropertySubscription(propertyId: string, daysToAdd = 30, planName = 'Standard Listing Plan') {
    const prop = this.getPropertyById(propertyId);
    if (!prop) return;

    const price = 1000;
    const now = new Date();
    const currentExpiry = new Date(prop.subscriptionExpiresAt || prop.subscriptionExpiryDate || now.toISOString());
    const startDate = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startDate);
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);

    prop.subscriptionExpiresAt = newExpiry.toISOString();
    prop.subscriptionExpiryDate = newExpiry.toISOString();
    prop.subscriptionStatus = 'active';
    prop.subscriptionPlan = 'standard_1000';
    prop.subscriptionPrice = price;
    prop.status = 'active';

    if (db) {
      setDoc(doc(db, 'properties', propertyId), {
        subscriptionExpiresAt: prop.subscriptionExpiresAt,
        subscriptionExpiryDate: prop.subscriptionExpiryDate,
        subscriptionStatus: prop.subscriptionStatus,
        subscriptionPlan: prop.subscriptionPlan,
        subscriptionPrice: prop.subscriptionPrice,
        status: prop.status
      }, { merge: true }).catch((err) => console.warn('Firestore renew error:', err));
    }

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
  }

  // Room Types
  public getRoomsByProperty(propertyId: string): RoomType[] {
    return this.getRooms().filter((room) => room && room.propertyId === propertyId);
  }

  public addRoom(room: Omit<RoomType, 'id'>): RoomType {
    const prop = this.getPropertyById(room.propertyId);
    const firebaseUid = auth?.currentUser?.uid;
    const ownerId = room.ownerId || prop?.ownerId || (firebaseUid ? `google_${firebaseUid}` : 'owner-demo');
    if (!firebaseUid || !prop || prop.ownerUid !== firebaseUid) {
      throw new Error('Only the authenticated owner of this property can add rooms.');
    }
    const ownerUid = firebaseUid;

    const newRoom: RoomType = {
      ...room,
      ownerId,
      ownerUid,
      id: 'room_' + Date.now(),
    };
    if (db) {
      setDoc(doc(db, 'rooms', newRoom.id), sanitizeForFirestore(newRoom)).catch((err) => {
        this.firestoreError = err?.message || String(err);
        console.error('Firestore addRoom rejected:', err);
        this.notify();
      });
    }
    this.rooms.push(newRoom);
    this.notify();
    return newRoom;
  }

  public addRoomType(room: Omit<RoomType, 'id'>): RoomType {
    return this.addRoom(room);
  }

  public updateRoom(id: string, updates: Partial<RoomType>) {
    const idx = this.rooms.findIndex((r) => r.id === id);
    if (idx !== -1) {
      const room = this.rooms[idx];
      const currentUser = this.getCurrentUser();
      if (currentUser && !this.isOwnerOfProperty(currentUser.id, room.propertyId)) {
        console.warn('Unauthorized room update blocked:', id);
        return;
      }
      this.rooms[idx] = { ...this.rooms[idx], ...updates };
      if (db) {
        setDoc(doc(db, 'rooms', id), this.rooms[idx], { merge: true }).catch((err) => console.warn('Firestore updateRoom error:', err));
      }
      this.notify();
    }
  }

  public deleteRoom(id: string) {
    const room = this.rooms.find((r) => r.id === id);
    if (room) {
      const currentUser = this.getCurrentUser();
      if (currentUser && !this.isOwnerOfProperty(currentUser.id, room.propertyId)) {
        console.warn('Unauthorized room deletion blocked:', id);
        return;
      }
      this.rooms = this.rooms.filter((r) => r.id !== id);
      if (db) {
        deleteDoc(doc(db, 'rooms', id)).catch((err) => console.warn('Firestore deleteRoom error:', err));
      }
      this.notify();
    }
  }

  public deleteRoomType(id: string) {
    this.deleteRoom(id);
  }

  // Booking Enquiries
  public addEnquiry(enquiry: Omit<BookingEnquiry, 'id' | 'createdAt'>): BookingEnquiry {
    const nowIso = new Date().toISOString();
    const relatedProperty = this.getPropertyById(enquiry.propertyId);
    const newEnquiry: BookingEnquiry = {
      ...enquiry,
      ownerUid: relatedProperty?.ownerUid || relatedProperty?.ownerId || '',
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
      id: 'banner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    };
    this.banners.push(newBanner);
    this.notify();
    if (db) {
      setDoc(doc(db, 'banners', newBanner.id), sanitizeForFirestore(newBanner))
        .catch(error => {
          this.banners = this.banners.filter(item => item.id !== newBanner.id);
          this.firestoreError = error?.message || String(error);
          this.notify();
          console.error('Firestore addBanner failed:', error);
        });
    }
    return newBanner;
  }

  public toggleBannerStatus(id: string) {
    const idx = this.banners.findIndex((b) => b.id === id);
    if (idx !== -1) {
      const nextStatus = !this.banners[idx].isActive;
      this.banners[idx].isActive = nextStatus;
      this.notify();
      if (db) setDoc(doc(db, 'banners', id), { isActive: nextStatus }, { merge: true })
        .catch(error => {
          this.firestoreError = error?.message || String(error);
          this.notify();
          console.error('Firestore toggleBannerStatus failed:', error);
        });
    }
  }

  public updateBanner(id: string, updates: Partial<BannerAd>) {
    const idx = this.banners.findIndex((b) => b.id === id);
    if (idx !== -1) {
      this.banners[idx] = { ...this.banners[idx], ...updates };
      this.notify();
      if (db) setDoc(doc(db, 'banners', id), sanitizeForFirestore(updates), { merge: true })
        .catch(error => {
          this.firestoreError = error?.message || String(error);
          this.notify();
          console.error('Firestore updateBanner failed:', error);
        });
    }
  }

  public deleteBanner(id: string) {
    this.banners = this.banners.filter((b) => b.id !== id);
    this.notify();
    if (db) deleteDoc(doc(db, 'banners', id)).catch(error => {
      this.firestoreError = error?.message || String(error);
      this.notify();
      console.error('Firestore deleteBanner failed:', error);
    });
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
      ownerUid: this.getPropertyById(propertyId)?.ownerUid || this.getPropertyById(propertyId)?.ownerId || '',
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
      ownerUid: this.getPropertyById(propertyId)?.ownerUid || this.getPropertyById(propertyId)?.ownerId || '',
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

    // QR/lead milestones no longer activate paid Search Boost automatically.

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