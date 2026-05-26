require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const Lead = require('./models/Lead');
const JobLead = require('./models/JobLead');
const SystemConfig = require('./models/SystemConfig');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('🚀 Connected to MongoDB Atlas successfully!');
      // Initialize background agent state from DB
      const { initAutopilotOnStartup } = require('./services/autopilot');
      initAutopilotOnStartup();
    })
    .catch(err => console.error('❌ MongoDB Atlas connection failure:', err));
} else {
  console.warn('⚠️ WARNING: MONGO_URI is missing in .env. Database will not persist leads.');
}

// Initialize Gemini Gen AI
let genAI = null;
if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('🧠 Google Gemini AI engine initialized successfully!');
  } catch (err) {
    console.error('❌ Failed to initialize Gemini AI engine:', err);
  }
} else {
  console.warn('⚠️ WARNING: GEMINI_API_KEY is missing in .env. Pitches cannot be auto-generated.');
}

// Helper function to call Gemini with robust retry logic (handles 503 service spikes gracefully!)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function generateGeminiContent(prompt, useSearch = false) {
  if (!genAI) {
    throw new Error('Google Gemini engine is not initialized. Please verify your GEMINI_API_KEY in the .env file.');
  }

  const maxAttempts = 3;
  const delayMs = 3000;

  if (useSearch) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🤖 Querying brain with live Google Search grounding: gemini-2.5-flash (Attempt ${attempt}/${maxAttempts})`);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.5-flash",
          tools: [{ googleSearch: {} }] 
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        if (text) return text;
      } catch (err) {
        console.warn(`⚠️ Grounded search attempt ${attempt} failed: ${err.message || err}`);
        if (attempt === maxAttempts) {
          console.warn('⚠️ Live search grounding failed on all attempts, falling back to standard prompt...');
        } else {
          await sleep(delayMs);
        }
      }
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🤖 Querying standard brain: gemini-2.5-flash (Attempt ${attempt}/${maxAttempts})`);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      console.warn(`⚠️ Standard brain attempt ${attempt} failed: ${err.message || err}`);
      if (attempt === maxAttempts) {
        throw err;
      } else {
        await sleep(delayMs);
      }
    }
  }
}

// Helper to normalize phone numbers internationally based on lead location
function normalizePhoneNumber(phone, location) {
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

    // Helper to format with specific country code
    const applyCountryCode = (code) => {
      if (cleaned.startsWith(code) && cleaned.length > code.length + 6) {
        return cleaned;
      }
      let localNum = cleaned;
      if (localNum.startsWith('0')) {
        localNum = localNum.substring(1);
      }
      return code + localNum;
    };

    // 1. UK (London, UK, United Kingdom, etc.)
    if (loc.includes('uk') || loc.includes('united kingdom') || loc.includes('london') || loc.includes('manchester') || loc.includes('birmingham') || loc.includes('leeds') || loc.includes('glasgow') || loc.includes('liverpool') || loc.includes('edinburgh')) {
      normalized = applyCountryCode('44');
    }
    // 2. USA / Canada
    else if (loc.includes('usa') || loc.includes('united states') || loc.includes('america') || loc.includes('canada') || loc.includes('toronto') || loc.includes('vancouver') || loc.includes('new york') || loc.includes('california') || loc.includes('texas') || loc.includes('florida')) {
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        normalized = cleaned;
      } else {
        normalized = '1' + cleaned;
      }
    }
    // 3. Australia
    else if (loc.includes('australia') || loc.includes('sydney') || loc.includes('melbourne') || loc.includes('brisbane') || loc.includes('perth') || loc.includes('adelaide')) {
      normalized = applyCountryCode('61');
    }
    // 4. South Africa
    else if (loc.includes('south africa') || loc.includes('johannesburg') || loc.includes('cape town') || loc.includes('durban') || loc.includes('pretoria')) {
      normalized = applyCountryCode('27');
    }
    // 5. Germany
    else if (loc.includes('germany') || loc.includes('berlin') || loc.includes('munich') || loc.includes('hamburg') || loc.includes('frankfurt') || loc.includes('deutschland')) {
      normalized = applyCountryCode('49');
    }
    // 6. France
    else if (loc.includes('france') || loc.includes('paris') || loc.includes('lyon') || loc.includes('marseille')) {
      normalized = applyCountryCode('33');
    }
    // 7. Netherlands
    else if (loc.includes('netherlands') || loc.includes('amsterdam') || loc.includes('rotterdam') || loc.includes('utrecht') || loc.includes('hague') || loc.includes('holland')) {
      normalized = applyCountryCode('31');
    }
    // 8. Ireland
    else if (loc.includes('ireland') || loc.includes('dublin') || loc.includes('cork') || loc.includes('galway')) {
      normalized = applyCountryCode('353');
    }
    // 9. Sweden
    else if (loc.includes('sweden') || loc.includes('stockholm') || loc.includes('gothenburg') || loc.includes('sverige')) {
      normalized = applyCountryCode('46');
    }
    // 10. Switzerland
    else if (loc.includes('switzerland') || loc.includes('zurich') || loc.includes('geneva') || loc.includes('schweiz')) {
      normalized = applyCountryCode('41');
    }
    // 11. Spain
    else if (loc.includes('spain') || loc.includes('madrid') || loc.includes('barcelona')) {
      normalized = applyCountryCode('34');
    }
    // 12. Italy
    else if (loc.includes('italy') || loc.includes('rome') || loc.includes('milan')) {
      normalized = applyCountryCode('39');
    }
    // 13. Default/Nigeria
    else {
      normalized = applyCountryCode('234');
    }
  }

  // Return with standard international + prefix
  return '+' + normalized;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. GET ALL LEADS
app.get('/api/leads', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. SEARCH & HARVEST LEADS (Google Gemini AI Structured Lead Generator with Live Google Search Grounding)
app.post('/api/leads/search', async (req, res) => {
  const { niche, location, platform } = req.body;

  if (!niche || !location) {
    return res.status(400).json({ success: false, message: 'Please provide both niche and location.' });
  }

  if (!genAI) {
    return res.status(400).json({ 
      success: false, 
      message: 'Google Gemini engine is not initialized. Please verify your GEMINI_API_KEY in the .env file.' 
    });
  }

  try {
    const prompt = `
      Perform a live Google Search to discover 8 to 10 real, active local businesses or creators in the category "${niche}" located in "${location}" that operate on ${platform}.
      We are looking for independent local businesses (exclude national brands/franchises/jobs). 
      CRITICAL LOCATION CONSTRAINT: Only find businesses that are actually situated in or near "${location}". Do not include businesses located in other regions, states, or cities.
      
      WEBSITE AUDIT PRIORITIZATION CONSTRAINT:
      Your primary goal is to find businesses that DO NOT have a website, have a broken/dead website link, or rely completely on social media catalogs or DMs for customer bookings (e.g., using Linktree, WhatsApp links like wa.me, or having no website listed at all). 
      If you can only find businesses that already have websites, you MAY return them, but prioritize those with basic or poorly optimized websites, and list their specific digital bottlenecks (e.g. "No online booking," "Poor mobile catalog," "Manual DM booking," "Zero local search optimization").
      
      STRICT JSON FORMATTING & REFUSAL CONSTRAINT:
      You MUST ALWAYS return your response as a valid JSON array of objects matching the schema below. 
      Under no circumstances should you return conversational text, apologies, explanations of search difficulties, warnings, or refutations. Even if no perfect matches are found, return a valid JSON array (or an empty array \`[]\` if absolutely nothing is found). Never start your response with "I am unable", "I cannot", or any conversational disclaimer.
      
      CRITICAL LINK & INTEGRITY CONSTRAINTS:
      1. Every single business you return MUST have a real, verified, active profile URL on ${platform}.
      2. The "socialUrl" field MUST be the exact, real profile link (e.g. https://www.instagram.com/real_username/) found directly in the search results.
      3. DO NOT guess, fabricate, extrapolate, or estimate the username or URL based on the business name (e.g. do NOT return "https://instagram.com/thespabytinu" or similar unless you explicitly found that exact URL in the live search grounding data).
      4. If you cannot verify the actual, active profile page URL for a business on ${platform}, do NOT include that business in your output.
      5. To achieve high quality, perform searches targeting the platform specifically, such as querying: "site:instagram.com ${niche} ${location}" or similar domain-specific searches on Google.
      
      For each business, you MUST return exactly these fields in the JSON:
      - name: The clean, professional business or creator name.
      - platform: Exactly "${platform}".
      - niche: Exactly "${niche.toLowerCase()}".
      - location: The actual city, state, or region where the business is located (e.g. "Miami, Florida" or "London, UK"). It MUST be located in or near the requested "${location.toLowerCase()}". Exclude and do not return any business located in a completely different city or state.
      - socialUrl: The actual, verified, active profile URL (e.g., https://www.instagram.com/actual_username).
      - website: The website URL listed on their profile (if any), or an empty string if none.
      - phone: A real local contact number.
      - email: A real contact email if listed, or empty string.
      - bioSnippet: A brief snippet describing their services, follower count, or reviews from their profile.
      - reviewsCount: A real or estimated integer for follower count (if Instagram/TikTok/LinkedIn) or reviews count (if Yelp/Maps/TripAdvisor).
      - websiteStatus: Choose one: "Missing Website", "Has Website Link", or "Social-Only Catalog".
      - bottlenecks: An array of 2-3 specific digital bottlenecks. Examples: "Manual DM booking", "No mobile landing page", "Zero local search visibility", "No online catalog".
      - convertibility: "High" (if active on social but no website), "Medium" (if basic website link but no online booking/e-commerce), or "Low".
      
      Return the output ONLY as a valid JSON array of objects. Do not include markdown code block formatting (like \`\`\`json). Just return the raw JSON array string.
    `;

    console.log(`🧠 Querying Gemini AI (with Search Grounding) for leads: Niche: "${niche}", Location: "${location}", Platform: "${platform}"`);

    // Make content generation call with Google Search Grounding enabled
    let responseText = await generateGeminiContent(prompt, true);
    
    let items = [];
    try {
      // Robust extraction of JSON array between [ and ]
      const startIdx = responseText.indexOf('[');
      const endIdx = responseText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonOnly = responseText.substring(startIdx, endIdx + 1);
        items = JSON.parse(jsonOnly);
      } else {
        // Try direct parse
        items = JSON.parse(responseText);
      }
    } catch (parseErr) {
      console.warn("⚠️ Standard JSON parse failed, trying regex match fallback...", parseErr.message);
      const match = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        try {
          items = JSON.parse(match[0]);
        } catch (regexErr) {
          console.error("❌ Fallback regex parse failed:", regexErr.message);
          throw new Error("Could not parse grounded search leads response into JSON. Raw: " + responseText);
        }
      } else {
        throw new Error("Grounded search response did not contain a valid JSON leads array. Raw: " + responseText);
      }
    }

    const harvestedLeads = [];

    for (const item of items) {
      // Real-time reachability check if website exists
      let statusToCheck = item.websiteStatus || 'Missing Website';
      let detectedBottlenecks = item.bottlenecks || [];

      if (item.website && item.website.trim() !== '') {
        let websiteUrl = item.website.trim();
        if (!/^https?:\/\//i.test(websiteUrl)) {
          websiteUrl = 'http://' + websiteUrl;
        }
        try {
          console.log(`🔍 Verifying link reachability for: ${websiteUrl}`);
          await axios.get(websiteUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 3000 
          });
          if (statusToCheck === 'Missing Website') {
            statusToCheck = 'Has Website Link';
          }
        } catch (err) {
          console.log(`⚠️ Dead link verified for ${item.name} (${websiteUrl}):`, err.message);
          statusToCheck = 'Broken/Offline Website';
          if (!detectedBottlenecks.includes('Broken/Offline Website')) {
            detectedBottlenecks.push('Broken/Offline Website');
          }
        }
      }

      // Calculate lead value score dynamically
      let score = 0;
      if (statusToCheck === 'Missing Website') {
        score += 40;
      } else if (statusToCheck === 'Broken/Offline Website') {
        score += 50; // Dead websites are high priority targets!
      } else if (statusToCheck === 'Social-Only Catalog') {
        score += 30;
      } else {
        score += 10;
      }

      if (item.phone || item.email) score += 20;
      if (item.reviewsCount > 500) score += 20;
      if (item.bioSnippet && item.bioSnippet.length > 20) score += 10;
      const qualityScore = Math.min(score, 100);

      // Attempt to save each lead (ignore duplicates gracefully)
      try {
        const leadLocation = item.location ? item.location.toLowerCase() : location.toLowerCase();
        const normalizedPhone = normalizePhoneNumber(item.phone || '', leadLocation);
        
        const newLead = new Lead({
          name: item.name,
          platform: item.platform || platform || 'Google Maps',
          niche: item.niche ? item.niche.toLowerCase() : niche.toLowerCase(),
          location: leadLocation,
          phone: normalizedPhone,
          email: item.email || '',
          socialUrl: item.socialUrl || '',
          website: item.website || '',
          bioSnippet: item.bioSnippet || '',
          reviewsCount: item.reviewsCount || 0,
          websiteStatus: statusToCheck,
          bottlenecks: detectedBottlenecks,
          convertibility: item.convertibility || 'Medium',
          qualityScore: qualityScore,
          status: 'scraped'
        });

        await newLead.save();
        harvestedLeads.push(newLead);
      } catch (err) {
        // Skip duplicate records silently
        console.log(`ℹ️ Duplicate lead skipped: ${item.name}`);
      }
    }

    res.json({ 
      success: true, 
      count: harvestedLeads.length, 
      message: `Harvest completed! Found ${harvestedLeads.length} new high-quality prospects.`,
      data: harvestedLeads 
    });

  } catch (err) {
    console.error('Lead Generation Error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate leads. Verify your GEMINI_API_KEY in the .env file.' 
    });
  }
});

// Helper to generate a premium, high-converting B2B outreach pitch locally for free!
function generateLocalPitch(lead) {
  const platformName = lead.platform || 'Google Maps';
  const reviewsCount = lead.reviewsCount || 0;
  const niche = lead.niche || 'business';
  const name = lead.name || 'Business Owner';
  const location = lead.location || 'your area';
  
  let attentionGrabber = `We saw your outstanding ${niche} presence in ${location}`;
  if (reviewsCount > 5) {
    if (platformName === 'Instagram' || platformName === 'TikTok') {
      attentionGrabber = `We came across your highly active ${niche} profile in ${location} with ${reviewsCount} followers`;
    } else {
      attentionGrabber = `We saw your highly rated ${niche} listing in ${location} with ${reviewsCount} reviews`;
    }
  }

  let bottleneckText = '';
  const websiteStatus = lead.websiteStatus || 'Missing Website';
  const bottlenecks = lead.bottlenecks || [];
  
  if (websiteStatus === 'Missing Website') {
    bottleneckText = `We noticed you don't have a custom website listed on your page. Right now, you are relying completely on manual coordination (like phone calls or social DMs) for bookings and inquiries.`;
  } else if (websiteStatus === 'Broken/Offline Website') {
    bottleneckText = `We noticed that the website link listed on your profile is currently offline or broken. This is causing high-intent local clients who click to drop off immediately.`;
  } else if (websiteStatus === 'Social-Only Catalog') {
    bottleneckText = `We noticed you are using a basic link-in-bio or social catalog. This makes it difficult for local search engines to find you and forces customers to do manual work to book your services.`;
  } else {
    bottleneckText = `We noticed some digital bottlenecks in your online presentation, specifically around local search visibility and ease of customer checkout.`;
  }

  if (bottlenecks.length > 0) {
    bottleneckText += ` This leads to ${bottlenecks.join(', ')} which costs you high-value bookings daily.`;
  }

  return `Hi ${name},

${attentionGrabber}. You are doing an impressive job, but we noticed a major digital bottleneck that is costing you business:

${bottleneckText}

When local customers search for a ${niche} in ${location}, they expect a premium, mobile-optimized booking site where they can view your services and book instantly in 2 clicks. Without this, you are losing high-value clients directly to competitors who do have custom websites.

We build premium, custom, mobile-optimized websites and automated booking catalogs tailored specifically for brands like ${name} to automate your client acquisition.

Are you open to a brief 2-minute chat this week to see how we can build this for you and recover lost revenue?

Sincerely,
AkinByte Technologies Limited
Email: Akinyemioluwaseunjunior@gmail.com
Phone: +234 7071238658`;
}

// 3. GENERATE CUSTOM PITCH FOR A LEAD (LOCAL ENGINE - $0 COST)
app.post('/api/leads/:id/pitch', async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    console.log(`🤖 Local Pitch Engine: Instantly generating pitch for: ${lead.name}`);

    // Generate local high-converting pitch instantly for $0
    lead.customPitch = generateLocalPitch(lead);
    lead.status = 'pitch-ready';
    await lead.save();

    res.json({ success: true, data: lead });

  } catch (err) {
    console.error('Local Pitch Engine Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate custom proposal locally.' });
  }
});

// 4. UPDATE LEAD STATUS
app.put('/api/leads/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const lead = await Lead.findByIdAndUpdate(id, { status }, { new: true });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. DELETE LEAD
app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await Lead.findByIdAndDelete(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }
    res.json({ success: true, message: 'Lead deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// AUTOPILOT & JOB FINDER API ROUTES
// ==========================================

// GET AUTOPILOT AGENT STATUS
app.get('/api/agent/status', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const config = await SystemConfig.findOne({ key: 'autopilot_active' });
    const isActive = config ? config.value === true : false;
    res.json({ success: true, active: isActive });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET AUTOPILOT AGENT SETTINGS AND MODE
app.get('/api/agent/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const activeConfig = await SystemConfig.findOne({ key: 'autopilot_active' });
    const modeConfig = await SystemConfig.findOne({ key: 'autopilot_mode' });
    const settingsConfig = await SystemConfig.findOne({ key: 'autopilot_b2b_settings' });

    res.json({
      success: true,
      active: activeConfig ? activeConfig.value === true : false,
      mode: modeConfig ? modeConfig.value : 'b2b',
      b2bSettings: settingsConfig ? settingsConfig.value : { enabled: false, niche: '', location: '' }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE AUTOPILOT MODE
app.post('/api/agent/mode', async (req, res) => {
  const { mode } = req.body;
  if (!['b2b', 'gigs'].includes(mode)) {
    return res.status(400).json({ success: false, message: 'Invalid autopilot mode.' });
  }
  try {
    let config = await SystemConfig.findOne({ key: 'autopilot_mode' });
    if (!config) {
      config = new SystemConfig({ key: 'autopilot_mode', value: 'b2b' });
    }
    config.value = mode;
    config.markModified('value');
    config.updatedAt = Date.now();
    await config.save();
    res.json({ success: true, mode: config.value, message: `Autopilot mode set to ${mode === 'b2b' ? 'Business Finder' : 'Developer Gig Finder'}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE AUTOPILOT B2B CUSTOM SETTINGS
app.post('/api/agent/settings', async (req, res) => {
  const { enabled, niche, location } = req.body;
  try {
    let config = await SystemConfig.findOne({ key: 'autopilot_b2b_settings' });
    if (!config) {
      config = new SystemConfig({ key: 'autopilot_b2b_settings', value: { enabled: false, niche: '', location: '' } });
    }
    config.value = {
      enabled: !!enabled,
      niche: (niche || '').trim(),
      location: (location || '').trim()
    };
    config.markModified('value');
    config.updatedAt = Date.now();
    await config.save();
    res.json({ success: true, settings: config.value, message: 'Autopilot targeting parameters saved successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// TOGGLE AUTOPILOT AGENT ON/OFF
app.post('/api/agent/toggle', async (req, res) => {
  const { startAgent, stopAgent } = require('./services/autopilot');
  try {
    let config = await SystemConfig.findOne({ key: 'autopilot_active' });
    if (!config) {
      config = new SystemConfig({ key: 'autopilot_active', value: false });
    }

    // Toggle value
    config.value = !config.value;
    config.markModified('value');
    config.updatedAt = Date.now();
    await config.save();

    if (config.value === true) {
      startAgent();
      res.json({ success: true, active: true, message: 'Autopilot Agent activated successfully!' });
    } else {
      stopAgent();
      res.json({ success: true, active: false, message: 'Autopilot Agent deactivated successfully.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// MANUAL TEST TRIGGER FOR REDDIT SCANS
app.get('/api/agent/test-scan', async (req, res) => {
  const { runAllScans } = require('./services/autopilot');
  try {
    console.log('⚡ Manual scan triggered via API.');
    await runAllScans();
    res.json({ success: true, message: 'Manual Reddit scan completed! Check server logs or Telegram.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET ALL JOB GIG LEADS
app.get('/api/jobs', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const jobs = await JobLead.find({ status: { $ne: 'closed' } }).sort({ createdAt: -1 });
    res.json({ success: true, count: jobs.length, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE JOB LEAD STATUS
app.put('/api/jobs/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const job = await JobLead.findByIdAndUpdate(id, { status }, { new: true });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job lead not found.' });
    }
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE JOB LEAD
app.delete('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const job = await JobLead.findByIdAndDelete(id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job lead not found.' });
    }
    res.json({ success: true, message: 'Job lead deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// BULK PUSH B2B LEADS TO TELEGRAM
app.post('/api/leads/telegram-push', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Please provide an array of lead IDs.' });
  }

  const { sendTelegramB2BAlert } = require('./services/autopilot');

  try {
    let sentCount = 0;
    for (const id of ids) {
      const lead = await Lead.findById(id);
      if (lead && !lead.telegramSent) {
        // If the lead doesn't have a pitch yet, generate one locally on-the-fly before sending!
        if (!lead.customPitch || lead.customPitch.trim() === '') {
          console.log(`🤖 Bulk Telegram: Instantly generating local pitch for: ${lead.name}`);
          lead.customPitch = generateLocalPitch(lead);
          lead.status = 'pitch-ready';
          await lead.save();
        }
        await sendTelegramB2BAlert(lead);
        sentCount++;
      }
    }
    res.json({ success: true, message: `Successfully pushed ${sentCount} leads directly to your Telegram chat!` });
  } catch (err) {
    console.error('❌ Bulk Telegram push failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to push leads to Telegram.' });
  }
});

// Fallback to Frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server Initialization
app.listen(PORT, () => {
  console.log(`
  ==============================================================
  🚀 PROSPECTOR AI RUNNING SUCCESSFULLY!
  --------------------------------------------------------------
  API Interface: http://localhost:${PORT}
  Admin Web Console: http://localhost:${PORT}/index.html
  --------------------------------------------------------------
  Decoupled stands, $0 overhead. Ready to hunt local clients!
  ==============================================================
  `);
});
