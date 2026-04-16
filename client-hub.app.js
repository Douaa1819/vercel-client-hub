(function () {
  'use strict';

  const LS_KEY = 'clientHubBearerToken';
  const API = '/api/client-hub';

  let clients = [];
  let hubRole = null;
  let detailCache = null;
  let authConfigured = { googleOAuth: false };
  let clientsLoading = false;

  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function getToken() {
    return (localStorage.getItem(LS_KEY) || '').trim();
  }

  function setToken(t) {
    if (t) localStorage.setItem(LS_KEY, t);
    else localStorage.removeItem(LS_KEY);
  }

  function toast(msg, type) {
    const host = document.getElementById('toastHost');
    if (!host || !msg) return;
    const el = document.createElement('div');
    el.className = 'ch-toast ' + (type === 'err' ? 'ch-toast-err' : 'ch-toast-ok');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function authHeaders() {
    const t = getToken();
    const h = { Accept: 'application/json' };
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  async function api(path, opts) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { ...authHeaders(), ...(opts && opts.headers) },
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { _raw: text };
    }
    if (!res.ok) {
      const err = data.error || data.message || res.statusText || 'Request failed';
      throw new Error(err + ' (' + res.status + ')');
    }
    return data;
  }

  async function apiUpload(path, formData) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { _raw: text };
    }
    if (!res.ok) {
      const err = data.error || data.message || 'Upload failed';
      const ex = new Error(err + ' (' + res.status + ')');
      ex.payload = data;
      throw ex;
    }
    return data;
  }

  function parseHash() {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (!h) return { view: 'list' };
    if (h.startsWith('c/')) {
      return { view: 'detail', id: decodeURIComponent(h.slice(2)) };
    }
    return { view: 'list' };
  }

  function setHashForDetail(id) {
    window.location.hash = 'c/' + encodeURIComponent(id);
  }

  function clearHash() {
    window.location.hash = '';
  }

  function showLogin() {
    document.getElementById('loginSection').hidden = false;
    document.getElementById('mainSection').hidden = true;
  }

  function showMain() {
    document.getElementById('loginSection').hidden = true;
    document.getElementById('mainSection').hidden = false;
    renderHeaderActions();
  }

  function setClientsLoading(isLoading, message) {
    clientsLoading = !!isLoading;
    const tbody = document.getElementById('clientsTbody');
    const empty = document.getElementById('listEmpty');
    const refreshBtn = document.getElementById('refreshBtn');
    const loadingMessage = message || 'Loading clients from backend...';

    if (refreshBtn) {
      refreshBtn.disabled = clientsLoading;
      refreshBtn.textContent = clientsLoading ? 'Loading...' : 'Refresh';
    }

    if (!tbody || !empty) return;
    if (clientsLoading) {
      tbody.innerHTML =
        '<tr><td colspan="6"><div class="ch-loading-row"><span class="ch-spinner" aria-hidden="true"></span>' +
        esc(loadingMessage) +
        '</div></td></tr>';
      empty.hidden = true;
      return;
    }
  }

  function renderHeaderActions() {
    const el = document.getElementById('headerActions');
    const t = getToken();
    if (!t) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<button type="button" class="ch-btn ch-btn-ghost" id="logoutBtn">Sign out</button>';
    document.getElementById('logoutBtn').onclick = () => {
      setToken('');
      hubRole = null;
      clients = [];
      showLogin();
      document.getElementById('hubTokenInput').value = '';
    };
  }

  function pillClass(pay) {
    if (pay === 'paid') return 'ch-pill-paid';
    if (pay === 'failed') return 'ch-pill-failed';
    return 'ch-pill-unknown';
  }

  function filteredClients() {
    const q = (document.getElementById('tableSearch') && document.getElementById('tableSearch').value) || '';
    const fp = (document.getElementById('filterPay') && document.getElementById('filterPay').value) || '';
    const fo = (document.getElementById('filterOnb') && document.getElementById('filterOnb').value) || '';
    const ql = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (fp && (c.paymentStatus || '') !== fp) return false;
      if (fo && (c.onboardingStatus || '') !== fo) return false;
      if (!ql) return true;
      const hay = [c.name, c.locationId, c.onboardingStatus, c.paymentStatus, c.id, String(c.messageFailureRate)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(ql);
    });
  }

  function renderList() {
    if (clientsLoading) return;
    const tbody = document.getElementById('clientsTbody');
    const empty = document.getElementById('listEmpty');
    const rows = filteredClients();
    if (!rows.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      if (!clients.length) {
        empty.textContent =
          'No clients returned. Check MongoDB / GHL (server logs). If the API works, you should see at least GHL subaccounts.';
      } else {
        empty.textContent =
          'No clients match the current filters. Set onboarding to “All onboarding” and payment to “All payments”, or clear the search box.';
      }
      return;
    }
    empty.hidden = true;
    const keyOf = (c) => c.locationId || c.id;
    tbody.innerHTML = rows
      .map((c) => {
        const key = keyOf(c);
        const pct = c.messageFailureRate != null ? (Number(c.messageFailureRate) * 100).toFixed(2) + '%' : '—';
        return (
          '<tr data-key="' +
          esc(key) +
          '">' +
          '<td><div class="ch-cell-title">' +
          esc(c.name) +
          '</div><div class="ch-cell-sub">' +
          esc(c.id || '') +
          '</div></td>' +
          '<td>' +
          esc(c.locationId || '—') +
          '</td>' +
          '<td><span class="ch-pill ch-pill-onb">' +
          esc(c.onboardingStatus || '—') +
          '</span></td>' +
          '<td><span class="ch-pill ' +
          pillClass(c.paymentStatus) +
          '">' +
          esc(c.paymentStatus || '—') +
          '</span></td>' +
          '<td>' +
          esc(pct) +
          '</td>' +
          '<td><span class="ch-muted">View →</span></td>' +
          '</tr>'
        );
      })
      .join('');

    tbody.querySelectorAll('tr').forEach((tr) => {
      tr.onclick = () => {
        const key = tr.getAttribute('data-key');
        setHashForDetail(key);
        route();
      };
    });
  }

  async function loadClients() {
    setClientsLoading(true, 'Loading clients from backend...');
    try {
      const data = await api('/clients?page=1&pageSize=50');
      clients = data.clients || [];
      hubRole = data.role || hubRole;
      const rb = document.getElementById('roleBadge');
      if (rb) rb.textContent = hubRole ? 'Role: ' + hubRole : '';
      renderList();
      if (hubRole === 'editor') {
        loadPending().catch(() => {});
        loadUserPermissions().catch(() => {});
      } else {
        const p = document.getElementById('userPermPanel');
        if (p) {
          p.hidden = true;
          p.innerHTML = '';
        }
      }
    } finally {
      setClientsLoading(false);
    }
  }

  async function loadPending() {
    const wrap = document.getElementById('pendingPanel');
    if (!wrap || hubRole !== 'editor') return;
    try {
      const data = await api('/pending-changes');
      const list = data.pendingChanges || [];
      if (!list.length) {
        wrap.hidden = true;
        wrap.innerHTML = '';
        return;
      }
      wrap.hidden = false;
      wrap.innerHTML =
        '<h3>Pending approvals</h3><table class="ch-pending-table"><thead><tr><th>Client</th><th>Proposed</th><th></th></tr></thead><tbody>' +
        list
          .map((p) => {
            const id = p._id || p.id;
            const summary = JSON.stringify(p.proposed || {}).slice(0, 120) + '…';
            return (
              '<tr><td>' +
              esc(p.clientKey) +
              '</td><td><code>' +
              esc(summary) +
              '</code></td><td>' +
              '<button type="button" class="ch-btn ch-btn-primary ch-ap" data-id="' +
              esc(id) +
              '">Approve</button> ' +
              '<button type="button" class="ch-btn ch-btn-ghost ch-rj" data-id="' +
              esc(id) +
              '">Reject</button></td></tr>'
            );
          })
          .join('') +
        '</tbody></table>';

      wrap.querySelectorAll('.ch-ap').forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          try {
            await api('/pending-changes/' + encodeURIComponent(id) + '/approve', { method: 'POST' });
            toast('Change approved and applied.', 'ok');
            loadPending();
            loadClients();
          } catch (err) {
            toast(err.message, 'err');
          }
        };
      });
      wrap.querySelectorAll('.ch-rj').forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const reason = window.prompt('Reject reason (optional)') || '';
          try {
            await api('/pending-changes/' + encodeURIComponent(id) + '/reject', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason }),
            });
            toast('Change rejected.', 'ok');
            loadPending();
          } catch (err) {
            toast(err.message, 'err');
          }
        };
      });
    } catch {
      wrap.hidden = true;
    }
  }

  async function loadUserPermissions() {
    const wrap = document.getElementById('userPermPanel');
    if (!wrap || hubRole !== 'editor') return;
    try {
      const data = await api('/users');
      const users = Array.isArray(data.users) ? data.users : [];
      wrap.hidden = false;
      wrap.innerHTML =
        '<h3>User permissions</h3>' +
        '<p class="ch-muted" style="margin-bottom:0.75rem">Manage who can view/edit and which sub-accounts they can import into.</p>' +
        '<div class="ch-perm-invite">' +
        '<input id="permInviteEmail" class="ch-search" type="email" placeholder="invite.email@gmail.com" autocomplete="off" />' +
        '<select id="permInviteRole" class="ch-select"><option value="viewer">viewer</option><option value="editor">editor</option></select>' +
        '<input id="permInviteAllowed" class="ch-search ch-perm-allowed" placeholder="allowed location IDs (optional): locA, locB" />' +
        '<button type="button" class="ch-btn ch-btn-primary" id="permInviteSave">Invite / Update</button>' +
        '</div>' +
        '<table class="ch-pending-table ch-perm-table"><thead><tr><th>Email</th><th>Role</th><th>Allowed Location IDs (comma-separated)</th><th></th></tr></thead><tbody>' +
        users
          .map((u) => {
            const email = (u.email || '').toString().trim().toLowerCase();
            const role = (u.role || 'viewer').toString();
            const allowed = Array.isArray(u.allowedLocationIds) ? u.allowedLocationIds.join(', ') : '';
            return (
              '<tr>' +
              '<td><strong>' + esc(email || 'unknown') + '</strong><div class="ch-cell-sub">' + esc(u.name || '') + '</div></td>' +
              '<td><select class="ch-select ch-perm-role" data-email="' + esc(email) + '">' +
              '<option value="viewer"' + (role === 'viewer' ? ' selected' : '') + '>viewer</option>' +
              '<option value="editor"' + (role === 'editor' ? ' selected' : '') + '>editor</option>' +
              '</select></td>' +
              '<td><input class="ch-search ch-perm-allowed" data-email="' + esc(email) + '" value="' + esc(allowed) + '" placeholder="locA, locB, locC" /></td>' +
              '<td><button type="button" class="ch-btn ch-btn-primary ch-perm-save" data-email="' + esc(email) + '">Save</button></td>' +
              '</tr>'
            );
          })
          .join('') +
        '</tbody></table>';

      const savePermissions = async (email, role, allowedLocationIds, buttonEl) => {
        if (!email) return;
        const btn = buttonEl || null;
        const original = btn ? btn.textContent : '';
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Saving...';
        }
        try {
          await api('/users/' + encodeURIComponent(email) + '/permissions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, allowedLocationIds }),
          });
          toast('Permissions updated for ' + email, 'ok');
          loadUserPermissions().catch(() => {});
        } catch (err) {
          toast(err.message, 'err');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = original || 'Save';
          }
        }
      };

      const inviteBtn = wrap.querySelector('#permInviteSave');
      if (inviteBtn) {
        inviteBtn.onclick = async (e) => {
          e.stopPropagation();
          const email = String((wrap.querySelector('#permInviteEmail') || {}).value || '')
            .trim()
            .toLowerCase();
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast('Enter a valid email to invite.', 'err');
            return;
          }
          const role = String((wrap.querySelector('#permInviteRole') || {}).value || 'viewer').trim();
          const allowedLocationIds = String((wrap.querySelector('#permInviteAllowed') || {}).value || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
          await savePermissions(email, role, allowedLocationIds, inviteBtn);
        };
      }

      wrap.querySelectorAll('.ch-perm-save').forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const email = (btn.getAttribute('data-email') || '').trim().toLowerCase();
          if (!email) return;
          const roleEl = wrap.querySelector('.ch-perm-role[data-email="' + CSS.escape(email) + '"]');
          const allowedEl = wrap.querySelector('.ch-perm-allowed[data-email="' + CSS.escape(email) + '"]');
          const role = roleEl ? roleEl.value : 'viewer';
          const allowedLocationIds = (allowedEl ? allowedEl.value : '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
          await savePermissions(email, role, allowedLocationIds, btn);
        };
      });
    } catch {
      wrap.hidden = true;
      wrap.innerHTML = '';
    }
  }

  function tabActivate(root, idx) {
    root.querySelectorAll('.ch-tab').forEach((b, i) => b.classList.toggle('active', i === idx));
    root.querySelectorAll('.ch-tab-panel').forEach((p, i) => {
      p.classList.toggle('active', i === idx);
    });
  }

  function renderOnboardingTab(onboarding) {
    const ob = onboarding || {};
    const steps = ob.steps || {};
    const stepLabel = {
      2: 'Chat / review widgets (embed codes)',
      3: 'GMB connection (job)',
      4: 'GHL custom values',
      5: 'Forms (e.g. website form)',
    };
    let html = '<p class="ch-muted" style="margin-bottom:0.75rem">';
    html += '<strong>GHL location</strong>: ' + esc(ob.locationName || '—');
    if (ob.locationId) html += ' <code style="font-size:0.8rem">' + esc(ob.locationId) + '</code>';
    html += '</p><ul class="ch-onb-list">';
    [2, 3, 4, 5].forEach((n) => {
      const s = steps[n];
      const status = s && s.status != null ? String(s.status) : '—';
      let hint = '';
      if (n === 4 && s && s.count != null) hint = ' · ' + s.count + ' custom values';
      if (n === 5 && s && s.totalForms != null) hint = ' · ' + s.totalForms + ' forms in subaccount';
      html += '<li><span class="ch-onb-step">' + n + '</span><div>';
      html += '<strong>' + esc(stepLabel[n]) + '</strong> ';
      html += '<span class="ch-pill ch-pill-onb">' + esc(status) + '</span>';
      html += '<span class="ch-muted" style="font-size:0.82rem">' + esc(hint) + '</span>';
      html += '</div></li>';
    });
    html += '</ul>';
    html +=
      '<details style="margin-top:1rem"><summary class="ch-muted" style="cursor:pointer">Show raw JSON (debug)</summary>';
    html += '<pre class="ch-json" style="margin-top:0.5rem">' + esc(JSON.stringify(ob, null, 2)) + '</pre></details>';
    return html;
  }

  function renderImportIssues(list) {
    if (!Array.isArray(list) || !list.length) return '<p class="ch-muted">No validation issues.</p>';
    return (
      '<ul class="ch-import-issues">' +
      list
        .slice(0, 8)
        .map((it) => {
          if (typeof it === 'string') return '<li>' + esc(it) + '</li>';
          const label = (it.customer && (it.customer.name || it.customer.email)) || 'contact';
          const reason = Array.isArray(it.reasons) ? it.reasons.join(', ') : it.reason || JSON.stringify(it);
          return '<li><strong>' + esc(label) + ':</strong> ' + esc(reason) + '</li>';
        })
        .join('') +
      '</ul>'
    );
  }

  function renderDetail(data) {
    const mount = document.getElementById('detailMount');
    const canEdit = hubRole === 'editor';
    const t = data.tracking || {};
    const hd = data._hubDetail || {};
    const onboarding = hd.onboarding || {};
    const forms = hd.forms || {};
    const payExtra = hd.payment || {};
    const gmb = data.gmb || {};
    const contacts = (forms.websiteBuilderContacts || []).slice();
    const media = data.mediaHub || {};
    const record = media.record && typeof media.record === 'object' ? media.record : null;
    const mediaListUrl = record && (record.customer_list_url || record.past_customers_url || record.media_hub_url);

    const tabs = [
      'Media Hub',
      'Onboarding',
      'GMB',
      'Payments',
      'Message failure',
      'Past customers',
    ];

    let html = '<div class="ch-tabs">';
    tabs.forEach((label, i) => {
      html += '<button type="button" class="ch-tab' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' + esc(label) + '</button>';
    });
    html += '</div>';

    html += '<div class="ch-tab-panel active" data-i="0">';
    html += '<p class="ch-muted">Supabase: ' + (media.supabaseConfigured ? 'connected' : 'not configured') + '</p>';
    if (record) {
      html += '<pre class="ch-json">' + esc(JSON.stringify(record, null, 2)) + '</pre>';
    } else {
      html += '<p class="ch-muted">No Media Hub row for this location yet.</p>';
    }
    html += '<div class="ch-detail-actions">';
    html +=
      '<button type="button" class="ch-btn ch-btn-secondary" id="jumpPastBtn">View past customers →</button>';
    if (mediaListUrl) {
      html +=
        '<a class="ch-btn ch-btn-primary" href="' +
        esc(mediaListUrl) +
        '" target="_blank" rel="noopener">Open customer list (Media Hub)</a>';
    }
    html += '</div></div>';

    html += '<div class="ch-tab-panel" data-i="1">';
    html += '<pre class="ch-json">' + esc(JSON.stringify(onboarding, null, 2)) + '</pre></div>';

    html += '<div class="ch-tab-panel" data-i="2">';
    html += '<dl class="ch-kv">';
    html += '<dt>Mock overlay</dt><dd>' + (gmb.mock ? 'yes' : 'no') + '</dd>';
    if (gmb.linked) {
      html += '<dt>GMB location</dt><dd>' + esc(gmb.linked.gmbLocationId || '—') + '</dd>';
      html += '<dt>GMB account</dt><dd>' + esc(gmb.linked.gmbAccountId || '—') + '</dd>';
    }
    if (gmb.summary) {
      const s = gmb.summary;
      html += '<dt>Business</dt><dd>' + esc(s.businessName || '—') + '</dd>';
      html += '<dt>Rating (mock)</dt><dd>' + esc(String(gmb.rating ?? '—')) + '</dd>';
    }
    html += '</dl>';
    html += '<div class="ch-links ch-detail-actions">';
    html +=
      '<a href="/gmb-editor.html?name=' +
      encodeURIComponent(data.name || '') +
      '" target="_blank" rel="noopener">GMB editor</a> · ';
    html += '<a href="/ghl-connect/" target="_blank" rel="noopener">GHL Connect</a>';
    html += '</div></div>';

    html += '<div class="ch-tab-panel" data-i="3">';
    html += '<dl class="ch-kv">';
    html += '<dt>Status</dt><dd><span class="ch-pill ' + pillClass(data.paymentStatus) + '">' + esc(data.paymentStatus) + '</span></dd>';
    html += '<dt>Stripe customer</dt><dd>' + esc(t.stripeCustomerId || '—') + '</dd>';
    if (t.paymentInfo) {
      const pi = t.paymentInfo;
      html += '<dt>Billing email</dt><dd>' + esc(pi.billingEmail || '—') + '</dd>';
      html += '<dt>Card</dt><dd>' + esc([pi.cardBrand, pi.lastFour].filter(Boolean).join(' · ') || '—') + '</dd>';
    }
    if (payExtra.stripeMarkedDone) {
      html += '<dt>Stripe marked done</dt><dd>' + esc(JSON.stringify(payExtra.stripeMarkedDone)) + '</dd>';
    }
    html += '</dl></div>';

    html += '<div class="ch-tab-panel" data-i="4">';
    html += '<dl class="ch-kv">';
    html += '<dt>Failure rate</dt><dd>' + esc(String(data.messageFailureRate ?? '—')) + '</dd>';
    html += '<dt>Delivered (count)</dt><dd>' + esc(String(t.messageDeliveredCount ?? '—')) + '</dd>';
    html += '<dt>Failed (count)</dt><dd>' + esc(String(t.messageFailedCount ?? '—')) + '</dd>';
    html += '</dl>';
    if (data.a2p) {
      html += '<p class="ch-muted" style="margin-top:1rem">A2P</p><pre class="ch-json">' + esc(JSON.stringify(data.a2p, null, 2)) + '</pre>';
    }
    html += '</div>';

    html += '<div class="ch-tab-panel" data-i="5">';
    html += '<section class="ch-import-card">';
    html += '<h3>Past Customer Automation Import</h3>';
    html += '<p class="ch-muted">Upload CSV/Excel. Required columns: name, email, phone.</p>';
    html += '<div class="ch-import-grid">';
    html += '<input type="file" id="pastImportFile" accept=".csv,.xls,.xlsx" />';
    html += '<label class="ch-check"><input type="checkbox" id="pastAutomationEnabled" checked /> Enable automation</label>';
    html += '<div class="ch-import-actions">';
    html += '<button type="button" class="ch-btn ch-btn-secondary" id="pastPreviewBtn">Preview</button>';
    html += '<button type="button" class="ch-btn ch-btn-primary" id="pastImportBtn">Upload & Import</button>';
    html += '</div>';
    html += '<div id="pastImportStatus" class="ch-import-status ch-muted">No upload started.</div>';
    html += '<div id="pastImportErrors"></div>';
    html += '</div>';
    html += '</section>';

    if (!contacts.length) {
      html += '<p class="ch-muted" style="margin-top:1rem">No website-builder contact rows yet.</p>';
    } else {
      html += '<table class="ch-past-table"><thead><tr><th>Date</th><th>Business</th><th>Email</th><th>Phone</th></tr></thead><tbody>';
      contacts.forEach((r) => {
        html +=
          '<tr><td>' +
          esc(r.createdAt ? String(r.createdAt).slice(0, 10) : '—') +
          '</td><td>' +
          esc(r.biz_name || '—') +
          '</td><td>' +
          esc(r.email || '—') +
          '</td><td>' +
          esc(r.phone || '—') +
          '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '<div class="ch-detail-actions ch-links">';
    if (mediaListUrl) {
      html +=
        '<a href="' +
        esc(mediaListUrl) +
        '" target="_blank" rel="noopener">Open linked Media Hub list</a> · ';
    }
    html +=
      '<a href="/onboarding-setup.html" target="_blank" rel="noopener">Onboarding setup (lists)</a>';
    html += '</div></div>';

    if (canEdit) {
      html += '<hr class="ch-divider" style="margin:1.25rem 0" />';
      html += '<h3 style="font-size:1rem;margin-bottom:0.75rem">Quick edit</h3>';
      html += '<div class="ch-form-grid">';
      html += '<div class="ch-field"><label for="ed_name">Client name</label><input id="ed_name" value="' + esc(t.clientName || '') + '" /></div>';
      html += '<div class="ch-field"><label for="ed_email">Email</label><input id="ed_email" value="' + esc(t.email || '') + '" /></div>';
      html += '<div class="ch-field"><label for="ed_phone">Phone</label><input id="ed_phone" value="' + esc(t.phoneNumber || '') + '" /></div>';
      html += '<div class="ch-field"><label for="ed_status">Status</label><input id="ed_status" value="' + esc(t.status || '') + '" /></div>';
      html += '<div class="ch-field"><label for="ed_notes">Hub notes</label><textarea id="ed_notes" rows="3">' + esc(t.hubNotes || '') + '</textarea></div>';
      html += '<button type="button" class="ch-btn ch-btn-primary" id="detailSaveBtn">Save</button>';
      html += '</div>';
    } else {
      html += '<p class="ch-muted" style="margin-top:1rem">View-only: editing disabled.</p>';
    }

    mount.innerHTML = html;
    const tabRoot = mount;
    tabRoot.querySelectorAll('.ch-tab').forEach((b) => {
      b.onclick = () => tabActivate(tabRoot, Number(b.getAttribute('data-i')));
    });

    const jump = document.getElementById('jumpPastBtn');
    if (jump) {
      jump.onclick = () => tabActivate(tabRoot, 5);
    }

    const saveBtn = document.getElementById('detailSaveBtn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        try {
          const payload = {
            clientName: document.getElementById('ed_name').value || null,
            email: document.getElementById('ed_email').value || null,
            phoneNumber: document.getElementById('ed_phone').value || null,
            status: document.getElementById('ed_status').value || null,
            hubNotes: document.getElementById('ed_notes').value || null,
          };
          const key = parseHash().id;
          const out = await api('/clients/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (out.pending) {
            toast(out.message || 'Saved as pending approval.', 'ok');
          } else {
            detailCache = out;
            renderDetail(out);
            toast('Saved.', 'ok');
            loadClients();
          }
        } catch (err) {
          toast(err.message, 'err');
        } finally {
          saveBtn.disabled = false;
        }
      };
    }

    const importBtn = document.getElementById('pastImportBtn');
    const previewBtn = document.getElementById('pastPreviewBtn');
    const fileInput = document.getElementById('pastImportFile');
    const statusEl = document.getElementById('pastImportStatus');
    const errorsEl = document.getElementById('pastImportErrors');
    const automationEnabledEl = document.getElementById('pastAutomationEnabled');
    const currentKey = parseHash().id;

    async function runImport(previewOnly) {
      if (!importBtn || !previewBtn || !fileInput || !statusEl || !errorsEl || !currentKey) return;
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        toast('Select a CSV/Excel file first.', 'err');
        return;
      }

      importBtn.disabled = true;
      previewBtn.disabled = true;
      statusEl.className = 'ch-import-status ch-muted';
      statusEl.textContent = previewOnly ? 'Preview running...' : 'Import running...';
      errorsEl.innerHTML = '';

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('previewOnly', previewOnly ? 'true' : 'false');
        fd.append('automationEnabled', automationEnabledEl && !automationEnabledEl.checked ? 'false' : 'true');
        const out = await apiUpload('/clients/' + encodeURIComponent(currentKey) + '/past-customers/import', fd);
        const blocked = out.automationBlocked ? ' Automation blocked due to first-message validation.' : '';
        statusEl.className = out.automationBlocked ? 'ch-import-status ch-import-err' : 'ch-import-status ch-import-ok';
        statusEl.textContent =
          (previewOnly ? 'Preview complete. ' : 'Import complete. ') +
          'Imported ' +
          String(out.importedCount || 0) +
          ', failed ' +
          String(out.failedImportCount || 0) +
          ', conversation issues ' +
          String(out.firstConversationIssueCount || 0) +
          '.' +
          blocked;

        const mergedIssues = []
          .concat(Array.isArray(out.firstConversationIssues) ? out.firstConversationIssues : [])
          .concat(Array.isArray(out.importFailures) ? out.importFailures : []);
        if (mergedIssues.length) {
          errorsEl.innerHTML = renderImportIssues(mergedIssues);
        }
        toast(previewOnly ? 'Preview generated.' : 'Import finished.', out.automationBlocked ? 'err' : 'ok');
      } catch (err) {
        const payload = err && err.payload ? err.payload : {};
        const details = Array.isArray(payload.errorDetails) ? payload.errorDetails : [];
        statusEl.className = 'ch-import-status ch-import-err';
        statusEl.textContent = err.message || 'Upload failed.';
        errorsEl.innerHTML = renderImportIssues(details);
        toast(err.message || 'Import failed.', 'err');
      } finally {
        importBtn.disabled = false;
        previewBtn.disabled = false;
      }
    }

    if (importBtn) importBtn.onclick = () => runImport(false);
    if (previewBtn) previewBtn.onclick = () => runImport(true);
  }

  async function loadDetail(id) {
    const mount = document.getElementById('detailMount');
    mount.innerHTML = '<p class="ch-muted">Loading…</p>';
    const data = await api('/clients/' + encodeURIComponent(id));
    detailCache = data;
    hubRole = data.role || hubRole;
    renderDetail(data);
  }

  function route() {
    const p = parseHash();
    const listView = document.getElementById('listView');
    const detailView = document.getElementById('detailView');
    const backBtn = document.getElementById('backBtn');
    if (p.view === 'detail' && p.id) {
      listView.hidden = true;
      detailView.hidden = false;
      backBtn.hidden = false;
      loadDetail(p.id).catch((err) => {
        document.getElementById('detailMount').innerHTML = '<p class="ch-muted">' + esc(err.message) + '</p>';
        toast(err.message, 'err');
      });
    } else {
      listView.hidden = false;
      detailView.hidden = true;
      backBtn.hidden = true;
      renderList();
    }
  }

  async function initAuthStatus() {
    const googleWrap = document.getElementById('googleOAuthWrap');
    const googleLink = document.getElementById('googleOAuthLink');
    const missingEl = document.getElementById('googleOAuthMissing');
    const statusErrEl = document.getElementById('googleOAuthStatusErr');
    if (missingEl) missingEl.hidden = true;
    if (statusErrEl) {
      statusErrEl.hidden = true;
      statusErrEl.textContent = '';
    }
    try {
      const res = await fetch(API + '/auth/status');
      const s = await res.json().catch(() => ({}));
      authConfigured = s;
      const tokenWrap = document.getElementById('tokenLoginWrap');
      const loginModeHint = document.getElementById('loginModeHint');
      const tokenEnabled = s.tokenLoginEnabled !== false;
      if (tokenWrap) tokenWrap.hidden = !tokenEnabled;
      if (loginModeHint) loginModeHint.hidden = tokenEnabled;
      if (googleWrap && googleLink) {
        if (s.googleOAuthConfigured) {
          googleWrap.hidden = false;
          googleLink.href = API + '/auth/google/start';
          if (missingEl) missingEl.hidden = true;
        } else {
          googleWrap.hidden = true;
          if (missingEl) missingEl.hidden = false;
        }
      }
    } catch (e) {
      if (statusErrEl) {
        statusErrEl.hidden = false;
        statusErrEl.textContent =
          'Cannot reach the hub API (' +
          API +
          '/auth/status). Check Vercel rewrites to your Render backend, or open the hub from the backend URL.';
      }
    }
  }

  function captureQuery() {
    const u = new URL(window.location.href);
    const oauthErr = u.searchParams.get('oauth_error');
    const oauthToken = (u.searchParams.get('oauth_token') || '').trim();
    if (oauthErr) {
      const msg = oauthErr === 'not_invited_contact_admin' ? 'Your email is not invited yet. Ask an admin to grant access.' : 'OAuth: ' + oauthErr;
      toast(msg, 'err');
    }
    if (oauthToken) {
      setToken(oauthToken);
      toast('Signed in with Google.', 'ok');
    }
    if (oauthErr || oauthToken) {
      u.searchParams.delete('oauth_error');
      u.searchParams.delete('oauth_token');
      window.history.replaceState({}, document.title, u.pathname + (u.search ? u.search : '') + (u.hash ? u.hash : ''));
    }
  }

  async function boot() {
    captureQuery();
    const tokenInput = document.getElementById('hubTokenInput');
    if (tokenInput) tokenInput.value = getToken();

    await initAuthStatus();

    document.getElementById('saveHubToken').onclick = () => {
      if (authConfigured && authConfigured.tokenLoginEnabled === false) {
        toast('Token login is disabled. Use Google sign-in.', 'err');
        return;
      }
      const submitBtn = document.getElementById('saveHubToken');
      const originalText = submitBtn ? submitBtn.textContent : '';
      setToken((document.getElementById('hubTokenInput').value || '').trim());
      if (!getToken()) {
        toast('Enter a token.', 'err');
        return;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Checking token...';
      }
      showMain();
      loadClients().catch((e) => {
        toast(e.message, 'err');
        showLogin();
      }).finally(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText || 'Continue with token';
        }
      });
      route();
    };

    document.getElementById('refreshBtn').onclick = () => {
      loadClients().catch((e) => toast(e.message, 'err'));
    };

    document.getElementById('backBtn').onclick = () => {
      clearHash();
      route();
    };

    ['tableSearch', 'filterPay', 'filterOnb'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => renderList());
      if (el) el.addEventListener('change', () => renderList());
    });

    window.addEventListener('hashchange', () => route());

    if (getToken()) {
      showMain();
      loadClients()
        .then(() => route())
        .catch((e) => {
          toast(e.message, 'err');
          showLogin();
        });
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
