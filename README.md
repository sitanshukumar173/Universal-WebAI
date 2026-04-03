<div align="center">

  <img src="https://via.placeholder.com/1000x250/050505/4F46E5?text=Universal+WebAI" alt="Universal WebAI Banner" width="100%" style="border-radius: 10px;" />

  <h1 style="font-size: 3em; margin-bottom: 0;">🌐 Universal WebAI</h1>
  
  <p>
    <strong>A High-Performance Hybrid RAG Browser Extension</strong><br/>
    <em>Turn any website, university portal, or massive PDF into a searchable AI knowledge base.</em>
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
    <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" />
    <img src="https://img.shields.io/badge/Gemini_2.5_Flash-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white" />
  </p>

</div>

---

## 💡 Why I Built This

<blockquote>
  I was tired of manually digging through massive institutional portals, infinite documentation pages, and complex policy PDFs just to find a single piece of information. 
  <br/><br/>
  <b>Universal WebAI</b> solves this. By combining <b>Gemini 2.5 Flash</b> with <b>MongoDB Atlas Vector Search</b>, it maps the domain you are browsing, reads the deep links, and gives you verified answers with direct source citations. No fluff, just the data you need.
</blockquote>

---

<div align="center">
  <img src="https://via.placeholder.com/800x450/111111/4F46E5?text=[Insert+Demo+GIF/Video+Here]" alt="Project Demo" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);" />
  <p><em>Demonstration: Extracting exact exit-level options from a complex academic PDF in seconds.</em></p>
</div>

---

## 📂 Project Structure

<details open>
  <summary><b>Click to expand/collapse directory tree</b></summary>

```text
Universal-WebAI/
├── backend/
│   ├── src/
│   │   ├── controllers/      # RAG logic, timeouts & search fallbacks
│   │   ├── routes/           # API endpoints (/api/v1/query)
│   │   ├── services/         # AI synthesis, embeddings & Firecrawl mapping
│   │   ├── db.ts             # MongoDB connection logic
│   │   ├── index.ts          # Express server entry point
│   │   ├── models.ts         # Mongoose schemas (Website, Sitemap)
│   │   └── scraper.ts        # Core scraping and Firecrawl SDK wrappers
│   ├── .env                  # Backend secrets (API Keys, Mongo URI)
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── public/               
    │   └── manifest.json     # Chrome Extension configuration
    ├── src/
    │   ├── assets/           # UI icons and SVGs
    │   ├── App.jsx           # Main Extension UI & query logic
    │   ├── index.css         # Pitch-black Tailwind CSS variables
    │   └── main.jsx          # React DOM rendering
    ├── package.json
    ├── tailwind.config.js    # Custom dark-mode theme config
    └── vite.config.js        # Build tool configuration
</details>
📋 Prerequisites

Before spinning this up locally, make sure you have:

Node.js installed
MongoDB Atlas account
Gemini API key
Firecrawl API key
⚡ Spinning it up
1. Clone & Install
git clone https://github.com/your-username/universal-webai.git

# Setup Backend
cd universal-webai/backend
npm install

# Setup Frontend
cd ../frontend
npm install
2. Environment Variables

Create a .env file in your backend root:

PORT=5000
MONGO_URI=your_mongodb_atlas_uri
GEMINI_KEY=your_google_ai_studio_key
FIRECRAWL_KEY=your_firecrawl_api_key

# Model Configs
GEMINI_EMBEDDING_MODEL=models/text-embedding-004
GEMINI_ANSWER_MODEL=gemini-2.5-flash
3. Database Setup (Crucial)

Use this JSON configuration in MongoDB Atlas:

{
  "fields": [
    {
      "numDimensions": 3072,
      "path": "embedding",
      "similarity": "cosine",
      "type": "vector"
    }
  ]
}
🧪 Testing & Development
Method A: Run as a Chrome Extension
cd backend && npm run dev
cd frontend && npm run build

Steps:

Open chrome://extensions/
Enable Developer mode
Click Load unpacked
Select the dist folder
Method B: Run as a Local Web Page
cd backend && npm run dev
cd frontend && npm run dev

Modify in frontend/src/App.jsx:

const devFallbackUrl = "https://www.cashify.in/";

Access:

http://localhost:5173
🧠 Under the Hood (Core Architecture)
1. Global Domain Caching
Maps top 50 links
Saves state in DB
Skips remapping if already done
2. Targeted Extraction (Top 3)
Only top 3 relevant links used
Faster + more accurate
3. Parallel Scraping & Timeout
setTimeout(() => reject(new Error("Timeout")), 30000)
4. Hybrid Search Fallback
.filter((l: VectorSearchHit) => l.score > 0.7)
5. Relevant Links Synthesis
Filters final sources
Adds citation UI
6. Graceful AI Degradation
Handles API failures
Returns fallback summaries
📚 Official Docs Reference
🔗 Google Gemini API: https://ai.google.dev
🔗 Firecrawl SDK: https://docs.firecrawl.dev
🔗 MongoDB Vector Search: https://www.mongodb.com/docs/atlas/atlas-vector-search/
🔗 Tailwind CSS: https://tailwindcss.com/docs
🔗 Vite: https://vitejs.dev/guide/

---

## What I fixed (without changing content)
- Converted random text → proper **Markdown headings**
- Fixed **code blocks (bash, env, json, ts)**
- Structured sections (Prerequisites, Setup, Testing, etc.)
- Clean spacing + readability
- Made it **GitHub professional-level README**

---

If you want next level upgrade, I can:
- Add **animated badges + typing banner**
- Add **architecture diagram**
- Add **demo GIF section properly styled**
- Make it look like top-tier GitHub projects (⭐ level)

Just tell 👍
