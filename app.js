const firebaseConfig = {
  apiKey: "AIzaSyCDQ3FAg1kLZyUySZtcMKi9kPIp8S0ARZk",
  authDomain: "petpulse-2b281.firebaseapp.com",
  projectId: "petpulse-2b281",
  storageBucket: "petpulse-2b281.firebasestorage.app",
  messagingSenderId: "982076073623",
  appId: "1:982076073623:web:8b90f7a3150a40578e6bd2",
  measurementId: "G-0YPFKX479W"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentPetId = null;
let userPets = [];
let petData = {};
let unsubPet = null;
let activeModalType = null;
let selectedType = 'dog';

// —— Widget system ——
const WIDGET_DEFS = [
  { id: 'hero', label: 'Снимка / заглавие на любимеца', icon: '🐕' },
  { id: 'quick', label: 'Бързи действия (разходка, хранене)', icon: '⚡' },
  { id: 'stats', label: 'Днес – статистики', icon: '📊' },
  { id: 'timeline', label: 'Днес – активност', icon: '📋' },
  { id: 'upcoming', label: 'Предстои (напомняния)', icon: '⏰' },
  { id: 'food', label: 'Храна / чувал', icon: '🥣' },
  { id: 'shared', label: 'Споделено с', icon: '👥' }
];

const DEFAULT_WIDGETS = [
  { id: 'hero', on: true },
  { id: 'quick', on: true },
  { id: 'stats', on: true },
  { id: 'timeline', on: true },
  { id: 'upcoming', on: true },
  { id: 'food', on: true },
  { id: 'shared', on: false }
];

function widgetKey() {
  return 'petpulse_widgets_' + (currentUser?.uid || 'guest');
}

function loadWidgets() {
  try {
    const raw = localStorage.getItem(widgetKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      // merge with defs in case new widgets added
      const ids = new Set(parsed.map(w => w.id));
      DEFAULT_WIDGETS.forEach(d => { if (!ids.has(d.id)) parsed.push({ ...d }); });
      return parsed.filter(w => WIDGET_DEFS.some(d => d.id === w.id));
    }
  } catch (e) {}
  return DEFAULT_WIDGETS.map(w => ({ ...w }));
}

function saveWidgets(list) {
  localStorage.setItem(widgetKey(), JSON.stringify(list));
}

let widgetConfig = DEFAULT_WIDGETS.map(w => ({ ...w }));

(function initDark() {
  const saved = localStorage.getItem('petpulse_dark');
  if (saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();

function hideAllScreens() {
  ['splash','auth-screen','profile-setup-screen','choice-screen','join-screen','newpet-screen','app','customize-screen'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

let setupAvatar = '👤';
let setupPhotoURL = null;

async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    await auth.signInWithPopup(provider);
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return;
    alert('Google вход неуспешен.\n\nВ Firebase Console → Authentication → Sign-in method включи Google и добави domain-а си в Authorized domains.\n\n' + (e.message || e.code));
  }
}

async function signInWithFacebook() {
  try {
    const provider = new firebase.auth.FacebookAuthProvider();
    provider.addScope('email');
    provider.addScope('public_profile');
    await auth.signInWithPopup(provider);
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return;
    alert('Facebook вход неуспешен.\n\nТрябва Firebase → Authentication → Facebook (App ID + App Secret) + Facebook Developer app.\n\n' + (e.message || e.code));
  }
}

function pickSetupAvatar(emoji) {
  setupAvatar = emoji;
  document.querySelectorAll('.setup-av').forEach(b => b.classList.toggle('border-teal-500', b.textContent.trim() === emoji));
  if (!setupPhotoURL) {
    document.getElementById('profile-setup-photo-fallback').textContent = emoji;
  }
}

function showProfileSetup() {
  hideAllScreens();
  document.getElementById('profile-setup-screen').classList.remove('hidden');
  const name = currentUser.displayName || currentUser.email?.split('@')[0] || '';
  document.getElementById('profile-setup-name').value = name;
  setupPhotoURL = currentUser.photoURL || null;
  const img = document.getElementById('profile-setup-photo-img');
  const fallback = document.getElementById('profile-setup-photo-fallback');
  if (setupPhotoURL) {
    img.src = setupPhotoURL;
    img.classList.remove('hidden');
    fallback.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    fallback.classList.remove('hidden');
    fallback.textContent = setupAvatar;
  }
}

function finishProfileSetup() {
  const name = document.getElementById('profile-setup-name').value.trim() || currentUser.email?.split('@')[0] || 'Стопанин';
  window._userProfile = {
    name,
    avatar: setupAvatar,
    photoURL: setupPhotoURL,
    color: '#0d9488'
  };
  localStorage.setItem('petpulse_user_profile_' + currentUser.uid, JSON.stringify(window._userProfile));
  hideAllScreens();
  document.getElementById('choice-screen').classList.remove('hidden');
}

function getUserProfile() {
  if (window._userProfile) return window._userProfile;
  try {
    const raw = localStorage.getItem('petpulse_user_profile_' + currentUser.uid);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Стопанин',
    avatar: '👤',
    photoURL: currentUser.photoURL || null,
    color: '#0d9488'
  };
}

auth.onAuthStateChanged(async (user) => {
  document.getElementById('splash')?.classList.add('hidden');
  if (user) {
    currentUser = user;
    widgetConfig = loadWidgets();
    // Prefill profile from Google/FB
    if (user.photoURL || user.displayName) {
      const existing = localStorage.getItem('petpulse_user_profile_' + user.uid);
      if (!existing) {
        window._userProfile = {
          name: user.displayName || user.email?.split('@')[0] || 'Стопанин',
          avatar: '👤',
          photoURL: user.photoURL || null,
          color: '#0d9488'
        };
        localStorage.setItem('petpulse_user_profile_' + user.uid, JSON.stringify(window._userProfile));
      }
    }
    await checkUserState();
  } else {
    currentUser = null;
    hideAllScreens();
    document.getElementById('auth-screen').classList.remove('hidden');
  }
});

async function handleLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return alert('Попълнете имейл и парола');
  try { await auth.signInWithEmailAndPassword(email, password); }
  catch (e) { alert('Грешка: ' + e.message); }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return alert('Попълнете имейл и парола');
  if (password.length < 6) return alert('Паролата трябва да е поне 6 символа');
  try { await auth.createUserWithEmailAndPassword(email, password); }
  catch (e) { alert('Грешка: ' + e.message); }
}

function logout() {
  if (unsubPet) unsubPet();
  localStorage.removeItem('petpulse_active_pet');
  auth.signOut();
  closeDrawer();
}

async function loadUserPets() {
  const snap = await db.collection('pets').where('members', 'array-contains', currentUser.uid).get();
  userPets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return userPets;
}

async function checkUserState() {
  try {
    await loadUserPets();
    const localId = localStorage.getItem('petpulse_active_pet');
    if (localId && userPets.find(p => p.id === localId)) {
      currentPetId = localId;
      startPetListener();
      return;
    }
    if (userPets.length > 0) {
      currentPetId = userPets[0].id;
      localStorage.setItem('petpulse_active_pet', currentPetId);
      startPetListener();
      return;
    }
    // No pets yet → personal profile first, then choice
    const hasProfile = localStorage.getItem('petpulse_user_profile_' + currentUser.uid);
    if (!hasProfile) {
      showProfileSetup();
    } else {
      hideAllScreens();
      document.getElementById('choice-screen').classList.remove('hidden');
    }
  } catch (e) {
    showProfileSetup();
  }
}

function backToChoice() {
  hideAllScreens();
  document.getElementById('choice-screen').classList.remove('hidden');
}
function showJoinForm() {
  hideAllScreens();
  document.getElementById('join-screen').classList.remove('hidden');
  document.getElementById('join-my-name').value = getUserProfile().name;
}
function showNewPetForm() {
  hideAllScreens();
  document.getElementById('newpet-screen').classList.remove('hidden');
  document.getElementById('np-my-name').value = getUserProfile().name;
  document.getElementById('np-name').value = 'Макс';
  document.getElementById('np-breed').value = 'Джак Ръсел териер';
  document.getElementById('np-weight').value = '7.2';
  const bd = new Date(); bd.setMonth(bd.getMonth() - 8);
  document.getElementById('np-birthdate').value = bd.toISOString().slice(0, 10);
  selectPetType('dog');
}
function selectPetType(type) {
  selectedType = type;
  ['dog','cat','other'].forEach(t => {
    const btn = document.getElementById('type-' + t);
    if (!btn) return;
    const on = t === type;
    btn.classList.toggle('border-teal-500', on);
    btn.classList.toggle('bg-teal-50', on);
    btn.classList.toggle('border-stone-200', !on);
  });
}

async function createPet() {
  const profile = getUserProfile();
  const myName = document.getElementById('np-my-name').value.trim() || profile.name;
  const name = document.getElementById('np-name').value.trim();
  if (!name) return alert('Въведи име');
  const btn = document.getElementById('create-pet-btn');
  btn.disabled = true; btn.textContent = 'Създаване...';
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newPet = {
    name, type: selectedType,
    breed: document.getElementById('np-breed').value.trim(),
    birthdate: document.getElementById('np-birthdate').value,
    weight: parseFloat(document.getElementById('np-weight').value) || null,
    gender: document.getElementById('np-gender').value,
    passport: document.getElementById('np-passport').value.trim(),
    chip: document.getElementById('np-chip').value.trim(),
    foods: [],
    trackFood: true, allergies: '', habits: '',
    hygiene: { bath: '', nails: '', ears: '', teeth: '' },
    weightHistory: [], code,
    members: [currentUser.uid],
    usersMeta: { [currentUser.uid]: { name: myName, avatar: profile.avatar || '👤', photoURL: profile.photoURL || null, color: profile.color || '#0d9488' } },
    walks: [], meals: [], health: []
  };
  try {
    const ref = await db.collection('pets').add(newPet);
    currentPetId = ref.id;
    localStorage.setItem('petpulse_active_pet', currentPetId);
    await loadUserPets();
    startPetListener();
  } catch (e) { alert('Грешка: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Създай профил'; }
}

async function joinWithCode() {
  const code = document.getElementById('invite-code-input').value.trim().toUpperCase();
  const profile = getUserProfile();
  const myName = document.getElementById('join-my-name').value.trim() || profile.name;
  if (!code) return alert('Въведи код');
  try {
    const snap = await db.collection('pets').where('code', '==', code).limit(1).get();
    if (snap.empty) return alert('Невалиден код');
    const petDoc = snap.docs[0];
    const data = petDoc.data();
    const members = data.members || [];
    if (!members.includes(currentUser.uid)) members.push(currentUser.uid);
    const usersMeta = data.usersMeta || {};
    usersMeta[currentUser.uid] = { name: myName, avatar: profile.avatar || '👤', photoURL: profile.photoURL || null, color: profile.color || '#10b981' };
    await petDoc.ref.update({ members, usersMeta });
    currentPetId = petDoc.id;
    localStorage.setItem('petpulse_active_pet', currentPetId);
    await loadUserPets();
    startPetListener();
  } catch (e) { alert('Грешка: ' + e.message); }
}

function switchToPet(petId) {
  if (unsubPet) unsubPet();
  currentPetId = petId;
  localStorage.setItem('petpulse_active_pet', petId);
  startPetListener();
  switchTab('home');
}

function startPetListener() {
  hideAllScreens();
  document.getElementById('app').classList.remove('hidden');
  const darkToggle = document.getElementById('toggle-dark');
  if (darkToggle) darkToggle.checked = document.documentElement.classList.contains('dark');
  if (unsubPet) unsubPet();
  unsubPet = db.collection('pets').doc(currentPetId).onSnapshot(doc => {
    if (doc.exists) { petData = doc.data(); renderApp(); }
  });
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T00:00:00').toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysAgo(str) {
  if (!str) return null;
  const diff = Math.floor((Date.now() - new Date(str + 'T00:00:00')) / 86400000);
  if (diff === 0) return 'днес';
  if (diff === 1) return 'вчера';
  return `преди ${diff} дни`;
}
function calcAge(birthdate) {
  if (!birthdate) return '';
  const b = new Date(birthdate + 'T00:00:00');
  const now = new Date();
  let m = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (m < 12) return m + ' месеца';
  const y = Math.floor(m / 12); const r = m % 12;
  return r ? `${y} г. ${r} мес.` : `${y} години`;
}

// —— Render widgets ——
function renderWidget(id) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const emoji = petData.type === 'cat' ? '🐈' : (petData.type === 'dog' ? '🐕' : '🐾');
  const age = calcAge(petData.birthdate);
  const hyg = petData.hygiene || {};

  if (id === 'hero') {
    const walksToday = (petData.walks || []).filter(w => w.date === todayStr).length;
    const mealsToday = (petData.meals || []).filter(m => m.date === todayStr).length;
    return `<button type="button" onclick="switchTab('pets')" class="w-full text-left bg-white dark:bg-slate-900 rounded-3xl border border-stone-200/80 dark:border-slate-800 overflow-hidden shadow-sm active:scale-[0.99] transition">
      <div class="h-28 bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-600 relative flex items-end p-4">
        <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_70%_30%,white,transparent_50%)]"></div>
        <div class="relative flex items-center gap-3 w-full">
          <div class="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur text-white text-2xl flex items-center justify-center border border-white/30">${emoji}</div>
          <div class="text-white min-w-0 flex-1">
            <div class="font-bold text-lg leading-tight">${petData.name || 'Любимец'}</div>
            <div class="text-xs text-white/80">${petData.breed || ''}${age ? ' · ' + age : ''}${petData.weight ? ' · ' + petData.weight + ' кг' : ''}</div>
          </div>
          <div class="text-white/80 text-xs font-semibold shrink-0">Профил ›</div>
        </div>
      </div>
      <div class="grid grid-cols-3 divide-x divide-stone-100 dark:divide-slate-800">
        <div class="py-3 text-center"><div class="text-base font-extrabold text-emerald-600">${mealsToday}</div><div class="text-[10px] text-slate-400">храна</div></div>
        <div class="py-3 text-center"><div class="text-base font-extrabold text-sky-500">${walksToday}</div><div class="text-[10px] text-slate-400">разходки</div></div>
        <div class="py-3 text-center"><div class="text-base font-extrabold text-amber-500">${(petData.health||[]).filter(h=>h.date===todayStr).length}</div><div class="text-[10px] text-slate-400">здраве</div></div>
      </div>
    </button>`;
  }

  if (id === 'quick') {
    return `<div class="grid grid-cols-2 gap-2.5">
      <button onclick="openModal('meal')" class="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800 shadow-sm active:scale-[0.98] text-left">
        <span class="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xl shrink-0">🥣</span>
        <span><span class="block font-bold text-sm">Хранене</span><span class="block text-[11px] text-slate-400">порция / награда</span></span>
      </button>
      <button onclick="openModal('walk')" class="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800 shadow-sm active:scale-[0.98] text-left">
        <span class="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-xl shrink-0">🚶</span>
        <span><span class="block font-bold text-sm">Разходка</span><span class="block text-[11px] text-slate-400">време · място</span></span>
      </button>
      <button onclick="openModal('health')" class="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800 shadow-sm active:scale-[0.98] text-left">
        <span class="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-xl shrink-0">💊</span>
        <span><span class="block font-bold text-sm">Здраве</span><span class="block text-[11px] text-slate-400">ваксина · хапче</span></span>
      </button>
      <button onclick="openModal('hygiene')" class="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800 shadow-sm active:scale-[0.98] text-left">
        <span class="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-xl shrink-0">🛁</span>
        <span><span class="block font-bold text-sm">Грижи</span><span class="block text-[11px] text-slate-400">къпане · нокти</span></span>
      </button>
    </div>`;
  }

  if (id === 'stats') {
    const walksToday = (petData.walks || []).filter(w => w.date === todayStr).length;
    const mealsToday = (petData.meals || []).filter(m => m.date === todayStr).length;
    let bag = '—';
    const mainFood = (petData.foods || []).find(f => f.active && f.type === 'main' && f.bagKg);
    if (mainFood) {
      let total = 0;
      (petData.meals || []).forEach(m => { if (m.amount && m.foodType !== 'treat') total += Number(m.amount); });
      bag = Math.max(0, (mainFood.bagKg * 1000 - total) / 1000).toFixed(1) + ' кг';
    }
    return `<div class="grid grid-cols-3 gap-2">
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-3 text-center shadow-sm">
        <div class="text-lg font-extrabold text-sky-500">${walksToday}</div>
        <div class="text-[10px] text-slate-400 font-medium">разходки</div>
      </div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-3 text-center shadow-sm">
        <div class="text-lg font-extrabold text-emerald-500">${mealsToday}</div>
        <div class="text-[10px] text-slate-400 font-medium">хранения</div>
      </div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-3 text-center shadow-sm">
        <div class="text-lg font-extrabold text-amber-500">${bag}</div>
        <div class="text-[10px] text-slate-400 font-medium">чувал</div>
      </div>
    </div>`;
  }

  if (id === 'timeline') {
    const typeColor = { walk: '#0ea5e9', meal: '#10b981', health: '#f59e0b' };
    const weatherIcon = { sun: '☀️', cloud: '☁️', rain: '🌧️', snow: '❄️' };
    const list = [
      ...(petData.walks || []).filter(w => w.date === todayStr).map(w => ({
        ...w, type: 'walk',
        label: `Разходка ${w.duration || ''} мин${w.weather ? ' ' + (weatherIcon[w.weather] || '') : ''}${w.place ? ' · ' + w.place : ''}`
      })),
      ...(petData.meals || []).filter(m => m.date === todayStr).map(m => ({
        ...m, type: 'meal',
        label: `${m.foodType === 'treat' ? 'Награда' : 'Хранене'}${m.foodName ? ' · ' + m.foodName : ''}${m.amount ? ' ' + m.amount + ' г' : ''}`
      })),
      ...(petData.health || []).filter(h => h.date === todayStr).map(h => ({ ...h, type: 'health', label: h.title }))
    ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const dateLabel = new Date().toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });
    let body = list.length ? list.map(item => {
      const u = (petData.usersMeta || {})[item.authorUid] || { name: 'Стопанин', avatar: '👤' };
      const border = typeColor[item.type] || '#94a3b8';
      const av = u.photoURL
        ? `<img src="${u.photoURL}" class="w-8 h-8 rounded-full object-cover shrink-0" alt="">`
        : `<div class="w-8 h-8 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-base shrink-0">${u.avatar || '👤'}</div>`;
      const mapLink = item.lat && item.lng
        ? `<a href="https://www.google.com/maps?q=${item.lat},${item.lng}" target="_blank" rel="noopener" class="text-[10px] text-sky-500 font-medium">Карта</a>`
        : '';
      return `<div class="flex items-center gap-3 bg-stone-50 dark:bg-slate-800/50 rounded-xl p-3 border-l-4" style="border-color:${border}">
        ${av}
        <div class="flex-1 min-w-0"><div class="text-sm font-semibold">${item.label}</div>
        <div class="text-[11px] text-slate-400">${item.time || ''} · ${u.name} ${mapLink}</div></div>
        <button onclick="deleteItem('${item.type}','${item.id}')" class="text-slate-400 hover:text-red-500 text-sm px-1">✕</button>
      </div>`;
    }).join('') : `<p class="text-xs text-slate-400 text-center py-4">Няма записи днес</p>`;
    return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-4 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-sm">Днес</h3>
        <span class="text-[11px] text-slate-400 bg-stone-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">${dateLabel}</span>
      </div>
      <div class="space-y-2">${body}</div>
    </div>`;
  }

  if (id === 'upcoming') {
    const showBath = localStorage.getItem('petpulse_remind_bath') !== '0';
    const showDeworm = localStorage.getItem('petpulse_remind_deworm') !== '0';
    const items = [];
    (petData.health || []).filter(h => h.nextDate && h.nextDate >= todayStr)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 3)
      .forEach(h => {
        const isDeworm = /обезпаразит|deworm/i.test(h.title + (h.productName || ''));
        if (isDeworm && !showDeworm) return;
        items.push(`${h.title} – ${fmtDate(h.nextDate)}`);
      });
    if (showBath && hyg.bath && parseInt(daysAgo(hyg.bath)) > 30) items.push('Къпане (отдавна)');
    if (!items.length) return '';
    return `<div class="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl p-4">
      <p class="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">Предстои</p>
      <div class="space-y-1 text-sm text-amber-900 dark:text-amber-200">${items.map(u => `<div>• ${u}</div>`).join('')}</div>
    </div>`;
  }

  if (id === 'food') {
    const foods = (petData.foods || []).filter(f => f.active && !f.archived);
    const main = foods.filter(f => f.type === 'main');
    const treats = foods.filter(f => f.type === 'treat');
    if (!foods.length) {
      return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-4 shadow-sm">
        <h3 class="font-bold text-sm mb-1">Храна и награди</h3>
        <p class="text-xs text-slate-400">Добави храни от таб „Любимци“ → Храна и награди</p>
      </div>`;
    }
    return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-4 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-bold text-sm">Храна и награди</h3>
        <button onclick="switchTab('pets')" class="text-[11px] text-teal-600 font-semibold">Управление</button>
      </div>
      ${main.length ? `<div class="text-xs text-slate-400 mb-1">Основна</div>
        <div class="flex flex-wrap gap-1.5 mb-2">${main.map(f => `<span class="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">${f.name}${f.bagKg ? ' · ' + f.bagKg + 'кг' : ''}</span>`).join('')}</div>` : ''}
      ${treats.length ? `<div class="text-xs text-slate-400 mb-1">Награди</div>
        <div class="flex flex-wrap gap-1.5">${treats.map(f => `<span class="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-medium">${f.name}</span>`).join('')}</div>` : ''}
      ${petData.allergies ? `<div class="text-xs text-amber-600 mt-2">⚠ ${petData.allergies}</div>` : ''}
    </div>`;
  }

  if (id === 'shared') {
    const meta = petData.usersMeta || {};
    const members = petData.members || [];
    const rows = members.map(uid => {
      const m = meta[uid] || { name: 'Стопанин', avatar: '👤' };
      const isMe = uid === currentUser.uid;
      return `<div class="flex items-center gap-3 py-2">
        <div class="w-9 h-9 rounded-full bg-stone-100 dark:bg-slate-800 flex items-center justify-center text-lg">${m.avatar || '👤'}</div>
        <div class="flex-1"><div class="text-sm font-semibold">${m.name}${isMe ? ' (ти)' : ''}</div>
        <div class="text-[11px] text-slate-400">${isMe ? 'Собственик' : 'Партньор'}</div></div>
      </div>`;
    }).join('');
    return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-4 shadow-sm">
      <h3 class="font-bold text-sm mb-2">Споделено с</h3>
      ${rows || '<p class="text-xs text-slate-400">Само ти</p>'}
      <p class="text-[11px] text-slate-400 mt-2">Код: <span class="font-mono font-bold text-teal-600">${petData.code || '—'}</span></p>
    </div>`;
  }
  return '';
}

function renderHomeWidgets() {
  const host = document.getElementById('tab-home');
  if (!host) return;
  const html = widgetConfig.filter(w => w.on).map(w => {
    const content = renderWidget(w.id);
    return content ? `<div class="widget" data-wid="${w.id}">${content}</div>` : '';
  }).join('');
  host.innerHTML = html || `<p class="text-sm text-slate-400 text-center py-12">Няма включени модули.<br><button onclick="openCustomize()" class="text-teal-600 font-semibold mt-2">Персонализирай екрана</button></p>`;
}

function renderApp() {
  const emoji = petData.type === 'cat' ? '🐈' : (petData.type === 'dog' ? '🐕' : '🐾');
  document.getElementById('pet-title-name').textContent = petData.name || 'Любимец';
  document.getElementById('pet-avatar-box').textContent = emoji;
  document.getElementById('profile-pet-name').textContent = petData.name || 'любимеца';
  document.getElementById('share-code-display').value = petData.code || '';
  document.getElementById('pet-subtitle').textContent = new Date().toLocaleDateString('bg-BG', { weekday: 'long', day: 'numeric', month: 'long' });

  document.getElementById('pet-breed').value = petData.breed || '';
  document.getElementById('pet-weight').value = petData.weight || '';
  document.getElementById('pet-birthdate').value = petData.birthdate || '';
  document.getElementById('pet-gender').value = petData.gender || 'unknown';
  document.getElementById('pet-passport').value = petData.passport || '';
  document.getElementById('pet-chip').value = petData.chip || '';
  document.getElementById('pet-allergies').value = petData.allergies || '';
  document.getElementById('pet-habits').value = petData.habits || '';

  const meta = (petData.usersMeta || {})[currentUser.uid] || {};
  document.getElementById('my-name-input').value = meta.name || '';
  document.querySelectorAll('.av-btn').forEach(b => {
    b.classList.toggle('border-teal-500', b.textContent.trim() === (meta.avatar || ''));
  });

  const hyg = petData.hygiene || {};
  document.getElementById('hyg-bath').textContent = hyg.bath ? `${fmtDate(hyg.bath)} (${daysAgo(hyg.bath)})` : '—';
  document.getElementById('hyg-nails').textContent = hyg.nails ? `${fmtDate(hyg.nails)} (${daysAgo(hyg.nails)})` : '—';
  document.getElementById('hyg-ears').textContent = hyg.ears ? `${fmtDate(hyg.ears)} (${daysAgo(hyg.ears)})` : '—';
  document.getElementById('hyg-teeth').textContent = hyg.teeth ? `${fmtDate(hyg.teeth)} (${daysAgo(hyg.teeth)})` : '—';

  const wh = petData.weightHistory || [];
  const lastW = wh[0] || (petData.weight ? { weight: petData.weight } : null);
  document.getElementById('weight-display').textContent = lastW ? `${lastW.weight} кг` : '— кг';
  document.getElementById('weight-history').innerHTML = wh.slice(0, 4).map(w =>
    `<div class="flex justify-between"><span>${fmtDate(w.date)}</span><span class="font-medium">${w.weight} кг</span></div>`
  ).join('') || '';

  const healthEl = document.getElementById('health-records-list');
  const items = [...(petData.health || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  healthEl.innerHTML = items.length ? items.map(h => `
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-4 shadow-sm">
      <div class="flex justify-between gap-2">
        <div>
          <div class="font-bold text-sm">${h.title}${h.productName ? ' · ' + h.productName : ''}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${fmtDate(h.date)}${h.nextDate ? ' → ' + fmtDate(h.nextDate) : ''}</div>
          ${h.notes ? `<p class="text-xs mt-1.5 text-slate-600 dark:text-slate-300">${h.notes}</p>` : ''}
        </div>
        <button onclick="deleteItem('health','${h.id}')" class="text-slate-400 hover:text-red-500 text-sm">✕</button>
      </div>
    </div>`).join('') : `<p class="text-xs text-slate-400 text-center py-6">Няма здравни записи</p>`;

  renderHomeWidgets();
  renderPetsList();
  renderFoodsList();
}

function foodCardHtml(f) {
  const notes = (f.notes || '').replace(/</g, '&lt;');
  return `<div class="rounded-xl bg-stone-50 dark:bg-slate-800/50 p-3 space-y-2 ${f.archived ? 'opacity-70' : ''}">
    <div class="flex items-center gap-3">
      <div class="text-lg">${f.type === 'treat' ? '🦴' : '🥣'}</div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate">${f.name}</div>
        <div class="text-[10px] text-slate-400">${f.type === 'treat' ? 'Награда' : 'Основна'}${f.bagKg ? ' · чувал ' + f.bagKg + ' кг' : ''}${f.archived ? ' · архив' : ''}</div>
      </div>
      ${!f.archived ? `<label class="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
        <input type="checkbox" ${f.active ? 'checked' : ''} onchange="toggleFoodActive('${f.id}', this.checked)" class="rounded accent-teal-600">
        активна
      </label>` : ''}
    </div>
    ${notes ? `<p class="text-[11px] text-slate-500 pl-8">📝 ${notes}</p>` : ''}
    <div class="flex flex-wrap gap-2 pl-8">
      <button onclick="editFoodNotes('${f.id}')" class="text-[11px] font-semibold text-teal-600">Бележка</button>
      ${f.archived
        ? `<button onclick="setFoodArchived('${f.id}', false)" class="text-[11px] font-semibold text-emerald-600">Възстанови</button>`
        : `<button onclick="setFoodArchived('${f.id}', true)" class="text-[11px] font-semibold text-amber-600">Архивирай</button>`}
      <button onclick="deleteFood('${f.id}')" class="text-[11px] font-semibold text-red-500">Изтрий</button>
    </div>
  </div>`;
}

function renderFoodsList() {
  const el = document.getElementById('foods-list');
  if (!el) return;
  const foods = petData.foods || [];
  if (!foods.length) {
    el.innerHTML = `<p class="text-xs text-slate-400 text-center py-3">Няма добавени храни. Добави основна гранула или награда.</p>`;
    return;
  }
  const active = foods.filter(f => !f.archived);
  const archived = foods.filter(f => f.archived);
  let html = active.length
    ? active.map(foodCardHtml).join('')
    : `<p class="text-xs text-slate-400 py-2">Няма активни – всички са в архива.</p>`;
  if (archived.length) {
    html += `<details class="mt-2">
      <summary class="text-[11px] font-semibold text-slate-400 cursor-pointer py-1">Архив (${archived.length})</summary>
      <div class="space-y-2 mt-2">${archived.map(foodCardHtml).join('')}</div>
    </details>`;
  }
  el.innerHTML = html;
}

function openAddFoodModal() {
  activeModalType = 'addfood';
  document.getElementById('modal-title').textContent = 'Нова храна / награда';
  document.getElementById('modal-body').innerHTML = `
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1">Тип</label>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" onclick="window._foodType='main';document.getElementById('ft-main').classList.add('border-teal-500','bg-teal-50');document.getElementById('ft-treat').classList.remove('border-teal-500','bg-teal-50')" id="ft-main" class="py-3 rounded-xl border-2 border-teal-500 bg-teal-50 text-sm font-semibold">🥣 Основна</button>
        <button type="button" onclick="window._foodType='treat';document.getElementById('ft-treat').classList.add('border-teal-500','bg-teal-50');document.getElementById('ft-main').classList.remove('border-teal-500','bg-teal-50')" id="ft-treat" class="py-3 rounded-xl border-2 border-stone-200 text-sm font-semibold">🦴 Награда</button>
      </div>
    </div>
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1">Име / марка</label>
      <input id="m-food-name" type="text" placeholder="напр. Royal Canin Mini Puppy" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none">
    </div>
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1">Чувал (кг) – по избор</label>
      <input id="m-food-bag" type="number" step="0.5" placeholder="12" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none">
    </div>
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1">Бележка (по избор)</label>
      <textarea id="m-food-notes" rows="2" placeholder="харесва я / изпражненията миришат по-малко…" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea>
    </div>`;
  window._foodType = 'main';
  document.getElementById('modal').classList.remove('hidden');
}

function editFoodNotes(id) {
  const f = (petData.foods || []).find(x => x.id === id);
  if (!f) return;
  activeModalType = 'editfoodnotes';
  window._editFoodId = id;
  document.getElementById('modal-title').textContent = 'Бележка: ' + f.name;
  document.getElementById('modal-body').innerHTML = `
    <p class="text-xs text-slate-400">Свободен текст – вкус, миризма, стомах, козина…</p>
    <textarea id="m-food-notes" rows="4" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none resize-none">${(f.notes || '').replace(/</g,'&lt;')}</textarea>`;
  document.getElementById('modal').classList.remove('hidden');
}

async function toggleFoodActive(id, on) {
  const foods = (petData.foods || []).map(f => f.id === id ? { ...f, active: on, archived: on ? false : f.archived } : f);
  petData.foods = foods;
  await db.collection('pets').doc(currentPetId).update({ foods });
}

async function setFoodArchived(id, archived) {
  const foods = (petData.foods || []).map(f => f.id === id ? { ...f, archived, active: archived ? false : f.active } : f);
  petData.foods = foods;
  await db.collection('pets').doc(currentPetId).update({ foods });
}

async function deleteFood(id) {
  if (!confirm('Изтриване завинаги? По-добре архивирай, ако искаш история.')) return;
  const foods = (petData.foods || []).filter(f => f.id !== id);
  petData.foods = foods;
  await db.collection('pets').doc(currentPetId).update({ foods });
}

function renderPetsList() {
  const el = document.getElementById('pets-list');
  if (!el) return;
  if (!userPets.length) {
    el.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Няма любимци</p>`;
    return;
  }
  el.innerHTML = userPets.map(p => {
    const em = p.type === 'cat' ? '🐈' : (p.type === 'dog' ? '🐕' : '🐾');
    const active = p.id === currentPetId;
    return `<button onclick="switchToPet('${p.id}')" class="w-full flex items-center gap-3 p-3.5 rounded-2xl border ${active ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30' : 'border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900'} text-left">
      <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center text-xl">${em}</div>
      <div class="flex-1 min-w-0"><div class="font-bold text-sm">${p.name}</div>
      <div class="text-[11px] text-slate-400">${{ dog: 'Куче', cat: 'Котка', other: 'Друго' }[p.type] || ''}</div></div>
      ${active ? '<span class="text-[10px] font-bold text-teal-600">активен</span>' : ''}
    </button>`;
  }).join('');
}

// —— Customize UI (live preview) ——
function openCustomize() {
  document.getElementById('customize-screen').classList.remove('hidden');
  renderCustomizeList();
  renderCustomizePreview();
}
function closeCustomize() {
  document.getElementById('customize-screen').classList.add('hidden');
  saveWidgets(widgetConfig);
  renderHomeWidgets();
}
function renderCustomizePreview() {
  const host = document.getElementById('customize-preview');
  if (!host) return;
  const html = widgetConfig.filter(w => w.on).map(w => {
    const content = renderWidget(w.id);
    return content ? `<div class="widget">${content}</div>` : '';
  }).join('');
  host.innerHTML = html || `<p class="text-xs text-slate-400 text-center py-6">Няма включени модули</p>`;
}
function renderCustomizeList() {
  const list = document.getElementById('customize-list');
  if (!list) return;
  list.innerHTML = widgetConfig.map((w, i) => {
    const def = WIDGET_DEFS.find(d => d.id === w.id) || { label: w.id, icon: '📦' };
    return `<div class="bg-white dark:bg-slate-900 rounded-2xl border ${w.on ? 'border-teal-300 dark:border-teal-800' : 'border-stone-200 dark:border-slate-800'} p-3.5 flex items-center gap-3 shadow-sm">
      <div class="text-xl w-8 text-center ${w.on ? '' : 'opacity-40'}">${def.icon}</div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold ${w.on ? '' : 'text-slate-400'}">${def.label}</div>
        <div class="text-[10px] text-slate-400">${w.on ? 'видима' : 'скрита'}</div>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="moveWidget(${i},-1)" class="w-8 h-8 rounded-lg bg-stone-100 dark:bg-slate-800 text-slate-500 ${i===0?'opacity-30':''}" ${i===0?'disabled':''}>↑</button>
        <button onclick="moveWidget(${i},1)" class="w-8 h-8 rounded-lg bg-stone-100 dark:bg-slate-800 text-slate-500 ${i===widgetConfig.length-1?'opacity-30':''}" ${i===widgetConfig.length-1?'disabled':''}>↓</button>
        <label class="relative inline-flex items-center cursor-pointer ml-1">
          <input type="checkbox" ${w.on?'checked':''} onchange="toggleWidget(${i},this.checked)" class="sr-only peer">
          <div class="w-10 h-5 bg-stone-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
        </label>
      </div>
    </div>`;
  }).join('');
}
function toggleWidget(index, on) {
  widgetConfig[index].on = on;
  saveWidgets(widgetConfig);
  renderCustomizeList();
  renderCustomizePreview();
  renderHomeWidgets();
}
function moveWidget(index, dir) {
  const next = index + dir;
  if (next < 0 || next >= widgetConfig.length) return;
  const tmp = widgetConfig[index];
  widgetConfig[index] = widgetConfig[next];
  widgetConfig[next] = tmp;
  saveWidgets(widgetConfig);
  renderCustomizeList();
  renderCustomizePreview();
  renderHomeWidgets();
}

// —— Profile / settings ——
async function saveMyProfile() {
  if (!currentPetId) return;
  const name = document.getElementById('my-name-input').value.trim() || 'Стопанин';
  const cur = (petData.usersMeta || {})[currentUser.uid] || { color: '#0d9488', avatar: '👤' };
  if (!petData.usersMeta) petData.usersMeta = {};
  petData.usersMeta[currentUser.uid] = { ...cur, name };
  await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
}
async function setMyColor(color) {
  if (!currentPetId) return;
  if (!petData.usersMeta) petData.usersMeta = {};
  const cur = petData.usersMeta[currentUser.uid] || { name: 'Стопанин', avatar: '👤' };
  petData.usersMeta[currentUser.uid] = { ...cur, color };
  await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
}
async function setMyAvatar(emoji) {
  if (!currentPetId) return;
  if (!petData.usersMeta) petData.usersMeta = {};
  const cur = petData.usersMeta[currentUser.uid] || { name: 'Стопанин', color: '#0d9488' };
  petData.usersMeta[currentUser.uid] = { ...cur, avatar: emoji };
  await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
  document.querySelectorAll('.av-btn').forEach(b => b.classList.toggle('border-teal-500', b.textContent.trim() === emoji));
}
function saveReminderSettings() {
  localStorage.setItem('petpulse_remind_bath', document.getElementById('toggle-remind-bath')?.checked ? '1' : '0');
  localStorage.setItem('petpulse_remind_deworm', document.getElementById('toggle-remind-deworm')?.checked ? '1' : '0');
  renderHomeWidgets();
}
async function savePetDetails() {
  if (!currentPetId) return;
  const payload = {
    breed: document.getElementById('pet-breed').value.trim(),
    weight: parseFloat(document.getElementById('pet-weight').value) || null,
    birthdate: document.getElementById('pet-birthdate').value,
    gender: document.getElementById('pet-gender').value,
    passport: document.getElementById('pet-passport').value.trim(),
    chip: document.getElementById('pet-chip').value.trim(),
    allergies: document.getElementById('pet-allergies').value.trim(),
    habits: document.getElementById('pet-habits').value.trim()
  };
  Object.assign(petData, payload);
  await db.collection('pets').doc(currentPetId).update(payload);
}

// —— Modals ——
function openModal(type) {
  activeModalType = type;
  const titles = { walk: 'Разходка', meal: 'Хранене', health: 'Здравен запис', hygiene: 'Хигиена', weight: 'Тегло' };
  document.getElementById('modal-title').textContent = titles[type] || 'Добави';
  const body = document.getElementById('modal-body');
  const now = new Date();
  const timeVal = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const today = now.toISOString().slice(0, 10);
  if (type === 'walk') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Час</label>
      <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Минути</label>
      <input id="m-duration" type="number" placeholder="30" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1.5">Време</label>
        <div class="flex gap-2" id="weather-picker">
          <button type="button" data-w="sun" onclick="selectWeather('sun')" class="weather-btn flex-1 py-3 rounded-xl border-2 border-sky-500 bg-sky-50 dark:bg-sky-950/30 text-xl">☀️</button>
          <button type="button" data-w="cloud" onclick="selectWeather('cloud')" class="weather-btn flex-1 py-3 rounded-xl border-2 border-stone-200 dark:border-slate-700 text-xl">☁️</button>
          <button type="button" data-w="rain" onclick="selectWeather('rain')" class="weather-btn flex-1 py-3 rounded-xl border-2 border-stone-200 dark:border-slate-700 text-xl">🌧️</button>
          <button type="button" data-w="snow" onclick="selectWeather('snow')" class="weather-btn flex-1 py-3 rounded-xl border-2 border-stone-200 dark:border-slate-700 text-xl">❄️</button>
        </div>
      </div>
      <div class="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-3 space-y-2">
        <label class="text-xs font-semibold text-slate-400">Място на разходката</label>
        <div class="flex gap-2">
          <button type="button" onclick="captureWalkLocation()" class="flex-1 py-2 rounded-lg bg-sky-500 text-white text-[11px] font-bold">📍 GPS сега</button>
          <button type="button" onclick="document.getElementById('m-place-search').focus()" class="flex-1 py-2 rounded-lg border border-stone-200 dark:border-slate-600 text-[11px] font-bold">🔍 Търси</button>
        </div>
        <input id="m-place-search" type="text" placeholder="Парк, квартал, град…" class="w-full px-3 py-2.5 rounded-lg border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm outline-none" oninput="searchPlaceDebounced(this.value)">
        <div id="m-place-results" class="space-y-1 max-h-28 overflow-y-auto hidden"></div>
        <p id="m-place-label" class="text-sm text-slate-600 dark:text-slate-300">Или напиши място / ползвай GPS</p>
        <input type="hidden" id="m-lat" value="">
        <input type="hidden" id="m-lng" value="">
        <input type="hidden" id="m-place" value="">
        <div id="m-map-link" class="hidden mt-1"></div>
        <p class="text-[10px] text-slate-400">Ако вече си вкъщи – потърси парка или въведи името ръчно.</p>
      </div>`;
    window._selectedWeather = 'sun';
  } else if (type === 'meal') {
    const active = (petData.foods || []).filter(f => f.active && !f.archived);
    const opts = active.map(f => `<option value="${f.id}">${f.type === 'treat' ? '🦴 ' : '🥣 '}${f.name}</option>`).join('');
    body.innerHTML = `
      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1">Какво</label>
        <select id="m-food-id" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none">
          ${opts || '<option value="">— няма активни храни —</option>'}
          <option value="__other">Друго (еднократно)…</option>
        </select>
      </div>
      <div id="m-other-wrap" class="hidden">
        <label class="block text-xs font-semibold text-slate-400 mb-1">Какво точно</label>
        <input id="m-food-other" type="text" placeholder="напр. пилешко от масата" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none">
      </div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Час</label>
      <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Количество (г)</label>
      <input id="m-amount" type="number" placeholder="65" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>`;
    setTimeout(() => {
      const sel = document.getElementById('m-food-id');
      if (sel) sel.addEventListener('change', () => {
        document.getElementById('m-other-wrap').classList.toggle('hidden', sel.value !== '__other');
      });
    }, 50);
  } else if (type === 'health') {
    body.innerHTML = `<div><label class="block text-xs font-semibold text-slate-400 mb-1">Какво</label>
      <input id="m-title" type="text" placeholder="Ваксина / Обезпаразитяване" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Продукт</label>
      <input id="m-product" type="text" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
      <input id="m-date" type="date" value="${today}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Следваща</label>
      <input id="m-next" type="date" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <textarea id="m-notes" rows="2" placeholder="Бележки" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea>`;
  } else if (type === 'hygiene') {
    const hyg = petData.hygiene || {};
    body.innerHTML = `<div><label class="block text-xs font-semibold text-slate-400 mb-1">Къпане</label>
      <input id="m-bath" type="date" value="${hyg.bath||''}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Нокти</label>
      <input id="m-nails" type="date" value="${hyg.nails||''}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Уши</label>
      <input id="m-ears" type="date" value="${hyg.ears||''}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Зъби</label>
      <input id="m-teeth" type="date" value="${hyg.teeth||''}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  } else if (type === 'weight') {
    body.innerHTML = `<div><label class="block text-xs font-semibold text-slate-400 mb-1">Тегло (кг)</label>
      <input id="m-weight" type="number" step="0.1" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
      <input id="m-wdate" type="date" value="${today}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  }
  document.getElementById('modal').classList.remove('hidden');
}

function selectWeather(w) {
  window._selectedWeather = w;
  document.querySelectorAll('.weather-btn').forEach(btn => {
    const on = btn.getAttribute('data-w') === w;
    btn.classList.toggle('border-sky-500', on);
    btn.classList.toggle('bg-sky-50', on);
    btn.classList.toggle('dark:bg-sky-950/30', on);
    btn.classList.toggle('border-stone-200', !on);
    btn.classList.toggle('dark:border-slate-700', !on);
  });
}

async function captureWalkLocation(silent) {
  const label = document.getElementById('m-place-label');
  const mapLink = document.getElementById('m-map-link');
  if (!label) return;
  if (!navigator.geolocation) {
    if (!silent) label.textContent = 'GPS не се поддържа – потърси място по име';
    return;
  }
  label.textContent = 'Определяне на локация…';
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 12000, maximumAge: 60000
      });
    });
    applyWalkCoords(pos.coords.latitude, pos.coords.longitude);
  } catch (err) {
    label.textContent = silent ? 'Потърси място или въведи име' : 'Няма GPS – потърси парк/квартал по име';
  }
}

async function applyWalkCoords(lat, lng, nameHint) {
  const label = document.getElementById('m-place-label');
  const mapLink = document.getElementById('m-map-link');
  document.getElementById('m-lat').value = lat;
  document.getElementById('m-lng').value = lng;
  let place = nameHint || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  if (!nameHint) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        { headers: { 'Accept-Language': 'bg' } }
      );
      const data = await res.json();
      const a = data.address || {};
      place = a.park || a.leisure || a.suburb || a.neighbourhood || a.road || a.city || a.town || a.village || data.name || place;
      if (a.city || a.town) {
        const city = a.city || a.town || a.village || '';
        if (city && place !== city) place = `${place}, ${city}`;
      }
    } catch (e) {}
  }
  document.getElementById('m-place').value = place;
  if (label) label.textContent = '✓ ' + place;
  if (mapLink) {
    mapLink.classList.remove('hidden');
    mapLink.innerHTML = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener" class="text-xs text-sky-500 font-semibold">Отвори в Google Maps →</a>`;
  }
  const results = document.getElementById('m-place-results');
  if (results) results.classList.add('hidden');
}

let _placeSearchTimer = null;
function searchPlaceDebounced(q) {
  clearTimeout(_placeSearchTimer);
  const results = document.getElementById('m-place-results');
  if (!q || q.trim().length < 2) {
    if (results) { results.innerHTML = ''; results.classList.add('hidden'); }
    // allow free-text place without coords
    const placeEl = document.getElementById('m-place');
    if (placeEl) placeEl.value = q.trim();
    const label = document.getElementById('m-place-label');
    if (label && q.trim()) label.textContent = 'Ръчно: ' + q.trim();
    return;
  }
  _placeSearchTimer = setTimeout(() => searchPlace(q.trim()), 400);
}

async function searchPlace(q) {
  const results = document.getElementById('m-place-results');
  if (!results) return;
  results.classList.remove('hidden');
  results.innerHTML = `<p class="text-[11px] text-slate-400 px-1">Търсене…</p>`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
      { headers: { 'Accept-Language': 'bg' } }
    );
    const data = await res.json();
    if (!data.length) {
      results.innerHTML = `<p class="text-[11px] text-slate-400 px-1">Няма резултати – ще се запише като текст</p>`;
      document.getElementById('m-place').value = q;
      document.getElementById('m-lat').value = '';
      document.getElementById('m-lng').value = '';
      return;
    }
    results.innerHTML = data.map(r => {
      const name = (r.display_name || '').split(',').slice(0, 3).join(',');
      return `<button type="button" onclick="selectSearchedPlace(${r.lat},${r.lon},${JSON.stringify(name)})" class="w-full text-left px-2 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-slate-700 text-xs">${name}</button>`;
    }).join('');
  } catch (e) {
    results.innerHTML = `<p class="text-[11px] text-red-400 px-1">Грешка при търсене</p>`;
  }
}

function selectSearchedPlace(lat, lng, name) {
  applyWalkCoords(lat, lng, name);
  const search = document.getElementById('m-place-search');
  if (search) search.value = name;
}

function toggleFab() {
  const sheet = document.getElementById('fab-sheet');
  if (!sheet) return;
  sheet.classList.toggle('hidden');
}
function closeFab() {
  document.getElementById('fab-sheet')?.classList.add('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  activeModalType = null;
}
async function saveModal() {
  if (!currentPetId) return;
  const item = { id: 'i' + Date.now(), createdAt: new Date().toISOString(), authorUid: currentUser.uid, date: new Date().toISOString().slice(0, 10) };
  if (activeModalType === 'walk') {
    item.time = document.getElementById('m-time').value;
    item.duration = document.getElementById('m-duration').value;
    item.weather = window._selectedWeather || 'sun';
    item.lat = parseFloat(document.getElementById('m-lat')?.value) || null;
    item.lng = parseFloat(document.getElementById('m-lng')?.value) || null;
    item.place = document.getElementById('m-place')?.value
      || document.getElementById('m-place-search')?.value.trim()
      || '';
    petData.walks = [item, ...(petData.walks || [])];
  } else if (activeModalType === 'meal') {
    item.time = document.getElementById('m-time').value;
    item.amount = document.getElementById('m-amount').value;
    const fid = document.getElementById('m-food-id')?.value || '';
    if (fid === '__other') {
      item.foodName = document.getElementById('m-food-other')?.value.trim() || 'Друго';
      item.foodType = 'other';
    } else {
      const f = (petData.foods || []).find(x => x.id === fid);
      item.foodId = fid;
      item.foodName = f ? f.name : '';
      item.foodType = f ? f.type : 'main';
    }
    petData.meals = [item, ...(petData.meals || [])];
  } else if (activeModalType === 'health') {
    item.title = document.getElementById('m-title').value || 'Запис';
    item.productName = document.getElementById('m-product').value.trim();
    item.date = document.getElementById('m-date').value;
    item.nextDate = document.getElementById('m-next').value;
    item.notes = document.getElementById('m-notes').value;
    petData.health = [item, ...(petData.health || [])];
  } else if (activeModalType === 'hygiene') {
    petData.hygiene = {
      bath: document.getElementById('m-bath').value || (petData.hygiene || {}).bath || '',
      nails: document.getElementById('m-nails').value || (petData.hygiene || {}).nails || '',
      ears: document.getElementById('m-ears').value || (petData.hygiene || {}).ears || '',
      teeth: document.getElementById('m-teeth').value || (petData.hygiene || {}).teeth || ''
    };
  } else if (activeModalType === 'weight') {
    const w = parseFloat(document.getElementById('m-weight').value);
    const d = document.getElementById('m-wdate').value;
    if (w) {
      petData.weight = w;
      petData.weightHistory = [{ date: d, weight: w }, ...(petData.weightHistory || [])].slice(0, 20);
    }
  } else if (activeModalType === 'addfood') {
    const name = document.getElementById('m-food-name')?.value.trim();
    if (!name) return alert('Въведи име на храната');
    const bag = parseFloat(document.getElementById('m-food-bag')?.value) || null;
    const notes = document.getElementById('m-food-notes')?.value.trim() || '';
    petData.foods = [{
      id: 'f' + Date.now(),
      name,
      type: window._foodType || 'main',
      active: true,
      archived: false,
      bagKg: bag,
      notes
    }, ...(petData.foods || [])];
    try {
      await db.collection('pets').doc(currentPetId).update({ foods: petData.foods });
      closeModal();
    } catch (e) { alert('Грешка: ' + e.message); }
    return;
  } else if (activeModalType === 'editfoodnotes') {
    const notes = document.getElementById('m-food-notes')?.value.trim() || '';
    const id = window._editFoodId;
    petData.foods = (petData.foods || []).map(f => f.id === id ? { ...f, notes } : f);
    try {
      await db.collection('pets').doc(currentPetId).update({ foods: petData.foods });
      closeModal();
    } catch (e) { alert('Грешка: ' + e.message); }
    return;
  }
  try {
    await db.collection('pets').doc(currentPetId).update({
      walks: petData.walks || [], meals: petData.meals || [], health: petData.health || [],
      hygiene: petData.hygiene || {}, weight: petData.weight || null, weightHistory: petData.weightHistory || [],
      foods: petData.foods || []
    });
    closeModal();
  } catch (e) { alert('Грешка: ' + e.message); }
}
async function deleteItem(type, id) {
  if (!confirm('Изтриване?')) return;
  if (type === 'walk') petData.walks = (petData.walks || []).filter(x => x.id !== id);
  if (type === 'meal') petData.meals = (petData.meals || []).filter(x => x.id !== id);
  if (type === 'health') petData.health = (petData.health || []).filter(x => x.id !== id);
  await db.collection('pets').doc(currentPetId).update({
    walks: petData.walks || [], meals: petData.meals || [], health: petData.health || []
  });
}

function switchTab(id) {
  closeFab();
  ['home', 'health', 'pets'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', t === id);
    const nav = document.getElementById('nav-' + t);
    if (nav) {
      nav.classList.toggle('text-teal-600', t === id);
      nav.classList.toggle('text-slate-400', t !== id);
    }
  });
  if (id === 'pets') loadUserPets().then(() => { renderPetsList(); renderFoodsList(); });
  if (id === 'home') renderHomeWidgets();
}

function openDrawer() {
  document.getElementById('drawer').classList.add('drawer-open');
  document.getElementById('drawer-backdrop').classList.add('drawer-bg-open');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('drawer-open');
  document.getElementById('drawer-backdrop').classList.remove('drawer-bg-open');
}
function toggleDarkMode() {
  const on = document.getElementById('toggle-dark').checked;
  document.documentElement.classList.toggle('dark', on);
  localStorage.setItem('petpulse_dark', on ? '1' : '0');
}
function copyShareCode() {
  const el = document.getElementById('share-code-display');
  el.select();
  navigator.clipboard.writeText(el.value);
  alert('Кодът е копиран!');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
