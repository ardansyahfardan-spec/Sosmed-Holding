(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const client = () => window.__ghoustorySupabaseClient || null;
  let currentUser = null;
  let activeTab = 'ideas';
  let cachedIdeas = [];
  let cachedTasks = [];
  let cachedActivity = [];
  let aiUsageCount = null;

  function status(message, error = false) {
    const el = $('workspace-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'text-xs mt-3 ' + (error ? 'text-red-300' : 'text-emerald-300');
  }
  function dateLabel(value) {
    if (!value) return 'Tanpa tenggat';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Tanpa tenggat' : d.toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
  }
  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('[data-workspace-tab]').forEach(el => {
      const on = el.dataset.workspaceTab === tab;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    ['ideas','tasks','monitor'].forEach(key => {
      const panel = $('workspace-panel-' + key);
      if (panel) panel.classList.toggle('hidden', key !== tab);
    });
    if (tab === 'monitor') renderMonitor();
  }
  function renderIdeas() {
    const root = $('workspace-ideas-list');
    if (!root) return;
    if (!cachedIdeas.length) {
      root.innerHTML = '<p class="workspace-empty">Belum ada ide. Jadilah Crew pertama yang mengirimkan gagasan.</p>';
      return;
    }
    root.innerHTML = cachedIdeas.map(item => `
      <article class="workspace-item">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0"><h3>${esc(item.title)}</h3><p>${esc(item.description || 'Tanpa deskripsi')}</p></div>
          <span class="workspace-pill">${esc(item.status)}</span>
        </div>
        <div class="workspace-meta"><span>${esc(item.category)}</span><span>${dateLabel(item.created_at)}</span></div>
      </article>`).join('');
  }
  function renderTasks() {
    const root = $('workspace-tasks-list');
    if (!root) return;
    if (!cachedTasks.length) {
      root.innerHTML = '<p class="workspace-empty">Belum ada tugas. Tambahkan tugas pertama untuk Crew.</p>';
      return;
    }
    root.innerHTML = cachedTasks.map(item => `
      <article class="workspace-item">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0"><h3>${esc(item.title)}</h3><p>${esc(item.description || 'Tanpa deskripsi')}</p></div>
          <span class="workspace-pill">${esc(item.status.replace('_',' '))}</span>
        </div>
        <div class="workspace-meta"><span>Prioritas: ${esc(item.priority)}</span><span>${dateLabel(item.due_at)}</span></div>
        ${item.status !== 'done' && item.status !== 'cancelled' ? '<button class="workspace-action" data-complete-task="' + esc(item.id) + '">Tandai selesai</button>' : ''}
      </article>`).join('');
  }
  function renderMonitor() {
    const values = [
      ['Ide Crew', cachedIdeas.length],
      ['Tugas', cachedTasks.length],
      ['Aktivitas tercatat', cachedActivity.length],
      ['Catatan pemakaian AI', aiUsageCount === null ? 'Admin saja' : aiUsageCount]
    ];
    const root = $('workspace-monitor-grid');
    if (root) root.innerHTML = values.map(([label,value]) => `<div class="workspace-stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
    const activity = $('workspace-activity-list');
    if (activity) activity.innerHTML = cachedActivity.length ? cachedActivity.map(a => `<div class="workspace-activity-row"><b>${esc(a.action)} · ${esc(a.entity_type)}</b><span>${dateLabel(a.created_at)}</span></div>`).join('') : '<p class="workspace-empty">Belum ada aktivitas.</p>';
    const note = $('workspace-monitor-note');
    if (note) note.textContent = 'Angka ini adalah jumlah data fitur Workspace, bukan batas kuota Supabase. Pencatatan token dan provider AI belum dihubungkan ke Edge Function.';
  }
  async function loadWorkspace() {
    const db = client();
    if (!db) { status('Koneksi database belum siap. Muat ulang setelah login.', true); return; }
    status('Memuat data Workspace…');
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth?.user) { status('Silakan login terlebih dahulu.', true); return; }
    currentUser = auth.user;
    const [ideas, tasks, activity, aiCount] = await Promise.all([
      db.from('ghoustory_workspace_ideas').select('id,title,description,category,status,created_by,created_at').order('created_at',{ascending:false}).limit(40),
      db.from('ghoustory_workspace_tasks').select('id,title,description,status,priority,due_at,assigned_to,created_by,created_at').order('created_at',{ascending:false}).limit(40),
      db.from('ghoustory_workspace_activity').select('id,entity_type,action,created_at').order('created_at',{ascending:false}).limit(20),
      Promise.resolve({data:[],error:null,count:null})
    ]);
    if (ideas.error || tasks.error || activity.error) {
      const err = ideas.error || tasks.error || activity.error;
      status(err.message.includes('does not exist') ? 'Fitur belum aktif: migration Workspace belum diterapkan.' : 'Gagal memuat Workspace: ' + err.message, true);
      return;
    }
    cachedIdeas = ideas.data || [];
    cachedTasks = tasks.data || [];
    cachedActivity = activity.data || [];
    aiUsageCount = null;
    renderIdeas(); renderTasks(); renderMonitor();
    status('Workspace tersinkron. Daftar dibatasi 40 item per kategori agar query tetap ringan.');
  }
  async function submitIdea(event) {
    event.preventDefault();
    const db = client();
    const title = $('workspace-idea-title')?.value.trim() || '';
    const description = $('workspace-idea-description')?.value.trim() || '';
    const category = $('workspace-idea-category')?.value || 'Umum';
    if (title.length < 3) return status('Judul ide minimal 3 karakter.', true);
    const button = $('workspace-idea-submit');
    if (button) button.disabled = true;
    const { error } = await db.from('ghoustory_workspace_ideas').insert({title,description,category,created_by:currentUser.id});
    if (button) button.disabled = false;
    if (error) return status('Ide gagal dikirim: ' + error.message, true);
    $('workspace-idea-form')?.reset();
    status('Ide berhasil dikirim ke Crew.');
    await loadWorkspace();
  }
  async function submitTask(event) {
    event.preventDefault();
    const db = client();
    const title = $('workspace-task-title')?.value.trim() || '';
    const description = $('workspace-task-description')?.value.trim() || '';
    const priority = $('workspace-task-priority')?.value || 'normal';
    const due = $('workspace-task-due')?.value || '';
    if (title.length < 3) return status('Judul tugas minimal 3 karakter.', true);
    const button = $('workspace-task-submit');
    if (button) button.disabled = true;
    const { error } = await db.from('ghoustory_workspace_tasks').insert({title,description,priority,due_at:due ? new Date(due).toISOString() : null,created_by:currentUser.id});
    if (button) button.disabled = false;
    if (error) return status('Tugas gagal dibuat: ' + error.message, true);
    $('workspace-task-form')?.reset();
    status('Tugas berhasil ditambahkan.');
    await loadWorkspace();
  }
  async function completeTask(id) {
    const db = client();
    const task = cachedTasks.find(x => x.id === id);
    if (!task) return;
    const { error } = await db.from('ghoustory_workspace_tasks').update({status:'done'}).eq('id',id);
    if (error) return status('Status tugas tidak dapat diubah: ' + error.message, true);
    await loadWorkspace();
  }
  function bind() {
    $('workspace-idea-form')?.addEventListener('submit', submitIdea);
    $('workspace-task-form')?.addEventListener('submit', submitTask);
    document.querySelectorAll('[data-workspace-tab]').forEach(el => el.addEventListener('click', () => setTab(el.dataset.workspaceTab)));
    $('workspace-refresh')?.addEventListener('click', loadWorkspace);
    $('workspace-ideas-list')?.addEventListener('click', event => {
      const button = event.target.closest('[data-complete-task]');
      if (button) completeTask(button.dataset.completeTask);
    });
    $('workspace-tasks-list')?.addEventListener('click', event => {
      const button = event.target.closest('[data-complete-task]');
      if (button) completeTask(button.dataset.completeTask);
    });
    document.querySelectorAll('[data-open-workspace]').forEach(el => el.addEventListener('click', () => {
      if (typeof window.showPage === 'function') window.showPage('workspace');
      else document.getElementById('page-workspace')?.classList.add('page-active');
      loadWorkspace();
    }));
    document.querySelectorAll('[data-workspace-tab]').forEach(el => el.setAttribute('type','button'));
    const page = $('page-workspace');
    if (page) {
      const observer = new MutationObserver(() => {
        if (page.classList.contains('page-active')) loadWorkspace();
      });
      observer.observe(page,{attributes:true,attributeFilter:['class']});
    }
  }
  function addStyles() {
    if ($('workspace-hub-styles')) return;
    const style = document.createElement('style');
    style.id = 'workspace-hub-styles';
    style.textContent = `
      #page-workspace{max-width:920px;padding:8px 4px 30px}
      #page-workspace .workspace-panel{background:#15161b;border:1px solid rgba(233,223,207,.12);border-radius:16px;padding:14px;margin:12px 0}
      #page-workspace .workspace-panel h3{font-size:14px;font-weight:700;color:#eee8dd;margin-bottom:8px}
      #page-workspace .workspace-input{width:100%;background:#0c0d11;border:1px solid #34353d;border-radius:10px;padding:11px 12px;color:#eee8dd;font-size:14px;margin:5px 0}
      #page-workspace .workspace-button{background:#a94d58;color:#fff;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:700}
      #page-workspace .workspace-button:disabled{opacity:.45}
      #page-workspace .workspace-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:14px 0}
      #page-workspace .workspace-tab{background:#17181e;border:1px solid #34353d;border-radius:10px;padding:10px 6px;color:#b9b9bd;font-size:12px}
      #page-workspace .workspace-tab.is-active{background:#30262a;border-color:#a94d58;color:#f2dfd5}
      #page-workspace .workspace-item{background:#101116;border:1px solid #292b33;border-radius:12px;padding:12px;margin:8px 0;min-width:0}
      #page-workspace .workspace-item h3{font-size:13px;font-weight:700;margin:0 0 5px;overflow-wrap:anywhere}
      #page-workspace .workspace-item p{font-size:12px;color:#b9bac2;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
      #page-workspace .workspace-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;margin-top:9px;font-size:10px;color:#8f929d}
      #page-workspace .workspace-pill{font-size:10px;color:#e6c7b8;background:#382b2d;border-radius:999px;padding:4px 7px;white-space:nowrap}
      #page-workspace .workspace-empty{font-size:12px;color:#858892;text-align:center;padding:18px 8px}
      #page-workspace .workspace-action{font-size:11px;color:#b9d8c0;margin-top:10px;padding:5px 0}
      #page-workspace .workspace-stat{background:#101116;border:1px solid #292b33;border-radius:12px;padding:12px;min-width:0}
      #page-workspace .workspace-stat span{display:block;font-size:10px;color:#999ca6}
      #page-workspace .workspace-stat b{display:block;font-size:20px;color:#eee8dd;margin-top:5px}
      #page-workspace .workspace-activity-row{display:flex;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid #292b33;font-size:11px}
      #page-workspace .workspace-activity-row span{color:#9295a0}
      @media(max-width:520px){#page-workspace .workspace-panel{padding:11px}#page-workspace .workspace-tabs{gap:4px}#page-workspace .workspace-tab{font-size:11px;padding:9px 3px}}
    `;
    document.head.appendChild(style);
  }
  function boot() {
    addStyles();
    bind();
    if (document.querySelector('#page-workspace.page-active')) loadWorkspace();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  window.GhoustoryWorkspace = { refresh: loadWorkspace, setTab };
})();