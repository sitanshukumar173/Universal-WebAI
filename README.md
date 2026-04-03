HTML
<div align="center">

  <img src="https://via.placeholder.com/1000x250/050505/4F46E5?text=Universal+WebAI" alt="Universal WebAI Banner" width="100%" style="border-radius: 10px;" />

  <h1 align="center" style="font-size: 3em; margin-bottom: 0;">🌐 Universal WebAI</h1>
  
  <p align="center">
    <strong>A High-Performance Hybrid RAG Browser Extension</strong><br/>
    <em>Turn any website, university portal, or massive PDF into a searchable AI knowledge base.</em>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/Gemini_2.5_Flash-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white" alt="Gemini" />
  </p>

</div>

<br/>

## 💡 Why I Built This

<blockquote>
  I was tired of manually digging through massive institutional portals, infinite documentation pages, and complex policy PDFs just to find a single piece of information. 
  <br/><br/>
  <b>Universal WebAI</b> solves this. By combining <b>Gemini 2.5 Flash</b> with <b>MongoDB Atlas Vector Search</b>, it maps the domain you are browsing, reads the deep links, and gives you verified answers with direct source citations. No fluff, just the data you need.
</blockquote>

<br/>

<div align="center">
  <img src="https://via.placeholder.com/800x450/111111/4F46E5?text=[Insert+Demo+GIF/Video+Here]" alt="Project Demo" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);" />
  <p><em>Demonstration: Extracting exact exit-level options from a complex academic PDF in seconds.</em></p>
</div>

<hr style="border: 1px solid #333;" />

## 📂 Project Structure

Here is the high-level developer tree. The architecture is cleanly split between the Chrome Extension frontend and the Express/RAG backend.

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
📋 Prerequisites
Before spinning this up locally, make sure you have:

⚡ Spinning it up
1. Clone & Install
Grab the repo and install dependencies for both the client and server.

Bash
git clone [https://github.com/your-username/universal-webai.git](https://github.com/your-username/universal-webai.git)

# Setup Backend
cd universal-webai/backend
npm install

# Setup Frontend
cd ../frontend
npm install
2. Environment Variables
Create a .env file in your backend root:

Code snippet
PORT=5000
MONGO_URI=your_mongodb_atlas_uri
GEMINI_KEY=your_google_ai_studio_key
FIRECRAWL_KEY=your_firecrawl_api_key

# Model Configs
GEMINI_EMBEDDING_MODEL=models/text-embedding-004
GEMINI_ANSWER_MODEL=gemini-2.5-flash
3. Database Setup (Crucial)
The RAG system relies on MongoDB Atlas Vector Search. You must create an index named vector_index in your sitemaps collection to allow the AI to search semantically.

Use this exact JSON configuration in the Atlas Dashboard:

JSON
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
You can run this project in two ways depending on what you are testing.

 Method A: Run as a Chrome Extension (Production Mode)
Boot the backend: cd backend && npm run dev

Build the frontend: cd frontend && npm run build

Load in Chrome:

Open Chrome and navigate to chrome://extensions/.

Toggle Developer mode on (top right).

Click Load unpacked and select the dist folder inside your frontend directory.

 Method B: Run as a Local Web Page (Fast UI Iteration)
If you're just tweaking the Pitch-Black Tailwind CSS or UI, you don't want to rebuild the extension every time.

Run the backend: cd backend && npm run dev

Run the frontend: cd frontend && npm run dev

Hardcode your target URL: Open frontend/src/App.jsx and change line 7 to whatever site you want to test against. The AI will pretend it's running as an extension on this tab.

JavaScript
// Change this to any domain you want to test (e.g., your university or a tech blog)
const devFallbackUrl = "[https://www.cashify.in/](https://www.cashify.in/)"; 
Access the UI: Open http://localhost:5173.

🧠 Under the Hood (Core Architecture)
Building a universal AI bot is hard because modern websites can have tens of thousands of pages. If the AI tried to scrape every single page live to answer one simple question, you'd be staring at a loading spinner for hours. Here is how this project tackles the time and scale constraints.

1. Global Domain Caching (The Scale Problem)
To fix the "thousands of links" problem, we only map a representative sample (the top 50 links) to capture the site's core structure.

The Optimization: We save this mapping state in the database (WebsiteModel). When a query hits the backend, it checks: Has this website already been mapped? If User A already mapped a specific domain, and User B visits it later, the backend sees isMapped: true. It skips the time-consuming Firecrawl mapping phase and jumps instantly to the Vector Search.

Tweak it: In services/web.service.ts, change limit: 50 to control how deep the initial crawl goes.

2. Targeted Extraction (Top 3)
Even after finding the right links in the database, we don't scrape all 50. The vector search ranks the links by mathematical relevance, and we only pass the Top 3 most relevant URLs to the scraper. This gives the LLM massive context without wasting time reading useless pages.

3. Parallel Scraping & Anti-Hang Logic
Once we have our 3 target URLs, we scrape them simultaneously. However, massive docs or 50-page PDFs can take a long time to parse. To ensure the UI never freezes, every scrape is wrapped in a 30-second race condition. If a massive file takes longer than 30s, the backend gracefully drops it and synthesizes an answer from the remaining fast sources.

Tweak it: In controllers/query.controller.ts, adjust the timeout on Line 54:

TypeScript
setTimeout(() => reject(new Error("Timeout")), 30000)
4. Hybrid Search Fallback
Pure vector search isn't perfect. If the database confidence score is below 70% (meaning the answer probably wasn't in the initial top 50 links), the system automatically switches to a live Firecrawl web-search to brute-force the domain for fresh links.

Tweak it: In controllers/query.controller.ts, adjust the strictness on Line 25:

TypeScript
.filter((l: VectorSearchHit) => l.score > 0.7) 
5. Relevant Links Synthesis
We don't just trust the LLM blindly. The system does a secondary AI pass to filter the exact Top 3 URLs used to generate the final answer. This ensures the user gets clickable citations, with dedicated UI badges differentiating standard web pages from PDF documents.

6. Graceful AI Degradation
If the Gemini API hits a rate limit or drops the connection during the final synthesis, the backend catches the error and formats a deterministic summary of the raw extracted text. The user always gets data, never a blank screen.

📚 Official Docs Reference
Need to dive deeper into the tools used?

🔗 Google Gemini API: ai.google.dev

🔗 Firecrawl SDK: docs.firecrawl.dev

🔗 MongoDB Vector Search: Atlas Vector Search Docs

🔗 Tailwind CSS: Tailwind v3 Docs

🔗 Vite: Vite Guide
