/**
 * main.js
 * Core application logic:
 *   – Splash / Age Gate
 *   – Auth (login / register / ban-check)
 *   – Video grid, tags, search, pagination
 *   – Profile panel (user)
 */

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const ADMIN_EMAIL    = 'mallikabdurrahman37@gmail.com';
const PAGE_SIZE      = 12;
const EMOJIS         = ['😀','😎','🤖','👾','🦊','🐱','🐻','🦁','🐼','🐸','🐯','👽','👻','🎭','🎃','🔥','💎','⚡','🌙','🌟'];

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const State = {
  currentUser:    null,
  activeTags:     [],
  activeFilter:   null,   // selected tag string or null
  searchQuery:    null,
  currentPage:    1,
  // Firestore cursor docs for keyset pagination
  pageCursors:    [null], // index 0 = start (no cursor), index N = startAfter doc for page N+1
  totalFetched:   0,
  lastVisible:    null,
};

/* ═══════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const dom = {
  splash:           $('splash-screen'),
  ageGate:          $('age-gate'),
  authModal:        $('auth-modal'),
  profileModal:     $('profile-modal'),
  searchBar:        $('search-bar'),
  searchInput:      $('search-input'),
  tagsRow:          $('tags-row'),
  viewMoreTagsBtn:  $('btn-view-more-tags'),
  videoGrid:        $('video-grid'),
  pagination:       $('pagination'),
  // Auth
  loginEmail:       $('login-email'),
  loginPassword:    $('login-password'),
  loginError:       $('login-error'),
  regUsername:      $('reg-username'),
  regEmail:         $('reg-email'),
  regPassword:      $('reg-password'),
  regError:         $('reg-error'),
  // Profile
  avatarDisplay:    $('avatar-display'),
  displayUsername:  $('display-username'),
  displayEmail:     $('display-email'),
  emojiPicker:      $('emoji-picker'),
  updateUsername:   $('update-username'),
  historyList:      $('history-list'),
  userPanel:        $('user-panel'),
  adminPanel:       $('admin-panel'),
};

/* ═══════════════════════════════════════════
   SPLASH SCREEN
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    dom.splash.classList.add('fade-out');
    dom.splash.addEventListener('transitionend', () => dom.splash.remove(), { once: true });
  }, 800);

  initAgeGate();
  initAuthUI();
  initSearchUI();
  initProfileUI();
  initEmojiPicker();
  loadActiveTags();

  auth.onAuthStateChanged(handleAuthStateChange);
});

/* ═══════════════════════════════════════════
   AGE GATE
═══════════════════════════════════════════ */
function initAgeGate() {
  if (localStorage.getItem('age_verified') === '1') return;
  dom.ageGate.classList.remove('hidden');

  $('btn-over18').addEventListener('click', () => {
    localStorage.setItem('age_verified', '1');
    dom.ageGate.classList.add('hidden');
  });
  $('btn-under18').addEventListener('click', () => {
    window.location.href = 'https://google.com';
  });
}

/* ═══════════════════════════════════════════
   AUTH STATE HANDLER
═══════════════════════════════════════════ */
async function handleAuthStateChange(user) {
  if (!user) {
    State.currentUser = null;
    loadVideos();
    return;
  }

  // Ban check
  const bannedSnap = await db.collection('banned_users').doc(user.uid).get();
  if (bannedSnap.exists) {
    await auth.signOut();
    alert('Your account has been banned. Reason: ' + (bannedSnap.data().reason || 'Violation of terms.'));
    return;
  }

  State.currentUser = user;
  loadVideos();
}

/* ═══════════════════════════════════════════
   AUTH MODAL UI
═══════════════════════════════════════════ */
function initAuthUI() {
  // Toggle modal from profile button when not logged in
  $('btn-profile-toggle').addEventListener('click', () => {
    if (State.currentUser) {
      openProfilePanel();
    } else {
      dom.authModal.classList.remove('hidden');
    }
  });
  $('auth-close').addEventListener('click', () => dom.authModal.classList.add('hidden'));

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Login
  $('btn-login').addEventListener('click', async () => {
    const email = dom.loginEmail.value.trim();
    const pass  = dom.loginPassword.value;
    dom.loginError.textContent = '';
    if (!email || !pass) { dom.loginError.textContent = 'Please fill all fields.'; return; }
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      dom.authModal.classList.add('hidden');
    } catch (e) {
      dom.loginError.textContent = friendlyAuthError(e.code);
    }
  });

  // Register
  $('btn-register').addEventListener('click', async () => {
    const username = dom.regUsername.value.trim();
    const email    = dom.regEmail.value.trim();
    const pass     = dom.regPassword.value;
    dom.regError.textContent = '';
    if (!username || !email || !pass) { dom.regError.textContent = 'Please fill all fields.'; return; }
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await db.collection('users').doc(cred.user.uid).set({
        username,
        email,
        avatar: '😀',
      });
      dom.authModal.classList.add('hidden');
    } catch (e) {
      dom.regError.textContent = friendlyAuthError(e.code);
    }
  });
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':      'No account found with this email.',
    'auth/wrong-password':      'Incorrect password.',
    'auth/email-already-in-use':'Email already registered.',
    'auth/weak-password':       'Password must be at least 6 characters.',
    'auth/invalid-email':       'Invalid email address.',
  };
  return map[code] || 'Authentication error. Try again.';
}

/* ═══════════════════════════════════════════
   SEARCH UI
═══════════════════════════════════════════ */
function initSearchUI() {
  $('btn-search-toggle').addEventListener('click', () => {
    dom.searchBar.classList.toggle('hidden');
    if (!dom.searchBar.classList.contains('hidden')) dom.searchInput.focus();
  });

  const doSearch = () => {
    const q = dom.searchInput.value.trim();
    State.searchQuery  = q || null;
    State.activeFilter = null;
    State.currentPage  = 1;
    State.pageCursors  = [null];
    document.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
    loadVideos();
  };

  $('btn-search-go').addEventListener('click', doSearch);
  dom.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  $('btn-search-clear').addEventListener('click', () => {
    dom.searchInput.value = '';
    State.searchQuery  = null;
    State.currentPage  = 1;
    State.pageCursors  = [null];
    dom.searchBar.classList.add('hidden');
    loadVideos();
  });
}

/* ═══════════════════════════════════════════
   TAGS
═══════════════════════════════════════════ */
async function loadActiveTags() {
  try {
    const snap = await db.collection('site_tags').doc('active_tags').get();
    if (!snap.exists) return;
    State.activeTags = snap.data().list || [];
    renderTags();
  } catch (e) {
    console.error('Tags load error:', e);
  }
}

function renderTags() {
  dom.tagsRow.innerHTML = '';
  State.activeTags.forEach(tag => {
    const pill = document.createElement('button');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    pill.addEventListener('click', () => {
      const isActive = pill.classList.contains('active');
      document.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
      if (isActive) {
        State.activeFilter = null;
      } else {
        pill.classList.add('active');
        State.activeFilter = tag;
      }
      State.searchQuery = null;
      dom.searchInput.value = '';
      State.currentPage = 1;
      State.pageCursors = [null];
      loadVideos();
    });
    dom.tagsRow.appendChild(pill);
  });

  // Detect overflow → show "View More"
  requestAnimationFrame(() => {
    const rowH   = dom.tagsRow.scrollHeight;
    const twoRow = parseInt(getComputedStyle(dom.tagsRow).maxHeight);
    
    if (rowH > twoRow) {
      dom.viewMoreTagsBtn.classList.remove('hidden');
      // Yahan se humne appendChild hata diya hai taaki button box ke bahar safe rahe
    } else {
      dom.viewMoreTagsBtn.classList.add('hidden');
    }
  });

  // Expand / Collapse Logic (Using onclick to prevent duplicate listeners)
  let expanded = false;
  dom.viewMoreTagsBtn.onclick = () => {
    expanded = !expanded;
    dom.tagsRow.classList.toggle('expanded', expanded);
    dom.viewMoreTagsBtn.textContent = expanded ? 'View Less ▴' : 'View More ▾';
  };
}

/* ═══════════════════════════════════════════
   VIDEO LOADING & RENDERING
═══════════════════════════════════════════ */
async function loadVideos() {
  dom.videoGrid.innerHTML = '<div class="loading-spinner">Loading videos…</div>';
  dom.pagination.innerHTML = '';

  try {
    let query = db.collection('videos').orderBy('createdAt', 'desc');

    // Tag filter (array-contains)
    if (State.activeFilter) {
      query = query.where('tags', 'array-contains', State.activeFilter);
    }

    // Search: Firestore has no native full-text search.
    // We use a simple client-side title filter approach:
    // fetch more docs and filter. For scale, use Algolia/Typesense.
    // Here we fetch reasonably and filter.
    if (State.searchQuery) {
      // Fetch up to 200 docs and filter client-side (practical for small datasets)
      const snap = await query.limit(200).get();
      const q = State.searchQuery.toLowerCase();
      const allDocs = snap.docs.filter(d => d.data().title.toLowerCase().includes(q));
      renderPaginatedResults(allDocs);
      return;
    }

    // Keyset pagination using startAfter
    const cursor = State.pageCursors[State.currentPage - 1];
    if (cursor) query = query.startAfter(cursor);
    query = query.limit(PAGE_SIZE);

    const snap = await query.get();
    State.lastVisible = snap.docs[snap.docs.length - 1] || null;

    // Store cursor for the NEXT page if not already stored
    if (snap.docs.length === PAGE_SIZE && !State.pageCursors[State.currentPage]) {
      State.pageCursors[State.currentPage] = State.lastVisible;
    }

    renderVideoCards(snap.docs);
    renderPagination(snap.docs.length);

  } catch (e) {
    dom.videoGrid.innerHTML = '<div class="loading-spinner">Error loading videos.</div>';
    console.error(e);
  }
}

function renderPaginatedResults(allDocs) {
  const start = (State.currentPage - 1) * PAGE_SIZE;
  const slice = allDocs.slice(start, start + PAGE_SIZE);
  renderVideoCards(slice);

  // Build pagination for client-side filtered results
  const totalPages = Math.ceil(allDocs.length / PAGE_SIZE);
  renderPaginationSimple(totalPages);
}

function renderVideoCards(docs) {
  if (docs.length === 0) {
    dom.videoGrid.innerHTML = '<div class="loading-spinner">No videos found.</div>';
    return;
  }
  dom.videoGrid.innerHTML = '';
  docs.forEach(doc => {
    const data = doc.data();
    dom.videoGrid.appendChild(createVideoCard(doc.id, data));
  });
}

function createVideoCard(id, data) {
  const card = document.createElement('div');
  card.className = 'video-card glass';

  // Sirf Thumbnail (Koi play overlay nahi)
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'card-thumb-wrap';

  const img = document.createElement('img');
  img.src    = data.thumbnail || 'https://via.placeholder.com/320x180?text=No+Thumb';
  img.alt    = data.title;
  img.loading = 'lazy';

  thumbWrap.appendChild(img);

  // Card Info
  const info = document.createElement('div');
  info.className = 'card-info';

  const title = document.createElement('a');
  title.className = 'card-title';
  title.textContent = data.title || 'Untitled';
  title.href = data.targetUrl || '#';
  title.target = '_blank';

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = `👁 ${formatViews(data.views || 0)} views`;

  info.appendChild(title);
  info.appendChild(meta);
  card.appendChild(thumbWrap);
  card.appendChild(info);

  // CLICK LOGIC: Direct Redirect + View Count
  const handleClick = (e) => {
    e.preventDefault(); 

    // 1. Background mein view counter badhana (Silent)
    db.collection('videos').doc(id).update({ views: FieldValue.increment(1) }).catch(() => {});
    
    // 2. Watch History save karna (agar login hai)
    if (State.currentUser) {
      db.collection('users').doc(State.currentUser.uid)
        .collection('history').add({ videoId: id, watchedAt: FieldValue.serverTimestamp() })
        .catch(() => {});
    }

    // 3. Direct Asli Website Par Bhejna (No Glitch)
    if (data.targetUrl) {
      window.open(data.targetUrl, '_blank');
    }
  };

  thumbWrap.addEventListener('click', handleClick);
  title.addEventListener('click', handleClick);

  return card;
}

function formatViews(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

/* ═══════════════════════════════════════════
   PAGINATION (Firestore keyset)
═══════════════════════════════════════════ */
function renderPagination(fetchedCount) {
  dom.pagination.innerHTML = '';

  const hasNext = fetchedCount === PAGE_SIZE && State.pageCursors[State.currentPage];
  const hasPrev = State.currentPage > 1;

  if (!hasPrev && !hasNext) return;

  if (hasPrev) {
    const prev = makePagerBtn('← Prev', false);
    prev.addEventListener('click', () => {
      State.currentPage--;
      loadVideos();
    });
    dom.pagination.appendChild(prev);
  }

  // Show surrounding page numbers based on stored cursors
  const totalKnown = State.pageCursors.length; // pages we know about
  for (let i = 1; i <= totalKnown; i++) {
    if (i > 1 && !State.pageCursors[i - 1]) break;
    const btn = makePagerBtn(String(i), i === State.currentPage);
    btn.addEventListener('click', () => {
      State.currentPage = i;
      loadVideos();
    });
    dom.pagination.appendChild(btn);
  }

  if (hasNext) {
    const next = makePagerBtn('Next →', false);
    next.classList.add('wide');
    next.addEventListener('click', () => {
      State.currentPage++;
      loadVideos();
    });
    dom.pagination.appendChild(next);
  }
}

function renderPaginationSimple(totalPages) {
  dom.pagination.innerHTML = '';
  if (totalPages <= 1) return;
  for (let i = 1; i <= totalPages; i++) {
    const btn = makePagerBtn(String(i), i === State.currentPage);
    const page = i;
    btn.addEventListener('click', () => {
      State.currentPage = page;
      loadVideos();
    });
    dom.pagination.appendChild(btn);
  }
}

function makePagerBtn(label, isActive) {
  const btn = document.createElement('button');
  btn.className = 'page-btn' + (isActive ? ' active' : '');
  btn.textContent = label;
  return btn;
}

/* ═══════════════════════════════════════════
   PROFILE PANEL
═══════════════════════════════════════════ */
function initProfileUI() {
  $('profile-close').addEventListener('click', () => dom.profileModal.classList.add('hidden'));
  $('btn-logout').addEventListener('click', () => {
    auth.signOut();
    dom.profileModal.classList.add('hidden');
  });

  $('btn-update-profile').addEventListener('click', updateProfile);
  $('btn-clear-history').addEventListener('click', clearHistory);
}

async function openProfilePanel() {
  dom.profileModal.classList.remove('hidden');

  const uid  = State.currentUser.uid;
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() || {};

  dom.displayUsername.textContent = data.username || 'User';
  dom.displayEmail.textContent    = State.currentUser.email;
  dom.avatarDisplay.textContent   = data.avatar || '😀';
  dom.updateUsername.value        = data.username || '';

  // Mark selected emoji
  document.querySelectorAll('.emoji-opt').forEach(e => {
    e.classList.toggle('selected', e.dataset.emoji === (data.avatar || '😀'));
  });

  // Show user or admin panel
  const isAdmin = State.currentUser.email === ADMIN_EMAIL;
  dom.userPanel.classList.toggle('hidden', isAdmin);
  dom.adminPanel.classList.toggle('hidden', !isAdmin);

  if (isAdmin) {
    // Admin logic handled in admin.js
    initAdminPanel();
  } else {
    loadHistory(uid);
  }
}

function initEmojiPicker() {
  EMOJIS.forEach(em => {
    const span = document.createElement('span');
    span.className    = 'emoji-opt';
    span.textContent  = em;
    span.dataset.emoji = em;
    span.addEventListener('click', () => {
      document.querySelectorAll('.emoji-opt').forEach(e => e.classList.remove('selected'));
      span.classList.add('selected');
      dom.avatarDisplay.textContent = em;
    });
    dom.emojiPicker.appendChild(span);
  });
}

async function updateProfile() {
  if (!State.currentUser) return;
  const username = dom.updateUsername.value.trim();
  const avatar   = dom.avatarDisplay.textContent;
  if (!username) { alert('Username cannot be empty.'); return; }
  await db.collection('users').doc(State.currentUser.uid).update({ username, avatar });
  dom.displayUsername.textContent = username;
  alert('Profile updated!');
}

async function loadHistory(uid) {
  dom.historyList.innerHTML = '<span class="muted">Loading…</span>';
  const snap = await db.collection('users').doc(uid).collection('history')
    .orderBy('watchedAt', 'desc').limit(20).get();
  if (snap.empty) {
    dom.historyList.innerHTML = '<span class="muted">No history yet.</span>';
    return;
  }
  dom.historyList.innerHTML = '';
  snap.docs.forEach(d => {
    const item = document.createElement('div');
    item.className   = 'history-item';
    item.innerHTML   = `🎬 <span>${d.data().videoId}</span>`;
    dom.historyList.appendChild(item);
  });
}

async function clearHistory() {
  if (!State.currentUser || !confirm('Clear all watch history?')) return;
  const snap = await db.collection('users').doc(State.currentUser.uid)
    .collection('history').get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  dom.historyList.innerHTML = '<span class="muted">History cleared.</span>';
}
