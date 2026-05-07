/**
 * admin.js
 * Admin-only features:
 *   – Add Video
 *   – Manage Home Page Tags
 *   – View / Ban / Delete Users
 *
 * This file is loaded after main.js and firebase-app.js.
 * It exposes a single entry-point: initAdminPanel()
 * which is called by main.js when an admin logs in.
 */

/* ═══════════════════════════════════════════
   INIT ADMIN PANEL
═══════════════════════════════════════════ */
function initAdminPanel() {
  // Admin sub-tab switching
  document.querySelectorAll('.atab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.atab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById('atab-' + btn.dataset.atab);
      if (target) target.classList.add('active');
    });
  });

  // Wire up each admin feature
  setupAddVideo();
  setupManageTags();
  setupManageUsers();
}

/* ═══════════════════════════════════════════
   1. ADD VIDEO
═══════════════════════════════════════════ */
function setupAddVideo() {
  const btn = document.getElementById('btn-add-video');
  const msg = document.getElementById('add-video-msg');

  // Avoid duplicate listeners by cloning the button
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);

  fresh.addEventListener('click', async () => {
    msg.textContent = '';
    const title  = document.getElementById('a-title').value.trim();
    const thumb  = document.getElementById('a-thumb').value.trim();
    const embed  = document.getElementById('a-embed').value.trim();
    const target = document.getElementById('a-target').value.trim();
    const rawTags = document.getElementById('a-tags').value.trim();

    if (!title || !thumb || !embed || !target) {
      msg.style.color = '#ff6b6b';
      msg.textContent = 'Please fill all required fields.';
      return;
    }

    // Parse tags: split by comma, trim, filter empty
    const tags = rawTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    try {
      fresh.disabled = true;
      fresh.textContent = 'Adding…';

      await db.collection('videos').add({
        title,
        thumbnail: thumb,
        embedUrl:  embed,
        targetUrl: target,
        tags,
        views:     0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      msg.style.color = '#6bffb8';
      msg.textContent = '✔ Video added successfully!';

      // Clear fields
      ['a-title','a-thumb','a-embed','a-target','a-tags'].forEach(id => {
        document.getElementById(id).value = '';
      });

    } catch (e) {
      msg.style.color = '#ff6b6b';
      msg.textContent = 'Error: ' + e.message;
    } finally {
      fresh.disabled = false;
      fresh.textContent = '➕ Add Video';
    }
  });
}

/* ═══════════════════════════════════════════
   2. MANAGE HOME PAGE TAGS
═══════════════════════════════════════════ */
async function setupManageTags() {
  const textarea = document.getElementById('tags-textarea');
  const saveBtn  = document.getElementById('btn-save-tags');
  const msg      = document.getElementById('tags-msg');

  // Load existing tags into textarea
  try {
    const snap = await db.collection('site_tags').doc('active_tags').get();
    if (snap.exists) {
      const list = snap.data().list || [];
      textarea.value = list.join(', ');
    }
  } catch (e) {
    console.error('Tags load error:', e);
  }

  // Clone to avoid duplicate listeners
  const fresh = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(fresh, saveBtn);

  fresh.addEventListener('click', async () => {
    msg.textContent = '';
    const raw = textarea.value.trim();
    const list = raw
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    try {
      fresh.disabled = true;
      await db.collection('site_tags').doc('active_tags').set({ list }, { merge: true });

      msg.style.color = '#6bffb8';
      msg.textContent = '✔ Tags saved!';

      // Refresh tags in the UI (reload State.activeTags & re-render)
      State.activeTags = list;
      renderTags();

    } catch (e) {
      msg.style.color = '#ff6b6b';
      msg.textContent = 'Error: ' + e.message;
    } finally {
      fresh.disabled = false;
    }
  });
}

/* ═══════════════════════════════════════════
   3. MANAGE USERS
═══════════════════════════════════════════ */
async function setupManageUsers() {
  const container = document.getElementById('users-list');
  container.innerHTML = '<span class="muted">Loading users…</span>';

  try {
    // NOTE: Firebase Auth Admin SDK is server-side only.
    // Here we read from the `users` Firestore collection.
    const snap = await db.collection('users').limit(50).get();

    if (snap.empty) {
      container.innerHTML = '<span class="muted">No users found.</span>';
      return;
    }

    container.innerHTML = '';
    snap.docs.forEach(doc => renderUserRow(doc, container));

  } catch (e) {
    container.innerHTML = '<span class="muted">Error loading users: ' + e.message + '</span>';
  }
}

function renderUserRow(doc, container) {
  const data = doc.data();
  const uid  = doc.id;

  const row = document.createElement('div');
  row.className = 'user-row';
  row.id        = 'user-row-' + uid;

  const info = document.createElement('div');
  info.className   = 'user-row-info';
  info.innerHTML   = `
    <strong>${escapeHtml(data.username || 'Unknown')}</strong>
    <br /><span class="muted">${escapeHtml(data.email || '')}</span>
  `;

  const actions = document.createElement('div');
  actions.className = 'user-row-actions';

  const banBtn = document.createElement('button');
  banBtn.className   = 'btn-ban';
  banBtn.textContent = '🚫 Ban';
  banBtn.addEventListener('click', () => banUser(uid, data.email, row));

  const delBtn = document.createElement('button');
  delBtn.className   = 'btn-del-user';
  delBtn.textContent = '🗑 Delete';
  delBtn.addEventListener('click', () => deleteUserDoc(uid, row));

  actions.appendChild(banBtn);
  actions.appendChild(delBtn);
  row.appendChild(info);
  row.appendChild(actions);
  container.appendChild(row);
}

async function banUser(uid, email, rowEl) {
  const reason = prompt(`Ban reason for ${email}:`);
  if (reason === null) return; // Cancelled
  try {
    await db.collection('banned_users').doc(uid).set({
      email:  email || '',
      reason: reason || 'No reason given.',
    });
    rowEl.querySelector('.user-row-info').insertAdjacentHTML(
      'beforeend',
      '<br /><span style="color:#ffaa40;font-size:0.75rem;">⚠ Banned</span>'
    );
    rowEl.querySelector('.btn-ban').disabled = true;
  } catch (e) {
    alert('Error banning user: ' + e.message);
  }
}

async function deleteUserDoc(uid, rowEl) {
  if (!confirm('Delete this user record from Firestore?')) return;
  try {
    await db.collection('users').doc(uid).delete();
    rowEl.remove();
  } catch (e) {
    alert('Error deleting user: ' + e.message);
  }
}

/* ═══════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
