require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const Lead = require('./models/Lead');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🚀 Connected to MongoDB Atlas successfully!'))
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

  // Return with standard international + prefix
  return '+' + normalized;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. GET ALL LEADS
app.get('/api/leads', async (req, res) => {
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
      Specifically find businesses that either have no website, a broken/offline website, or rely entirely on social media/DMs for booking or selling products (e.g. using Linktree, WhatsApp links like wa.me, or having no website link at all).
      
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
      - location: Exactly "${location.toLowerCase()}".
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

// 3. GENERATE GEMINI PITCH FOR A LEAD
app.post('/api/leads/:id/pitch', async (req, res) => {
  const { id } = req.params;

  if (!genAI) {
    return res.status(400).json({ 
      success: false, 
      message: 'Gemini AI is not configured. Add GEMINI_API_KEY to your .env file.' 
    });
  }

  try {
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    // Build highly professional proposal prompt (Corporate Lead Auditing)
    let prompt = `
      You are an expert business growth consultant and professional sales copywriter.
      Write an extremely direct, conversational, and highly persuasive business outreach message addressed to "${lead.name}".
      The goal of this message is to capture their attention instantly. Keep the message short, punchy, and under 150 to 200 words. Avoid long essays, formal business reports, or dry documents.
      
      Here is the diagnostic audit data of the prospect:
      Name: ${lead.name}
      Platform: ${lead.platform}
      Category/Niche: ${lead.niche}
      Location: ${lead.location}
      Contact: ${lead.phone ? `Phone: ${lead.phone}` : ''} ${lead.email ? `Email: ${lead.email}` : ''}
      Social Link: ${lead.socialUrl}
      Website Status: ${lead.websiteStatus || 'Missing Website'}
      Identified Bottlenecks: ${(lead.bottlenecks || []).join(', ') || 'No custom website, manual booking/sales'}
      Reviews/Followers: ${lead.reviewsCount || 0}
      
      OUTREACH STRUCTURE:
      1. COMPLIMENT & ATTENTION GRABBER: Start by complimenting their impressive presence or customer feedback (e.g. "We saw your highly rated ${lead.niche} profile in ${lead.location} with ${lead.reviewsCount} reviews...").
      2. THE PROBLEM & LOSS: Directly but politely highlight their core digital operational bottleneck (e.g. a missing website link, an offline/dead URL, or relying entirely on DMs/phone calls). Clearly articulate what they are losing because of this (e.g. losing potential customers who drop off when they can't book instantly, hours wasted on manual chat coordination, and losing local search traffic to competitors).
      3. THE SOLUTION & CALL TO ACTION: Propose building a premium, custom mobile-optimized website and booking catalog designed specifically for their brand to automate client acquisition and recovery. Ask if they are open to a brief 2-minute chat this week to discuss how we can implement this.
      
      STRICT CONTROLS:
      - Keep it short, conversational, and direct. NO long blocks of formal proposal text.
      - Do NOT use any emojis, smileys, or icons.
      - Do NOT claim, suggest, or imply that we have already built a mockup, website, preview, or catalog for them. Do NOT ask them to review a "preview link" or "mockup link". Focus purely on offering to design and build a custom website solution for their brand to solve their digital bottleneck.
      - Do not include brackets, placeholders, or template tags (like [Name], [Your Name], [Contact Info]) in the final proposal text.
      - Sign off formally as:
        Sincerely,
        AkinByte Technologies Limited
        Email: Akinyemioluwaseunjunior@gmail.com
        Phone: +234 7071238658
    `;

    console.log(`🤖 Generating Gemini Proposal for: ${lead.name}`);

    const pitchText = await generateGeminiContent(prompt);

    lead.customPitch = pitchText;
    lead.status = 'pitch-ready';
    await lead.save();

    res.json({ success: true, data: lead });

  } catch (err) {
    console.error('Gemini Generation Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate custom proposal via Gemini.' });
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
