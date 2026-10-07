// PetPulse - Beta v0.2
// Firebase-powered pet care tracker PWA

const firebaseConfig = {
  apiKey: "AIzaSyCDQ3FAg1kLZyUySZtcMKi9kPIp8S0ARZk",
  authDomain: "petpulse-2b281.firebaseapp.com",
  projectId: "petpulse-2b281",
  storageBucket: "petpulse-2b281.firebasestorage.app",
  messagingSenderId: "982076073623",
  appId: "1:982076073623:web:8b90f7a3150a40578e6bd2",
  measurementId: "G-0YPFKX479W"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Offline persistence (new API to avoid deprecation warning)
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {}
// Note: enablePersistence is deprecated, we rely on default cache for now

const LOCAL_PET_ID_KEY = 'petpulse_pet_id';
const LOCAL_CACHE_KEY = 'petpulse_cache_v2';

const PET_TYPES = {
  dog: { label: 'Куче', emoji: '🐕', icons: ['🐕', '🐶', '🦴', '🐾'] },
  cat: { label: 'Котка', emoji: '🐈', icons: ['🐈', '🐱', '🐟', '🐾'] },
  rabbit: { label: 'Заек', emoji: '🐇', icons: ['🐇', '🥕', '🌿', '🐾'] },
  other: { label: 'Друго', emoji: '🐾', icons: ['🐾', '❤️', '🌟', '✨'] }
};

const HEALTH_TYPES = {
  vaccine: { label: 'Ваксина', emoji: '💉', color: 'bg-blue-50 text-blue-600' },
  deworm: { label: 'Обезпаразитяване', emoji: '🐛', color: 'bg-green-50 text-green-600' },
  vet: { label: 'Ветеринар', emoji: '🏥', color: 'bg-purple-50 text-purple-600' },
  other: { label: 'Друго', emoji: '📋', color: 'bg-orange-50 text-orange-600' }
};

let state = {
  onboarded: false,
  pet: null,
  owners: [],
  walks: [],
  meals: [],
  snacks: [],
  health: [],
  foods: [],          // NEW: saved foods for quick selection
  currentOwner: 'Аз',
  selectedIcon: '🐕',
  currentFilter: 'all',
  petId: null,
  uid: null
};

let modalType = null;
let unsubscribe = null; // for realtime listener
let isSaving = false;

// ---------- Auth & Init ----------
async function init() {
  document.getElementById('today-date').textContent = formatDate(new Date());

  try {
    // Sign in anonymously
    const userCred = await auth.signInAnonymously();
    state.uid = userCred.user.uid;
    console.log('Signed in anonymously:', state.uid);

    // Try to load existing pet
    const savedPetId = localStorage.getItem(LOCAL_PET_ID_KEY);
    if (savedPetId) {
      state.petId = savedPetId;
      await loadPetFromFirebase(savedPetId);
    } else {
      // Check local cache as fallback
      loadLocalCache();
      if (state.onboarded && state.pet) {
        // Migrate local to Firebase
        await createPetInFirebase();
      } else {
        showOnboarding();
      }
    }
  } catch (err) {
    console.error('Firebase init error:', err);
    // Fallback to local only
    loadLocalCache();
    if (state.onboarded && state.pet) {
      showMainApp();
    } else {
      showOnboarding();
    }
  }
}

function showOnboarding() {
  document.getElementById('onboarding').classList.remove('hide');
  document.getElementById('main-app').classList.add('hide');
}

// ---------- Firebase Data ----------
async function loadPetFromFirebase(petId) {
  try {
    const doc = await db.collection('pets').doc(petId).get();
    if (doc.exists) {
      const data = doc.data();
      applyDataToState(data);
      state.petId = petId;
      localStorage.setItem(LOCAL_PET_ID_KEY, petId);

      // Realtime listener
      if (unsubscribe) unsubscribe();
      unsubscribe = db.collection('pets').doc(petId).onSnapshot((snap) => {
        if (snap.exists && !isSaving) {
          applyDataToState(snap.data());
          renderCurrentScreen();
        }
      }, (err) => console.warn('Realtime error:', err));

      showMainApp();
    } else {
      console.warn('Pet not found, starting fresh');
      localStorage.removeItem(LOCAL_PET_ID_KEY);
      showOnboarding();
    }
  } catch (err) {
    console.error('Load pet error:', err);
    loadLocalCache();
    if (state.onboarded) showMainApp();
    else showOnboarding();
  }
}

function applyDataToState(data) {
  state.onboarded = true;
  state.pet = data.pet || null;
  state.owners = data.owners || [];
  state.walks = data.walks || [];
  state.meals = data.meals || [];
  state.snacks = data.snacks || [];
  state.health = data.health || [];
  state.foods = data.foods || [];
  state.selectedIcon = data.selectedIcon || state.pet?.emoji || '🐕';
  state.currentOwner = data.currentOwner || 'Аз';
  // Keep local cache updated
  saveLocalCache();
}

async function saveState() {
  if (!state.petId || !state.uid) {
    saveLocalCache();
    return;
  }

  isSaving = true;
  const payload = {
    pet: state.pet,
    owners: state.owners,
    walks: state.walks,
    meals: state.meals,
    snacks: state.snacks,
    health: state.health,
    foods: state.foods,
    selectedIcon: state.selectedIcon,
    currentOwner: state.currentOwner,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: state.uid
  };

  try {
    await db.collection('pets').doc(state.petId).set(payload, { merge: true });
    saveLocalCache();
  } catch (err) {
    console.error('Save to Firebase failed:', err);
    saveLocalCache(); // at least keep local
  } finally {
    isSaving = false;
  }
}

async function createPetInFirebase() {
  // Ensure we have a uid
  if (!state.uid) {
    try {
      const userCred = await auth.signInAnonymously();
      state.uid = userCred.user.uid;
      console.log('Re-signed in anonymously:', state.uid);
    } catch (authErr) {
      console.error('Auth failed:', authErr);
      // Continue in local-only mode
      saveLocalCache();
      showMainApp();
      return;
    }
  }

  const payload = {
    pet: state.pet,
    owners: state.owners,
    walks: state.walks || [],
    meals: state.meals || [],
    snacks: state.snacks || [],
    health: state.health || [],
    foods: state.foods || [],
    selectedIcon: state.selectedIcon,
    currentOwner: state.currentOwner,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: state.uid,
    ownerUids: [state.uid]
  };

  try {
    // Timeout after 8 seconds so the button never hangs forever
    const addPromise = db.collection('pets').add(payload);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout – провери Firestore rules и интернет')), 8000)
    );
    
    const docRef = await Promise.race([addPromise, timeoutPromise]);
    state.petId = docRef.id;
    localStorage.setItem(LOCAL_PET_ID_KEY, docRef.id);

    // Start realtime
    if (unsubscribe) unsubscribe();
    unsubscribe = db.collection('pets').doc(state.petId).onSnapshot((snap) => {
      if (snap.exists && !isSaving) {
        applyDataToState(snap.data());
        renderCurrentScreen();
      }
    });

    console.log('Pet created in Firebase:', state.petId);
    showMainApp();
  } catch (err) {
    console.error('Create pet failed:', err);
    alert('Не можах да запиша в Firebase.\n\nНай-честа причина: Firestore Rules блокират записа.\n\nОтиди в Firebase Console → Firestore → Rules и сложи временно:\n\nallow read, write: if true;\n\nПосле Publish.\n\nГрешка: ' + (err.code || err.message));
    saveLocalCache();
    showMainApp();
  }
}

// Local cache helpers
function saveLocalCache() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
      onboarded: state.onboarded,
      pet: state.pet,
      owners: state.owners,
      walks: state.walks,
      meals: state.meals,
      snacks: state.snacks,
      health: state.health,
      foods: state.foods,
      selectedIcon: state.selectedIcon,
      currentOwner: state.currentOwner
    }));
  } catch (e) {}
}

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
    }
  } catch (e) {}
}

// ---------- Onboarding ----------
function selectPetType(type) {
  state.tempType = type;
  document.getElementById('pet-type-label').textContent = PET_TYPES[type].label.toLowerCase();
  
  // Prefill for Max example
  if (type === 'dog') {
    document.getElementById('pet-name').value = 'Макс';
    document.getElementById('pet-breed').value = 'Джак Ръсел териер';
    document.getElementById('pet-weight').value = '7.2';
    const bd = new Date();
    bd.setMonth(bd.getMonth() - 8);
    document.getElementById('pet-birthdate').value = bd.toISOString().slice(0, 10);
  }
  
  goToStep(2);
}

function goToStep(step) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`onboard-step-${i}`);
    if (el) el.classList.add('hide');
  }
  
  const progress = document.getElementById('onboard-progress');
  if (progress) {
    if (step === 1) {
      progress.classList.add('hide');
    } else {
      progress.classList.remove('hide');
      for (let i = 1; i <= 4; i++) {
        const p = document.getElementById(`prog-${i}`);
        if (p) {
          p.classList.toggle('bg-coral', i <= step);
          p.classList.toggle('bg-peach', i > step);
        }
      }
    }
  }
  
  const target = document.getElementById(`onboard-step-${step}`);
  if (target) {
    target.classList.remove('hide');
    target.classList.add('fade-in');
  }
}

function calcAgeFromBirthdate(birthdateStr) {
  if (!birthdateStr) return '';
  const birth = new Date(birthdateStr);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 12) return `${months} месеца`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} г. и ${rem} мес.` : `${years} години`;
}

async function finishOnboarding() {
  const btn = document.getElementById('finish-btn');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Запазване...';
  }

  try {
    const name = document.getElementById('pet-name').value.trim() || 'Макс';
    const breed = document.getElementById('pet-breed').value.trim() || '';
    const birthdate = document.getElementById('pet-birthdate').value || '';
    const weight = parseFloat(document.getElementById('pet-weight').value) || 0;
    const gender = document.getElementById('pet-gender').value;
    const color = document.getElementById('pet-color')?.value.trim() || '';
    const type = state.tempType || 'dog';

    const passport = document.getElementById('pet-passport')?.value.trim() || '';
    const chip = document.getElementById('pet-chip')?.value.trim() || '';
    const chipDate = document.getElementById('pet-chip-date')?.value || '';
    const vetClinic = document.getElementById('pet-vet-clinic')?.value.trim() || '';
    const vetName = document.getElementById('pet-vet-name')?.value.trim() || '';

    const lastVaccine = document.getElementById('pet-last-vaccine')?.value.trim() || '';
    const lastVaccineDate = document.getElementById('pet-last-vaccine-date')?.value || '';
    const allergies = document.getElementById('pet-allergies')?.value.trim() || '';
    const habits = document.getElementById('pet-habits')?.value.trim() || '';
    const notes = document.getElementById('pet-notes')?.value.trim() || '';

    const age = calcAgeFromBirthdate(birthdate);

    state.pet = {
      name,
      breed,
      birthdate,
      age,
      weight,
      gender,
      color,
      type,
      emoji: PET_TYPES[type].emoji,
      passport,
      chip,
      chipDate,
      vetClinic,
      vetName,
      allergies,
      habits,
      notes
    };

    state.owners = [{ id: state.uid || '1', name: 'Аз', role: 'owner', color: '#FF8A65' }];
    state.currentOwner = 'Аз';
    state.selectedIcon = PET_TYPES[type].emoji;
    state.onboarded = true;
    state.foods = [];
    state.health = [];

    // Seed from the quick health fields if provided
    if (lastVaccine) {
      state.health.push({
        id: uid(),
        type: 'vaccine',
        title: lastVaccine,
        date: lastVaccineDate || todayStr(),
        notes: 'Добавено при регистрация',
        by: 'Аз',
        createdAt: new Date().toISOString()
      });
    }

    // Default sample for Max if nothing entered
    if (type === 'dog' && name === 'Макс' && state.health.length === 0) {
      state.health = [
        {
          id: uid(),
          type: 'vaccine',
          title: 'Комплексна ваксина (DHPPi)',
          date: '2025-11-15',
          nextDate: '2026-11-15',
          notes: 'Първа годишна ваксина. Без реакция.',
          vet: 'Д-р Иванова',
          by: 'Аз',
          createdAt: new Date().toISOString()
        },
        {
          id: uid(),
          type: 'deworm',
          title: 'Обезпаразитяване (таблетка)',
          date: '2026-03-01',
          nextDate: '2026-06-01',
          notes: 'Drontal. Прието добре.',
          by: 'Аз',
          createdAt: new Date().toISOString()
        }
      ];
    }

    await createPetInFirebase();
  } catch (err) {
    console.error('finishOnboarding error:', err);
    alert('Грешка при запазване: ' + (err.message || err) + '\n\nПриложението ще продължи в локален режим.');
    saveLocalCache();
    showMainApp();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ---------- Navigation ----------
function showMainApp() {
  document.getElementById('onboarding').classList.add('hide');
  document.getElementById('main-app').classList.remove('hide');
  updateUI();
  showScreen('home');
}

function showScreen(name) {
  ['home', 'health', 'profile'].forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hide', s !== name);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.screen === name;
    btn.classList.toggle('text-coral', isActive);
    btn.classList.toggle('text-warmgray/50', !isActive);
  });

  if (name === 'health') renderHealth();
  if (name === 'profile') renderProfile();
  if (name === 'home') renderHome();
}

function renderCurrentScreen() {
  const active = document.querySelector('.nav-btn.text-coral');
  if (active) {
    const screen = active.dataset.screen;
    if (screen === 'home') renderHome();
    else if (screen === 'health') renderHealth();
    else if (screen === 'profile') renderProfile();
  } else {
    renderHome();
  }
  updateUI();
}

// ---------- Render ----------
function updateUI() {
  if (!state.pet) return;
  const p = state.pet;
  // Recalculate age if birthdate exists
  if (p.birthdate) p.age = calcAgeFromBirthdate(p.birthdate);

  document.getElementById('header-pet-name').textContent = p.name;
  document.getElementById('header-pet-info').textContent = `${p.breed || PET_TYPES[p.type]?.label || ''} · ${p.age || ''}`;
  document.getElementById('pet-avatar').textContent = p.emoji || '🐾';
  
  document.getElementById('profile-name').textContent = p.name;
  document.getElementById('profile-breed').textContent = p.breed || '—';
  document.getElementById('profile-age').textContent = p.age || '—';
  document.getElementById('profile-weight').textContent = p.weight ? `${p.weight} кг` : '—';
  document.getElementById('profile-gender').textContent = p.gender === 'male' ? 'Мъжки' : 'Женски';
  document.getElementById('profile-type').textContent = PET_TYPES[p.type]?.label || 'Друго';
}

function renderHome() {
  const today = todayStr();
  
  // Walks
  const walksToday = state.walks.filter(w => w.date === today);
  document.getElementById('stat-walks').textContent = walksToday.length;
  const walksEl = document.getElementById('today-walks');
  if (walksToday.length === 0) {
    walksEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма записани разходки днес</p>`;
  } else {
    walksEl.innerHTML = walksToday.map(w => `
      <div class="flex items-center justify-between bg-cream rounded-xl px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">${w.time} · ${w.duration || '?'} мин</div>
          <div class="text-xs text-warmgray/50">${w.location || 'Без локация'} · ${w.by}</div>
        </div>
        <button onclick="deleteItem('walks','${w.id}')" class="text-warmgray/30 text-lg">×</button>
      </div>
    `).join('');
  }

  // Meals
  const mealsToday = state.meals.filter(m => m.date === today);
  document.getElementById('stat-meals').textContent = `${mealsToday.length}/2`;
  const mealsEl = document.getElementById('today-meals');
  if (mealsToday.length === 0) {
    mealsEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма записани хранения днес</p>`;
  } else {
    mealsEl.innerHTML = mealsToday.map(m => `
      <div class="flex items-center justify-between bg-cream rounded-xl px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">${m.time} · ${m.amount || ''} ${m.unit || 'г'}</div>
          <div class="text-xs text-warmgray/50">${m.foodName || m.food || 'Храна'} · ${m.by}</div>
        </div>
        <button onclick="deleteItem('meals','${m.id}')" class="text-warmgray/30 text-lg">×</button>
      </div>
    `).join('');
  }

  // Snacks
  const snacksToday = state.snacks.filter(s => s.date === today);
  const snacksEl = document.getElementById('today-snacks');
  if (snacksToday.length === 0) {
    snacksEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма снакове днес</p>`;
  } else {
    snacksEl.innerHTML = snacksToday.map(s => `
      <div class="flex items-center justify-between bg-cream rounded-xl px-3 py-2.5">
        <div>
          <div class="text-sm font-medium">${s.time} · ${s.what || 'Снак'}</div>
          <div class="text-xs text-warmgray/50">${s.by}</div>
        </div>
        <button onclick="deleteItem('snacks','${s.id}')" class="text-warmgray/30 text-lg">×</button>
      </div>
    `).join('');
  }

  // Upcoming health
  const upcoming = state.health
    .filter(h => h.nextDate && h.nextDate >= today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3);
  
  const upEl = document.getElementById('upcoming-health');
  if (upcoming.length === 0) {
    upEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Няма предстоящи записи</p>`;
  } else {
    upEl.innerHTML = upcoming.map(h => {
      const t = HEALTH_TYPES[h.type] || HEALTH_TYPES.other;
      return `
        <div class="flex items-center gap-3 bg-cream rounded-xl px-3 py-2.5">
          <span class="text-xl">${t.emoji}</span>
          <div class="flex-1">
            <div class="text-sm font-medium">${h.title}</div>
            <div class="text-xs text-warmgray/50">Следващо: ${formatDateStr(h.nextDate)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Recent activity
  const all = [
    ...state.walks.map(w => ({ ...w, kind: 'walk', label: `Разходка ${w.duration || '?'} мин` })),
    ...state.meals.map(m => ({ ...m, kind: 'meal', label: `Хранене ${m.amount || ''} ${m.unit || 'г'}` })),
    ...state.snacks.map(s => ({ ...s, kind: 'snack', label: `Снак: ${s.what || ''}` })),
    ...state.health.map(h => ({ ...h, kind: 'health', label: h.title, date: h.date }))
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);

  const actEl = document.getElementById('recent-activity');
  if (all.length === 0) {
    actEl.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Все още няма активност</p>`;
  } else {
    actEl.innerHTML = all.map(a => `
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-peach/60 flex items-center justify-center text-sm">${(a.by || '?')[0]}</div>
        <div class="flex-1">
          <div class="text-sm">${a.label}</div>
          <div class="text-xs text-warmgray/50">${a.by} · ${formatRelative(a.createdAt || a.date)}</div>
        </div>
      </div>
    `).join('');
  }

  // Health status
  const overdue = state.health.filter(h => h.nextDate && h.nextDate < today);
  document.getElementById('stat-health').textContent = overdue.length > 0 ? `${overdue.length}!` : 'OK';
  document.getElementById('stat-health').className = overdue.length > 0 ? 'font-bold text-red-500' : 'font-bold text-softgreen';
}

function renderHealth() {
  const list = document.getElementById('health-list');
  let items = [...state.health].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  
  if (state.currentFilter !== 'all') {
    items = items.filter(h => h.type === state.currentFilter);
  }

  if (items.length === 0) {
    list.innerHTML = `<p class="text-center text-warmgray/50 py-8">Няма записи в тази категория</p>`;
    return;
  }

  list.innerHTML = items.map(h => {
    const t = HEALTH_TYPES[h.type] || HEALTH_TYPES.other;
    return `
      <div class="card p-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl ${t.color} flex items-center justify-center text-lg">${t.emoji}</div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">${h.title}</h3>
              <button onclick="deleteItem('health','${h.id}')" class="text-warmgray/30 text-lg">×</button>
            </div>
            <div class="text-xs text-warmgray/50 mt-0.5">${formatDateStr(h.date)} ${h.vet ? '· ' + h.vet : ''}</div>
            ${h.notes ? `<p class="text-sm mt-2 text-warmgray/80">${h.notes}</p>` : ''}
            ${h.nextDate ? `<div class="mt-2 text-xs font-medium text-coral">Следващо: ${formatDateStr(h.nextDate)}</div>` : ''}
            <div class="text-xs text-warmgray/40 mt-1">Добавено от ${h.by}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterHealth(filter) {
  state.currentFilter = filter;
  document.querySelectorAll('.health-filter').forEach(btn => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle('bg-coral', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-white', !active);
    btn.classList.toggle('text-warmgray', !active);
  });
  renderHealth();
}

function renderProfile() {
  const list = document.getElementById('owners-list');
  list.innerHTML = state.owners.map(o => `
    <div class="flex items-center gap-3 bg-cream rounded-xl px-3 py-2.5">
      <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium" style="background:${o.color || '#FF8A65'}">${(o.name || '?')[0]}</div>
      <div class="flex-1">
        <div class="text-sm font-medium">${o.name}</div>
        <div class="text-xs text-warmgray/50">${o.role === 'owner' ? 'Собственик' : 'Стопанин'}</div>
      </div>
    </div>
  `).join('');

  // Foods list
  const foodsList = document.getElementById('foods-list');
  if (foodsList) {
    if (!state.foods || state.foods.length === 0) {
      foodsList.innerHTML = `<p class="text-sm text-warmgray/50 text-center py-2">Все още няма добавени храни</p>`;
    } else {
      foodsList.innerHTML = state.foods.map(f => {
        const remaining = f.remainingGrams != null 
          ? `<div class="text-xs text-warmgray/50">Остават ~${Math.round(f.remainingGrams)} г ${f.bagSizeKg ? '(' + f.bagSizeKg + ' кг чувал)' : ''}</div>` 
          : (f.bagSizeKg ? `<div class="text-xs text-warmgray/50">Чувал: ${f.bagSizeKg} кг</div>` : '');
        return `
          <div class="flex items-center justify-between bg-cream rounded-xl px-3 py-2.5">
            <div>
              <div class="text-sm font-medium">${f.name}${f.brand ? ' · ' + f.brand : ''}</div>
              <div class="text-xs text-warmgray/50">${f.type === 'dry' ? 'Суха гранула' : f.type === 'wet' ? 'Мокра' : 'Друго'} · порция ${f.defaultPortion || '?'} ${f.unit || 'г'}</div>
              ${remaining}
            </div>
            <button onclick="deleteItem('foods','${f.id}')" class="text-warmgray/30 text-lg">×</button>
          </div>
        `;
      }).join('');
    }
  }
}

// ---------- Modal ----------
function openAddModal(type) {
  modalType = type;
  const titleMap = {
    walk: 'Нова разходка',
    meal: 'Ново хранене',
    snack: 'Нов снак',
    health: 'Здравен запис',
    owner: 'Добави стопанин',
    food: 'Нова храна'
  };
  document.getElementById('modal-title').textContent = titleMap[type] || 'Добави';
  
  const body = document.getElementById('modal-body');
  const now = new Date();
  const timeVal = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  if (type === 'walk') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Час</label>
        <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Продължителност (мин)</label>
        <input id="m-duration" type="number" placeholder="30" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Локация / маршрут</label>
        <input id="m-location" type="text" placeholder="Парк, квартал..." class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Бележки</label>
        <input id="m-notes" type="text" placeholder="По избор" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
    `;
  } else if (type === 'meal') {
    // Foods dropdown
    let foodOptions = '<option value="">— Избери храна —</option>';
    state.foods.forEach(f => {
      foodOptions += `<option value="${f.id}" data-portion="${f.defaultPortion || ''}" data-unit="${f.unit || 'г'}">${f.name}${f.brand ? ' (' + f.brand + ')' : ''}</option>`;
    });
    foodOptions += '<option value="__new__">+ Добави нова храна...</option>';

    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Храна</label>
        <select id="m-food-id" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" onchange="onFoodSelect(this)">
          ${foodOptions}
        </select>
      </div>
      <div id="m-food-custom" class="hide space-y-3">
        <input id="m-food-name" type="text" placeholder="Име / марка на храната" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Час</label>
        <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Количество</label>
        <div class="flex gap-2">
          <input id="m-amount" type="number" step="1" placeholder="65" class="flex-1 px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
          <select id="m-unit" class="w-24 px-3 py-3 rounded-2xl border border-peach/50 bg-white">
            <option value="г">г</option>
            <option value="мл">мл</option>
            <option value="чаши">чаши</option>
          </select>
        </div>
      </div>
    `;
  } else if (type === 'snack') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Час</label>
        <input id="m-time" type="time" value="${timeVal}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Какво</label>
        <input id="m-what" type="text" placeholder="Лакомство, ябълка..." class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
    `;
  } else if (type === 'health') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Тип</label>
        <select id="m-type" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white">
          <option value="vaccine">Ваксина</option>
          <option value="deworm">Обезпаразитяване</option>
          <option value="vet">Ветеринарен преглед</option>
          <option value="other">Друго</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Заглавие</label>
        <input id="m-title" type="text" placeholder="напр. Комплексна ваксина" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Дата</label>
        <input id="m-date" type="date" value="${todayStr()}" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Следваща дата (по избор)</label>
        <input id="m-next" type="date" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Ветеринар / клиника</label>
        <input id="m-vet" type="text" placeholder="по избор" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Бележки / какво се случи</label>
        <textarea id="m-notes" rows="3" placeholder="Процедури, реакция, препоръки..." class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white resize-none"></textarea>
      </div>
    `;
  } else if (type === 'owner') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Име</label>
        <input id="m-name" type="text" placeholder="Име на стопанина" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <p class="text-xs text-warmgray/50">По-късно ще добавим покани с линк. Засега името е локално към този любимец.</p>
    `;
  } else if (type === 'food') {
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1.5">Име на храната</label>
        <input id="m-food-name" type="text" placeholder="напр. Royal Canin Mini Puppy" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Марка (по избор)</label>
        <input id="m-food-brand" type="text" placeholder="напр. Royal Canin" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Тип</label>
        <select id="m-food-type" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white">
          <option value="dry">Суха гранула</option>
          <option value="wet">Мокра храна</option>
          <option value="other">Друго</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1.5">Чувал (кг)</label>
          <input id="m-bag-size" type="number" step="0.1" placeholder="12" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">Стандартна порция (г)</label>
          <input id="m-default-portion" type="number" step="1" placeholder="65" class="w-full px-4 py-3 rounded-2xl border border-peach/50 bg-white" />
        </div>
      </div>
    `;
  }

  document.getElementById('modal').classList.remove('hide');
}

function onFoodSelect(select) {
  const val = select.value;
  const custom = document.getElementById('m-food-custom');
  if (val === '__new__') {
    custom.classList.remove('hide');
    document.getElementById('m-amount').value = '';
  } else {
    custom.classList.add('hide');
    const opt = select.selectedOptions[0];
    if (opt && opt.dataset.portion) {
      document.getElementById('m-amount').value = opt.dataset.portion;
      document.getElementById('m-unit').value = opt.dataset.unit || 'г';
    }
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hide');
  modalType = null;
}

async function saveModal() {
  const by = state.currentOwner || 'Аз';
  const createdAt = new Date().toISOString();
  const date = todayStr();

  if (modalType === 'walk') {
    const time = document.getElementById('m-time').value;
    const duration = document.getElementById('m-duration').value;
    const location = document.getElementById('m-location').value;
    const notes = document.getElementById('m-notes').value;
    state.walks.push({ id: uid(), date, time, duration, location, notes, by, createdAt });
  } else if (modalType === 'meal') {
    const time = document.getElementById('m-time').value;
    const amount = document.getElementById('m-amount').value;
    const unit = document.getElementById('m-unit').value;
    let foodId = document.getElementById('m-food-id').value;
    let foodName = '';

    if (foodId === '__new__' || !foodId) {
      foodName = document.getElementById('m-food-name')?.value || 'Храна';
      // Optionally auto-create food
      if (foodName && foodName !== 'Храна') {
        const newFood = {
          id: uid(),
          name: foodName,
          brand: '',
          type: 'dry',
          bagSizeKg: null,
          defaultPortion: amount || null,
          unit: unit || 'г',
          remainingGrams: null
        };
        state.foods.push(newFood);
        foodId = newFood.id;
      }
    } else {
      const food = state.foods.find(f => f.id === foodId);
      foodName = food ? (food.brand ? `${food.name} (${food.brand})` : food.name) : 'Храна';
      // Subtract from remaining if tracked
      if (food && food.remainingGrams != null && amount) {
        food.remainingGrams = Math.max(0, food.remainingGrams - parseFloat(amount));
      }
    }

    state.meals.push({
      id: uid(),
      date,
      time,
      amount,
      unit,
      foodId,
      foodName,
      by,
      createdAt
    });
  } else if (modalType === 'snack') {
    const time = document.getElementById('m-time').value;
    const what = document.getElementById('m-what').value;
    state.snacks.push({ id: uid(), date, time, what, by, createdAt });
  } else if (modalType === 'health') {
    const type = document.getElementById('m-type').value;
    const title = document.getElementById('m-title').value || HEALTH_TYPES[type].label;
    const hDate = document.getElementById('m-date').value;
    const nextDate = document.getElementById('m-next').value || null;
    const vet = document.getElementById('m-vet').value;
    const notes = document.getElementById('m-notes').value;
    state.health.push({ id: uid(), type, title, date: hDate, nextDate, vet, notes, by, createdAt });
  } else if (modalType === 'owner') {
    const name = document.getElementById('m-name').value.trim();
    if (name) {
      const colors = ['#FF8A65', '#4DB6AC', '#B39DDB', '#81C784', '#FFB74D'];
      state.owners.push({
        id: uid(),
        name,
        role: 'caregiver',
        color: colors[state.owners.length % colors.length]
      });
    }
  } else if (modalType === 'food') {
    const name = document.getElementById('m-food-name').value.trim();
    if (!name) return;
    const brand = document.getElementById('m-food-brand').value.trim();
    const type = document.getElementById('m-food-type').value;
    const bagSizeKg = parseFloat(document.getElementById('m-bag-size').value) || null;
    const defaultPortion = parseFloat(document.getElementById('m-default-portion').value) || null;

    state.foods.push({
      id: uid(),
      name,
      brand,
      type,
      bagSizeKg,
      defaultPortion,
      unit: 'г',
      remainingGrams: bagSizeKg ? bagSizeKg * 1000 : null,
      createdAt
    });
  }

  await saveState();
  closeModal();
  renderHome();
  if (modalType === 'health') renderHealth();
  if (modalType === 'owner' || modalType === 'food') renderProfile();
}

// ---------- Helpers ----------
async function deleteItem(collection, id) {
  if (!confirm('Изтриване?')) return;
  state[collection] = state[collection].filter(i => i.id !== id);
  await saveState();
  renderHome();
  if (collection === 'health') renderHealth();
}

function editPet() {
  alert('Редактирането на профила ще бъде добавено скоро.');
}

function selectIcon(emoji) {
  state.selectedIcon = emoji;
  document.querySelectorAll('.icon-opt').forEach(btn => {
    btn.classList.remove('ring-2', 'ring-coral');
    btn.classList.add('bg-peach/50');
  });
  if (event && event.target) {
    event.target.classList.add('ring-2', 'ring-coral');
    event.target.classList.remove('bg-peach/50');
  }
  saveState();
}

async function resetApp() {
  if (!confirm('Сигурен ли си? Всички данни за този любимец ще бъдат изтрити.')) return;
  
  if (state.petId) {
    try {
      await db.collection('pets').doc(state.petId).delete();
    } catch (e) {}
  }
  localStorage.removeItem(LOCAL_PET_ID_KEY);
  localStorage.removeItem(LOCAL_CACHE_KEY);
  if (unsubscribe) unsubscribe();
  location.reload();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  return d.toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateStr(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'току-що';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return formatDateStr(iso.slice(0, 10));
}

// Start
init();
