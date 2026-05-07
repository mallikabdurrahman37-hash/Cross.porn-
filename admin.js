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
    setupManageVideos(); // NEW LINE FOR VIDEO MANAGER

}

/* ═══════════════════════════════════════════
   1. AUTO FETCH & ADD VIDEO
═══════════════════════════════════════════ */
function setupAddVideo() {
  const btn = document.getElementById('btn-add-video');
  const msg = document.getElementById('add-video-msg');

  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);

  fresh.addEventListener('click', async () => {
    msg.textContent = '';
    const videoUrl = document.getElementById('a-video-url').value.trim();
    const rawTags = document.getElementById('a-tags').value.trim();

    if (!videoUrl) {
      msg.style.color = '#ff6b6b';
      msg.textContent = '❌ Please provide a Video URL.';
      return;
    }

    const tags = rawTags.split(',').map(t => t.trim()).filter(t => t.length > 0);

    try {
      fresh.disabled = true;
      fresh.textContent = 'Fetching data... ⏳';
      msg.style.color = '#fff';
      msg.textContent = 'Scraping video details from website...';

      // Microlink API Fetch
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(videoUrl)}`);
      const data = await res.json();

      const title = data.data.title || "Unknown Title";
      const thumb = data.data.image ? data.data.image.url : "https://via.placeholder.com/320x180?text=No+Thumb";

      fresh.textContent = 'Saving to Database... ⏳';

      await db.collection('videos').add({
        title: title,
        thumbnail: thumb,
        embedUrl: videoUrl, 
        targetUrl: videoUrl,
        tags: tags,
        views: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      msg.style.color = '#6bffb8';
      msg.textContent = '✔ Video Auto-Fetched & Added Successfully!';

      document.getElementById('a-video-url').value = '';
      document.getElementById('a-tags').value = '';

      // Refresh list if manage videos is loaded
      setupManageVideos();

    } catch (e) {
      msg.style.color = '#ff6b6b';
      msg.textContent = 'Error: API blocked or invalid link. ' + e.message;
    } finally {
      fresh.disabled = false;
      fresh.textContent = '⚡ Auto Fetch & Add Video';
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

/* ═══════════════════════════════════════════
   4. MANAGE / DELETE VIDEOS
═══════════════════════════════════════════ */
async function setupManageVideos() {
  const container = document.getElementById('admin-video-list');
  if(!container) return;
  container.innerHTML = '<span class="muted">Loading videos...</span>';

  try {
    const snap = await db.collection('videos').orderBy('createdAt', 'desc').limit(50).get();
    
    if (snap.empty) {
      container.innerHTML = '<span class="muted">No videos uploaded yet.</span>';
      return;
    }
    
    container.innerHTML = '';
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      const row = document.createElement('div');
      row.className = 'user-row';
      
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
          <img src="${data.thumbnail}" style="width:60px; height:34px; object-fit:cover; border-radius:4px;">
          <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <strong>${escapeHtml(data.title)}</strong><br>
            <span class="muted" style="font-size:0.7rem;">Views: ${data.views || 0}</span>
          </div>
        </div>
      `;
      
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del-user';
      delBtn.textContent = '🗑 Delete';
      delBtn.addEventListener('click', async () => {
        if(!confirm('Are you sure you want to permanently delete this video?')) return;
        delBtn.textContent = '...';
        await db.collection('videos').doc(doc.id).delete();
        row.remove();
      });

      row.appendChild(delBtn);
      container.appendChild(row);
    });

  } catch (e) {
    container.innerHTML = '<span class="muted">Error loading videos: ' + e.message + '</span>';
  }
}
