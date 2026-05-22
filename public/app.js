// ==========================================================================
// PROSPECTOR AI — FRONTEND APP CONTROLLER
// ==========================================================================

// ==========================================
// B2B LEAD FINDER STATE
// ==========================================
let leads = [];
let selectedLead = null;
let currentFilter = 'all';

// ==========================================
// CUSTOM RESPONSES ENGINE (TOAST & MODAL)
// ==========================================

function showToast(message, type = 'success', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  else if (type === 'error') icon = '❌';
  else if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-message">${message}</div>
    <button class="toast-close">&times;</button>
  `;

  // Close event
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => removeToast(toast));

  container.appendChild(toast);

  // Auto remove
  const autoTimeout = setTimeout(() => {
    removeToast(toast);
  }, duration);

  function removeToast(el) {
    clearTimeout(autoTimeout);
    el.style.animation = 'toast-out 0.3s ease forwards';
    el.addEventListener('animationend', () => {
      el.remove();
    });
  }
}

function showConfirm(title, message, options = {}) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('custom-confirm-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'custom-confirm-modal';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-container">
          <div class="modal-header">
            <span class="modal-title-icon">⚠️</span>
            <h3 class="modal-title" id="confirm-title">Confirm Action</h3>
          </div>
          <div class="modal-body" id="confirm-message">Are you sure you want to proceed?</div>
          <div class="modal-footer">
            <button class="modal-btn modal-btn-cancel" id="confirm-btn-cancel">Cancel</button>
            <button class="modal-btn modal-btn-confirm" id="confirm-btn-ok">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const titleEl = overlay.querySelector('#confirm-title');
    const messageEl = overlay.querySelector('#confirm-message');
    const cancelBtn = overlay.querySelector('#confirm-btn-cancel');
    const confirmBtn = overlay.querySelector('#confirm-btn-ok');
    const iconEl = overlay.querySelector('.modal-title-icon');

    titleEl.textContent = title || 'Confirm Action';
    messageEl.textContent = message || 'Are you sure you want to proceed?';
    cancelBtn.textContent = options.cancelText || 'Cancel';
    confirmBtn.textContent = options.confirmText || 'Confirm';
    iconEl.textContent = options.icon || '⚠️';

    if (options.confirmColor === 'danger') {
      confirmBtn.style.background = 'linear-gradient(135deg, var(--danger) 0%, #B91C1C 100%)';
      confirmBtn.style.boxShadow = '0 6px 16px -4px rgba(220, 38, 38, 0.3)';
    } else {
      confirmBtn.style.background = 'linear-gradient(135deg, var(--primary) 0%, #312E81 100%)';
      confirmBtn.style.boxShadow = '0 6px 16px -4px rgba(79, 70, 229, 0.3)';
    }

    setTimeout(() => {
      overlay.classList.add('active');
    }, 10);

    const cleanup = (value) => {
      overlay.classList.remove('active');
      setTimeout(() => {
        resolve(value);
      }, 300);
    };

    const onCancel = () => {
      cleanup(false);
      removeListeners();
    };

    const onConfirm = () => {
      cleanup(true);
      removeListeners();
    };

    const removeListeners = () => {
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
    };

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
  });
}

// Helper to format external URLs with https:// if missing to prevent relative path loops under localhost
function formatExternalUrl(url) {
  if (!url) return '#';
  let cleaned = url.trim();
  if (cleaned === '' || cleaned === '#') return '#';
  
  if (!/^https?:\/\//i.test(cleaned)) {
    return 'https://' + cleaned;
  }
  return cleaned;
}

// DOM Elements
const searchForm = document.getElementById('search-form');
const nicheInput = document.getElementById('niche');
const locationInput = document.getElementById('location');
const platformSelect = document.getElementById('platform');
const harvestBtn = document.getElementById('harvest-btn');
const harvestStatus = document.getElementById('harvest-status');
const statusText = document.getElementById('status-text');
const leadsList = document.getElementById('leads-list');
const leadCountBadge = document.getElementById('lead-count');
const pitchContainer = document.getElementById('pitch-container');
const filterTabs = document.querySelectorAll('.filter-tab');

// ==========================================
// EVENT LISTENERS & INITS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  fetchLeads();

  // Niche Suggestion Chips Click Handler
  const nicheChips = document.querySelectorAll('.niche-chip');
  nicheChips.forEach(chip => {
    chip.addEventListener('click', () => {
      nicheChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      nicheInput.value = chip.getAttribute('data-niche');
    });
  });
});

// Filter Tabs Selection
filterTabs.forEach(tab => {
  tab.addEventListener('click', (e) => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.getAttribute('data-filter');
    renderLeadsList();
  });
});

// Submit Google Search Harvest Request
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const niche = nicheInput.value.trim();
  const location = locationInput.value.trim();
  const platform = platformSelect.value;

  if (!niche || !location) return;

  // Show Loading Status Overlay
  harvestStatus.classList.remove('hidden');
  harvestBtn.disabled = true;
  statusText.textContent = `Crawling Google's index for ${niche}s in ${location}...`;

  try {
    const res = await fetch('/api/leads/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche, location, platform })
    });

    const data = await res.json();
    
    if (data.success) {
      statusText.textContent = 'Data crawling complete! Storing leads in MongoDB Atlas...';
      setTimeout(async () => {
        await fetchLeads();
        // Reset console state
        harvestStatus.classList.add('hidden');
        harvestBtn.disabled = false;
        searchForm.reset();
        showToast(data.message, 'success');
      }, 1000);
    } else {
      throw new Error(data.message);
    }

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Scraping request failed. Verify your Google Custom Search API key or daily free limit.', 'error');
    harvestStatus.classList.add('hidden');
    harvestBtn.disabled = false;
  }
});

// ==========================================
// CORE CONTROLLER CONTROLS
// ==========================================

// Fetch Leads list from Mongoose
async function fetchLeads() {
  try {
    const res = await fetch('/api/leads');
    const data = await res.json();
    if (data.success) {
      leads = data.data;
      renderLeadsList();
    }
  } catch (err) {
    console.error('Failed to fetch leads:', err);
  }
}

// Render directory cards based on filters
function renderLeadsList() {
  let filteredLeads = leads;

  if (currentFilter !== 'all') {
    filteredLeads = leads.filter(lead => lead.status === currentFilter);
  }

  // Update Count Badge
  leadCountBadge.textContent = `${filteredLeads.length} Prospects`;

  if (filteredLeads.length === 0) {
    leadsList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📭</span>
        <h3>No Leads Found</h3>
        <p>No prospects match this filter state. Try running a fresh search query in the search console!</p>
      </div>
    `;
    return;
  }

  leadsList.innerHTML = filteredLeads.map(lead => {
    const isActive = selectedLead && selectedLead._id === lead._id ? 'active' : '';
    const hasContact = lead.phone || lead.email ? '📞' : '🌐';
    
    let platformIcon = '📍';
    if (lead.platform === 'Instagram') platformIcon = '📸';
    else if (lead.platform === 'Facebook') platformIcon = '👥';
    else if (lead.platform === 'TikTok') platformIcon = '🎵';
    else if (lead.platform === 'Yelp') platformIcon = '⭐';
    else if (lead.platform === 'LinkedIn') platformIcon = '💼';
    else if (lead.platform === 'TripAdvisor') platformIcon = '🦉';
    else if (lead.platform === 'Google Maps') platformIcon = '📍';

    let statsLabel = '';
    if (lead.platform === 'Instagram' || lead.platform === 'TikTok') {
      statsLabel = `👥 ${lead.reviewsCount || 0} followers`;
    } else if (lead.platform === 'LinkedIn') {
      statsLabel = `👥 ${lead.reviewsCount || 0} connections`;
    } else {
      statsLabel = `⭐ ${lead.rating || 0} (${lead.reviewsCount || 0} reviews)`;
    }

    const scoreClass = (lead.qualityScore >= 70) 
      ? 'score-high' 
      : (lead.qualityScore >= 45 ? 'score-med' : 'score-low');

    return `
      <div class="lead-item ${isActive}" onclick="selectLead('${lead._id}')">
        <div class="lead-info">
          <h3 class="lead-name">${lead.name}</h3>
          <div class="lead-meta">
            <span class="lead-platform">${platformIcon} ${lead.platform}</span>
            <span class="lead-location">${lead.location}</span>
          </div>
          <div class="lead-meta" style="margin-top: 4px;">
            <span>${statsLabel}</span>
            <span>${hasContact}</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
          <button class="list-delete-btn" onclick="event.stopPropagation(); deleteProspect('${lead._id}')" title="Delete Prospect">🗑️</button>
          <span class="status-pill status-${lead.status}">${lead.status.replace('-', ' ')}</span>
          <span class="score-badge ${scoreClass}">${lead.qualityScore || 0}% Score</span>
        </div>
      </div>
    `;
  }).join('');
}

// Select a single prospect to display in the studio
function selectLead(id) {
  selectedLead = leads.find(lead => lead._id === id);
  renderLeadsList(); // Redraw directory list to update active border highlight
  renderPitchStudio();
}

// Draw the Gemini pitch studio for the selected lead
function renderPitchStudio() {
  if (!selectedLead) {
    pitchContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✨</span>
        <h3>No Prospect Selected</h3>
        <p>Select any lead from the directory in Step 2 to analyze their profile and generate an unstoppable pitch with Gemini.</p>
      </div>
    `;
    return;
  }

  const lead = selectedLead;

  // Render Pitch Content based on generation state
  let pitchContentHTML = '';

  if (lead.customPitch) {
    pitchContentHTML = `
      <div class="pitch-textbox" id="pitch-text">${lead.customPitch}</div>
      
      <div class="pitch-actions">
        <button class="btn-secondary" onclick="copyToClipboard()">
          📋 Copy to Clipboard
        </button>
        <button class="btn-whatsapp" onclick="launchWhatsApp()">
          💬 Pitch on WhatsApp
        </button>
      </div>
      
      ${lead.email ? `
        <button class="btn-secondary" style="width: 100%; border-color: rgba(16, 185, 129, 0.2); color: #10B981;" onclick="launchEmail()">
          ✉️ Send Custom Proposal Email
        </button>
      ` : ''}
    `;
  } else {
    pitchContentHTML = `
      <div class="empty-state" style="padding: 40px 0;">
        <span class="empty-icon">🤖</span>
        <h3>No Proposal Generated Yet</h3>
        <p>Ask Google Gemini to analyze their profile snippet, locate operational bottlenecks, and generate a customized sales pitch.</p>
        <button onclick="generateGeminiPitch('${lead._id}')" class="btn-primary" style="margin-top: 16px;">
          ⚡ Generate Proposal with Gemini
        </button>
      </div>
    `;
  }

  // Website status class
  let webStatusClass = 'web-missing';
  let webStatusIcon = '❌';
  if (lead.websiteStatus === 'Has Website Link') {
    webStatusClass = 'web-active';
    webStatusIcon = '✅';
  } else if (lead.websiteStatus === 'Broken/Offline Website') {
    webStatusClass = 'web-broken';
    webStatusIcon = '⚠️';
  } else if (lead.websiteStatus === 'Social-Only Catalog') {
    webStatusClass = 'web-social';
    webStatusIcon = '📱';
  }

  // Bottlenecks list HTML
  const bottlenecksHTML = (lead.bottlenecks && lead.bottlenecks.length > 0)
    ? lead.bottlenecks.map(b => `<span class="bottleneck-tag">🚨 ${b}</span>`).join('')
    : '<span class="bottleneck-tag success">No severe digital bottlenecks detected</span>';

  // Quality score tier
  let scoreTier = 'High Priority Prospect';
  let scoreColor = 'var(--success)';
  if (lead.qualityScore < 45) {
    scoreTier = 'Low Priority';
    scoreColor = 'var(--danger)';
  } else if (lead.qualityScore < 70) {
    scoreTier = 'Medium Priority';
    scoreColor = 'var(--warning)';
  }

  // Draw Studio Wrapper
  pitchContainer.className = 'pitch-container pitch-viewer';
  pitchContainer.innerHTML = `
    <div class="prospect-details">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; letter-spacing: -0.03em;">${lead.name}</h3>
          <a href="${formatExternalUrl(lead.socialUrl)}" target="_blank" style="color: var(--accent); font-size: 0.85rem; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;">
            🔗 View Original Profile Page &rarr;
          </a>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.6rem; font-weight: 900; color: ${scoreColor};">${lead.qualityScore || 0}%</div>
          <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">${scoreTier}</span>
        </div>
      </div>
      
      <!-- Premium Digital Audit Panel -->
      <div class="audit-panel">
        <h4 class="audit-title">🔍 Real-Time Lead Diagnostic Audit</h4>
        
        <div class="audit-grid">
          <div class="audit-item ${webStatusClass}">
            <span class="audit-label">Website Status</span>
            <strong class="audit-value">
              ${lead.website 
                ? `<a href="${formatExternalUrl(lead.website)}" target="_blank" style="color: inherit; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">${webStatusIcon} ${lead.websiteStatus || 'Missing Website'}</a>` 
                : `${webStatusIcon} ${lead.websiteStatus || 'Missing Website'}`
              }
            </strong>
          </div>
          <div class="audit-item">
            <span class="audit-label">Convertibility</span>
            <strong class="audit-value" style="color: ${lead.convertibility === 'High' ? 'var(--success)' : 'var(--warning)'};">⚡ ${lead.convertibility || 'Medium'}</strong>
          </div>
        </div>

        <div class="audit-bottlenecks">
          <span class="audit-label" style="margin-bottom: 8px; display: block;">Identified Key Bottlenecks:</span>
          <div class="bottleneck-list">
            ${bottlenecksHTML}
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">Target Niche <strong>${lead.niche}</strong></div>
        <div class="detail-item">Location <strong>${lead.location}</strong></div>
        <div class="detail-item">Phone Contact <strong>${lead.phone || 'Not Indexed'}</strong></div>
        <div class="detail-item">Email Address <strong>${lead.email || 'Not Indexed'}</strong></div>
        <div class="detail-item" style="grid-column: span 2;">
          Website URL 
          <strong>
            ${lead.website 
              ? `<a href="${formatExternalUrl(lead.website)}" target="_blank" style="color: var(--primary); text-decoration: none; word-break: break-all;">🔗 ${lead.website} &rarr;</a>` 
              : 'None Indexed / Missing'
            }
          </strong>
        </div>
      </div>
      
      <div style="margin-top: 16px; background: rgba(255,255,255,0.01); border: 1px solid var(--surface-border); padding: 12px; border-radius: 12px; font-size: 0.82rem; color: var(--text-muted);">
        <strong style="color: var(--text); font-size: 0.85rem; display: block; margin-bottom: 4px;">Index Bio Snippet:</strong>
        "${lead.bioSnippet || 'No bio snippet indexed.'}"
      </div>
    </div>
    
    ${pitchContentHTML}
    
    <div class="pitch-lead-controls">
      <div>
        <label for="status-select" style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Lead Status:</label>
        <select id="status-select" style="height: 36px; background: var(--surface); border: 1px solid var(--surface-border); border-radius: 8px; color: var(--text); font-family: var(--font); font-size: 0.8rem; font-weight: 600;" onchange="updateLeadStatus('${lead._id}', this.value)">
          <option value="scraped" ${lead.status === 'scraped' ? 'selected' : ''}>Scraped</option>
          <option value="pitch-ready" ${lead.status === 'pitch-ready' ? 'selected' : ''}>Pitch Ready</option>
          <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Pitched (Contacted)</option>
          <option value="interested" ${lead.status === 'interested' ? 'selected' : ''}>Interested</option>
          <option value="closed" ${lead.status === 'closed' ? 'selected' : ''}>Closed (Client Won!)</option>
          <option value="rejected" ${lead.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </div>
      <button class="delete-btn" onclick="deleteProspect('${lead._id}')">🗑️ Delete Prospect</button>
    </div>
  `;
}

// Trigger Google Gemini API Pitch Generation via server
async function generateGeminiPitch(id) {
  pitchContainer.innerHTML = `
    <div class="empty-state" style="padding: 80px 0;">
      <div class="loader" style="width: 40px; height: 40px; border-width: 4px; border-top-color: var(--primary);"></div>
      <h3 style="margin-top: 16px;">Gemini is writing your proposal...</h3>
      <p style="max-width: 250px;">Analyzing Google reviews and identifying business bottlenecks to generate an irresistible sales pitch.</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/leads/${id}/pitch`, { method: 'POST' });
    const data = await res.json();
    
    if (data.success) {
      // Update our local memory state
      const index = leads.findIndex(l => l._id === id);
      leads[index] = data.data;
      selectedLead = data.data;
      
      // Re-render views
      renderLeadsList();
      renderPitchStudio();
      showToast('Outreach pitch successfully generated with Gemini!', 'success');
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Gemini Pitch generation failed. Verify your GEMINI_API_KEY in .env file.', 'error');
    renderPitchStudio();
  }
}

// Copy pitch to clipboard
function copyToClipboard() {
  const pitchText = document.getElementById('pitch-text').textContent;
  navigator.clipboard.writeText(pitchText)
    .then(() => showToast('Pitch text successfully copied to clipboard! Ready to paste into DMs.', 'success'))
    .catch(err => {
      console.error('Failed to copy text:', err);
      showToast('Failed to copy pitch text to clipboard.', 'error');
    });
}

// Helper to normalize phone numbers internationally for WhatsApp wa.me links
function normalizePhoneForWhatsApp(phone, location) {
  if (!phone) return '';
  
  // Clean all characters except digits (and + if it starts with one)
  let cleaned = phone.trim();
  const startsWithPlus = cleaned.startsWith('+');
  cleaned = cleaned.replace(/[^0-9]/g, '');

  if (cleaned === '') return '';

  let normalized = cleaned;

  if (startsWithPlus) {
    normalized = cleaned;
  } else {
    const loc = (location || '').toLowerCase();

    // 1. UK (London, UK, United Kingdom, Manchester, etc.)
    if (loc.includes('uk') || loc.includes('united kingdom') || loc.includes('london') || loc.includes('manchester') || loc.includes('birmingham')) {
      if (cleaned.startsWith('44') && cleaned.length > 10) {
        normalized = cleaned;
      } else {
        if (cleaned.startsWith('0')) {
          cleaned = cleaned.substring(1);
        }
        normalized = '44' + cleaned;
      }
    }
    // 2. USA / Canada
    else if (loc.includes('usa') || loc.includes('united states') || loc.includes('america') || loc.includes('canada') || loc.includes('toronto') || loc.includes('vancouver') || loc.includes('new york') || loc.includes('california') || loc.includes('texas')) {
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        normalized = cleaned;
      } else {
        normalized = '1' + cleaned;
      }
    }
    // 3. Australia
    else if (loc.includes('australia') || loc.includes('sydney') || loc.includes('melbourne') || loc.includes('brisbane')) {
      if (cleaned.startsWith('61') && cleaned.length > 9) {
        normalized = cleaned;
      } else {
        if (cleaned.startsWith('0')) {
          cleaned = cleaned.substring(1);
        }
        normalized = '61' + cleaned;
      }
    }
    // 4. South Africa
    else if (loc.includes('south africa') || loc.includes('johannesburg') || loc.includes('cape town') || loc.includes('durban')) {
      if (cleaned.startsWith('27') && cleaned.length > 9) {
        normalized = cleaned;
      } else {
        if (cleaned.startsWith('0')) {
          cleaned = cleaned.substring(1);
        }
        normalized = '27' + cleaned;
      }
    }
    // 5. Default/Nigeria
    else {
      if (cleaned.startsWith('234') && cleaned.length > 10) {
        normalized = cleaned;
      } else {
        if (cleaned.startsWith('0')) {
          cleaned = cleaned.substring(1);
        }
        normalized = '234' + cleaned;
      }
    }
  }

  return normalized;
}

// Launch WhatsApp Web / App with pre-filled, personalized text
function launchWhatsApp() {
  let pitchText = document.getElementById('pitch-text').textContent;
  
  // Robustly filter out any line containing "phone:" to remove the phone/whatsapp signature line for clean WhatsApp delivery
  pitchText = pitchText.split('\n')
                       .filter(line => !line.toLowerCase().includes('phone:'))
                       .join('\n')
                       .trim();
                       
  const encodedText = encodeURIComponent(pitchText);
  
  if (selectedLead.phone) {
    // Normalize and clean phone for standard wa.me format
    const cleanPhone = normalizePhoneForWhatsApp(selectedLead.phone, selectedLead.location);
    const finalPhone = cleanPhone.replace(/[^0-9]/g, ''); // Ensure no special characters
    window.open(`https://wa.me/${finalPhone}?text=${encodedText}`, '_blank');
  } else {
    // If phone is missing, prompt user to copy paste
    showToast('No phone number was indexed for this lead. Opening profile page...', 'warning');
    setTimeout(() => {
      window.open(formatExternalUrl(selectedLead.socialUrl), '_blank');
    }, 1500);
  }
}

// Launch Email Client (mailto) with prefilled pitch
function launchEmail() {
  if (!selectedLead.email) return;
  const pitchText = document.getElementById('pitch-text').textContent;
  const subject = encodeURIComponent(`Growth & Website Concept for ${selectedLead.name}`);
  const body = encodeURIComponent(pitchText);
  window.open(`mailto:${selectedLead.email}?subject=${subject}&body=${body}`, '_blank');
}

// Update lead status in DB
async function updateLeadStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/leads/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (data.success) {
      // Update memory
      const index = leads.findIndex(l => l._id === id);
      leads[index] = data.data;
      selectedLead = data.data;
      renderLeadsList();
    }
  } catch (err) {
    console.error('Failed to update lead status:', err);
  }
}

// Delete Lead from DB
async function deleteProspect(id) {
  const targetLead = leads.find(l => l._id === id);
  const nameToDisplay = targetLead ? targetLead.name : 'this prospect';

  const confirmDelete = await showConfirm(
    'Delete Prospect',
    `Are you sure you want to permanently delete "${nameToDisplay}" from your lead database?`,
    {
      confirmText: 'Delete Lead',
      cancelText: 'Cancel',
      confirmColor: 'danger',
      icon: '🗑️'
    }
  );
  
  if (!confirmDelete) return;
  
  try {
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    const data = await res.json();
    
    if (data.success) {
      leads = leads.filter(l => l._id !== id);
      if (selectedLead && selectedLead._id === id) {
        selectedLead = null;
        renderPitchStudio();
      }
      renderLeadsList();
      showToast('Prospect successfully deleted from lead database.', 'success');
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    console.error('Failed to delete prospect:', err);
    showToast('Failed to delete prospect from database.', 'error');
  }
}

// ==========================================================================
// GIG FINDER & AUTOPILOT MODULE
// ==========================================================================

// ==========================================
// GIG FINDER STATE
// ==========================================
let jobs = [];
let selectedJob = null;
let currentJobFilter = 'all';
let currentMode = 'b2b'; // 'b2b' | 'gigs'

// ==========================================
// MODE SWITCHER
// ==========================================

function switchMode(mode) {
  currentMode = mode;

  const b2bConsole   = document.getElementById('b2b-console');
  const gigsConsole  = document.getElementById('gigs-console');
  const leadsList    = document.getElementById('leads-list');
  const jobsList     = document.getElementById('jobs-list');
  const b2bFilters   = document.getElementById('b2b-filters');
  const gigsFilters  = document.getElementById('gigs-filters');
  const modeB2b      = document.getElementById('mode-b2b');
  const modeGigs     = document.getElementById('mode-gigs');
  const dirDesc      = document.getElementById('directory-desc');
  const studioDesc   = document.getElementById('studio-desc');

  if (mode === 'gigs') {
    b2bConsole.classList.add('hidden');
    gigsConsole.classList.remove('hidden');
    leadsList.classList.add('hidden');
    jobsList.classList.remove('hidden');
    b2bFilters.classList.add('hidden');
    gigsFilters.classList.remove('hidden');
    modeB2b.classList.remove('active');
    modeGigs.classList.add('active');
    dirDesc.textContent = 'Live Reddit & social media posts actively seeking software developers right now.';
    studioDesc.textContent = 'Review the job description and send your AI-drafted proposal directly to the client.';
    fetchJobs();
  } else {
    gigsConsole.classList.add('hidden');
    b2bConsole.classList.remove('hidden');
    jobsList.classList.add('hidden');
    leadsList.classList.remove('hidden');
    gigsFilters.classList.add('hidden');
    b2bFilters.classList.remove('hidden');
    modeGigs.classList.remove('active');
    modeB2b.classList.add('active');
    dirDesc.textContent = 'Real-time local leads qualified as having high ratings but poor/missing websites.';
    studioDesc.textContent = 'Auto-generate a highly tailored sales audit and WhatsApp pitch targeting their specific reviews and bottlenecks.';
    // Reset pitch studio to B2B state
    selectedJob = null;
    renderPitchStudio();
  }
}

// ==========================================
// AUTOPILOT TOGGLE
// ==========================================

async function fetchAutopilotStatus() {
  try {
    const res = await fetch('/api/agent/status');
    const data = await res.json();
    if (data.success) {
      setToggleUI(data.active);
    }
  } catch (err) {
    console.error('Failed to fetch autopilot status:', err);
  }
}

function setToggleUI(isActive) {
  const toggle    = document.getElementById('autopilot-toggle');
  const dot       = document.querySelector('.autopilot-status-dot');
  const statusTxt = document.querySelector('.autopilot-status-text');

  if (!toggle) return;
  toggle.checked = isActive;

  if (isActive) {
    dot.classList.add('active');
    statusTxt.innerHTML = 'Autopilot Agent: <strong style="color: #10B981;">ON</strong>';
    appendLog('🚀 Autopilot Agent is active — scanning Reddit every 15 mins...');
  } else {
    dot.classList.remove('active');
    statusTxt.innerHTML = 'Autopilot Agent: <strong>OFF</strong>';
    appendLog('🛑 Autopilot Agent stopped. Toggle ON to resume background scanning.');
  }
}

async function handleToggle() {
  try {
    const res  = await fetch('/api/agent/toggle', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setToggleUI(data.active);
      showToast(data.message, data.active ? 'success' : 'warning');
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    console.error('Toggle failed:', err);
    showToast('Failed to toggle Autopilot Agent. Check server connection.', 'error');
  }
}

// ==========================================
// AGENT LOGS CONSOLE
// ==========================================

function appendLog(message) {
  const logsEl = document.getElementById('agent-logs');
  if (!logsEl) return;
  const timestamp = new Date().toLocaleTimeString();
  logsEl.textContent += `\n[${timestamp}] ${message}`;
  logsEl.scrollTop = logsEl.scrollHeight;
}

// ==========================================
// MANUAL SCAN TRIGGER
// ==========================================

async function runManualScan() {
  const btn = document.getElementById('manual-scan-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Scanning Reddit...';
  }
  appendLog('⚡ Manual scan triggered — checking r/forhire, r/freelance_forhire, r/jobbit...');

  try {
    const res  = await fetch('/api/agent/test-scan');
    const data = await res.json();
    if (data.success) {
      appendLog('✅ Scan complete! Check Telegram for any new HOT leads.');
      showToast('Manual Reddit scan complete! Check your Telegram for new leads.', 'success');
      await fetchJobs();
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    appendLog(`❌ Scan failed: ${err.message}`);
    showToast(err.message || 'Manual scan failed. Check server logs.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Run Manual Scan Now';
    }
  }
}

// ==========================================
// JOB LEADS FETCHER & RENDERER
// ==========================================

async function fetchJobs() {
  try {
    const res  = await fetch('/api/jobs');
    const data = await res.json();
    if (data.success) {
      jobs = data.data;
      renderJobsList();
      updateGigStats();
    }
  } catch (err) {
    console.error('Failed to fetch job leads:', err);
  }
}

function updateGigStats() {
  const totalEl   = document.getElementById('total-gigs-count');
  const appliedEl = document.getElementById('total-applied-count');
  if (totalEl)   totalEl.textContent   = jobs.length;
  if (appliedEl) appliedEl.textContent = jobs.filter(j => j.status === 'applied').length;
}

function renderJobsList() {
  const jobsList = document.getElementById('jobs-list');
  if (!jobsList) return;

  let filtered = jobs;
  if (currentJobFilter !== 'all') {
    filtered = jobs.filter(j => j.status === currentJobFilter);
  }

  const leadCount = document.getElementById('lead-count');
  if (leadCount) leadCount.textContent = `${filtered.length} Gigs`;

  if (filtered.length === 0) {
    jobsList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">💼</span>
        <h3>No Gigs Found Yet</h3>
        <p>Turn on the Autopilot Agent or run a manual scan to harvest freelance development leads!</p>
      </div>
    `;
    return;
  }

  jobsList.innerHTML = filtered.map(job => {
    const isActive     = selectedJob && selectedJob._id === job._id ? 'active' : '';
    
    // Support specific subreddits or microchannels
    const platformStr  = job.platform || '';
    const platformClass = platformStr.startsWith('Reddit') ? 'reddit' : platformStr.startsWith('Twitter') ? 'twitter' : 'linkedin';

    let platformIcon = '📡';
    if (platformStr.startsWith('Reddit'))    platformIcon = '🟠';
    if (platformStr.startsWith('Twitter'))   platformIcon = '🐦';
    if (platformStr.startsWith('LinkedIn'))  platformIcon = '💼';

    const skillTags = (job.requiredSkills || []).slice(0, 3).map(s =>
      `<span style="background: rgba(79,70,229,0.08); color: var(--primary); padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 800;">${s}</span>`
    ).join('');

    const statusClass = job.status === 'applied' ? 'status-closed' : 'status-pitch-ready';
    const statusLabel = job.status === 'applied' ? '✅ Applied' : '🔥 Unapplied';

    // Show the actual post date, fallback to scraping date
    const postDate = job.postCreatedAt ? new Date(job.postCreatedAt) : new Date(job.createdAt);
    const dateStr  = postDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return `
      <div class="lead-item ${isActive} ${platformClass}" onclick="selectJob('${job._id}')">
        <div class="lead-info" style="flex: 1; min-width: 0;">
          <h3 class="lead-name" style="font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px;">${job.title}</h3>
          <div class="lead-meta" style="margin-top: 4px;">
            <span class="lead-platform" title="${job.platform}">${platformIcon} ${job.platform}</span>
            <span style="color: var(--success); font-weight: 700; font-size: 0.78rem;">💰 ${job.budget}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">${skillTags}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0;">
          <button class="list-delete-btn" onclick="event.stopPropagation(); deleteJob('${job._id}')" title="Delete Gig">🗑️</button>
          <span class="status-pill ${statusClass}">${statusLabel}</span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;" title="Post Date">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// JOB LEAD SELECTION → PITCH STUDIO
// ==========================================

function selectJob(id) {
  selectedJob = jobs.find(j => j._id === id);
  renderJobsList();
  renderJobStudio();
}

function renderJobStudio() {
  const pitchContainer = document.getElementById('pitch-container');
  if (!selectedJob) {
    pitchContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">💼</span>
        <h3>No Gig Selected</h3>
        <p>Select any job lead from the directory to view the AI-drafted proposal and send your pitch.</p>
      </div>
    `;
    return;
  }

  const job = selectedJob;

  const skillBadges = (job.requiredSkills || []).map(s =>
    `<span class="bottleneck-tag" style="background: rgba(79,70,229,0.06); color: var(--primary); border-color: rgba(79,70,229,0.12);">🛠️ ${s}</span>`
  ).join('') || '<span class="bottleneck-tag success">General Development</span>';

  let proposalHTML = '';
  if (job.customProposal) {
    proposalHTML = `
      <div class="pitch-textbox" id="gig-proposal-text">${job.customProposal}</div>
      <div class="pitch-actions">
        <button class="btn-secondary" onclick="copyJobProposal()">📋 Copy Proposal</button>
        <button class="btn-secondary" onclick="openJobPost()" style="border-color: rgba(255,69,0,0.2); color: #FF4500;">🔗 Open Original Post</button>
      </div>
      ${job.status !== 'applied' ? `
        <button class="btn-primary" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); box-shadow: 0 8px 20px -4px rgba(16,185,129,0.3);" onclick="markJobApplied('${job._id}')">
          ✅ Mark as Applied
        </button>
      ` : `
        <div style="text-align: center; padding: 14px; background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.15); border-radius: 12px; font-size: 0.88rem; font-weight: 700; color: var(--success);">
          ✅ You have already applied to this gig!
        </div>
      `}
    `;
  } else {
    proposalHTML = `
      <div class="empty-state" style="padding: 30px 0;">
        <span class="empty-icon">🤖</span>
        <h3>No Proposal Generated</h3>
        <p>This gig was flagged but has no proposal yet. Delete and re-scan to regenerate.</p>
      </div>
    `;
  }

  pitchContainer.className = 'pitch-container pitch-viewer';
  pitchContainer.innerHTML = `
    <div class="prospect-details">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div style="flex: 1; min-width: 0;">
          <h3 style="font-size: 1.1rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.3;">${job.title}</h3>
          <a href="${job.postUrl}" target="_blank" style="color: var(--accent); font-size: 0.85rem; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-top: 6px;">
            🔗 View Original Post &rarr;
          </a>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; display: block; margin-top: 4px;">
            📅 Posted: ${job.postCreatedAt ? new Date(job.postCreatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : new Date(job.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="font-size: 1.4rem; font-weight: 900; color: var(--success);">💰 ${job.budget}</div>
          <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">${job.platform}</span>
        </div>
      </div>

      <div class="audit-panel" style="margin-top: 14px;">
        <h4 class="audit-title">🛠️ Required Skills & Technologies</h4>
        <div class="bottleneck-list">${skillBadges}</div>
      </div>

      <div style="margin-top: 14px; background: rgba(255,255,255,0.5); border: 1px solid var(--surface-border); padding: 14px; border-radius: 12px; font-size: 0.82rem; color: var(--text-muted); max-height: 120px; overflow-y: auto;">
        <strong style="color: var(--text); font-size: 0.85rem; display: block; margin-bottom: 6px;">📝 Post Content:</strong>
        "${job.postContent ? job.postContent.substring(0, 400) + (job.postContent.length > 400 ? '...' : '') : 'No content available.'}"
      </div>
    </div>

    ${proposalHTML}

    <div class="pitch-lead-controls">
      <div>
        <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Gig Status:</label>
        <select style="height: 36px; background: var(--surface); border: 1px solid var(--surface-border); border-radius: 8px; color: var(--text); font-family: var(--font); font-size: 0.8rem; font-weight: 600;" onchange="updateJobStatus('${job._id}', this.value)">
          <option value="scraped"      ${job.status === 'scraped'        ? 'selected' : ''}>Scraped</option>
          <option value="proposal-ready" ${job.status === 'proposal-ready' ? 'selected' : ''}>Proposal Ready</option>
          <option value="applied"      ${job.status === 'applied'        ? 'selected' : ''}>Applied</option>
          <option value="closed"       ${job.status === 'closed'         ? 'selected' : ''}>Closed</option>
        </select>
      </div>
      <button class="delete-btn" onclick="deleteJob('${job._id}')">🗑️ Delete Gig</button>
    </div>
  `;
}

// ==========================================
// JOB ACTIONS
// ==========================================

function copyJobProposal() {
  const proposalEl = document.getElementById('gig-proposal-text');
  if (!proposalEl) return;
  navigator.clipboard.writeText(proposalEl.textContent)
    .then(() => showToast('Proposal copied! Paste it into Reddit/LinkedIn DM and send 🚀', 'success'))
    .catch(() => showToast('Failed to copy proposal text.', 'error'));
}

function openJobPost() {
  if (!selectedJob || !selectedJob.postUrl) return;
  window.open(selectedJob.postUrl, '_blank');
}

async function markJobApplied(id) {
  await updateJobStatus(id, 'applied');
  showToast('Marked as Applied! Great work — now go close that client! 💪', 'success');
}

async function updateJobStatus(id, newStatus) {
  try {
    const res  = await fetch(`/api/jobs/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      const idx = jobs.findIndex(j => j._id === id);
      if (idx !== -1) jobs[idx] = data.data;
      selectedJob = data.data;
      renderJobsList();
      renderJobStudio();
      updateGigStats();
    }
  } catch (err) {
    console.error('Failed to update job status:', err);
    showToast('Failed to update job status.', 'error');
  }
}

async function deleteJob(id) {
  const targetJob = jobs.find(j => j._id === id);
  const titleToDisplay = targetJob ? targetJob.title : 'this gig';

  const confirmDelete = await showConfirm(
    'Delete Gig Lead',
    `Are you sure you want to permanently delete "${titleToDisplay}" from your database?`,
    { confirmText: 'Delete Gig', cancelText: 'Cancel', confirmColor: 'danger', icon: '🗑️' }
  );
  if (!confirmDelete) return;

  try {
    const res  = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      jobs       = jobs.filter(j => j._id !== id);
      if (selectedJob && selectedJob._id === id) {
        selectedJob = null;
        renderJobStudio();
      }
      renderJobsList();
      updateGigStats();
      showToast('Gig lead deleted successfully.', 'success');
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    console.error('Failed to delete job:', err);
    showToast('Failed to delete gig lead.', 'error');
  }
}

// ==========================================
// INIT — WIRE UP ALL GIG/AUTOPILOT EVENTS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Mode tabs
  document.getElementById('mode-b2b').addEventListener('click',  () => switchMode('b2b'));
  document.getElementById('mode-gigs').addEventListener('click', () => switchMode('gigs'));

  // Autopilot toggle
  const toggle = document.getElementById('autopilot-toggle');
  if (toggle) {
    toggle.addEventListener('change', handleToggle);
    fetchAutopilotStatus(); // Sync toggle state on load
  }

  // Manual scan button
  const scanBtn = document.getElementById('manual-scan-btn');
  if (scanBtn) scanBtn.addEventListener('click', runManualScan);

  // Gig filter tabs
  const gigFilterTabs = document.querySelectorAll('[data-job-filter]');
  gigFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      gigFilterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentJobFilter = tab.getAttribute('data-job-filter');
      renderJobsList();
    });
  });
});
