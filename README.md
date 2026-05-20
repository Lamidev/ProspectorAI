# Prospector AI 🎯

A premium, standalone, Gemini-powered **Client Acquisition & Lead Scraper Engine** built to locate high-intent local businesses and creators who don't have websites, and auto-generate highly qualified, hyper-personalized sales audits and pitches.

Runs as a **unified Node.js server**—highly performant, ultra-lightweight (~50MB RAM), and completely free to operate on your existing VPS and database resources!

---

## 📂 Project Directory Structure

```text
client-lead-finder/
  ├── package.json
  ├── server.js               <-- Unified Server Core
  ├── .env                    <-- Credentials & Keys
  ├── models/
  │    └── Lead.js            <-- MongoDB Lead Schema
  └── public/                 <-- Stunning Glassmorphic Dashboard Console
       ├── index.html
       ├── styles.css
       └── app.js
```

---

## 🚀 Local Quickstart (On your Laptop)

Follow these simple steps to run and test it on your laptop:

### 1. Install Dependencies
Open your terminal, navigate into the project directory, and install the lightweight Node modules:
```bash
cd c:\Users\user\Desktop\My-Projects\Active-projects\client-lead-finder
npm install
```

### 2. Configure Environment Keys
Open the `.env` file on your laptop and paste your keys:
*   `MONGO_URI`: (Copy from your Kredibly Atlas URL, but change the database name at the end to `prospector_ai`).
*   `GEMINI_API_KEY`: (Your existing Google Gemini API key).
*   `GOOGLE_SEARCH_API_KEY`: Get a free key (100 free searches/day) in 10 seconds: [Google Custom Search](https://developers.google.com/custom-search/v1/overview) (Click *Get a Key*).
*   `GOOGLE_CX`: Create a free custom search engine in 10 seconds: [Programmable Search Engine](https://programmablesearchengine.google.com/). Set it to search the web (e.g. `site:instagram.com` or general web pages).

### 3. Run Development Server
```bash
npm run dev
```
Open **`http://localhost:9000`** in your browser and start harvesting prospects!

---

## 🌎 Deploying to your Contabo VPS ($0 Extra Cost)

Since you already have a powerful 8 GB RAM Contabo server, deploying this standalone tool 24/7 is a breeze:

### Step 1: Push Code to a Private GitHub Repo
Initialize git inside `client-lead-finder/`, push the folder to your private GitHub account.

### Step 2: Clone onto your VPS
SSH into your Contabo server and clone the repository:
```bash
git clone <your-repo-link>
cd client-lead-finder
npm install --omit=dev
```

### Step 3: Start with PM2 (Background Worker)
PM2 ensures the server runs forever in the background. Start the server with a descriptive name:
```bash
pm2 start server.js --name "prospector-ai"
```
*(Your new engine is now running 24/7 in the background on Port 9000!)*

### Step 4: Map your Free Subdomain
1.  Go to your Domain Registrar (Namecheap, GoDaddy, Cloudflare, etc.).
2.  Add a **free A Record**:
    *   **Host/Name**: `leads` (or `prospects`)
    *   **Value/IP**: Your Contabo VPS IP address (`157.173.125.29`)
3.  On your VPS, open your Nginx configuration, add a reverse proxy block mapping `leads.yourdomain.com` to `http://localhost:9000`, run `certbot --nginx` for free SSL, and you are instantly live!

---

## 🏆 Your Lead Generation Flow
1.  **Harvest**: Search for `Boutiques` or `Spas` in `Lekki` or `London`.
2.  **Qualify**: Review the scraped profiles, follower numbers, and bio details on your grid dashboard.
3.  **Audit**: Click "Generate Pitch". Google Gemini connects, analyzes their profile, finds their booking leaks, and writes an irresistible outreach pitch.
4.  **Pitch**: Click **"Pitch on WhatsApp"** or **"Send Email"**. Pitch goes out, client goes in! 💸
