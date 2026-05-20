// ==========================================================================
// PROSPECTOR AI — FRONTEND APP CONTROLLER
// ==========================================================================

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
  const confirmDelete = await showConfirm(
    'Delete Prospect',
    `Are you sure you want to permanently delete "${selectedLead.name}" from your lead database?`,
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
      selectedLead = null;
      renderLeadsList();
      renderPitchStudio();
      showToast('Prospect successfully deleted from lead database.', 'success');
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    console.error('Failed to delete prospect:', err);
    showToast('Failed to delete prospect from database.', 'error');
  }
}
