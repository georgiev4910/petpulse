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
let petData = { name: 'Макс', type: 'dog', code: '', foodBagKg: 3, trackFood: true, walks: [], meals: [], health: [], usersMeta: {} };
let unsubPet = null;
let activeModalType = null;
let tempSetupAvatar = '👨';
let tempSetupColor = '#0ea5e9';

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
  try { await auth.signInWithEmailAndPassword(email, password); } catch (e) { alert('Грешка: ' + e.message); }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { alert('Попълнете имейл и парола'); return; }
  try { await auth.createUserWithEmailAndPassword(email, password); } catch (e) { alert('Грешка: ' + e.message); }
}

function logout() {
  if (unsubPet) unsubPet();
  auth.signOut();
}

// Check if user has personal profile and linked pet
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
    // No pet found -> show profile setup first
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
}

function selectSetupColor(colorHex) {
  tempSetupColor = colorHex;
}

async function proceedToPetSetup() {
  const name = document.getElementById('setup-my-name').value.trim() || 'Стопанин';
  // Save initial meta locally or temporarily until pet is created/joined
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
    name, type, code, foodBagKg: 3, trackFood: true,
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
    
    if (!members.includes(currentUser.uid)) {
      members.push(currentUser.uid);
    }

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

  if (unsubPet) unsubPet();
  unsubPet = db.collection('pets').doc(currentPetId).onSnapshot(doc => {
    if (doc.exists) {
      petData = doc.data();
      renderApp();
    }
  });
}

function renderApp() {
  document.getElementById('pet-title-name').textContent = petData.name || 'Макс';
  document.getElementById('share-code-display').value = petData.code || '';
  
  document.getElementById('pet-birthdate').value = petData.birthdate || '';
  document.getElementById('pet-passport').value = petData.passport || '';
  document.getElementById('pet-chip').value = petData.chip || '';
  document.getElementById('food-brand-model').value = petData.foodBrandModel || '';
  document.getElementById('food-bag-kg').value = petData.foodBagKg || 3;
  document.getElementById('toggle-food-tracking').checked = petData.trackFood !== false;

  const meta = (petData.usersMeta || {})[currentUser.uid] || { name: currentUser.email.split('@')[0], avatar: '👨', color: '#0ea5e9' };
  document.getElementById('my-name-input').value = meta.name;
  document.getElementById('my-avatar-input').value = meta.avatar;

  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('today-date-label').textContent = new Date().toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });

  const walksToday = (petData.walks || []).filter(w => w.date === todayStr);
  const mealsToday = (petData.meals || []).filter(m => m.date === todayStr);

  document.getElementById('stat-walks').textContent = walksToday.length;
  document.getElementById('stat-meals').textContent = mealsToday.length;

  if (petData.trackFood !== false) {
    let totalEaten = 0;
    (petData.meals || []).forEach(m => { if (m.amount) totalEaten += Number(m.amount); });
    const bagGrams = (petData.foodBagKg || 3) * 1000;
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
    listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">Няма записани активности за днес</p>`;
  } else {
    listEl.innerHTML = todayList.map(item => {
      const uMeta = (petData.usersMeta || {})[item.authorUid] || { name: 'Стопанин', avatar: '👤', color: '#0ea5e9' };
      return `
        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3.5 border-l-4 shadow-sm" style="border-color: ${uMeta.color}">
          <div>
            <div class="text-sm font-bold">${item.label}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${item.time || ''} · <span class="font-bold text-slate-700 dark:text-slate-200">${uMeta.avatar} ${uMeta.name}</span></div>
          </div>
          <button onclick="deleteItem('${item.type}', '${item.id}')" class="w-8 h-8 rounded-xl bg-slate-200/50 dark:bg-slate-700 text-slate-400 hover:text-red-500 flex items-center justify-center text-sm transition">✕</button>
        </div>
      `;
    }).join('');
  }

  const healthEl = document.getElementById('health-records-list');
  const healthItems = petData.health || [];
  if (healthItems.length === 0) {
    healthEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-12">Все още няма здравни записи</p>`;
  } else {
    healthEl.innerHTML = healthItems.map(h => `
      <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm space-y-1.5">
        <div class="flex items-center justify-between">
          <h4 class="font-extrabold text-sm">${h.title} ${h.productName ? '· ' + h.productName : ''}</h4>
          <button onclick="deleteItem('health', '${h.id}')" class="text-slate-400 hover:text-red-500 text-sm p-1">✕</button>
        </div>
        <p class="text-xs text-slate-400">Дата: ${h.date} ${h.nextDate ? '· Следваща: ' + h.nextDate : ''}</p>
        ${h.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1">${h.notes}</p>` : ''}
      </div>
    `).join('');
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
  petData.birthdate = document.getElementById('pet-birthdate').value;
  petData.passport = document.getElementById('pet-passport').value.trim();
  petData.chip = document.getElementById('pet-chip').value.trim();
  petData.foodBrandModel = document.getElementById('food-brand-model').value.trim();
  petData.foodBagKg = parseFloat(document.getElementById('food-bag-kg').value) || 3;
  petData.trackFood = document.getElementById('toggle-food-tracking').checked;

  await db.collection('pets').doc(currentPetId).update({
    birthdate: petData.birthdate,
    passport: petData.passport,
    chip: petData.chip,
    foodBrandModel: petData.foodBrandModel,
    foodBagKg: petData.foodBagKg,
    trackFood: petData.trackFood
  });
}

function openModal(type) {
  activeModalType = type;
  const titleMap = { walk: 'Нова разходка 🚶', meal: 'Хранене 🍖', health: 'Здравен запис 💉' };
  document.getElementById('modal-title').textContent = titleMap[type] || 'Добави';
  const body = document.getElementById('modal-body');
  const now = new Date();
  const timeVal = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  if (type === 'walk') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Час</label><input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Продължителност (минути)</label><input id="m-duration" type="number" placeholder="30" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
    `;
  } else if (type === 'meal') {
    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Час</label><input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Количество (грама)</label><input id="m-amount" type="number" placeholder="70" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
    `;
  } else if (type === 'health') {
    const lastHealth = (petData.health || [])[0];
    const lastProduct = lastHealth ? lastHealth.productName || '' : '';

    body.innerHTML = `
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Тип / Заглавие</label><input id="m-title" type="text" placeholder="напр. Обезпаразитяване / Ваксина" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Име на лекарство / продукт</label><input id="m-product" type="text" value="${lastProduct}" placeholder="напр. NexGard / Drontal" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Дата</label><input id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Следваща дата</label><input id="m-next" type="date" class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none"></div>
      <div><label class="block text-xs font-semibold text-slate-400 mb-1">Бележки</label><textarea id="m-notes" rows="2" placeholder="Допълнителна информация..." class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none resize-none"></textarea></div>
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
  } catch (e) { alert('Грешка при запис: ' + e.message); }
}

async function deleteItem(type, id) {
  if (!confirm('Сигурни ли сте, че искате да изтриете този запис?')) return;
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
  alert('Кодът е копиран в клипборда!');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error', err));
}