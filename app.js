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
let userPets = []; // [{id, name, type}]
let petData = {};
let unsubPet = null;
let activeModalType = null;
let tempSetupAvatar = '👨';
let tempSetupColor = '#0ea5e9';

(function initDark() {
  const saved = localStorage.getItem('petpulse_dark');
  if (saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();

auth.onAuthStateChanged(async (user) => {
  const splash = document.getElementById('splash');
  if (splash) splash.classList.add('hidden');
  if (user) {
    currentUser = user;
    await checkUserState();
  } else {
    currentUser = null;
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
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
    // No pets
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('setup-step-profile').classList.remove('hidden');
    document.getElementById('setup-step-pet').classList.add('hidden');
    document.getElementById('setup-my-name').value = currentUser.email.split('@')[0];
  } catch (e) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  }
}

function selectSetupAvatar(emoji) {
  tempSetupAvatar = emoji;
  document.querySelectorAll('.setup-av').forEach(b => b.classList.remove('border-sky-500'));
  if (event?.currentTarget) event.currentTarget.classList.add('border-sky-500');
}
function selectSetupColor(c) { tempSetupColor = c; }

function proceedToPetSetup() {
  const name = document.getElementById('setup-my-name').value.trim() || 'Стопанин';
  window._tempUserMeta = { name, avatar: tempSetupAvatar, color: tempSetupColor };
  document.getElementById('setup-step-profile').classList.add('hidden');
  document.getElementById('setup-step-pet').classList.remove('hidden');
}

async function createPet() {
  const name = document.getElementById('new-pet-name').value.trim() || 'Макс';
  const type = document.getElementById('new-pet-type').value;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const userMeta = window._tempUserMeta || { name: currentUser.email.split('@')[0], avatar: '👨', color: '#0ea5e9' };
  const usersMeta = { [currentUser.uid]: userMeta };

  const newPet = {
    name, type, code, foodBagKg: 12, trackFood: true, breed: '', weight: null, birthdate: '',
    passport: '', chip: '', allergies: '', dislikes: '', habits: '',
    vetClinic: '', vetName: '', vetPhone: '',
    hygiene: { bath: '', nails: '', ears: '', teeth: '' },
    weightHistory: [],
    members: [currentUser.uid], walks: [], meals: [], health: [], usersMeta
  };

  try {
    const ref = await db.collection('pets').add(newPet);
    currentPetId = ref.id;
    localStorage.setItem('petpulse_active_pet', currentPetId);
    document.getElementById('setup-screen').classList.add('hidden');
    await loadUserPets();
    startPetListener();
  } catch (e) { alert('Грешка: ' + e.message); }
}

async function joinWithCode() {
  const code = document.getElementById('invite-code-input').value.trim().toUpperCase();
  if (!code) return alert('Въведете код');
  try {
    const snap = await db.collection('pets').where('code', '==', code).limit(1).get();
    if (snap.empty) return alert('Невалиден код');
    const petDoc = snap.docs[0];
    const data = petDoc.data();
    const members = data.members || [];
    if (!members.includes(currentUser.uid)) members.push(currentUser.uid);
    const usersMeta = data.usersMeta || {};
    usersMeta[currentUser.uid] = window._tempUserMeta || { name: currentUser.email.split('@')[0], avatar: '👩', color: '#10b981' };
    await petDoc.ref.update({ members, usersMeta });
    currentPetId = petDoc.id;
    localStorage.setItem('petpulse_active_pet', currentPetId);
    document.getElementById('setup-screen').classList.add('hidden');
    await loadUserPets();
    startPetListener();
  } catch (e) { alert('Грешка: ' + e.message); }
}

function showAddPet() {
  // Reuse setup pet step
  document.getElementById('app').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('setup-step-profile').classList.add('hidden');
  document.getElementById('setup-step-pet').classList.remove('hidden');
  window._tempUserMeta = (petData.usersMeta || {})[currentUser.uid] || { name: currentUser.email.split('@')[0], avatar: '👤', color: '#0ea5e9' };
}

function switchToPet(petId) {
  if (unsubPet) unsubPet();
  currentPetId = petId;
  localStorage.setItem('petpulse_active_pet', petId);
  startPetListener();
  switchTab('home');
}

function startPetListener() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.add('hidden');
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
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysAgo(str) {
  if (!str) return null;
  const diff = Math.floor((Date.now() - new Date(str + 'T00:00:00')) / 86400000);
  if (diff === 0) return 'днес';
  if (diff === 1) return 'вчера';
  return `преди ${diff} дни`;
}

function renderApp() {
  const typeLabel = { dog: 'Куче', cat: 'Котка', other: 'Любимец' }[petData.type] || 'Любимец';
  const emoji = petData.type === 'cat' ? '🐈' : (petData.type === 'dog' ? '🐕' : '🐾');

  document.getElementById('pet-title-name').textContent = petData.name || 'Макс';
  document.getElementById('pet-avatar-box').textContent = emoji;
  document.getElementById('pet-big-avatar').textContent = emoji;
  document.getElementById('pet-detail-name').textContent = petData.name || 'Макс';
  document.getElementById('pet-detail-type').textContent = typeLabel;
  document.getElementById('share-code-display').value = petData.code || '';

  // Profile fields
  document.getElementById('pet-birthdate').value = petData.birthdate || '';
  document.getElementById('pet-weight').value = petData.weight || '';
  document.getElementById('pet-breed').value = petData.breed || '';
  document.getElementById('pet-passport').value = petData.passport || '';
  document.getElementById('pet-chip').value = petData.chip || '';
  document.getElementById('food-brand-model').value = petData.foodBrandModel || '';
  document.getElementById('food-bag-kg').value = petData.foodBagKg || 12;
  document.getElementById('pet-allergies').value = petData.allergies || '';
  document.getElementById('pet-dislikes').value = petData.dislikes || '';
  document.getElementById('pet-habits').value = petData.habits || '';
  document.getElementById('pet-vet-clinic').value = petData.vetClinic || '';
  document.getElementById('pet-vet-name').value = petData.vetName || '';
  document.getElementById('pet-vet-phone').value = petData.vetPhone || '';
  document.getElementById('toggle-food-tracking').checked = petData.trackFood !== false;

  const meta = (petData.usersMeta || {})[currentUser.uid] || { name: currentUser.email.split('@')[0], avatar: '👨', color: '#0ea5e9' };
  document.getElementById('my-name-input').value = meta.name || '';
  document.getElementById('my-avatar-input').value = meta.avatar || '';

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
  document.getElementById('weight-history').innerHTML = wh.slice(0, 5).map(w =>
    `<div class="flex justify-between"><span>${fmtDate(w.date)}</span><span class="font-medium">${w.weight} кг</span></div>`
  ).join('') || '<span class="text-slate-400">Няма история</span>';

  // Stats today
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('today-date-label').textContent = new Date().toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });
  const walksToday = (petData.walks || []).filter(w => w.date === todayStr);
  const mealsToday = (petData.meals || []).filter(m => m.date === todayStr);
  document.getElementById('stat-walks').textContent = walksToday.length;
  document.getElementById('stat-meals').textContent = mealsToday.length;

  if (petData.trackFood !== false) {
    let totalEaten = 0;
    (petData.meals || []).forEach(m => { if (m.amount) totalEaten += Number(m.amount); });
    const bagGrams = (petData.foodBagKg || 12) * 1000;
    document.getElementById('stat-food-bag').textContent = Math.max(0, (bagGrams - totalEaten) / 1000).toFixed(1) + ' кг';
  } else {
    document.getElementById('stat-food-bag').textContent = 'Изкл.';
  }

  // Upcoming (next health + hygiene older than 30/60 days)
  const upcoming = [];
  (petData.health || []).filter(h => h.nextDate && h.nextDate >= todayStr)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 3)
    .forEach(h => upcoming.push(`${h.title} – ${fmtDate(h.nextDate)}`));
  if (hyg.bath && daysAgo(hyg.bath) && parseInt(daysAgo(hyg.bath)) > 30) upcoming.push('Къпане (отдавна)');
  if (hyg.nails && daysAgo(hyg.nails) && parseInt(daysAgo(hyg.nails)) > 45) upcoming.push('Нокти (отдавна)');
  const upBox = document.getElementById('upcoming-box');
  if (upcoming.length) {
    upBox.classList.remove('hidden');
    document.getElementById('upcoming-list').innerHTML = upcoming.map(u => `<div>• ${u}</div>`).join('');
  } else {
    upBox.classList.add('hidden');
  }

  // Today activity
  const todayList = [
    ...(petData.walks || []).filter(w => w.date === todayStr).map(w => ({ ...w, type: 'walk', label: `Разходка ${w.duration || ''} мин` })),
    ...(petData.meals || []).filter(m => m.date === todayStr).map(m => ({ ...m, type: 'meal', label: `Хранене ${m.amount || ''} г` })),
    ...(petData.health || []).filter(h => h.date === todayStr).map(h => ({ ...h, type: 'health', label: `Здраве: ${h.title}` }))
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const listEl = document.getElementById('today-activity-list');
  if (!todayList.length) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Няма записи за днес</p>`;
  } else {
    listEl.innerHTML = todayList.map(item => {
      const u = (petData.usersMeta || {})[item.authorUid] || { name: 'Стопанин', avatar: '👤', color: '#0ea5e9' };
      return `<div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border-l-4" style="border-color:${u.color}">
        <div><div class="text-sm font-semibold">${item.label}</div>
        <div class="text-[11px] text-slate-400 mt-0.5">${item.time || ''} · ${u.avatar} ${u.name}</div></div>
        <button onclick="deleteItem('${item.type}','${item.id}')" class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-500 text-sm">✕</button>
      </div>`;
    }).join('');
  }

  // Health list
  const healthEl = document.getElementById('health-records-list');
  const healthItems = [...(petData.health || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!healthItems.length) {
    healthEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Все още няма здравни записи</p>`;
  } else {
    healthEl.innerHTML = healthItems.map(h => `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-4 shadow-sm">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h4 class="font-bold text-sm">${h.title}${h.productName ? ' · ' + h.productName : ''}</h4>
            <p class="text-[11px] text-slate-400 mt-0.5">${fmtDate(h.date)}${h.nextDate ? ' → ' + fmtDate(h.nextDate) : ''}</p>
            ${h.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5">${h.notes}</p>` : ''}
          </div>
          <button onclick="deleteItem('health','${h.id}')" class="text-slate-400 hover:text-red-500 text-sm shrink-0">✕</button>
        </div>
      </div>`).join('');
  }

  // Pets list
  renderPetsList();
}

function renderPetsList() {
  const el = document.getElementById('pets-list');
  if (!userPets.length) {
    el.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">Няма любимци</p>`;
    return;
  }
  el.innerHTML = userPets.map(p => {
    const em = p.type === 'cat' ? '🐈' : (p.type === 'dog' ? '🐕' : '🐾');
    const active = p.id === currentPetId;
    return `<button onclick="switchToPet('${p.id}')" class="w-full flex items-center gap-3 p-3.5 rounded-2xl border ${active ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'} shadow-sm text-left">
      <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 text-white flex items-center justify-center text-xl">${em}</div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-sm truncate">${p.name}</div>
        <div class="text-[11px] text-slate-400">${{ dog: 'Куче', cat: 'Котка', other: 'Друго' }[p.type] || ''}</div>
      </div>
      ${active ? '<span class="text-[10px] font-bold text-sky-500 bg-sky-100 dark:bg-sky-900/50 px-2 py-0.5 rounded-full">активен</span>' : ''}
    </button>`;
  }).join('');
}

async function saveMyProfile() {
  if (!currentPetId) return;
  const name = document.getElementById('my-name-input').value.trim() || 'Стопанин';
  const avatar = document.getElementById('my-avatar-input').value.trim() || '👤';
  const cur = (petData.usersMeta || {})[currentUser.uid] || { color: '#0ea5e9' };
  if (!petData.usersMeta) petData.usersMeta = {};
  petData.usersMeta[currentUser.uid] = { name, avatar, color: cur.color };
  await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
}

async function setMyColor(colorHex) {
  if (!currentPetId) return;
  if (!petData.usersMeta) petData.usersMeta = {};
  const cur = petData.usersMeta[currentUser.uid] || { name: currentUser.email.split('@')[0], avatar: '👤' };
  petData.usersMeta[currentUser.uid] = { ...cur, color: colorHex };
  await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
}

async function savePetDetails() {
  if (!currentPetId) return;
  const payload = {
    birthdate: document.getElementById('pet-birthdate').value,
    weight: parseFloat(document.getElementById('pet-weight').value) || null,
    breed: document.getElementById('pet-breed').value.trim(),
    passport: document.getElementById('pet-passport').value.trim(),
    chip: document.getElementById('pet-chip').value.trim(),
    foodBrandModel: document.getElementById('food-brand-model').value.trim(),
    foodBagKg: parseFloat(document.getElementById('food-bag-kg').value) || 12,
    allergies: document.getElementById('pet-allergies').value.trim(),
    dislikes: document.getElementById('pet-dislikes').value.trim(),
    habits: document.getElementById('pet-habits').value.trim(),
    vetClinic: document.getElementById('pet-vet-clinic').value.trim(),
    vetName: document.getElementById('pet-vet-name').value.trim(),
    vetPhone: document.getElementById('pet-vet-phone').value.trim(),
    trackFood: document.getElementById('toggle-food-tracking').checked
  };
  Object.assign(petData, payload);
  await db.collection('pets').doc(currentPetId).update(payload);
  // also update local userPets name if changed
  const up = userPets.find(p => p.id === currentPetId);
  if (up) up.name = petData.name;
}

function openModal(type) {
  activeModalType = type;
  const titles = { walk: 'Нова разходка', meal: 'Хранене', health: 'Здравен запис', hygiene: 'Хигиена', weight: 'Ново тегло' };
  document.getElementById('modal-title').textContent = titles[type] || 'Добави';
  const body = document.getElementById('modal-body');
  const now = new Date();
  const timeVal = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.toISOString().slice(0, 10);

  if (type === 'walk') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Час</label>
      <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Минути</label>
      <input id="m-duration" type="number" placeholder="30" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  } else if (type === 'meal') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Час</label>
      <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Грама</label>
      <input id="m-amount" type="number" placeholder="65" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>`;
  } else if (type === 'health') {
    const lastProduct = (petData.health || [])[0]?.productName || '';
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Тип / заглавие</label>
      <input id="m-title" type="text" placeholder="Обезпаразитяване / Ваксина" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Продукт</label>
      <input id="m-product" type="text" value="${lastProduct}" placeholder="NexGard / Drontal" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
      <input id="m-date" type="date" value="${today}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Следваща дата</label>
      <input id="m-next" type="date" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Бележки</label>
      <textarea id="m-notes" rows="2" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea></div>`;
  } else if (type === 'hygiene') {
    const hyg = petData.hygiene || {};
    body.innerHTML = `
      <p class="text-xs text-slate-500">Маркирай какво си направил днес (или избери дата):</p>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Къпане</label>
      <input id="m-bath" type="date" value="${hyg.bath || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Нокти</label>
      <input id="m-nails" type="date" value="${hyg.nails || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Уши</label>
      <input id="m-ears" type="date" value="${hyg.ears || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Зъби</label>
      <input id="m-teeth" type="date" value="${hyg.teeth || ''}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <button type="button" onclick="document.getElementById('m-bath').value='${today}'" class="text-xs text-sky-500 font-semibold">Постави днес за къпане</button>`;
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
  const newItem = { id: 'item_' + Date.now(), createdAt: new Date().toISOString(), authorUid: currentUser.uid, date: new Date().toISOString().slice(0, 10) };

  if (activeModalType === 'walk') {
    newItem.time = document.getElementById('m-time').value;
    newItem.duration = document.getElementById('m-duration').value;
    petData.walks = [newItem, ...(petData.walks || [])];
  } else if (activeModalType === 'meal') {
    newItem.time = document.getElementById('m-time').value;
    newItem.amount = document.getElementById('m-amount').value;
    petData.meals = [newItem, ...(petData.meals || [])];
  } else if (activeModalType === 'health') {
    newItem.title = document.getElementById('m-title').value || 'Здравен запис';
    newItem.productName = document.getElementById('m-product').value.trim();
    newItem.date = document.getElementById('m-date').value;
    newItem.nextDate = document.getElementById('m-next').value;
    newItem.notes = document.getElementById('m-notes').value;
    petData.health = [newItem, ...(petData.health || [])];
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
      petData.weightHistory = [{ date: d, weight: w }, ...(petData.weightHistory || [])].slice(0, 30);
    }
  }

  try {
    const update = {
      walks: petData.walks || [],
      meals: petData.meals || [],
      health: petData.health || [],
      hygiene: petData.hygiene || {},
      weight: petData.weight || null,
      weightHistory: petData.weightHistory || []
    };
    await db.collection('pets').doc(currentPetId).update(update);
    closeModal();
  } catch (e) { alert('Грешка: ' + e.message); }
}

async function deleteItem(type, id) {
  if (!confirm('Изтриване?')) return;
  if (type === 'walk') petData.walks = (petData.walks || []).filter(w => w.id !== id);
  if (type === 'meal') petData.meals = (petData.meals || []).filter(m => m.id !== id);
  if (type === 'health') petData.health = (petData.health || []).filter(h => h.id !== id);
  try {
    await db.collection('pets').doc(currentPetId).update({
      walks: petData.walks || [], meals: petData.meals || [], health: petData.health || []
    });
  } catch (e) { alert('Грешка: ' + e.message); }
}

function switchTab(tabId) {
  ['home', 'health', 'pets', 'pet-profile'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.toggle('active', t === tabId);
  });
  // nav highlight only for main 3
  ['home', 'health', 'pets'].forEach(t => {
    const nav = document.getElementById(`nav-${t}`);
    if (nav) {
      nav.classList.toggle('text-sky-500', t === tabId || (tabId === 'pet-profile' && t === 'pets'));
      nav.classList.toggle('text-slate-400', !(t === tabId || (tabId === 'pet-profile' && t === 'pets')));
    }
  });
  if (tabId === 'pets') loadUserPets().then(renderPetsList);
  if (tabId === 'pet-profile' || tabId === 'home') { /* already rendered */ }
}

// Make header pet name open profile
document.addEventListener('DOMContentLoaded', () => {
  // already handled via onclick on the button
});

function openDrawer() {
  document.getElementById('drawer').classList.add('drawer-open');
  document.getElementById('drawer-backdrop').classList.add('drawer-bg-open');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('drawer-open');
  document.getElementById('drawer-backdrop').classList.remove('drawer-bg-open');
}
function toggleDarkMode() {
  const isDark = document.getElementById('toggle-dark').checked;
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('petpulse_dark', isDark ? '1' : '0');
}
function copyShareCode() {
  const input = document.getElementById('share-code-display');
  input.select();
  navigator.clipboard.writeText(input.value);
  alert('Кодът е копиран!');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
