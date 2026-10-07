// ==================== FIREBASE CONFIG ====================
// Използваме същите надеждни ключове от твоя акаунт
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

// ==================== STATE ====================
let currentUser = null;
let currentPetId = null;
let petData = { name: 'Макс', type: 'dog', code: '', foodBagKg: 3, walks: [], meals: [], health: [] };
let unsubPet = null;
let activeModalType = null;

// ==================== INIT ====================
auth.onAuthStateChanged(async (user) => {
  const splash = document.getElementById('splash');
  if (splash) splash.classList.add('hidden');

  if (user) {
    currentUser = user;
    await checkUserPet();
  } else {
    currentUser = null;
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
  }
});

// ==================== AUTH ====================
async function handleLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { alert('Попълни имейл и парола'); return; }
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) { alert('Грешка при вход: ' + e.message); }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { alert('Попълни имейл и парола'); return; }
  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (e) { alert('Грешка при регистрация: ' + e.message); }
}

function logout() {
  if (unsubPet) unsubPet();
  auth.signOut();
}

// ==================== PET & SHARING LOGIC ====================
async function checkUserPet() {
  try {
    // Check if user has linked pet in localStorage or Firestore user doc
    const localPetId = localStorage.getItem('petpulse_active_pet');
    if (localPetId) {
      const doc = await db.collection('pets').doc(localPetId).get();
      if (doc.exists) {
        currentPetId = localPetId;
        startPetListener();
        return;
      }
    }
    // Otherwise check if any pet contains user uid in members
    const snap = await db.collection('pets').where('members', 'array-contains', currentUser.uid).limit(1).get();
    if (!snap.empty) {
      currentPetId = snap.docs[0].id;
      localStorage.setItem('petpulse_active_pet', currentPetId);
      startPetListener();
      return;
    }
    // No pet found -> show setup / create / join
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  } catch (e) {
    console.error(e);
    document.getElementById('setup-screen').classList.remove('hidden');
  }
}

async function createPet() {
  const name = document.getElementById('new-pet-name').value.trim() || 'Макс';
  const type = document.getElementById('new-pet-type').value;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const newPet = {
    name,
    type,
    code,
    foodBagKg: 3,
    members: [currentUser.uid],
    walks: [],
    meals: [],
    health: []
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
  if (!code) { alert('Въведи код за покана'); return; }
  try {
    const snap = await db.collection('pets').where('code', '==', code).limit(1).get();
    if (snap.empty) { alert('Невалиден код'); return; }
    const petDoc = snap.docs[0];
    const data = petDoc.data();
    const members = data.members || [];
    if (!members.includes(currentUser.uid)) {
      members.push(currentUser.uid);
      await petDoc.ref.update({ members });
    }
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

  if (unsubPet) unsubPet();
  unsubPet = db.collection('pets').doc(currentPetId).onSnapshot(doc => {
    if (doc.exists) {
      petData = doc.data();
      renderApp();
    }
  });
}

// ==================== RENDERING ====================
function renderApp() {
  document.getElementById('pet-title-name').textContent = petData.name;
  document.getElementById('pet-avatar').textContent = petData.type === 'cat' ? '🐈' : '🐕';
  document.getElementById('share-code-display').value = petData.code || '------';
  document.getElementById('food-bag-kg').value = petData.foodBagKg || 3;

  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('today-date-label').textContent = new Date().toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });

  // Walks & Meals today stats
  const walksToday = (petData.walks || []).filter(w => w.date === todayStr);
  const mealsToday = (petData.meals || []).filter(m => m.date === todayStr);

  document.getElementById('stat-walks').textContent = walksToday.length;
  document.getElementById('stat-meals').textContent = mealsToday.length;

  // Food remaining calculation
  let totalEatenGrams = 0;
  (petData.meals || []).forEach(m => {
    if (m.unit === 'г' && m.amount) totalEatenGrams += Number(m.amount);
  });
  const bagTotalGrams = (petData.foodBagKg || 3) * 1000;
  const remainingKg = Math.max(0, (bagTotalGrams - totalEatenGrams) / 1000).toFixed(1);
  document.getElementById('stat-food-bag').textContent = `${remainingKg} кг`;

  // Today activity list stream
  const todayList = [
    ...(petData.walks || []).filter(w => w.date === todayStr).map(w => ({ ...w, type: 'walk', label: `Разходка ${w.duration || ''} мин` })),
    ...(petData.meals || []).filter(m => m.date === todayStr).map(m => ({ ...m, type: 'meal', label: `Хранене ${m.amount || ''} ${m.unit || 'г'}` })),
    ...(petData.health || []).filter(h => h.date === todayStr).map(h => ({ ...h, type: 'health', label: `Здраве: ${h.title}` }))
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const listEl = document.getElementById('today-activity-list');
  if (todayList.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Няма записани активности за днес</p>`;
  } else {
    listEl.innerHTML = todayList.map(item => `
      <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
        <div>
          <div class="text-sm font-semibold">${item.label}</div>
          <div class="text-[11px] text-slate-400">${item.time || ''} · Стопанин: <span class="text-sky-500 font-medium">${item.authorName || 'Партньор'}</span></div>
        </div>
        <button onclick="deleteItem('${item.type}', '${item.id}')" class="text-slate-400 hover:text-red-500 text-sm p-1">✕</button>
      </div>
    `).join('');
  }

  // Health records list
  const healthEl = document.getElementById('health-records-list');
  const healthItems = petData.health || [];
  if (healthItems.length === 0) {
    healthEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">Няма здравни записи</p>`;
  } else {
    healthEl.innerHTML = healthItems.map(h => `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-1">
        <div class="flex items-center justify-between">
          <h4 class="font-bold text-sm">${h.title}</h4>
          <button onclick="deleteItem('health', '${h.id}')" class="text-slate-400 hover:text-red-500 text-sm">✕</button>
        </div>
        <p class="text-xs text-slate-400">Дата: ${h.date} ${h.nextDate ? '· Следваща: ' + h.nextDate : ''}</p>
        ${h.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1">${h.notes}</p>` : ''}
      </div>
    `).join('');
  }
}

// ==================== MODALS & ACTIONS ====================
function openModal(type) {
  activeModalType = type;
  const titleMap = { walk: 'Нова разходка', meal: 'Ново хранене', health: 'Здравен запис' };
  document.getElementById('modal-title').textContent = titleMap[type] || 'Добави';
  const body = document.getElementById('modal-body');
  const now = new Date();
  const timeVal = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  if (type === 'walk') {
    body.innerHTML = `
      <div><label class="block text-xs text-slate-400 mb-1">Час</label><input id="m-time" type="time" value="${timeVal}" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs text-slate-400 mb-1">Продължителност (минути)</label><input id="m-duration" type="number" placeholder="30" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
    `;
  } else if (type === 'meal') {
    body.innerHTML = `
      <div><label class="block text-xs text-slate-400 mb-1">Час</label><input id="m-time" type="time" value="${timeVal}" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs text-slate-400 mb-1">Количество (грама)</label><input id="m-amount" type="number" placeholder="70" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <input type="hidden" id="m-unit" value="г">
    `;
  } else if (type === 'health') {
    body.innerHTML = `
      <div><label class="block text-xs text-slate-400 mb-1">Заглавие</label><input id="m-title" type="text" placeholder="напр. Ваксина / Обезпаразитяване" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs text-slate-400 mb-1">Дата</label><input id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs text-slate-400 mb-1">Следваща дата (предупреждение)</label><input id="m-next" type="date" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs text-slate-400 mb-1">Бележки</label><textarea id="m-notes" rows="2" placeholder="Допълнителна информация..." class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea></div>
    `;
  }

  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  activeModalType = null;
}

async function saveModal() {
  if (!currentPetId) return;
  const authorName = currentUser.email ? currentUser.email.split('@')[0] : 'Партньор';
  const newItem = { id: 'item_' + Date.now(), createdAt: new Date().toISOString(), authorName, date: new Date().toISOString().slice(0, 10) };

  if (activeModalType === 'walk') {
    newItem.time = document.getElementById('m-time').value;
    newItem.duration = document.getElementById('m-duration').value;
    petData.walks = [newItem, ...(petData.walks || [])];
  } else if (activeModalType === 'meal') {
    newItem.time = document.getElementById('m-time').value;
    newItem.amount = document.getElementById('m-amount').value;
    newItem.unit = document.getElementById('m-unit').value;
    petData.meals = [newItem, ...(petData.meals || [])];
  } else if (activeModalType === 'health') {
    newItem.title = document.getElementById('m-title').value || 'Здравен запис';
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
  } catch (e) { alert('Грешка при запис: ' + e.message); }
}

async function deleteItem(type, id) {
  if (!confirm('Сигурен ли си, че искаш да изтриеш този запис?')) return;
  if (type === 'walk') petData.walks = petData.walks.filter(w => w.id !== id);
  if (type === 'meal') petData.meals = petData.meals.filter(m => m.id !== id);
  if (type === 'health') petData.health = petData.health.filter(h => h.id !== id);

  try {
    await db.collection('pets').doc(currentPetId).update({
      walks: petData.walks || [],
      meals: petData.meals || [],
      health: petData.health || []
    });
  } catch (e) { alert('Грешка при изтриване: ' + e.message); }
}

async function updateFoodBag() {
  if (!currentPetId) return;
  const val = parseFloat(document.getElementById('food-bag-kg').value) || 3;
  petData.foodBagKg = val;
  try {
    await db.collection('pets').doc(currentPetId).update({ foodBagKg: val });
  } catch (e) {}
}

// ==================== NAVIGATION & UTILS ====================
function switchTab(tabId) {
  ['home', 'health', 'settings'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const nav = document.getElementById(`nav-${t}`);
    if (el) el.classList.toggle('active', t === tabId);
    if (nav) {
      nav.classList.toggle('text-sky-500', t === tabId);
      nav.classList.toggle('text-slate-400', t !== tabId);
    }
  });
}

function copyShareCode() {
  const input = document.getElementById('share-code-display');
  input.select();
  navigator.clipboard.writeText(input.value);
  alert('Кодът е копиран! Прати го на Нина.');
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
}

// PWA Service Worker Register
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error', err));
}