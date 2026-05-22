const cron = require('node-cron');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const JobLead = require('../models/JobLead');
const Lead = require('../models/Lead');
const SystemConfig = require('../models/SystemConfig');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let activeCronTask = null;

// Initialize Gemini
let genAI = null;
if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('🤖 Autopilot: Google Gemini AI initialized successfully!');
  } catch (err) {
    console.error('❌ Autopilot: Failed to initialize Gemini:', err);
  }
}

// Generate Gemini Content helper
async function generateGeminiJSON(prompt) {
  if (!genAI) {
    throw new Error('Gemini API is not initialized. Please verify your GEMINI_API_KEY.');
  }
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// Generate Gemini Content with Live Google Search Grounding and robust retries
async function generateGeminiGrounded(prompt) {
  if (!genAI) {
    throw new Error('Gemini API is not initialized. Please verify your GEMINI_API_KEY.');
  }
  const maxAttempts = 3;
  const delayMs = 3000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🤖 Autopilot: Querying grounded brain: gemini-2.5-flash (Attempt ${attempt}/${maxAttempts})`);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        tools: [{ googleSearch: {} }] 
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      console.warn(`⚠️ Autopilot: Grounded search attempt ${attempt} failed: ${err.message || err}`);
      if (attempt === maxAttempts) {
        throw err;
      } else {
        await sleep(delayMs);
      }
    }
  }
}

// Send Message via Telegram Bot for Freelance Gigs
async function sendTelegramAlert(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('⚠️ Autopilot: Telegram credentials missing in .env. Skipping alert.');
    return;
  }

  const messageText = `🚨 *HOT DEVELOPER LEAD*
📌 *Platform*: ${lead.platform}
💼 *Job*: ${lead.title}
💰 *Budget*: ${lead.budget}
🛠️ *Skills*: ${lead.requiredSkills.join(', ') || 'General Dev'}
🔗 *Link*: ${lead.postUrl}

🤖 *AI GENERATED PROPOSAL*:
\`\`\`
${lead.customProposal}
\`\`\`
`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: messageText,
      parse_mode: 'Markdown'
    });
    console.log(`✅ Telegram alert sent successfully for: ${lead.title}`);
  } catch (err) {
    console.error('❌ Autopilot: Failed to send Telegram alert:', err.response ? err.response.data : err.message);
  }
}

// Send Message via Telegram Bot for B2B Client Leads
async function sendTelegramB2BAlert(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('⚠️ Autopilot B2B: Telegram credentials missing in .env. Skipping alert.');
    return;
  }

  const messageText = `🚨 *NEW B2B CLIENT FOUND (AUTOPILOT)*
🏢 *Name*: ${lead.name}
📍 *Platform*: ${lead.platform}
💼 *Niche*: ${lead.niche} (${lead.location})
🌐 *Website*: ${lead.websiteStatus} ${lead.website ? `(${lead.website})` : ''}
📞 *Contact*: ${lead.phone || 'None'} | ${lead.email || 'None'}
🎯 *Convertibility*: ${lead.convertibility} | *Score*: ${lead.qualityScore}%

🤖 *PRE-GENERATED PROPOSAL*:
\`\`\`
${lead.customPitch}
\`\`\`
`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: messageText,
      parse_mode: 'Markdown'
    });
    console.log(`✅ Telegram B2B alert sent successfully for: ${lead.name}`);
  } catch (err) {
    console.error('❌ Autopilot B2B: Failed to send Telegram B2B alert:', err.response ? err.response.data : err.message);
  }
}

// Rotating B2B Local Business Campaigns - Dynamic Permutations for Unserved Non-Popularized Towns & Cities
const B2B_NICHES = [
  'dentist', 'roofing', 'spa & beauty', 'plumber', 'construction', 
  'boutique', 'cleaning service', 'home builder', 'landscaping', 'hvac', 
  'electrician', 'florist', 'dry cleaning', 'bakery', 'auto repair', 
  'chiropractor', 'veterinarian', 'gym & fitness', 'catering', 'pest control', 
  'painting contractor', 'roofing contractor', 'locksmith', 'accounting service',
  'hair salon', 'moving company', 'solar installer', 'medical clinic'
];

const B2B_LOCATIONS = [
  // Indiana (excellent local leads, low competition)
  { city: 'Fort Wayne', state: 'Indiana' },
  { city: 'South Bend', state: 'Indiana' },
  { city: 'Evansville', state: 'Indiana' },
  { city: 'Lafayette', state: 'Indiana' },
  { city: 'Bloomington', state: 'Indiana' },
  
  // Ohio
  { city: 'Toledo', state: 'Ohio' },
  { city: 'Akron', state: 'Ohio' },
  { city: 'Dayton', state: 'Ohio' },
  { city: 'Canton', state: 'Ohio' },
  { city: 'Youngstown', state: 'Ohio' },
  { city: 'Springfield', state: 'Ohio' },
  
  // Oklahoma
  { city: 'Tulsa', state: 'Oklahoma' },
  { city: 'Norman', state: 'Oklahoma' },
  { city: 'Edmond', state: 'Oklahoma' },
  { city: 'Lawton', state: 'Oklahoma' },
  { city: 'Broken Arrow', state: 'Oklahoma' },
  
  // Kansas
  { city: 'Wichita', state: 'Kansas' },
  { city: 'Topeka', state: 'Kansas' },
  { city: 'Lawrence', state: 'Kansas' },
  { city: 'Olathe', state: 'Kansas' },
  
  // Missouri
  { city: 'Springfield', state: 'Missouri' },
  { city: 'Columbia', state: 'Missouri' },
  { city: 'Independence', state: 'Missouri' },
  { city: 'St. Joseph', state: 'Missouri' },
  
  // Iowa
  { city: 'Des Moines', state: 'Iowa' },
  { city: 'Cedar Rapids', state: 'Iowa' },
  { city: 'Davenport', state: 'Iowa' },
  { city: 'Sioux City', state: 'Iowa' },
  
  // Nebraska
  { city: 'Lincoln', state: 'Nebraska' },
  { city: 'Bellevue', state: 'Nebraska' },
  { city: 'Grand Island', state: 'Nebraska' },
  
  // Wisconsin
  { city: 'Green Bay', state: 'Wisconsin' },
  { city: 'Kenosha', state: 'Wisconsin' },
  { city: 'Racine', state: 'Wisconsin' },
  { city: 'Appleton', state: 'Wisconsin' },
  
  // Tennessee
  { city: 'Knoxville', state: 'Tennessee' },
  { city: 'Chattanooga', state: 'Tennessee' },
  { city: 'Clarksville', state: 'Tennessee' },
  { city: 'Murfreesboro', state: 'Tennessee' },

  // Kentucky
  { city: 'Lexington', state: 'Kentucky' },
  { city: 'Bowling Green', state: 'Kentucky' },
  { city: 'Owensboro', state: 'Kentucky' },
  { city: 'Covington', state: 'Kentucky' },

  // Illinois
  { city: 'Rockford', state: 'Illinois' },
  { city: 'Peoria', state: 'Illinois' },
  { city: 'Springfield', state: 'Illinois' },

  // Alabama
  { city: 'Huntsville', state: 'Alabama' },
  { city: 'Montgomery', state: 'Alabama' },
  { city: 'Mobile', state: 'Alabama' },

  // Georgia
  { city: 'Savannah', state: 'Georgia' },
  { city: 'Augusta', state: 'Georgia' },
  { city: 'Columbus', state: 'Georgia' }
];

const B2B_PLATFORMS = ['Google Maps', 'Yelp', 'Instagram', 'Facebook'];

function getDynamicB2BCampaign() {
  const niche = B2B_NICHES[Math.floor(Math.random() * B2B_NICHES.length)];
  const locationObj = B2B_LOCATIONS[Math.floor(Math.random() * B2B_LOCATIONS.length)];
  const platform = B2B_PLATFORMS[Math.floor(Math.random() * B2B_PLATFORMS.length)];
  return {
    niche: niche,
    location: `${locationObj.city} ${locationObj.state}`,
    platform: platform
  };
}

// Core B2B Crawler and Qualifier Logic
async function scanB2BLeads() {
  const campaign = getDynamicB2BCampaign();
  console.log(`🔍 Autopilot B2B: Scanning niche "${campaign.niche}" in "${campaign.location}" on ${campaign.platform}...`);
  
  const prompt = `
    Perform a live Google Search to discover 5 real, active local businesses or creators in the category "${campaign.niche}" located in "${campaign.location}" that operate on ${campaign.platform}.
    We are looking for independent local businesses (exclude national brands/franchises/jobs). 
    Specifically find businesses that either have no website, a broken/offline website, or rely entirely on social media/DMs for booking or selling products (e.g. using Linktree, WhatsApp links like wa.me, or having no website link at all).
    
    CRITICAL LINK & INTEGRITY CONSTRAINTS:
    1. Every single business you return MUST have a real, verified, active profile URL on ${campaign.platform}.
    2. The "socialUrl" field MUST be the exact, real profile link (e.g. https://www.instagram.com/real_username/) found directly in the search results.
    3. DO NOT guess, fabricate, extrapolate, or estimate the username or URL based on the business name.
    4. If you cannot verify the actual, active profile page URL for a business on ${campaign.platform}, do NOT include that business in your output.
    
    For each business, you MUST return exactly these fields in the JSON:
    - name: The clean, professional business or creator name.
    - platform: Exactly "${campaign.platform}".
    - niche: Exactly "${campaign.niche.toLowerCase()}".
    - location: Exactly "${campaign.location.toLowerCase()}".
    - socialUrl: The actual, verified, active profile URL.
    - website: The website URL listed on their profile (if any), or an empty string if none.
    - phone: A real local contact number.
    - email: A real contact email if listed, or empty string.
    - bioSnippet: A brief snippet describing their services, follower count, or reviews from their profile.
    - reviewsCount: A real or estimated integer for follower count (if Instagram/TikTok/LinkedIn) or reviews count (if Yelp/Maps/TripAdvisor).
    - websiteStatus: Choose one: "Missing Website", "Has Website Link", or "Social-Only Catalog".
    - bottlenecks: An array of 2-3 specific digital bottlenecks.
    - convertibility: "High", "Medium", or "Low".
    
    Return the output ONLY as a valid JSON array of objects. Do not include markdown code block formatting (like \`\`\`json). Just return the raw JSON array string.
  `;

  try {
    const responseText = await generateGeminiGrounded(prompt);
    let items = [];
    
    const startIdx = responseText.indexOf('[');
    const endIdx = responseText.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      items = JSON.parse(responseText.substring(startIdx, endIdx + 1));
    } else {
      items = JSON.parse(responseText);
    }

    let savedCount = 0;

    for (const item of items) {
      const leadLocation = item.location ? item.location.toLowerCase() : campaign.location.toLowerCase();
      const leadNiche = item.niche ? item.niche.toLowerCase() : campaign.niche.toLowerCase();
      
      const existing = await Lead.findOne({
        name: item.name,
        location: leadLocation,
        niche: leadNiche
      });
      if (existing) continue;

      let statusToCheck = item.websiteStatus || 'Missing Website';
      let detectedBottlenecks = item.bottlenecks || [];

      if (item.website && item.website.trim() !== '') {
        let websiteUrl = item.website.trim();
        if (!/^https?:\/\//i.test(websiteUrl)) {
          websiteUrl = 'http://' + websiteUrl;
        }
        try {
          await axios.get(websiteUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 3000 
          });
          if (statusToCheck === 'Missing Website') {
            statusToCheck = 'Has Website Link';
          }
        } catch (err) {
          statusToCheck = 'Broken/Offline Website';
          if (!detectedBottlenecks.includes('Broken/Offline Website')) {
            detectedBottlenecks.push('Broken/Offline Website');
          }
        }
      }

      let score = 0;
      if (statusToCheck === 'Missing Website') score += 40;
      else if (statusToCheck === 'Broken/Offline Website') score += 50;
      else if (statusToCheck === 'Social-Only Catalog') score += 30;
      else score += 10;

      if (item.phone || item.email) score += 20;
      if (item.reviewsCount > 500) score += 20;
      if (item.bioSnippet && item.bioSnippet.length > 20) score += 10;
      const qualityScore = Math.min(score, 100);

      const newLead = new Lead({
        name: item.name,
        platform: item.platform || campaign.platform || 'Google Maps',
        niche: leadNiche,
        location: leadLocation,
        phone: item.phone || '',
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

      if (statusToCheck === 'Missing Website' || statusToCheck === 'Broken/Offline Website' || statusToCheck === 'Social-Only Catalog') {
        console.log(`🤖 Autopilot B2B: Generating outreach pitch for B2B client: "${item.name}"`);
        const pitchPrompt = `
          You are an expert business growth consultant and professional sales copywriter.
          Write an extremely direct, conversational, and highly persuasive outreach message addressed to "${newLead.name}".
          The goal of this message is to capture their attention instantly. Keep the message short, punchy, and under 150 to 200 words. Avoid long essays, formal business reports, or dry documents.
          
          Here is the diagnostic audit data of the prospect:
          Name: ${newLead.name}
          Platform: ${newLead.platform}
          Category/Niche: ${newLead.niche}
          Location: ${newLead.location}
          Contact: ${newLead.phone ? `Phone: ${newLead.phone}` : ''} ${newLead.email ? `Email: ${newLead.email}` : ''}
          Social Link: ${newLead.socialUrl}
          Website Status: ${newLead.websiteStatus || 'Missing Website'}
          Identified Bottlenecks: ${(newLead.bottlenecks || []).join(', ') || 'No custom website, manual booking/sales'}
          Reviews/Followers: ${newLead.reviewsCount || 0}
          
          OUTREACH STRUCTURE:
          1. COMPLIMENT & ATTENTION GRABBER: Start by complimenting their impressive presence or customer feedback (e.g. "We saw your highly rated ${newLead.niche} profile in ${newLead.location} with ${newLead.reviewsCount} reviews...").
          2. THE PROBLEM & LOSS: Directly but politely highlight their core digital operational bottleneck. Clearly articulate what they are losing because of this.
          3. THE SOLUTION & CALL TO ACTION: Propose building a premium, custom mobile-optimized website and booking catalog designed specifically for their brand to automate client acquisition and recovery. Ask if they are open to a brief 2-minute chat this week to discuss how we can implement this.
          
          STRICT CONTROLS:
          - Keep it short, conversational, and direct. NO long blocks of formal proposal text.
          - Do NOT use any emojis, smileys, or icons.
          - Do NOT claim, suggest, or imply that we have already built a mockup, website, preview, or catalog for them.
          - Do not include brackets, placeholders, or template tags in the final proposal text.
          - Sign off formally as:
            Sincerely,
            AkinByte Technologies Limited
            Email: Akinyemioluwaseunjunior@gmail.com
            Phone: +234 7071238658
        `;
        
        try {
          const pitchText = await generateGeminiGrounded(pitchPrompt);
          newLead.customPitch = pitchText;
          newLead.status = 'pitch-ready';
        } catch (err) {
          console.error(`❌ Autopilot B2B: Pitch generation failed for ${newLead.name}:`, err.message);
        }
      }

      await newLead.save();
      savedCount++;

      if (newLead.status === 'pitch-ready') {
        await sendTelegramB2BAlert(newLead);
      }
    }
    console.log(`Finished B2B scan. Found and saved ${savedCount} new prospects.`);
  } catch (err) {
    console.error('❌ Autopilot B2B: Scan failed:', err.message);
  }
}

// Social Platforms Gig Searches
const SOCIAL_GIG_CAMPAIGNS = [
  { platform: 'Twitter/X', query: 'site:x.com "hiring" ("web developer" OR "nextjs" OR "mern" OR "react developer") -"job board"' },
  { platform: 'LinkedIn', query: 'site:linkedin.com/posts "looking for a" ("nextjs" OR "mern" OR "react") "developer"' }
];

async function scanSocialGigs() {
  const campaign = SOCIAL_GIG_CAMPAIGNS[Math.floor(Math.random() * SOCIAL_GIG_CAMPAIGNS.length)];
  console.log(`🔍 Autopilot Social Gigs: Scraping ${campaign.platform} via Google Search Grounding...`);

  const prompt = `
    Perform a live Google Search using this query: "${campaign.query}"
    Identify 3 real, active, recent social posts where clients are looking to hire a software developer, web programmer, or coder.
    Do NOT include posts written by developers advertising their services (For Hire). ONLY return job post offers looking to hire a developer.
    
    For each post, return:
    - title: A descriptive job title.
    - postUrl: The exact URL of the post (must be verified and real, do not guess).
    - postContent: The text content of the post.
    
    Return the output ONLY as a valid JSON array of objects. Do not include markdown code block formatting (like \`\`\`json). Just return the raw JSON array string.
    JSON schema:
    [
      {
        "title": string,
        "postUrl": string,
        "postContent": string
      }
    ]
  `;

  try {
    const responseText = await generateGeminiGrounded(prompt);
    let posts = [];
    
    const startIdx = responseText.indexOf('[');
    const endIdx = responseText.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      posts = JSON.parse(responseText.substring(startIdx, endIdx + 1));
    } else {
      posts = JSON.parse(responseText);
    }

    let savedCount = 0;

    for (const post of posts) {
      const existing = await JobLead.findOne({ postUrl: post.postUrl });
      if (existing) continue;

      console.log(`🎯 Autopilot: Found potential ${campaign.platform} gig: "${post.title}". Qualifying with Gemini...`);

      const qualificationPrompt = `
        You are an expert AI recruiter and freelance developer.
        Analyze this social job board post:
        Title: "${post.title}"
        Body: "${post.postContent}"
        
        Your instructions:
        1. Determine if this is an active hiring post seeking a software developer, web programmer, coder, designer, or technical builder.
           - We ONLY want client job offers looking to hire a developer. Return "isHiring": true or false.
        2. If isHiring is true:
           - Extract the "budget" (e.g. "$500", "$40/hr", or "Unspecified").
           - Extract "requiredSkills" as an array of technologies mentioned (e.g., ["React", "Node.js"]).
           - Write a hyper-personalized sales proposal pitch under 180 words.
             Introduce yourself as a software developer. Do NOT mention AkinByte Technologies Limited.
             Your CORE target stack is the MERN stack (MongoDB, Express, React, Node.js), TypeScript, and Next.js.
             Focus on their specific requirements. Do NOT use placeholders. Keep it conversational, direct, and suggest scheduling a brief chat.
             Sign off as Akinyemi Oluwaseun (Email: Akinyemioluwaseunjunior@gmail.com, Phone: +234 7071238658).
        
        Return the output ONLY as a valid JSON object string. Do not include markdown code block formatting (like \`\`\`json).
        JSON schema:
        {
          "isHiring": boolean,
          "budget": string,
          "requiredSkills": string[],
          "customProposal": string
        }
      `;

      try {
        const qualResponse = await generateGeminiJSON(qualificationPrompt);
        let parsed = {};
        
        const qStart = qualResponse.indexOf('{');
        const qEnd = qualResponse.lastIndexOf('}');
        if (qStart !== -1 && qEnd !== -1 && qEnd > qStart) {
          parsed = JSON.parse(qualResponse.substring(qStart, qEnd + 1));
        } else {
          parsed = JSON.parse(qualResponse);
        }

        if (parsed.isHiring) {
          console.log(`🔥 Autopilot: Confirmed gig match: "${post.title}". Saving and alerting...`);
          
          const newLead = new JobLead({
            title: post.title,
            platform: `${campaign.platform} (Autopilot)`,
            postUrl: post.postUrl,
            postContent: post.postContent || '',
            budget: parsed.budget || 'Unspecified',
            requiredSkills: parsed.requiredSkills || [],
            customProposal: parsed.customProposal || '',
            status: 'proposal-ready',
            postCreatedAt: new Date()
          });

          await newLead.save();
          savedCount++;

          // Alert User via Telegram
          await sendTelegramAlert(newLead);
        } else {
          console.log(`ℹ️ Autopilot: Discarded social post as non-hiring/irrelevant.`);
          const skippedLead = new JobLead({
            title: post.title,
            platform: `${campaign.platform} (Autopilot)`,
            postUrl: post.postUrl,
            postContent: post.postContent || '',
            status: 'closed',
            postCreatedAt: new Date()
          });
          await skippedLead.save();
        }
      } catch (err) {
        console.error('❌ Autopilot Social Gigs: Error qualifying post:', err.message);
      }
    }
    console.log(`Finished ${campaign.platform} social gig scan. Found ${savedCount} new hot gigs.`);
  } catch (err) {
    console.error(`❌ Autopilot Social Gigs: Scan failed:`, err.message);
  }
}

// Core Reddit Scanner Logic
async function scanRedditSubreddit(subreddit) {
  console.log(`🔍 Autopilot: Scanning r/${subreddit} for developer opportunities...`);
  try {
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=15`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProspectorAI/1.0' }
    });

    const posts = response.data.data.children;
    let leadsFound = 0;

    for (const postWrapper of posts) {
      const post = postWrapper.data;
      const postUrl = `https://www.reddit.com${post.permalink}`;

      // Check if lead already exists in DB
      const existing = await JobLead.findOne({ postUrl });
      if (existing) continue;

      const titleAndText = `${post.title} ${post.selftext}`.toLowerCase();

      // Broad filter focusing on web development, MERN, React, Node, Next.js, TypeScript, Fullstack, Frontend, Backend
      const keywords = [
        'dev', 'developer', 'web', 'app', 'site', 'website', 'coder', 'program', 'react', 'node', 
        'express', 'mongodb', 'mern', 'nextjs', 'next.js', 'typescript', 'ts', 'fullstack', 
        'full-stack', 'backend', 'frontend', 'hire', 'hiring', 'looking for'
      ];
      const hasKeyword = keywords.some(kw => titleAndText.includes(kw));

      if (!hasKeyword) continue;

      console.log(`🎯 Autopilot: Found potential Reddit match: "${post.title}". Qualifying with Gemini...`);

      // Run qualification and pitch generation through Gemini specifically tuned for the MERN/NextJS/TS stack
      const prompt = `
        You are an expert AI recruiter and freelance developer.
        Analyze this Reddit job board post:
        Title: "${post.title}"
        Body: "${post.selftext}"
        
        Your instructions:
        1. Determine if this is an active hiring post seeking a software developer, web programmer, coder, designer, or technical builder.
           - Note: Many posts are typed by developers looking for work (For Hire). We MUST exclude "For Hire" posts. We ONLY want client job offers looking to hire a developer.
           - Return "isHiring": true or false.
        2. If isHiring is true:
           - Extract the "budget" (e.g. "$500", "$40/hr", or "Unspecified").
           - Extract "requiredSkills" as an array of technologies mentioned (e.g., ["React", "Node.js"]).
           - Write a hyper-personalized sales proposal pitch under 180 words.
             Introduce yourself as a software developer. Do NOT mention AkinByte Technologies Limited.
             Your CORE target stack is the MERN stack (MongoDB, Express, React, Node.js), TypeScript, and Next.js.
             - If the client's post mentions MERN, MongoDB, Express, React, Node, Next.js, or TypeScript, write a highly tailored pitch highlighting your deep expertise in these specific technologies.
             - If the post is for general software or web development (or mentions other web tech like Python, PHP, etc.), tailor a compelling pitch illustrating how you can deliver highly interactive, fast, scalable full-stack applications with high performance.
             Focus on their specific requirements. Do NOT use placeholders. Keep it conversational, direct, and suggest scheduling a brief chat.
             Sign off as Akinyemi Oluwaseun (Email: Akinyemioluwaseunjunior@gmail.com, Phone: +234 7071238658).
        
        Return the output ONLY as a valid JSON object string. Do not include markdown code block formatting (like \`\`\`json).
        JSON schema:
        {
          "isHiring": boolean,
          "budget": string,
          "requiredSkills": string[],
          "customProposal": string
        }
      `;

      try {
        const responseText = await generateGeminiJSON(prompt);
        let parsed = {};
        
        // Extract JSON array/object cleanly
        const startIdx = responseText.indexOf('{');
        const endIdx = responseText.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          parsed = JSON.parse(responseText.substring(startIdx, endIdx + 1));
        } else {
          parsed = JSON.parse(responseText);
        }

        if (parsed.isHiring) {
          console.log(`🔥 Autopilot: Confirmed gig match: "${post.title}". Saving and alerting...`);
          
          const newLead = new JobLead({
            title: post.title,
            platform: `Reddit (r/${subreddit})`,
            postUrl: postUrl,
            postContent: post.selftext || '',
            budget: parsed.budget || 'Unspecified',
            requiredSkills: parsed.requiredSkills || [],
            customProposal: parsed.customProposal || '',
            status: 'proposal-ready',
            postCreatedAt: new Date(post.created_utc * 1000)
          });

          await newLead.save();
          leadsFound++;

          // Alert User via Telegram
          await sendTelegramAlert(newLead);
        } else {
          // Save negative results as "closed" to avoid rescanning and wasting API calls
          console.log(`ℹ️ Autopilot: Discarded post as non-hiring/irrelevant.`);
          const skippedLead = new JobLead({
            title: post.title,
            platform: `Reddit (r/${subreddit})`,
            postUrl: postUrl,
            postContent: post.selftext || '',
            status: 'closed', // Hidden or closed status to prevent parsing again
            postCreatedAt: new Date(post.created_utc * 1000)
          });
          await skippedLead.save();
        }
      } catch (err) {
        console.error('❌ Autopilot: Error parsing Gemini response:', err.message);
      }
    }

    console.log(`Finished r/${subreddit} scan. Found ${leadsFound} new hot leads.`);
  } catch (err) {
    console.error(`❌ Autopilot: Error scanning r/${subreddit}:`, err.message);
  }
}

// Global scan executor
async function runAllScans() {
  // 1. Reddit subreddits
  await scanRedditSubreddit('forhire');
  await scanRedditSubreddit('freelance_forhire');
  await scanRedditSubreddit('jobbit');

  // 2. Social Media Grounded Freelance Gig scans (Twitter/X & LinkedIn)
  await scanSocialGigs();

  // 3. B2B Local Business Crawler scan
  await scanB2BLeads();
}

// Autopilot Controllers
function startAgent() {
  if (activeCronTask) {
    console.log('ℹ️ Autopilot: Background agent is already running.');
    return;
  }

  console.log('🚀 Autopilot: Starting background agent (Interval: 15 minutes)...');
  
  // Run immediately on start, then schedule
  runAllScans().catch(err => console.error('❌ Autopilot: Initial scan failed:', err));

  // Schedule task every 15 minutes
  activeCronTask = cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ Autopilot: Triggering scheduled scan...');
    try {
      const config = await SystemConfig.findOne({ key: 'autopilot_active' });
      if (config && config.value === true) {
        await runAllScans();
      } else {
        console.log('🛑 Autopilot: Inactive configuration detected. Stopping task.');
        stopAgent();
      }
    } catch (err) {
      console.error('❌ Autopilot: Scheduled task execution failed:', err);
    }
  });

  activeCronTask.start();
}

function stopAgent() {
  if (!activeCronTask) {
    console.log('ℹ️ Autopilot: Background agent is not running.');
    return;
  }

  console.log('🛑 Autopilot: Stopping background agent...');
  activeCronTask.stop();
  activeCronTask = null;
}

// Hook to initialize agent state from DB on server startup
async function initAutopilotOnStartup() {
  try {
    const config = await SystemConfig.findOne({ key: 'autopilot_active' });
    if (config && config.value === true) {
      console.log('⚡ Autopilot: Autopilot config is active. Initializing cron scheduler.');
      startAgent();
    } else {
      console.log('⚡ Autopilot: Autopilot config is disabled. Scheduler idle.');
    }
  } catch (err) {
    console.error('❌ Autopilot: Startup initialization failed:', err);
  }
}

module.exports = {
  startAgent,
  stopAgent,
  initAutopilotOnStartup,
  runAllScans // Export for manual triggers
};
