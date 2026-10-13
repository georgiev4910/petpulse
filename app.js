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
  { id: 'hero', label: 'Профил', icon: '🐕', defaultSize: 'l' },
  { id: 'quick', label: 'Бързи действия', icon: '⚡', defaultSize: 'l' },
  { id: 'stats', label: 'Статистики', icon: '📊', defaultSize: 'm' },
  { id: 'timeline', label: 'Днес', icon: '📋', defaultSize: 'l' },
  { id: 'upcoming', label: 'Предстои', icon: '⏰', defaultSize: 'm' },
  { id: 'food', label: 'Храна', icon: '🥣', defaultSize: 'm' },
  { id: 'shared', label: 'Споделено', icon: '👥', defaultSize: 's' }
];
// sizes: s = лента (2 колони, нисък), m = квадрат (1 колона), l = голям (2 колони)
const SIZE_LABELS = { s: 'Лента', m: 'Квадрат', l: 'Голям' };
const SIZE_ORDER = ['s', 'm', 'l'];

const DEFAULT_WIDGETS = [
  { id: 'hero', on: true, size: 'l' },
  { id: 'quick', on: true, size: 'l' },
  { id: 'stats', on: true, size: 'm' },
  { id: 'timeline', on: true, size: 'l' },
  { id: 'upcoming', on: true, size: 'm' },
  { id: 'food', on: true, size: 'm' },
  { id: 'shared', on: false, size: 's' }
];

function widgetKey() {
  return 'petpulse_widgets_' + (currentUser?.uid || 'guest');
}

function normalizeWidget(w) {
  const def = WIDGET_DEFS.find(d => d.id === w.id);
  return {
    id: w.id,
    on: w.on !== false,
    size: SIZE_ORDER.includes(w.size) ? w.size : (def?.defaultSize || 'l')
  };
}

function loadWidgets() {
  try {
    const raw = localStorage.getItem(widgetKey());
    if (raw) {
      const parsed = JSON.parse(raw).map(normalizeWidget);
      const ids = new Set(parsed.map(w => w.id));
      DEFAULT_WIDGETS.forEach(d => { if (!ids.has(d.id)) parsed.push(normalizeWidget(d)); });
      return sortWidgets(parsed.filter(w => WIDGET_DEFS.some(d => d.id === w.id)));
    }
  } catch (e) {}
  return DEFAULT_WIDGETS.map(normalizeWidget);
}

function sortWidgets(list) {
  // active first (keep relative order), inactive at bottom
  const on = list.filter(w => w.on);
  const off = list.filter(w => !w.on);
  return [...on, ...off];
}

function saveWidgets(list) {
  widgetConfig = sortWidgets(list);
  localStorage.setItem(widgetKey(), JSON.stringify(widgetConfig));
}

let widgetConfig = DEFAULT_WIDGETS.map(normalizeWidget);

function sizeClass(size) {
  if (size === 'm') return 'col-span-1';
  return 'col-span-2'; // s and l full width
}
function sizeMinH(size) {
  if (size === 's') return 'min-h-[52px]';
  if (size === 'm') return 'min-h-[120px]';
  return 'min-h-[100px]';
}

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
    creatorUid: currentUser.uid,
    usersMeta: { [currentUser.uid]: { name: myName, avatar: profile.avatar || '👤', photoURL: profile.photoURL || null, color: profile.color || '#0d9488' } },
    walks: [], meals: [], health: [],
    aiChat: [],
    aiSettings: {
      mode: 'pet',           // standard | pet | custom
      customName: '',
      customType: 'dog',     // dog | cat | hamster | other
      style: 'friendly',     // friendly | strict | humor | playful | teasing
      apiKey: ''             // only creator sets; shared for members
    }
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

function switchToPet(petId, goHome) {
  closePetSwitcher();
  if (petId === currentPetId) {
    if (goHome) switchTab('home');
    else { renderPetsList(); renderFoodsList(); }
    return;
  }
  if (unsubPet) unsubPet();
  currentPetId = petId;
  localStorage.setItem('petpulse_active_pet', petId);
  startPetListener();
  if (goHome) {
    switchTab('home');
  } else {
    // Stay on Любимци (or current tab) so user can edit/view
    setTimeout(() => {
      if (document.getElementById('tab-pets')?.classList.contains('active')) {
        renderPetsList();
        renderFoodsList();
      }
    }, 150);
  }
}

function petThemeOf(p) {
  if (p?.themeColor) return p.themeColor;
  if (p?.type === 'cat') return '#ef4444';
  if (p?.type === 'dog') return '#0d9488';
  return '#8b5cf6';
}

function openPetSwitcher() {
  const list = document.getElementById('pet-switcher-list');
  if (!list) return;
  if (!userPets.length) {
    list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Няма други любимци</p>`;
  } else {
    list.innerHTML = userPets.map(p => {
      const active = p.id === currentPetId;
      const em = p.type === 'cat' ? '🐈' : (p.type === 'dog' ? '🐕' : '🐾');
      const theme = petThemeOf(p);
      const av = p.photoURL
        ? `<img src="${p.photoURL}" class="w-12 h-12 rounded-2xl object-cover" alt="" style="box-shadow:0 0 0 2px ${theme}55">`
        : `<div class="w-12 h-12 rounded-2xl text-white flex items-center justify-center text-xl" style="background:linear-gradient(135deg,${theme},${theme}cc)">${em}</div>`;
      return `<button onclick="switchToPet('${p.id}', true)" class="w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition ${active ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30' : 'border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/50'}" ${active ? `style="border-color:${theme};background:${theme}14"` : ''}>
        ${av}
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm">${p.name || 'Любимец'}</div>
          <div class="text-[11px] text-slate-400">${p.breed || ({ dog: 'Куче', cat: 'Котка', other: 'Друго' }[p.type] || '')}</div>
        </div>
        ${active ? `<span class="text-[10px] font-bold px-2 py-1 rounded-full" style="color:${theme};background:${theme}22">активен</span>` : '<span class="text-slate-300 text-lg">›</span>'}
      </button>`;
    }).join('');
  }
  document.getElementById('pet-switcher').classList.remove('hidden');
}
function closePetSwitcher() {
  document.getElementById('pet-switcher')?.classList.add('hidden');
}

function multiPetPickerHtml() {
  if (!userPets || userPets.length < 2) return '';
  const chips = userPets.map(p => {
    const checked = p.id === currentPetId ? 'checked' : '';
    const em = p.type === 'cat' ? '🐈' : (p.type === 'dog' ? '🐕' : '🐾');
    return `<label class="flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer">
      <input type="checkbox" class="m-pet-target rounded accent-teal-600" value="${p.id}" ${checked}>
      <span class="text-sm font-semibold">${em} ${p.name || 'Любимец'}</span>
    </label>`;
  }).join('');
  return `<div class="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 p-3 space-y-2">
    <div class="flex items-center justify-between">
      <label class="text-xs font-bold text-teal-700 dark:text-teal-400">За кои любимци?</label>
      <button type="button" onclick="toggleAllPetTargets()" class="text-[11px] font-bold text-teal-600">Всички</button>
    </div>
    <div class="flex flex-wrap gap-2">${chips}</div>
    <p class="text-[10px] text-slate-400">Можеш да запишеш еднакво за няколко наведнъж</p>
  </div>`;
}
function toggleAllPetTargets() {
  const boxes = [...document.querySelectorAll('.m-pet-target')];
  const allOn = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allOn; });
}
function getSelectedPetTargets() {
  const boxes = [...document.querySelectorAll('.m-pet-target')];
  if (!boxes.length) return [currentPetId];
  const ids = boxes.filter(b => b.checked).map(b => b.value);
  return ids.length ? ids : [currentPetId];
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
function renderWidget(id, size) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const emoji = petData.type === 'cat' ? '🐈' : (petData.type === 'dog' ? '🐕' : '🐾');
  const age = calcAge(petData.birthdate);
  const hyg = petData.hygiene || {};

  if (id === 'hero') {
    const walksToday = (petData.walks || []).filter(w => w.date === todayStr).length;
    const mealsToday = (petData.meals || []).filter(m => m.date === todayStr).length;
    const theme = petThemeOf(petData);
    const themeDark = darkenHex(theme, 0.2);
    const avInner = petData.photoURL
      ? `<img src="${petData.photoURL}" class="w-full h-full object-cover rounded-2xl" alt="">`
      : emoji;
    return `<button type="button" onclick="switchTab('pets')" class="w-full text-left bg-white dark:bg-slate-900 rounded-3xl border border-stone-200/80 dark:border-slate-800 overflow-hidden shadow-sm active:scale-[0.99] transition">
      <div class="h-28 relative flex items-end p-4" style="background:linear-gradient(135deg,${theme} 0%,${themeDark} 100%)">
        <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_70%_30%,white,transparent_50%)]"></div>
        <div class="relative flex items-center gap-3 w-full">
          <div class="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur text-white text-2xl flex items-center justify-center border border-white/30 overflow-hidden">${avInner}</div>
          <div class="text-white min-w-0 flex-1">
            <div class="font-bold text-lg leading-tight">${petData.name || 'Любимец'}</div>
            <div class="text-xs text-white/80">${petData.breed || ''}${age ? ' · ' + age : ''}${petData.weight ? ' · ' + petData.weight + ' кг' : ''}</div>
          </div>
          <div class="text-white/80 text-xs font-semibold shrink-0">Профил ›</div>
        </div>
      </div>
      <div class="grid grid-cols-3 divide-x divide-stone-100 dark:divide-slate-800">
        <div class="py-3 text-center"><div class="text-base font-extrabold" style="color:${theme}">${mealsToday}</div><div class="text-[10px] text-slate-400">храна</div></div>
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
    const typeMeta = {
      walk: { color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-950/30', icon: '🚶', name: 'Разходка' },
      meal: { color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: '🥣', name: 'Храна' },
      health: { color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/30', icon: '💊', name: 'Здраве' },
      plan: { color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-950/30', icon: '📅', name: 'План' }
    };
    const weatherIcon = { sun: '☀️', cloud: '☁️', rain: '🌧️', snow: '❄️' };
    const list = [
      ...(petData.walks || []).filter(w => w.date === todayStr).map(w => ({
        ...w, type: 'walk',
        title: `Разходка${w.duration ? ' · ' + w.duration + ' мин' : ''}`,
        sub: [w.weather ? weatherIcon[w.weather] : '', w.place || ''].filter(Boolean).join(' ')
      })),
      ...(petData.meals || []).filter(m => m.date === todayStr).map(m => ({
        ...m, type: 'meal',
        title: `${m.foodType === 'treat' ? 'Награда' : 'Хранене'}${m.amount ? ' · ' + m.amount + ' г' : ''}`,
        sub: m.foodName || ''
      })),
      ...(petData.health || []).filter(h => h.date === todayStr).map(h => ({
        ...h, type: 'health', title: h.title, sub: h.productName || h.notes || ''
      })),
      ...(petData.plans || []).filter(p => p.date === todayStr).map(p => ({
        ...p, type: 'plan', title: p.title, sub: p.notes || ''
      }))
    ].sort((a, b) => (a.time || a.createdAt || '').localeCompare(b.time || b.createdAt || ''));
    const dateLabel = new Date().toLocaleDateString('bg-BG', { weekday: 'long', day: 'numeric', month: 'long' });
    let body;
    if (!list.length) {
      body = `<div class="text-center py-6">
        <div class="text-2xl mb-1">📭</div>
        <p class="text-xs text-slate-400">Все още тихо днес</p>
        <button onclick="toggleFab()" class="mt-2 text-xs font-bold text-teal-600">+ Добави запис</button>
      </div>`;
    } else {
      body = `<div class="relative pl-3 space-y-0">
        <div class="absolute left-[19px] top-2 bottom-2 w-0.5 bg-stone-200 dark:bg-slate-700"></div>
        ${list.map(item => {
          const tm = typeMeta[item.type] || typeMeta.plan;
          const u = (petData.usersMeta || {})[item.authorUid] || {};
          return `<div class="relative flex gap-3 py-2.5">
            <div class="relative z-10 w-9 h-9 rounded-full ${tm.bg} flex items-center justify-center text-base shrink-0 border-2 border-white dark:border-slate-900">${tm.icon}</div>
            <div class="flex-1 min-w-0 pt-0.5">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="text-sm font-bold leading-tight">${item.title}</div>
                  ${item.sub ? `<div class="text-[11px] text-slate-500 mt-0.5">${item.sub}</div>` : ''}
                  <div class="text-[10px] text-slate-400 mt-0.5">${item.time || '—'} · ${u.name || 'Стопанин'}</div>
                </div>
                <div class="flex gap-1 shrink-0">
                  ${item.type !== 'plan'
                    ? `<button onclick="editItem('${item.type}','${item.id}')" class="text-slate-400 hover:text-teal-600 text-[11px] font-bold px-1">✎</button>
                       <button onclick="deleteItem('${item.type}','${item.id}')" class="text-slate-300 hover:text-red-500 text-xs px-1">✕</button>`
                    : `<button onclick="editPlan('${item.id}')" class="text-slate-400 hover:text-teal-600 text-[11px] font-bold px-1">✎</button>
                       <button onclick="deletePlan('${item.id}')" class="text-slate-300 hover:text-red-500 text-xs px-1">✕</button>`}
                </div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }
    return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-4 shadow-sm">
      <div class="flex items-center justify-between mb-1">
        <h3 class="font-bold text-sm">Днес</h3>
        <span class="text-[11px] text-slate-400 font-medium">${dateLabel}</span>
      </div>
      ${body}
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
        <div class="space-y-1.5 mb-2">${main.map(f => {
          const est = bagEstimate(f);
          return `<div class="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-[11px]">
            <div class="font-semibold">${f.name}${f.bagKg ? ' · ' + f.bagKg + ' кг' : ''}</div>
            ${est ? `<div class="text-[10px] opacity-80 mt-0.5">${est}</div>` : ''}
          </div>`;
        }).join('')}</div>` : ''}
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
      const canRemove = isPetCreator() && !isMe;
      return `<div class="flex items-center gap-3 py-2">
        <div class="w-9 h-9 rounded-full bg-stone-100 dark:bg-slate-800 flex items-center justify-center text-lg overflow-hidden">${m.photoURL ? `<img src="${m.photoURL}" class="w-full h-full object-cover">` : (m.avatar || '👤')}</div>
        <div class="flex-1"><div class="text-sm font-semibold">${m.name}${isMe ? ' (ти)' : ''}</div>
        <div class="text-[11px] text-slate-400">${isMe ? 'Ти' : 'Стопанин'}</div></div>
        ${canRemove ? `<button onclick="removeMember('${uid}')" class="text-[11px] font-bold text-red-500">Премахни</button>` : ''}
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
  const active = widgetConfig.filter(w => w.on);
  const html = active.map(w => {
    const content = renderWidget(w.id, w.size);
    if (!content) return '';
    return `<div class="widget ${sizeClass(w.size)} ${sizeMinH(w.size)}" data-wid="${w.id}">${content}</div>`;
  }).join('');
  // Do not rewrite className here — switchTab owns active; CSS makes #tab-home a grid
  host.innerHTML = html || `<p class="col-span-2 text-sm text-slate-400 text-center py-12">Няма включени модули.<br><button onclick="openCustomize()" class="text-teal-600 font-semibold mt-2">Персонализирай екрана</button></p>`;
}

function renderApp() {
  const emoji = petData.type === 'cat' ? '🐈' : (petData.type === 'dog' ? '🐕' : '🐾');
  document.getElementById('pet-title-name').textContent = petData.name || 'Любимец';
  const avBox = document.getElementById('pet-avatar-box');
  if (avBox) {
    if (petData.photoURL) {
      avBox.innerHTML = `<img src="${petData.photoURL}" class="w-full h-full object-cover" alt="">`;
    } else {
      avBox.textContent = emoji;
    }
  }
  const defaultTheme = petData.type === 'cat' ? '#ef4444' : (petData.type === 'dog' ? '#0d9488' : '#8b5cf6');
  applyPetTheme(petData.themeColor || defaultTheme);
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
  const setHyg = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ? `${fmtDate(val)} (${daysAgo(val)})` : '—'; };
  setHyg('hyg-bath', hyg.bath);
  setHyg('hyg-nails', hyg.nails);
  setHyg('hyg-ears', hyg.ears);
  setHyg('hyg-teeth', hyg.teeth);

  const wh = petData.weightHistory || [];
  const lastW = wh[0] || (petData.weight ? { weight: petData.weight } : null);
  const wd = document.getElementById('weight-display');
  if (wd) wd.textContent = lastW ? `${lastW.weight} кг` : '— кг';
  const whEl = document.getElementById('weight-history');
  if (whEl) whEl.innerHTML = wh.slice(0, 4).map(w =>
    `<div class="flex justify-between"><span>${fmtDate(w.date)}</span><span class="font-medium">${w.weight} кг</span></div>`
  ).join('') || '';

  renderHealthLists();
  renderHomeWidgets();
  renderPetsList();
  renderFoodsList();
}

function classifyHealth(h) {
  if (h.category) return h.category;
  const t = ((h.title || '') + ' ' + (h.productName || '')).toLowerCase();
  if (/ваксин|vaccine|rabies|рабиес|парвов|каре|лепто/.test(t)) return 'vaccine';
  if (/обезпаразит|deworm|бълх|кърлеж|антипаразит|празицид|нексгард|бравекто|фронтлайн/.test(t)) return 'parasite';
  if (/преглед|ветеринар|операц|хирург/.test(t)) return 'vet';
  return 'other';
}

function healthCardHtml(h) {
  return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-3.5 shadow-sm">
    <div class="flex justify-between gap-2">
      <div class="min-w-0">
        <div class="font-bold text-sm">${h.title}${h.productName ? ' · ' + h.productName : ''}</div>
        <div class="text-[11px] text-slate-400 mt-0.5">${fmtDate(h.date)}${h.nextDate ? ' → следваща ' + fmtDate(h.nextDate) : ''}</div>
        ${h.notes ? `<p class="text-xs mt-1 text-slate-600 dark:text-slate-300">${h.notes}</p>` : ''}
      </div>
      <div class="flex flex-col gap-1 shrink-0">
        <button onclick="editItem('health','${h.id}')" class="text-slate-400 hover:text-teal-600 text-[11px] font-bold">✎</button>
        <button onclick="deleteItem('health','${h.id}')" class="text-slate-400 hover:text-red-500 text-sm">✕</button>
      </div>
    </div>
  </div>`;
}

function renderHealthLists() {
  const items = [...(petData.health || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const vaccines = items.filter(h => classifyHealth(h) === 'vaccine');
  const parasites = items.filter(h => classifyHealth(h) === 'parasite');
  const other = items.filter(h => !['vaccine', 'parasite'].includes(classifyHealth(h)));

  const empty = (t) => `<p class="text-xs text-slate-400 text-center py-6">${t}</p>`;
  const setList = (id, arr, emptyMsg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = arr.length ? arr.map(healthCardHtml).join('') : empty(emptyMsg);
  };
  setList('health-recent-list', items.slice(0, 5), 'Няма записи още');
  setList('health-vaccine-list', vaccines, 'Няма записани ваксини');
  setList('health-parasite-list', parasites, 'Няма записано обезпаразитяване');
  setList('health-other-list', other, 'Няма други здравни записи');

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter(h => h.nextDate && h.nextDate >= todayStr).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const nextEl = document.getElementById('next-health-summary');
  if (nextEl) {
    nextEl.textContent = upcoming[0] ? `${upcoming[0].title} · ${fmtDate(upcoming[0].nextDate)}` : 'Няма планирани';
  }
}

let healthSub = 'overview';
function setHealthSub(id) {
  healthSub = id;
  ['overview', 'vaccine', 'parasite', 'care'].forEach(s => {
    document.getElementById('health-sub-' + s)?.classList.toggle('hidden', s !== id);
    const btn = document.getElementById('hsub-' + s);
    if (btn) {
      btn.classList.toggle('bg-white', s === id);
      btn.classList.toggle('dark:bg-slate-900', s === id);
      btn.classList.toggle('shadow-sm', s === id);
      btn.classList.toggle('text-teal-700', s === id);
      btn.classList.toggle('text-slate-500', s !== id);
    }
  });
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
    const theme = petThemeOf(p);
    const av = p.photoURL
      ? `<img src="${p.photoURL}" class="w-11 h-11 rounded-xl object-cover" alt="">`
      : `<div class="w-11 h-11 rounded-xl text-white flex items-center justify-center text-xl" style="background:linear-gradient(135deg,${theme},${theme}cc)">${em}</div>`;
    return `<button onclick="switchToPet('${p.id}')" class="w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left ${active ? '' : 'border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900'}" ${active ? `style="border-color:${theme};background:${theme}14"` : ''}>
      ${av}
      <div class="flex-1 min-w-0"><div class="font-bold text-sm">${p.name}</div>
      <div class="text-[11px] text-slate-400">${{ dog: 'Куче', cat: 'Котка', other: 'Друго' }[p.type] || ''}</div></div>
      ${active ? `<span class="text-[10px] font-bold" style="color:${theme}">активен</span>` : ''}
    </button>`;
  }).join('');
}

// —— Customize UI (live preview) ——
function openCustomize() {
  document.getElementById('customize-screen').classList.remove('hidden');
  renderCustomizeBoard();
}
function closeCustomize() {
  document.getElementById('customize-screen').classList.add('hidden');
  saveWidgets(widgetConfig);
  renderHomeWidgets();
}

function renderCustomizeBoard() {
  const board = document.getElementById('customize-board');
  if (!board) return;
  widgetConfig = sortWidgets(widgetConfig);
  board.innerHTML = widgetConfig.map((w, i) => {
    const def = WIDGET_DEFS.find(d => d.id === w.id) || { label: w.id, icon: '📦' };
    const activeCls = w.on
      ? 'bg-white dark:bg-slate-900 border-teal-500 shadow-md ring-1 ring-teal-500/30'
      : 'bg-stone-200/50 dark:bg-slate-800/40 border-stone-300/50 dark:border-slate-700 opacity-50';
    const span = sizeClass(w.size);
    const h = w.size === 's' ? 'min-h-[64px]' : (w.size === 'm' ? 'min-h-[110px]' : 'min-h-[140px]');
    return `<div draggable="true"
      data-idx="${i}"
      ondragstart="widgetDragStart(event,${i})"
      ondragover="widgetDragOver(event)"
      ondrop="widgetDrop(event,${i})"
      ondragend="widgetDragEnd(event)"
      onclick="widgetTapToggle(${i}, event)"
      class="customize-tile ${span} ${h} rounded-2xl border-2 p-3 flex flex-col cursor-grab active:cursor-grabbing select-none transition ${activeCls}">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-lg">${def.icon}</span>
        <span class="text-xs font-bold flex-1 truncate ${w.on ? '' : 'text-slate-500'}">${def.label}</span>
        <span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${w.on ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300' : 'bg-stone-300 text-slate-600'}">${w.on ? 'ON' : 'OFF'}</span>
      </div>
      <div class="flex-1 flex items-end justify-between gap-1 mt-auto">
        <span class="text-[10px] text-slate-400">⠿ влачи</span>
        <button type="button" onclick="event.stopPropagation();cycleWidgetSize(${i})"
          class="text-[10px] font-bold px-2 py-1 rounded-lg bg-stone-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-stone-200 dark:border-slate-600">
          ${SIZE_LABELS[w.size] || 'Голям'} ▸
        </button>
      </div>
    </div>`;
  }).join('');
}

let _dragIdx = null;
function widgetDragStart(e, i) {
  _dragIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('opacity-40', 'scale-95');
}
function widgetDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function widgetDrop(e, toIdx) {
  e.preventDefault();
  e.stopPropagation();
  if (_dragIdx === null || _dragIdx === toIdx) return;
  const list = [...widgetConfig];
  const [item] = list.splice(_dragIdx, 1);
  list.splice(toIdx, 0, item);
  saveWidgets(list);
  renderCustomizeBoard();
  renderHomeWidgets();
  _dragIdx = null;
}
function widgetDragEnd(e) {
  e.currentTarget.classList.remove('opacity-40', 'scale-95');
  _dragIdx = null;
}
function widgetTapToggle(i, e) {
  // ignore if click was on size button (stopPropagation handles) or during drag
  if (e && e.target.closest('button')) return;
  widgetConfig[i].on = !widgetConfig[i].on;
  saveWidgets(widgetConfig);
  renderCustomizeBoard();
  renderHomeWidgets();
}
function cycleWidgetSize(i) {
  const cur = widgetConfig[i].size || 'l';
  const next = SIZE_ORDER[(SIZE_ORDER.indexOf(cur) + 1) % SIZE_ORDER.length];
  widgetConfig[i].size = next;
  saveWidgets(widgetConfig);
  renderCustomizeBoard();
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
  localStorage.setItem('petpulse_remind_plans', document.getElementById('toggle-remind-plans')?.checked ? '1' : '0');
  renderHomeWidgets();
  scheduleLocalReminders();
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
  window._editId = null;
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
      </div>
      ${multiPetPickerHtml()}`;
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
      <input id="m-amount" type="number" placeholder="65" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      ${multiPetPickerHtml()}`;
    setTimeout(() => {
      const sel = document.getElementById('m-food-id');
      if (sel) sel.addEventListener('change', () => {
        document.getElementById('m-other-wrap').classList.toggle('hidden', sel.value !== '__other');
      });
    }, 50);
  } else if (type === 'health') {
    body.innerHTML = `
      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1.5">Категория</label>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" data-cat="vaccine" onclick="window._healthCat='vaccine';document.querySelectorAll('[data-cat]').forEach(b=>b.classList.remove('border-teal-500','bg-teal-50'));this.classList.add('border-teal-500','bg-teal-50')" class="py-2.5 rounded-xl border-2 border-teal-500 bg-teal-50 text-xs font-bold">💉 Ваксина</button>
          <button type="button" data-cat="parasite" onclick="window._healthCat='parasite';document.querySelectorAll('[data-cat]').forEach(b=>b.classList.remove('border-teal-500','bg-teal-50'));this.classList.add('border-teal-500','bg-teal-50')" class="py-2.5 rounded-xl border-2 border-stone-200 text-xs font-bold">🐛 Обезпаразитяване</button>
          <button type="button" data-cat="vet" onclick="window._healthCat='vet';document.querySelectorAll('[data-cat]').forEach(b=>b.classList.remove('border-teal-500','bg-teal-50'));this.classList.add('border-teal-500','bg-teal-50')" class="py-2.5 rounded-xl border-2 border-stone-200 text-xs font-bold">🏥 Преглед</button>
          <button type="button" data-cat="other" onclick="window._healthCat='other';document.querySelectorAll('[data-cat]').forEach(b=>b.classList.remove('border-teal-500','bg-teal-50'));this.classList.add('border-teal-500','bg-teal-50')" class="py-2.5 rounded-xl border-2 border-stone-200 text-xs font-bold">📋 Друго</button>
        </div>
      </div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Заглавие</label>
      <input id="m-title" type="text" placeholder="напр. Рабиес / NexGard" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Продукт / лекарство</label>
      <input id="m-product" type="text" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
        <input id="m-date" type="date" value="${today}" class="w-full px-3 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
        <div><label class="block text-xs font-semibold text-slate-400 mb-1">Следваща</label>
        <input id="m-next" type="date" class="w-full px-3 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none"></div>
      </div>
      <textarea id="m-notes" rows="2" placeholder="Бележки" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea>`;
    window._healthCat = 'vaccine';
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
    if (window._editId) {
      const eid = window._editId;
      petData.walks = (petData.walks || []).map(w => w.id === eid ? { ...w, ...item, id: eid } : w);
      try {
        await db.collection('pets').doc(currentPetId).update({ walks: petData.walks });
        closeModal();
      } catch (e) { alert('Грешка: ' + e.message); }
      return;
    }
    const targets = getSelectedPetTargets();
    try {
      await Promise.all(targets.map(async (pid, i) => {
        const entry = { ...item, id: item.id + '_' + i };
        if (pid === currentPetId) {
          petData.walks = [entry, ...(petData.walks || [])];
          await db.collection('pets').doc(pid).update({ walks: petData.walks });
        } else {
          const snap = await db.collection('pets').doc(pid).get();
          const walks = [entry, ...(snap.data()?.walks || [])];
          await db.collection('pets').doc(pid).update({ walks });
        }
      }));
      closeModal();
      return;
    } catch (e) { alert('Грешка: ' + e.message); return; }
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
    if (window._editId) {
      const eid = window._editId;
      petData.meals = (petData.meals || []).map(m => m.id === eid ? { ...m, ...item, id: eid } : m);
      try {
        await db.collection('pets').doc(currentPetId).update({ meals: petData.meals });
        closeModal();
      } catch (e) { alert('Грешка: ' + e.message); }
      return;
    }
    const targets = getSelectedPetTargets();
    try {
      await Promise.all(targets.map(async (pid, i) => {
        const entry = { ...item, id: item.id + '_' + i };
        if (pid === currentPetId) {
          petData.meals = [entry, ...(petData.meals || [])];
          await db.collection('pets').doc(pid).update({ meals: petData.meals });
        } else {
          const snap = await db.collection('pets').doc(pid).get();
          const meals = [entry, ...(snap.data()?.meals || [])];
          await db.collection('pets').doc(pid).update({ meals });
        }
      }));
      closeModal();
      return;
    } catch (e) { alert('Грешка: ' + e.message); return; }
  } else if (activeModalType === 'health') {
    item.title = document.getElementById('m-title').value || 'Запис';
    item.productName = document.getElementById('m-product').value.trim();
    item.date = document.getElementById('m-date').value;
    item.nextDate = document.getElementById('m-next').value;
    item.notes = document.getElementById('m-notes').value;
    item.category = window._healthCat || 'other';
    if (window._editId) {
      const eid = window._editId;
      petData.health = (petData.health || []).map(h => h.id === eid ? { ...h, ...item, id: eid } : h);
    } else {
      petData.health = [item, ...(petData.health || [])];
    }
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

function editItem(type, id) {
  let item = null;
  if (type === 'walk') item = (petData.walks || []).find(x => x.id === id);
  if (type === 'meal') item = (petData.meals || []).find(x => x.id === id);
  if (type === 'health') item = (petData.health || []).find(x => x.id === id);
  if (!item) return;
  openModal(type);
  window._editId = id;
  document.getElementById('modal-title').textContent = 'Редакция';
  setTimeout(() => {
    if (type === 'walk') {
      if (item.time) document.getElementById('m-time').value = item.time;
      if (item.duration) document.getElementById('m-duration').value = item.duration;
      if (item.weather) selectWeather(item.weather);
      if (item.place) {
        document.getElementById('m-place').value = item.place;
        document.getElementById('m-place-search').value = item.place;
        document.getElementById('m-place-label').textContent = '✓ ' + item.place;
      }
      if (item.lat) document.getElementById('m-lat').value = item.lat;
      if (item.lng) document.getElementById('m-lng').value = item.lng;
    }
    if (type === 'meal') {
      if (item.time) document.getElementById('m-time').value = item.time;
      if (item.amount) document.getElementById('m-amount').value = item.amount;
      const sel = document.getElementById('m-food-id');
      if (sel && item.foodId) sel.value = item.foodId;
      if (item.foodType === 'other' || (!item.foodId && item.foodName)) {
        if (sel) sel.value = '__other';
        document.getElementById('m-other-wrap')?.classList.remove('hidden');
        const o = document.getElementById('m-food-other');
        if (o) o.value = item.foodName || '';
      }
    }
    if (type === 'health') {
      if (item.title) document.getElementById('m-title').value = item.title;
      if (item.productName) document.getElementById('m-product').value = item.productName;
      if (item.date) document.getElementById('m-date').value = item.date;
      if (item.nextDate) document.getElementById('m-next').value = item.nextDate;
      if (item.notes) document.getElementById('m-notes').value = item.notes;
      if (item.category) {
        window._healthCat = item.category;
        document.querySelectorAll('[data-cat]').forEach(b => {
          const on = b.getAttribute('data-cat') === item.category;
          b.classList.toggle('border-teal-500', on);
          b.classList.toggle('bg-teal-50', on);
        });
      }
    }
  }, 50);
}

function editPlan(id) {
  const item = (petData.plans || []).find(x => x.id === id);
  if (!item) return;
  openModal('plan');
  window._editId = id;
  document.getElementById('modal-title').textContent = 'Редакция на план';
  setTimeout(() => {
    const t = document.getElementById('m-plan-title');
    const d = document.getElementById('m-plan-date');
    const tm = document.getElementById('m-plan-time');
    const n = document.getElementById('m-plan-notes');
    if (t) t.value = item.title || '';
    if (d) d.value = item.date || '';
    if (tm) tm.value = item.time || '';
    if (n) n.value = item.notes || '';
  }, 50);
}

function bagEstimate(f) {
  if (!f.bagKg) return '';
  const totalG = Number(f.bagKg) * 1000;
  let used = 0;
  (petData.meals || []).forEach(m => {
    if (m.foodId === f.id && m.amount) used += Number(m.amount) || 0;
  });
  const left = Math.max(0, totalG - used);
  const leftKg = (left / 1000).toFixed(left >= 1000 ? 1 : 2);
  // avg daily from last 14 days for this food
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
  const cutStr = cutoff.toISOString().slice(0, 10);
  let recent = 0, days = new Set();
  (petData.meals || []).forEach(m => {
    if (m.foodId === f.id && m.amount && m.date && m.date >= cutStr) {
      recent += Number(m.amount) || 0;
      days.add(m.date);
    }
  });
  const dayCount = Math.max(days.size, 1);
  const avg = recent / dayCount;
  if (avg > 0) {
    const daysLeft = Math.floor(left / avg);
    return `≈ ${leftKg} кг остават · ~${daysLeft} дни при ~${Math.round(avg)} г/ден`;
  }
  return used > 0 ? `≈ ${leftKg} кг остават (използвани ${Math.round(used)} г)` : `чувал ${f.bagKg} кг (още няма порции)`;
}

async function removeMember(uid) {
  if (!isPetCreator()) return alert('Само създателят може да премахва стопани.');
  if (uid === currentUser.uid) return alert('Не можеш да премахнеш себе си.');
  if (!confirm('Премахване на този стопанин от любимеца?')) return;
  const members = (petData.members || []).filter(id => id !== uid);
  const usersMeta = { ...(petData.usersMeta || {}) };
  delete usersMeta[uid];
  petData.members = members;
  petData.usersMeta = usersMeta;
  await db.collection('pets').doc(currentPetId).update({ members, usersMeta });
  renderMembersManage();
}

function renderMembersManage() {
  const el = document.getElementById('members-manage-list');
  if (!el) return;
  const meta = petData.usersMeta || {};
  const members = petData.members || [];
  el.innerHTML = members.map(uid => {
    const m = meta[uid] || { name: 'Стопанин' };
    const isMe = uid === currentUser.uid;
    const canRemove = isPetCreator() && !isMe;
    return `<div class="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 dark:bg-slate-800">
      <span class="text-sm font-semibold">${m.name || 'Стопанин'}${isMe ? ' (ти)' : ''}</span>
      ${canRemove ? `<button onclick="removeMember('${uid}')" class="text-[11px] font-bold text-red-500">Премахни</button>` : '<span class="text-[10px] text-slate-400">—</span>'}
    </div>`;
  }).join('') || '<p class="text-xs text-slate-400">Само ти</p>';
}

async function enableBrowserNotifications() {
  const status = document.getElementById('notify-status');
  if (!('Notification' in window)) {
    if (status) status.textContent = 'Браузърът не поддържа известия.';
    return;
  }
  const perm = await Notification.requestPermission();
  if (status) status.textContent = perm === 'granted' ? 'Известията са включени.' : 'Разрешението е отказано.';
  if (perm === 'granted') scheduleLocalReminders();
}

function scheduleLocalReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !petData) return;
  const today = new Date().toISOString().slice(0, 10);
  const key = 'petpulse_notified_' + (currentPetId || '') + '_' + today;
  if (localStorage.getItem(key) === '1') return;

  const msgs = [];
  const showBath = localStorage.getItem('petpulse_remind_bath') !== '0';
  const showDeworm = localStorage.getItem('petpulse_remind_deworm') !== '0';
  const showPlans = localStorage.getItem('petpulse_remind_plans') !== '0';

  if (showPlans) {
    (petData.health || []).forEach(h => {
      if (h.nextDate && h.nextDate <= today) msgs.push(`${h.title} – срок ${fmtDate(h.nextDate)}`);
    });
    (petData.plans || []).forEach(p => {
      if (p.date === today) msgs.push(`План днес: ${p.title}`);
      if (p.date && p.date < today) msgs.push(`Просрочен план: ${p.title}`);
    });
  }
  if (showBath && petData.hygiene?.bath) {
    const days = Math.floor((Date.now() - new Date(petData.hygiene.bath + 'T00:00:00')) / 86400000);
    if (days >= 30) msgs.push(`Къпане – последно преди ${days} дни`);
  }
  if (showDeworm) {
    const deworm = (petData.health || []).filter(h => classifyHealth(h) === 'parasite' && h.nextDate);
    deworm.forEach(h => {
      if (h.nextDate <= today) msgs.push(`Обезпаразитяване: ${h.title}`);
    });
  }

  if (msgs.length) {
    try {
      new Notification('PetPulse · ' + (petData.name || 'Любимец'), {
        body: msgs.slice(0, 3).join('\n'),
        tag: 'petpulse-' + currentPetId + '-' + today
      });
      localStorage.setItem(key, '1');
    } catch (e) { /* ignore */ }
  }
}

// Offline banner
window.addEventListener('online', () => document.getElementById('offline-banner')?.classList.add('hidden'));
window.addEventListener('offline', () => document.getElementById('offline-banner')?.classList.remove('hidden'));
if (typeof navigator !== 'undefined' && !navigator.onLine) {
  document.getElementById('offline-banner')?.classList.remove('hidden');
}

function switchTab(id) {
  closeFab();
  ['home', 'health', 'pets', 'calendar'].forEach(t => {
    const pane = document.getElementById('tab-' + t);
    if (pane) {
      if (t === id) pane.classList.add('active');
      else pane.classList.remove('active');
    }
    const nav = document.getElementById('nav-' + t);
    if (nav) {
      nav.classList.toggle('text-teal-600', t === id);
      nav.classList.toggle('text-slate-400', t !== id);
    }
  });
  if (id === 'pets') loadUserPets().then(() => { renderPetsList(); renderFoodsList(); });
  if (id === 'home') renderHomeWidgets();
  if (id === 'calendar') renderCalendar();
  if (id === 'health') setHealthSub(healthSub || 'overview');
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

// —— Pet AI chat (shared history + shared API key on pet document) ——

function getAiSettings() {
  const s = petData.aiSettings || {};
  return {
    mode: s.mode || 'pet',
    customName: s.customName || '',
    customType: s.customType || 'dog',
    style: s.style || 'friendly',
    apiKey: s.apiKey || ''
  };
}

function isPetCreator() {
  if (!currentUser) return false;
  if (petData.creatorUid) return petData.creatorUid === currentUser.uid;
  // fallback: first member
  return (petData.members || [])[0] === currentUser.uid;
}

function typeEmoji(t) {
  return ({ dog: '🐕', cat: '🐈', hamster: '🐹', rabbit: '🐰', bird: '🐦', other: '🐾' })[t] || '🐾';
}
function typeWord(t) {
  return ({ dog: 'куче', cat: 'котка', hamster: 'хамстер', rabbit: 'заек', bird: 'птица', other: 'създание' })[t] || 'създание';
}
function petEmoji() {
  return typeEmoji(petData.type || 'dog');
}
function petSpeciesWord() {
  return typeWord(petData.type || 'dog');
}

function aiDisplayName() {
  const s = getAiSettings();
  if (s.mode === 'custom' && s.customName) return s.customName;
  if (s.mode === 'standard') return 'Асистент';
  return petData.name || 'Аз';
}
function aiDisplayEmoji() {
  const s = getAiSettings();
  if (s.mode === 'custom') return typeEmoji(s.customType);
  if (s.mode === 'standard') return '✨';
  return petEmoji();
}

function styleInstruction(style) {
  const map = {
    friendly: 'Тон: топъл, грижовен, спокоен. Говори като добър приятел.',
    strict: 'Тон: строг, сериозен, кратък. Без шеги. Ясни правила и предупреждения.',
    humor: 'Тон: с лек хумор и остроумие, но пак полезен. Уместни шеги.',
    playful: 'Тон: игрив, енергичен, ентусиазиран. Много животински характер.',
    teasing: 'Тон: закачлив, леко подигравателен с любов, но никога обиден. Леко заяждане към стопанина.'
  };
  return map[style] || map.friendly;
}

function buildPetPersonaPrompt() {
  const s = getAiSettings();
  const context = {
    realPetName: petData.name, realType: petData.type, breed: petData.breed,
    weight: petData.weight, birthdate: petData.birthdate, gender: petData.gender,
    allergies: petData.allergies, habits: petData.habits,
    foods: (petData.foods || []).filter(f => f.active && !f.archived).map(f => ({
      name: f.name, type: f.type, notes: f.notes || ''
    })),
    recentHealth: (petData.health || []).slice(0, 10).map(h => ({
      title: h.title, product: h.productName, date: h.date, next: h.nextDate, category: h.category
    })),
    hygiene: petData.hygiene,
    recentWalks: (petData.walks || []).slice(0, 5).map(w => ({ date: w.date, min: w.duration, place: w.place, weather: w.weather }))
  };

  const styleLine = styleInstruction(s.style);

  if (s.mode === 'standard') {
    return `Ти си полезен асистент в приложението PetPulse за домашни любимци.
Отговаряй на български. ${styleLine}
Не се представяй като животно. Бъди ясен и практичен. При съмнение – препоръчай ветеринар.
Данни за любимеца: ${JSON.stringify(context)}`;
  }

  const name = s.mode === 'custom' && s.customName ? s.customName : (petData.name || 'Аз');
  const species = s.mode === 'custom' ? typeWord(s.customType) : petSpeciesWord();
  const breedBit = (s.mode === 'pet' && petData.breed) ? ` (${petData.breed})` : '';

  return `Ти си ${name}, ${species}${breedBit}. Говори ВИНАГИ в първо лице като ${name}, на български.
Не казвай, че си AI, Gemini, език модел или робот. Ти си ${name}.
${styleLine}
Бъди кратък. Ако питат „мога ли да ти дам X“ – отговори от мое име с безопасен съвет.
При сериозни медицински съмнения подскажи ветеринар, пак от мое лице.
Реални факти за домашния любимец в приложението (използвай ги): ${JSON.stringify(context)}`;
}

function openGeminiChat() {
  document.getElementById('gemini-screen').classList.remove('hidden');
  const name = aiDisplayName();
  document.getElementById('gemini-pet-name').textContent = name;
  const av = document.getElementById('gemini-pet-avatar');
  if (av) av.textContent = aiDisplayEmoji();
  const key = getAiSettings().apiKey;
  const row = document.getElementById('gemini-key-row');
  row.classList.toggle('hidden', !!key);
  const hint = document.getElementById('gemini-key-hint');
  if (hint) {
    hint.textContent = isPetCreator()
      ? 'Няма API ключ. Като създател го сложи в Меню → AI асистент.'
      : 'Създателят на любимеца още не е сложил API ключ. Кажи му да го направи в настройките.';
  }
  renderAiChat();
}

function closeGeminiChat() {
  document.getElementById('gemini-screen').classList.add('hidden');
}

function renderAiChat() {
  const box = document.getElementById('gemini-messages');
  if (!box) return;
  const name = aiDisplayName();
  const emoji = aiDisplayEmoji();
  const msgs = petData.aiChat || [];
  if (!msgs.length) {
    const s = getAiSettings();
    const intro = s.mode === 'standard'
      ? `Здравей! Аз съм асистентът за ${petData.name || 'любимеца'}. Питай за храна, здраве, навици…`
      : `Здравей! Аз съм ${name}. Питай ме каквото искаш – храна, разходки, здраве…`;
    box.innerHTML = `<div class="bg-white dark:bg-slate-900 rounded-2xl p-3.5 text-sm shadow-sm border border-stone-200/80 dark:border-slate-800">
      <div class="font-semibold mb-1">${emoji} ${name}</div>
      ${intro}
      <br><span class="text-[11px] text-slate-400 mt-1 block">Чатът е общ за всички стопани. Не замествам ветеринар 🐾</span>
    </div>`;
    return;
  }
  box.innerHTML = msgs.map(m => {
    if (m.role === 'user') {
      return `<div class="flex justify-end"><div class="bg-teal-600 text-white rounded-2xl rounded-br-md px-3.5 py-2 text-sm max-w-[85%]">
        <div class="text-[10px] text-white/70 mb-0.5">${escHtml(m.authorName || '')}</div>
        ${escHtml(m.text)}
      </div></div>`;
    }
    return `<div class="bg-white dark:bg-slate-900 rounded-2xl rounded-bl-md p-3 text-sm shadow-sm border border-stone-200/80 dark:border-slate-800 max-w-[90%]">
      <div class="text-[10px] font-bold text-amber-600 mb-1">${emoji} ${name}</div>
      <div class="whitespace-pre-wrap">${escHtml(m.text)}</div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggleAiHelp() {
  document.getElementById('ai-help')?.classList.toggle('hidden');
}
function onAiModeChange() {
  const mode = document.getElementById('ai-mode')?.value;
  document.getElementById('ai-custom-fields')?.classList.toggle('hidden', mode !== 'custom');
}

async function saveAiSettings() {
  if (!currentPetId) return;
  const prev = getAiSettings();
  const aiSettings = {
    mode: document.getElementById('ai-mode')?.value || 'pet',
    customName: document.getElementById('ai-custom-name')?.value.trim() || '',
    customType: document.getElementById('ai-custom-type')?.value || 'dog',
    style: document.getElementById('ai-style')?.value || 'friendly',
    apiKey: prev.apiKey // key saved separately
  };
  petData.aiSettings = aiSettings;
  await db.collection('pets').doc(currentPetId).update({ aiSettings });
  // reflect in open chat header
  const n = aiDisplayName();
  const e = aiDisplayEmoji();
  const gn = document.getElementById('gemini-pet-name');
  const av = document.getElementById('gemini-pet-avatar');
  if (gn) gn.textContent = n;
  if (av) av.textContent = e;
  const bn = document.getElementById('ai-pet-btn-name');
  const be = document.getElementById('ai-pet-btn-emoji');
  if (bn) bn.textContent = n;
  if (be) be.textContent = e;
}

async function saveAiApiKey() {
  if (!currentPetId) return;
  if (!isPetCreator()) {
    return alert('Само създателят на любимеца може да зададе API ключ.');
  }
  const k = document.getElementById('ai-api-key')?.value.trim();
  if (!k) return alert('Въведи API ключ');
  const aiSettings = { ...getAiSettings(), apiKey: k };
  petData.aiSettings = aiSettings;
  await db.collection('pets').doc(currentPetId).update({ aiSettings });
  document.getElementById('ai-api-key').value = '';
  document.getElementById('ai-key-status').textContent = 'Ключът е записан. Нина и другите могат да чатят.';
  document.getElementById('gemini-key-row')?.classList.add('hidden');
}

function syncAiSettingsUI() {
  const s = getAiSettings();
  const modeEl = document.getElementById('ai-mode');
  const styleEl = document.getElementById('ai-style');
  const nameEl = document.getElementById('ai-custom-name');
  const typeEl = document.getElementById('ai-custom-type');
  if (modeEl) modeEl.value = s.mode;
  if (styleEl) styleEl.value = s.style;
  if (nameEl) nameEl.value = s.customName;
  if (typeEl) typeEl.value = s.customType;
  onAiModeChange();
  const keyBlock = document.getElementById('ai-key-block');
  const status = document.getElementById('ai-key-status');
  if (keyBlock) {
    // Everyone can see status; only creator edits key
    const creator = isPetCreator();
    document.getElementById('ai-api-key')?.classList.toggle('hidden', !creator);
    document.getElementById('ai-save-key-btn')?.classList.toggle('hidden', !creator);
    if (status) {
      status.textContent = s.apiKey
        ? (creator ? 'Има записан ключ (споделен с членовете).' : 'Ключът е настроен от създателя – можеш да пишеш.')
        : (creator ? 'Няма ключ – сложи го, за да работи чатът.' : 'Чакай създателят да сложи API ключ.');
    }
  }
}

function aiLoadingPhrase() {
  const s = getAiSettings();
  if (s.mode === 'standard') return 'Подготвям отговор…';
  const t = s.mode === 'custom' ? s.customType : (petData.type || 'dog');
  const map = {
    dog: 'Превеждане от кучешки…',
    cat: 'Превеждане от котешки…',
    hamster: 'Превеждане от хамстерски…',
    rabbit: 'Превеждане от заешки…',
    bird: 'Превеждане от птичи…',
    other: 'Превеждане от животински…'
  };
  return map[t] || 'Превеждане от животински…';
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const texts = parts.filter(p => p.text && !p.thought).map(p => p.text);
  if (texts.length) return texts.join('').trim();
  return parts.map(p => p.text).filter(Boolean).join('').trim();
}

async function callGeminiApi(key, contents, systemText) {
  const models = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  let lastErr = '';
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    // try with low/no thinking first; some models reject thinkingConfig
    const configs = [
      { temperature: 0.9, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      { temperature: 0.9, maxOutputTokens: 1024 }
    ];
    for (const generationConfig of configs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 40000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents,
            generationConfig
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        const data = await res.json();
        if (!res.ok) {
          lastErr = data?.error?.message || res.statusText;
          if (/thinking|Unknown name|Invalid/i.test(lastErr)) continue; // try next config
          if (/not found|no longer available|404/i.test(lastErr)) break; // next model
          throw new Error(lastErr);
        }
        const reply = extractGeminiText(data);
        if (!reply) {
          lastErr = 'Празен отговор от модела';
          continue;
        }
        return reply;
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') {
          lastErr = 'Времето изтече – опитай пак';
          break;
        }
        lastErr = e.message || String(e);
        if (/not found|no longer available/i.test(lastErr)) break;
        if (/thinking|Unknown name/i.test(lastErr)) continue;
        throw e;
      }
    }
  }
  throw new Error(lastErr || 'Няма наличен модел');
}

async function sendGemini() {
  const input = document.getElementById('gemini-input');
  const text = input.value.trim();
  if (!text || !currentPetId) return;
  const key = getAiSettings().apiKey;
  if (!key) {
    document.getElementById('gemini-key-row')?.classList.remove('hidden');
    const hint = document.getElementById('gemini-key-hint');
    if (hint) {
      hint.textContent = isPetCreator()
        ? 'Сложи API ключ в Меню → AI асистент.'
        : 'Създателят още не е сложил ключ.';
    }
    return;
  }

  const profile = getUserProfile();
  const userMsg = {
    id: 'c' + Date.now(),
    role: 'user',
    text,
    authorUid: currentUser.uid,
    authorName: profile.name || 'Стопанин',
    createdAt: new Date().toISOString()
  };
  petData.aiChat = [...(petData.aiChat || []), userMsg].slice(-80);
  input.value = '';
  renderAiChat();
  try {
    await db.collection('pets').doc(currentPetId).update({ aiChat: petData.aiChat });
  } catch (e) {
    alert('Не можах да запиша съобщението: ' + e.message);
    return;
  }

  const box = document.getElementById('gemini-messages');
  document.getElementById('ai-loading')?.remove();
  const loading = document.createElement('div');
  loading.className = 'text-xs text-amber-600 dark:text-amber-400 px-1 font-medium animate-pulse';
  loading.id = 'ai-loading';
  loading.textContent = aiLoadingPhrase();
  box.appendChild(loading);
  box.scrollTop = box.scrollHeight;

  const history = (petData.aiChat || []).slice(-16).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));
  while (history.length && history[0].role !== 'user') history.shift();

  try {
    const reply = await callGeminiApi(
      key,
      history.length ? history : [{ role: 'user', parts: [{ text }] }],
      buildPetPersonaPrompt()
    );
    document.getElementById('ai-loading')?.remove();
    const modelMsg = {
      id: 'c' + Date.now() + 'a',
      role: 'model',
      text: reply,
      createdAt: new Date().toISOString()
    };
    petData.aiChat = [...(petData.aiChat || []), modelMsg].slice(-80);
    await db.collection('pets').doc(currentPetId).update({ aiChat: petData.aiChat });
    renderAiChat();
  } catch (e) {
    document.getElementById('ai-loading')?.remove();
    alert('Грешка: ' + e.message);
  }
}

(function patchAiLabels() {
  const prev = renderApp;
  renderApp = function () {
    prev();
    const n = aiDisplayName();
    const e = aiDisplayEmoji();
    const bn = document.getElementById('ai-pet-btn-name');
    const be = document.getElementById('ai-pet-btn-emoji');
    if (bn) bn.textContent = n;
    if (be) be.textContent = e;
    syncAiSettingsUI();
    if (!document.getElementById('gemini-screen')?.classList.contains('hidden')) {
      document.getElementById('gemini-pet-name').textContent = n;
      const av = document.getElementById('gemini-pet-avatar');
      if (av) av.textContent = e;
      renderAiChat();
    }
  };
})();

// —— Drawer navigation ——
function drawerShowRoot() {
  ['root','profile','pet','ai','screen','share'].forEach(p => {
    document.getElementById('drawer-' + p)?.classList.toggle('hidden', p !== 'root');
  });
  document.getElementById('drawer-back')?.classList.add('hidden');
  document.getElementById('drawer-title').textContent = 'Меню';
}
function drawerOpen(panel) {
  ['root','profile','pet','ai','screen','share'].forEach(p => {
    document.getElementById('drawer-' + p)?.classList.toggle('hidden', p !== panel);
  });
  document.getElementById('drawer-back')?.classList.remove('hidden');
  const titles = { profile: 'Моят профил', pet: 'Любимец', ai: 'AI асистент', screen: 'Екран и вид', share: 'Споделяне' };
  document.getElementById('drawer-title').textContent = titles[panel] || 'Меню';
  if (panel === 'profile') syncMyPhotoPreview();
  if (panel === 'pet') syncPetPhotoPreview();
  if (panel === 'ai') syncAiSettingsUI();
  if (panel === 'share') renderMembersManage();
}
function openDrawer() {
  document.getElementById('drawer').classList.add('drawer-open');
  document.getElementById('drawer-backdrop').classList.add('drawer-bg-open');
  drawerShowRoot();
  syncAiSettingsUI();
}

// —— Theme & photos ——
function hexToRgb(hex) {
  const h = (hex || '#0d9488').replace('#', '');
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function darkenHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const d = (v) => Math.max(0, Math.round(v * (1 - amount)));
  return '#' + [d(r), d(g), d(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function applyPetTheme(color) {
  const c = color || '#0d9488';
  const { r, g, b } = hexToRgb(c);
  const root = document.documentElement;
  root.style.setProperty('--pet', c);
  root.style.setProperty('--pet-dark', darkenHex(c, 0.18));
  root.style.setProperty('--pet-soft', `rgba(${r},${g},${b},0.12)`);
  root.style.setProperty('--pet-soft-2', `rgba(${r},${g},${b},0.22)`);
  root.style.setProperty('--pet-ring', `rgba(${r},${g},${b},0.35)`);
  // mark selected theme chip in drawer
  document.querySelectorAll('[data-theme-color]').forEach(btn => {
    btn.classList.toggle('theme-chip', btn.getAttribute('data-theme-color') === c);
  });
}
async function setPetTheme(color) {
  if (!currentPetId) return;
  petData.themeColor = color;
  await db.collection('pets').doc(currentPetId).update({ themeColor: color });
  applyPetTheme(color);
}
function compressImage(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadMyPhoto(ev) {
  const file = ev.target.files?.[0];
  if (!file || !currentPetId) return;
  try {
    const dataUrl = await compressImage(file, 256, 0.7);
    const cur = (petData.usersMeta || {})[currentUser.uid] || {};
    if (!petData.usersMeta) petData.usersMeta = {};
    petData.usersMeta[currentUser.uid] = { ...cur, photoURL: dataUrl };
    await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
    syncMyPhotoPreview();
  } catch (e) { alert('Грешка при качване: ' + e.message); }
}
async function uploadPetPhoto(ev) {
  const file = ev.target.files?.[0];
  if (!file || !currentPetId) return;
  try {
    const dataUrl = await compressImage(file, 400, 0.75);
    petData.photoURL = dataUrl;
    await db.collection('pets').doc(currentPetId).update({ photoURL: dataUrl });
    syncPetPhotoPreview();
  } catch (e) { alert('Грешка при качване: ' + e.message); }
}
function syncMyPhotoPreview() {
  const el = document.getElementById('my-photo-preview');
  if (!el) return;
  const m = (petData.usersMeta || {})[currentUser.uid] || {};
  if (m.photoURL) el.innerHTML = `<img src="${m.photoURL}" class="w-full h-full object-cover" alt="">`;
  else el.textContent = m.avatar || '👤';
}
function syncPetPhotoPreview() {
  const el = document.getElementById('pet-photo-preview');
  if (!el) return;
  if (petData.photoURL) el.innerHTML = `<img src="${petData.photoURL}" class="w-full h-full object-cover" alt="">`;
  else el.textContent = petEmoji();
}

// —— Calendar / plans ——
function renderCalendar() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const label = document.getElementById('calendar-month-label');
  if (label) label.textContent = now.toLocaleDateString('bg-BG', { month: 'long', year: 'numeric' });
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const first = new Date(y, m, 1);
  const startDay = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const plans = petData.plans || [];
  const healthNext = (petData.health || []).filter(h => h.nextDate);
  const dots = {};
  plans.forEach(p => { if (p.date) dots[p.date] = (dots[p.date] || 0) + 1; });
  healthNext.forEach(h => { dots[h.nextDate] = (dots[h.nextDate] || 0) + 1; });
  const todayStr = now.toISOString().slice(0, 10);
  let html = ['П','В','С','Ч','П','С','Н'].map(d => `<div class="text-slate-400 font-semibold py-1">${d}</div>`).join('');
  for (let i = 0; i < startDay; i++) html += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = ds === todayStr;
    const has = dots[ds];
    html += `<button onclick="showDayPlans('${ds}')" class="aspect-square rounded-xl flex flex-col items-center justify-center ${isToday ? 'bg-teal-600 text-white font-bold' : 'hover:bg-stone-200 dark:hover:bg-slate-800'}">
      <span>${d}</span>
      ${has ? `<span class="w-1 h-1 rounded-full ${isToday?'bg-white':'bg-amber-500'} mt-0.5"></span>` : ''}
    </button>`;
  }
  grid.innerHTML = html;

  const upcoming = [
    ...plans.map(p => ({ ...p, kind: 'plan' })),
    ...healthNext.map(h => ({ id: h.id, title: h.title, date: h.nextDate, notes: 'От здравен запис', kind: 'health' }))
  ].filter(x => x.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);

  const list = document.getElementById('calendar-upcoming');
  if (!list) return;
  list.innerHTML = upcoming.length ? upcoming.map(u => `
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-stone-200/80 dark:border-slate-800 p-3.5 flex justify-between gap-2">
      <div>
        <div class="font-bold text-sm">${u.title}</div>
        <div class="text-[11px] text-slate-400">${fmtDate(u.date)}${u.notes ? ' · ' + u.notes : ''}</div>
      </div>
      ${u.kind === 'plan' ? `<div class="flex gap-1"><button onclick="editPlan('${u.id}')" class="text-slate-400 hover:text-teal-600 text-[11px] font-bold">✎</button><button onclick="deletePlan('${u.id}')" class="text-slate-400 hover:text-red-500 text-sm">✕</button></div>` : ''}
    </div>`).join('') : `<p class="text-xs text-slate-400 text-center py-6">Няма планирани събития</p>`;
}
function showDayPlans(ds) {
  const items = (petData.plans || []).filter(p => p.date === ds);
  if (!items.length) {
    if (confirm('Няма планове за ' + fmtDate(ds) + '. Добави?')) {
      openModal('plan');
      setTimeout(() => { const el = document.getElementById('m-plan-date'); if (el) el.value = ds; }, 100);
    }
    return;
  }
  alert(items.map(i => i.title + (i.notes ? ' – ' + i.notes : '')).join('\n'));
}
async function deletePlan(id) {
  if (!confirm('Изтриване на плана?')) return;
  petData.plans = (petData.plans || []).filter(p => p.id !== id);
  await db.collection('pets').doc(currentPetId).update({ plans: petData.plans });
  renderCalendar();
  renderHomeWidgets();
}

// Extend openModal for plan
const _openModalOrig = openModal;
openModal = function (type) {
  if (type === 'plan') {
    activeModalType = 'plan';
    document.getElementById('modal-title').textContent = 'Планирай';
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('modal-body').innerHTML = `
      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1">Какво</label>
        <input id="m-plan-title" type="text" placeholder="Ваксина / Голяма разходка / Груминг…" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
        <input id="m-plan-date" type="date" value="${today}" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-400 mb-1">Час (по избор)</label>
        <input id="m-plan-time" type="time" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none">
      </div>
      <textarea id="m-plan-notes" rows="2" placeholder="Бележки" class="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea>`;
    document.getElementById('modal').classList.remove('hidden');
    return;
  }
  _openModalOrig(type);
};
const _saveModalOrig = saveModal;
saveModal = async function () {
  if (activeModalType === 'plan') {
    const title = document.getElementById('m-plan-title')?.value.trim();
    if (!title) return alert('Въведи заглавие');
    if (window._editId) {
      const eid = window._editId;
      petData.plans = (petData.plans || []).map(p => p.id === eid ? {
        ...p,
        title,
        date: document.getElementById('m-plan-date')?.value,
        time: document.getElementById('m-plan-time')?.value || '',
        notes: document.getElementById('m-plan-notes')?.value.trim() || ''
      } : p);
    } else {
      const item = {
        id: 'p' + Date.now(),
        title,
        date: document.getElementById('m-plan-date')?.value,
        time: document.getElementById('m-plan-time')?.value || '',
        notes: document.getElementById('m-plan-notes')?.value.trim() || '',
        authorUid: currentUser.uid,
        createdAt: new Date().toISOString()
      };
      petData.plans = [item, ...(petData.plans || [])];
    }
    await db.collection('pets').doc(currentPetId).update({ plans: petData.plans });
    closeModal();
    renderCalendar();
    renderHomeWidgets();
    return;
  }
  return _saveModalOrig();
};

// FAB emoji sync + reminders
(function patchFabEmoji() {
  const prev = renderApp;
  renderApp = function () {
    prev();
    const fab = document.getElementById('ai-fab-emoji');
    if (fab) fab.textContent = aiDisplayEmoji();
    try { scheduleLocalReminders(); } catch (e) {}
  };
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
