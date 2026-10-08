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
let petData = { name: 'Макс', type: 'dog', code: '', foodBagKg: 12, trackFood: true, walks: [], meals: [], health: [], usersMeta: {} };
let unsubPet = null;
let activeModalType = null;
let tempSetupAvatar = '👨';
let tempSetupColor = '#0ea5e9';

// Dark mode init
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
  if (!email || !password) { alert('Попълнете имейл и парола'); return; }
  try { await auth.signInWithEmailAndPassword(email, password); } 
  catch (e) { alert('Грешка: ' + e.message); }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { alert('Попълнете имейл и парола'); return; }
  try { await auth.createUserWithEmailAndPassword(email, password); } 
  catch (e) { alert('Грешка: ' + e.message); }
}

function logout() {
  if (unsubPet) unsubPet();
  localStorage.removeItem('petpulse_active_pet');
  auth.signOut();
  closeDrawer();
}

async function checkUserState() {
  try {
    const localPetId = localStorage.getItem('petpulse_active_pet');
    if (localPetId) {
      const doc = await db.collection('pets').doc(localPetId).get();
      if (doc.exists) { currentPetId = localPetId; startPetListener(); return; }
    }
    const snap = await db.collection('pets').where('members', 'array-contains', currentUser.uid).limit(1).get();
    if (!snap.empty) {
      currentPetId = snap.docs[0].id;
      localStorage.setItem('petpulse_active_pet', currentPetId);
      startPetListener();
      return;
    }
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
  if (event && event.currentTarget) event.currentTarget.classList.add('border-sky-500');
}

function selectSetupColor(colorHex) {
  tempSetupColor = colorHex;
}

async function proceedToPetSetup() {
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
  const usersMeta = {};
  usersMeta[currentUser.uid] = userMeta;

  const newPet = {
    name, type, code, foodBagKg: 12, trackFood: true, breed: '', weight: null, birthdate: '', passport: '', chip: '',
    members: [currentUser.uid], walks: [], meals: [], health: [], usersMeta
  };

  try {
    const ref = await db.collection('pets').add(newPet);
    currentPetId = ref.id;
    localStorage.setItem('petpulse_active_pet', currentPetId);
    document.getElementById('setup-screen').classList.add('hidden');
    startPetListener();
  } catch (e) { alert('Грешка при създаване: ' + e.message); }
}

async function joinWithCode() {
  const code = document.getElementById('invite-code-input').value.trim().toUpperCase();
  if (!code) { alert('Въведете код за покана'); return; }
  try {
    const snap = await db.collection('pets').where('code', '==', code).limit(1).get();
    if (snap.empty) { alert('Невалиден код'); return; }
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
    startPetListener();
  } catch (e) { alert('Грешка при присъединяване: ' + e.message); }
}

function startPetListener() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Sync dark toggle
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

function renderApp() {
  const typeLabel = { dog: 'Куче', cat: 'Котка', other: 'Любимец' }[petData.type] || 'Любимец';
  const emoji = petData.type === 'cat' ? '🐈' : (petData.type === 'dog' ? '🐕' : '🐾');

  document.getElementById('pet-title-name').textContent = petData.name || 'Макс';
  document.getElementById('pet-avatar-box').textContent = emoji;
  document.getElementById('pet-big-avatar').textContent = emoji;
  document.getElementById('pet-detail-name').textContent = petData.name || 'Макс';
  document.getElementById('pet-detail-type').textContent = typeLabel;

  document.getElementById('share-code-display').value = petData.code || '';
  
  document.getElementById('pet-birthdate').value = petData.birthdate || '';
  document.getElementById('pet-passport').value = petData.passport || '';
  document.getElementById('pet-chip').value = petData.chip || '';
  document.getElementById('pet-breed').value = petData.breed || '';
  document.getElementById('pet-weight').value = petData.weight || '';
  document.getElementById('food-brand-model').value = petData.foodBrandModel || '';
  document.getElementById('food-bag-kg').value = petData.foodBagKg || 12;
  document.getElementById('toggle-food-tracking').checked = petData.trackFood !== false;

  const meta = (petData.usersMeta || {})[currentUser.uid] || { name: currentUser.email.split('@')[0], avatar: '👨', color: '#0ea5e9' };
  document.getElementById('my-name-input').value = meta.name || '';
  document.getElementById('my-avatar-input').value = meta.avatar || '';

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
    const remKg = Math.max(0, (bagGrams - totalEaten) / 1000).toFixed(1);
    document.getElementById('stat-food-bag').textContent = `${remKg} кг`;
  } else {
    document.getElementById('stat-food-bag').textContent = 'Изкл.';
  }

  const todayList = [
    ...(petData.walks || []).filter(w => w.date === todayStr).map(w => ({ ...w, type: 'walk', label: `Разходка ${w.duration || ''} мин` })),
    ...(petData.meals || []).filter(m => m.date === todayStr).map(m => ({ ...m, type: 'meal', label: `Хранене ${m.amount || ''} г` })),
    ...(petData.health || []).filter(h => h.date === todayStr).map(h => ({ ...h, type: 'health', label: `Здраве: ${h.title}` }))
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const listEl = document.getElementById('today-activity-list');
  if (todayList.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Няма записи за днес</p>`;
  } else {
    listEl.innerHTML = todayList.map(item => {
      const uMeta = (petData.usersMeta || {})[item.authorUid] || { name: 'Стопанин', avatar: '👤', color: '#0ea5e9' };
      return `
        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border-l-4" style="border-color:${uMeta.color}">
          <div>
            <div class="text-sm font-semibold">${item.label}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${item.time || ''} · ${uMeta.avatar} ${uMeta.name}</div>
          </div>
          <button onclick="deleteItem('${item.type}','${item.id}')" class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-500 text-sm">✕</button>
        </div>`;
    }).join('');
  }

  const healthEl = document.getElementById('health-records-list');
  const healthItems = [...(petData.health || [])].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if (healthItems.length === 0) {
    healthEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-10">Все още няма записи</p>`;
  } else {
    healthEl.innerHTML = healthItems.map(h => `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-4 shadow-sm">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h4 class="font-bold text-sm">${h.title}${h.productName ? ' · ' + h.productName : ''}</h4>
            <p class="text-[11px] text-slate-400 mt-0.5">${h.date || ''}${h.nextDate ? ' → следваща ' + h.nextDate : ''}</p>
            ${h.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5">${h.notes}</p>` : ''}
          </div>
          <button onclick="deleteItem('health','${h.id}')" class="text-slate-400 hover:text-red-500 text-sm shrink-0">✕</button>
        </div>
      </div>`).join('');
  }
}

async function saveMyProfile() {
  if (!currentPetId) return;
  const name = document.getElementById('my-name-input').value.trim() || 'Стопанин';
  const avatar = document.getElementById('my-avatar-input').value.trim() || '👤';
  const currentMeta = (petData.usersMeta || {})[currentUser.uid] || { color: '#0ea5e9' };
  if (!petData.usersMeta) petData.usersMeta = {};
  petData.usersMeta[currentUser.uid] = { name, avatar, color: currentMeta.color };
  await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
}

async function setMyColor(colorHex) {
  if (!currentPetId) return;
  if (!petData.usersMeta) petData.usersMeta = {};
  const currentMeta = petData.usersMeta[currentUser.uid] || { name: currentUser.email.split('@')[0], avatar: '👤' };
  petData.usersMeta[currentUser.uid] = { ...currentMeta, color: colorHex };
  await db.collection('pets').doc(currentPetId).update({ usersMeta: petData.usersMeta });
}

async function savePetDetails() {
  if (!currentPetId) return;
  const payload = {
    birthdate: document.getElementById('pet-birthdate').value,
    passport: document.getElementById('pet-passport').value.trim(),
    chip: document.getElementById('pet-chip').value.trim(),
    breed: document.getElementById('pet-breed').value.trim(),
    weight: parseFloat(document.getElementById('pet-weight').value) || null,
    foodBrandModel: document.getElementById('food-brand-model').value.trim(),
    foodBagKg: parseFloat(document.getElementById('food-bag-kg').value) || 12,
    trackFood: document.getElementById('toggle-food-tracking').checked
  };
  Object.assign(petData, payload);
  await db.collection('pets').doc(currentPetId).update(payload);
}

function openModal(type) {
  activeModalType = type;
  const titles = { walk: 'Нова разходка', meal: 'Хранене', health: 'Здравен запис' };
  document.getElementById('modal-title').textContent = titles[type] || 'Добави';
  const body = document.getElementById('modal-body');
  const now = new Date();
  const timeVal = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

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
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Продукт / лекарство</label>
      <input id="m-product" type="text" value="${lastProduct}" placeholder="NexGard / Drontal" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label>
      <input id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Следваща дата</label>
      <input id="m-next" type="date" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Бележки</label>
      <textarea id="m-notes" rows="2" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea></div>`;
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
  }

  try {
    await db.collection('pets').doc(currentPetId).update({
      walks: petData.walks || [],
      meals: petData.meals || [],
      health: petData.health || []
    });
    closeModal();
  } catch (e) { alert('Грешка: ' + e.message); }
}

async function deleteItem(type, id) {
  if (!confirm('Изтриване на записа?')) return;
  if (type === 'walk') petData.walks = (petData.walks || []).filter(w => w.id !== id);
  if (type === 'meal') petData.meals = (petData.meals || []).filter(m => m.id !== id);
  if (type === 'health') petData.health = (petData.health || []).filter(h => h.id !== id);
  try {
    await db.collection('pets').doc(currentPetId).update({
      walks: petData.walks || [],
      meals: petData.meals || [],
      health: petData.health || []
    });
  } catch (e) { alert('Грешка: ' + e.message); }
}

function switchTab(tabId) {
  ['home', 'health', 'pet'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const nav = document.getElementById(`nav-${t}`);
    if (el) el.classList.toggle('active', t === tabId);
    if (nav) {
      nav.classList.toggle('text-sky-500', t === tabId);
      nav.classList.toggle('text-slate-400', t !== tabId);
    }
  });
}

function openDrawer() {
  document.getElementById('drawer').classList.add('drawer-open');
  document.getElementById('drawer-backdrop').classList.add('drawer-backdrop-open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('drawer-open');
  document.getElementById('drawer-backdrop').classList.remove('drawer-backdrop-open');
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
