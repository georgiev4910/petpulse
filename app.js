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

(function () {
  const saved = localStorage.getItem('petpulse_dark');
  if (saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();

function hideAllScreens() {
  ['splash','auth-screen','choice-screen','join-screen','newpet-screen','app'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

auth.onAuthStateChanged(async (user) => {
  const splash = document.getElementById('splash');
  if (splash) splash.classList.add('hidden');

  if (user) {
    currentUser = user;
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
    // No pets → choice screen
    hideAllScreens();
    document.getElementById('choice-screen').classList.remove('hidden');
  } catch (e) {
    hideAllScreens();
    document.getElementById('choice-screen').classList.remove('hidden');
  }
}

function backToChoice() {
  hideAllScreens();
  document.getElementById('choice-screen').classList.remove('hidden');
}

function showJoinForm() {
  hideAllScreens();
  document.getElementById('join-screen').classList.remove('hidden');
  document.getElementById('join-my-name').value = currentUser.email.split('@')[0];
}

function showNewPetForm() {
  hideAllScreens();
  document.getElementById('newpet-screen').classList.remove('hidden');
  document.getElementById('np-my-name').value = currentUser.email.split('@')[0];
  // Prefill Max example
  document.getElementById('np-name').value = 'Макс';
  document.getElementById('np-breed').value = 'Джак Ръсел териер';
  document.getElementById('np-weight').value = '7.2';
  const bd = new Date(); bd.setMonth(bd.getMonth() - 8);
  document.getElementById('np-birthdate').value = bd.toISOString().slice(0, 10);
  selectPetType('dog');
}

function selectPetType(type) {
  selectedType = type;
  ['dog', 'cat', 'other'].forEach(t => {
    const btn = document.getElementById('type-' + t);
    if (!btn) return;
    if (t === type) {
      btn.classList.add('border-sky-500', 'bg-sky-50', 'dark:bg-sky-950/30');
      btn.classList.remove('border-slate-200', 'dark:border-slate-700');
    } else {
      btn.classList.remove('border-sky-500', 'bg-sky-50', 'dark:bg-sky-950/30');
      btn.classList.add('border-slate-200', 'dark:border-slate-700');
    }
  });
}

async function createPet() {
  const myName = document.getElementById('np-my-name').value.trim() || currentUser.email.split('@')[0];
  const name = document.getElementById('np-name').value.trim();
  if (!name) return alert('Въведи име на любимеца');

  const btn = document.getElementById('create-pet-btn');
  btn.disabled = true;
  btn.textContent = 'Създаване...';

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const usersMeta = {
    [currentUser.uid]: { name: myName, avatar: '👤', color: '#0ea5e9' }
  };

  const newPet = {
    name,
    type: selectedType,
    breed: document.getElementById('np-breed').value.trim(),
    birthdate: document.getElementById('np-birthdate').value,
    weight: parseFloat(document.getElementById('np-weight').value) || null,
    gender: document.getElementById('np-gender').value,
    passport: document.getElementById('np-passport').value.trim(),
    chip: document.getElementById('np-chip').value.trim(),
    foodBrandModel: document.getElementById('np-food').value.trim(),
    foodBagKg: parseFloat(document.getElementById('np-bag').value) || 12,
    trackFood: true,
    allergies: '',
    dislikes: '',
    habits: '',
    hygiene: { bath: '', nails: '', ears: '', teeth: '' },
    weightHistory: [],
    code,
    members: [currentUser.uid],
    usersMeta,
    walks: [],
    meals: [],
    health: []
  };

  try {
    const ref = await db.collection('pets').add(newPet);
    currentPetId = ref.id;
    localStorage.setItem('petpulse_active_pet', currentPetId);
    await loadUserPets();
    startPetListener();
  } catch (e) {
    alert('Грешка: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Създай профил на любимеца';
  }
}

async function joinWithCode() {
  const code = document.getElementById('invite-code-input').value.trim().toUpperCase();
  const myName = document.getElementById('join-my-name').value.trim() || currentUser.email.split('@')[0];
  if (!code) return alert('Въведи код');

  try {
    const snap = await db.collection('pets').where('code', '==', code).limit(1).get();
    if (snap.empty) return alert('Невалиден код');
    const petDoc = snap.docs[0];
    const data = petDoc.data();
    const members = data.members || [];
    if (!members.includes(currentUser.uid)) members.push(currentUser.uid);
    const usersMeta = data.usersMeta || {};
    usersMeta[currentUser.uid] = { name: myName, avatar: '👤', color: '#10b981' };
    await petDoc.ref.update({ members, usersMeta });
    currentPetId = petDoc.id;
    localStorage.setItem('petpulse_active_pet', currentPetId);
    await loadUserPets();
    startPetListener();
  } catch (e) {
    alert('Грешка: ' + e.message);
  }
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
    if (doc.exists) {
      petData = doc.data();
      renderApp();
    }
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

function renderApp() {
  const emoji = petData.type === 'cat' ? '🐈' : (petData.type === 'dog' ? '🐕' : '🐾');
  document.getElementById('pet-title-name').textContent = petData.name || 'Любимец';
  document.getElementById('pet-avatar-box').textContent = emoji;
  document.getElementById('profile-pet-name').textContent = petData.name || 'любимеца';
  document.getElementById('share-code-display').value = petData.code || '';

  // Profile fields
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

  // Hygiene
  const hyg = petData.hygiene || {};
  document.getElementById('hyg-bath').textContent = hyg.bath ? `${fmtDate(hyg.bath)} (${daysAgo(hyg.bath)})` : '—';
  document.getElementById('hyg-nails').textContent = hyg.nails ? `${fmtDate(hyg.nails)} (${daysAgo(hyg.nails)})` : '—';
  document.getElementById('hyg-ears').textContent = hyg.ears ? `${fmtDate(hyg.ears)} (${daysAgo(hyg.ears)})` : '—';
  document.getElementById('hyg-teeth').textContent = hyg.teeth ? `${fmtDate(hyg.teeth)} (${daysAgo(hyg.teeth)})` : '—';

  // Weight
  const wh = petData.weightHistory || [];
  const lastW = wh[0] || (petData.weight ? { weight: petData.weight } : null);
  document.getElementById('weight-display').textContent = lastW ? `${lastW.weight} кг` : '— кг';
  document.getElementById('weight-history').innerHTML = wh.slice(0, 4).map(w =>
    `<div class="flex justify-between"><span>${fmtDate(w.date)}</span><span class="font-medium">${w.weight} кг</span></div>`
  ).join('') || '';

  // Today
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('today-date-label').textContent = new Date().toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });
  document.getElementById('pet-subtitle').textContent = new Date().toLocaleDateString('bg-BG', { weekday: 'long', day: 'numeric', month: 'long' });

  const walksToday = (petData.walks || []).filter(w => w.date === todayStr);
  const mealsToday = (petData.meals || []).filter(m => m.date === todayStr);
  document.getElementById('stat-walks').textContent = walksToday.length;
  document.getElementById('stat-meals').textContent = mealsToday.length;

  if (petData.trackFood !== false) {
    let total = 0;
    (petData.meals || []).forEach(m => { if (m.amount) total += Number(m.amount); });
    const bag = (petData.foodBagKg || 12) * 1000;
    document.getElementById('stat-food-bag').textContent = Math.max(0, (bag - total) / 1000).toFixed(1) + 'кг';
  } else {
    document.getElementById('stat-food-bag').textContent = '—';
  }

  // Upcoming
  const upcoming = [];
  (petData.health || []).filter(h => h.nextDate && h.nextDate >= todayStr)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 3)
    .forEach(h => upcoming.push(`${h.title} – ${fmtDate(h.nextDate)}`));
  if (hyg.bath && parseInt(daysAgo(hyg.bath)) > 30) upcoming.push('Къпане (отдавна)');
  if (hyg.nails && parseInt(daysAgo(hyg.nails)) > 40) upcoming.push('Нокти (отдавна)');
  const upBox = document.getElementById('upcoming-box');
  if (upcoming.length) {
    upBox.classList.remove('hidden');
    document.getElementById('upcoming-list').innerHTML = upcoming.map(u => `<div>• ${u}</div>`).join('');
  } else upBox.classList.add('hidden');

  // Activity list
  const todayList = [
    ...(petData.walks || []).filter(w => w.date === todayStr).map(w => ({ ...w, type: 'walk', label: `Разходка ${w.duration || ''} мин` })),
    ...(petData.meals || []).filter(m => m.date === todayStr).map(m => ({ ...m, type: 'meal', label: `Хранене ${m.amount || ''} г` })),
    ...(petData.health || []).filter(h => h.date === todayStr).map(h => ({ ...h, type: 'health', label: h.title }))
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const listEl = document.getElementById('today-activity-list');
  if (!todayList.length) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Все още няма записи днес</p>`;
  } else {
    listEl.innerHTML = todayList.map(item => {
      const u = (petData.usersMeta || {})[item.authorUid] || { name: 'Стопанин', color: '#0ea5e9' };
      return `<div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border-l-4" style="border-color:${u.color}">
        <div>
          <div class="text-sm font-semibold">${item.label}</div>
          <div class="text-[11px] text-slate-400">${item.time || ''} · ${u.name}</div>
        </div>
        <button onclick="deleteItem('${item.type}','${item.id}')" class="text-slate-400 hover:text-red-500 text-sm px-2">✕</button>
      </div>`;
    }).join('');
  }

  // Health records
  const healthEl = document.getElementById('health-records-list');
  const items = [...(petData.health || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  healthEl.innerHTML = items.length ? items.map(h => `
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-4 shadow-sm">
      <div class="flex justify-between gap-2">
        <div>
          <div class="font-bold text-sm">${h.title}${h.productName ? ' · ' + h.productName : ''}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${fmtDate(h.date)}${h.nextDate ? ' → ' + fmtDate(h.nextDate) : ''}</div>
          ${h.notes ? `<p class="text-xs mt-1.5 text-slate-600 dark:text-slate-300">${h.notes}</p>` : ''}
        </div>
        <button onclick="deleteItem('health','${h.id}')" class="text-slate-400 hover:text-red-500 text-sm">✕</button>
      </div>
    </div>`).join('') : `<p class="text-xs text-slate-400 text-center py-6">Няма здравни записи</p>`;

  renderPetsList();
}

function renderPetsList() {
  const el = document.getElementById('pets-list');
  if (!userPets.length) {
    el.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Няма любимци</p>`;
    return;
  }
  el.innerHTML = userPets.map(p => {
    const em = p.type === 'cat' ? '🐈' : (p.type === 'dog' ? '🐕' : '🐾');
    const active = p.id === currentPetId;
    return `<button onclick="switchToPet('${p.id}')" class="w-full flex items-center gap-3 p-3.5 rounded-2xl border ${active ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'} text-left">
      <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 text-white flex items-center justify-center text-xl">${em}</div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-sm">${p.name}</div>
        <div class="text-[11px] text-slate-400">${{ dog: 'Куче', cat: 'Котка', other: 'Друго' }[p.type] || ''}</div>
      </div>
      ${active ? '<span class="text-[10px] font-bold text-sky-500">активен</span>' : ''}
    </button>`;
  }).join('');
}

async function saveMyProfile() {
  if (!currentPetId) return;
  const name = document.getElementById('my-name-input').value.trim() || 'Стопанин';
  const cur = (petData.usersMeta || {})[currentUser.uid] || { color: '#0ea5e9', avatar: '👤' };
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
      <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Продължителност (мин)</label>
      <input id="m-duration" type="number" placeholder="30" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  } else if (type === 'meal') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Час</label>
      <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Количество (г)</label>
      <input id="m-amount" type="number" placeholder="65" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  } else if (type === 'health') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Какво</label>
      <input id="m-title" type="text" placeholder="Ваксина / Обезпаразитяване / Преглед" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Продукт / лекарство</label>
      <input id="m-product" type="text" placeholder="по избор" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
      <input id="m-date" type="date" value="${today}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Следваща дата</label>
      <input id="m-next" type="date" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Бележки</label>
      <textarea id="m-notes" rows="2" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea></div>`;
  } else if (type === 'hygiene') {
    const hyg = petData.hygiene || {};
    body.innerHTML = `
      <p class="text-xs text-slate-500 mb-1">Обнови датите (остави празно ако не си правил):</p>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Къпане</label>
      <input id="m-bath" type="date" value="${hyg.bath || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Нокти</label>
      <input id="m-nails" type="date" value="${hyg.nails || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Уши</label>
      <input id="m-ears" type="date" value="${hyg.ears || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Зъби</label>
      <input id="m-teeth" type="date" value="${hyg.teeth || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  } else if (type === 'weight') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Тегло (кг)</label>
      <input id="m-weight" type="number" step="0.1" placeholder="7.2" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
      <input id="m-wdate" type="date" value="${today}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  }
  document.getElementById('modal').classList.remove('hidden');
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
    petData.walks = [item, ...(petData.walks || [])];
  } else if (activeModalType === 'meal') {
    item.time = document.getElementById('m-time').value;
    item.amount = document.getElementById('m-amount').value;
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
  }

  try {
    await db.collection('pets').doc(currentPetId).update({
      walks: petData.walks || [],
      meals: petData.meals || [],
      health: petData.health || [],
      hygiene: petData.hygiene || {},
      weight: petData.weight || null,
      weightHistory: petData.weightHistory || []
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
  ['home', 'health', 'pets'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', t === id);
    const nav = document.getElementById('nav-' + t);
    if (nav) {
      nav.classList.toggle('text-sky-500', t === id);
      nav.classList.toggle('text-slate-400', t !== id);
    }
  });
  if (id === 'pets') loadUserPets().then(renderPetsList);
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
