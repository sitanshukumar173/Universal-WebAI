<div align="center">

<img width="200" height="400" alt="Universal WebAI" src="https://github.com/user-attachments/assets/ec132449-0cf4-4564-9212-2cf55ff62a7b" />


  <h1 style="font-size: 3em; margin-bottom: 0;">🌐 Universal WebAI</h1>
  
  <p>
    <strong>A High-Performance Hybrid RAG Browser Extension</strong><br/>
    <em>Turn any website, university portal, or massive PDF into a searchable AI knowledge base.</em>
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/Gemini_2.5_Flash-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white" alt="Gemini" />
  </p>

</div>

<br/>

<h2>💡 Why I Built This</h2>

<blockquote>
  <p>I was tired of manually digging through massive institutional portals, infinite documentation pages, and complex policy PDFs just to find a single piece of information.</p>
  <p><b>Universal WebAI</b> solves this. By combining <b>Gemini 2.5 Flash</b> with <b>MongoDB Atlas Vector Search</b>, it maps the domain you are browsing, reads the deep links, and gives you verified answers with direct source citations. No fluff, just the data you need.</p>
</blockquote>

<br/>

<div align="center">
 <video src="https://res.cloudinary.com/dlpluej6w/video/upload/v1775209528/universal-web-ai-demov_3SY6TxXh_qxvg7c.mp4" width="100%" style="border-radius: 12px; box-shadow: 0 8px 16px rgba(0,0,0,0.5);" autoplay loop muted playsinline>
   
  </video>
  <p><em>  Universal WebAI Demo Video </em></p>
</div>

<hr style="border: 1px solid #333;" />

<h2>📂 Project Structure</h2>

<p>Here is the high-level developer tree. The architecture is cleanly split between the Chrome Extension frontend and the Express/RAG backend.</p>

<details open>
  <summary><b>Click to expand/collapse directory tree</b></summary>
<pre><code>Universal-WebAI/
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
    └── vite.config.js        # Build tool configuration</code></pre>
</details>

<hr style="border: 1px solid #333;" />

<h2>📋 Prerequisites</h2>

<p>Before spinning this up locally, make sure you have:</p>

<ul>
  <li>✅ <b>Node.js</b> (v18 or higher recommended)</li>
  <li>✅ <b>Git</b></li>
  <li>✅ A free <a href="https://www.mongodb.com/cloud/atlas">MongoDB Atlas</a> account</li>
  <li>✅ API Keys for <a href="https://aistudio.google.com/">Google AI Studio (Gemini)</a> and <a href="https://www.firecrawl.dev/">Firecrawl</a></li>
</ul>

<hr style="border: 1px solid #333;" />

<h2>⚡ Spinning it up</h2>

<h3>1. Clone & Install</h3>
<p>Grab the repo and install dependencies for both the client and server.</p>

<pre><code>git clone https://github.com/your-username/universal-webai.git

# Setup Backend
cd universal-webai/backend
npm install

# Setup Frontend
cd ../frontend
npm install</code></pre>

<br/>

<h3>2. Environment Variables</h3>
<p>Create a <code>.env</code> file in your <b>backend</b> root:</p>

<pre><code>PORT=5000
MONGO_URI=your_mongodb_atlas_uri
GEMINI_KEY=your_google_ai_studio_key
FIRECRAWL_KEY=your_firecrawl_api_key

# Model Configs
GEMINI_EMBEDDING_MODEL=models/text-embedding-004
GEMINI_ANSWER_MODEL=gemini-2.5-flash</code></pre>

<br/>

<h3>3. Database Setup (Crucial)</h3>
<p>The RAG system relies on MongoDB Atlas Vector Search. You <b>must</b> create an index named <code>vector_index</code> in your <code>sitemaps</code> collection to allow the AI to search semantically.</p> 

<p>Use this exact JSON configuration in the Atlas Dashboard:</p>

<pre><code>{
  "fields": [
    {
      "numDimensions": 3072,
      "path": "embedding",
      "similarity": "cosine",
      "type": "vector"
    }
  ]
}</code></pre>

<hr style="border: 1px solid #333;" />

<h2>🧪 Testing & Development</h2>

<p>You can run this project in two ways depending on what you are testing.</p>

<h3><img src="https://img.icons8.com/color/48/000000/chrome.png" width="24" style="vertical-align: middle;" /> Method A: Run as a Chrome Extension (Production Mode)</h3>

<ol>
  <li><b>Boot the backend:</b> <code>cd backend && npm run dev</code></li>
  <li><b>Build the frontend:</b> <code>cd frontend && npm run build</code></li>
  <li><b>Load in Chrome:</b>
    <ul>
      <li>Open Chrome and navigate to <code>chrome://extensions/</code>.</li>
      <li>Toggle <b>Developer mode</b> on (top right).</li>
      <li>Click <b>Load unpacked</b> and select the <code>dist</code> folder inside your frontend directory.</li>
    </ul>
  </li>
</ol>

<br/>

<h3><img src="https://img.icons8.com/color/48/000000/monitor.png" width="24" style="vertical-align: middle;" /> Method B: Run as a Local Web Page (Fast UI Iteration)</h3>

<p>If you're just tweaking the Pitch-Black Tailwind CSS or UI, you don't want to rebuild the extension every time.</p> 

<ol>
  <li><b>Run the backend:</b> <code>cd backend && npm run dev</code></li>
  <li><b>Run the frontend:</b> <code>cd frontend && npm run dev</code></li>
  <li><b>Hardcode your target URL:</b> Open <code>frontend/src/App.jsx</code> and change line 7 to whatever site you want to test against. The AI will pretend it's running as an extension on this tab.
<pre><code>// Change this to any domain you want to test (e.g., your university or a tech blog)
const devFallbackUrl = "https://www.example.com/";</code></pre>
  </li>
  <li><b>Access the UI:</b> Open <code>http://localhost:5173</code>.</li>
</ol>

<hr style="border: 1px solid #333;" />

<h2>🧠 Under the Hood (Core Architecture)</h2>

<p>Building a <i>universal</i> AI bot is hard because modern websites can have tens of thousands of pages. If the AI tried to scrape every single page live to answer one simple question, you'd be staring at a loading spinner for hours. Here is how this project tackles the time and scale constraints.</p>

<ul>
  <li>
    <h3>1. Global Domain Caching (The Scale Problem)</h3>
    <p>To fix the "thousands of links" problem, we only map a representative sample (the top 50 links) to capture the site's core structure.</p>
    <ul>
      <li><b>The Optimization:</b> We save this mapping state in the database (<code>WebsiteModel</code>). When a query hits the backend, it checks: <i>Has this website already been mapped?</i> If User A already mapped a specific domain, and User B visits it later, the backend sees <code>isMapped: true</code>. It skips the time-consuming Firecrawl mapping phase and jumps instantly to the Vector Search.</li>
      <li><b>Tweak it:</b> In <code>services/web.service.ts</code>, change <code>limit: 50</code> to control how deep the initial crawl goes.</li>
    </ul>
  </li>

  <li>
    <h3>2. Targeted Extraction (Top 3)</h3>
    <p>Even after finding the right links in the database, we don't scrape all 50. The vector search ranks the links by mathematical relevance, and we only pass the <b>Top 3</b> most relevant URLs to the scraper. This gives the LLM massive context without wasting time reading useless pages.</p>
  </li>

  <li>
    <h3>3. Parallel Scraping & Anti-Hang Logic</h3>
    <p>Once we have our 3 target URLs, we scrape them simultaneously. However, massive docs or 50-page PDFs can take a long time to parse. To ensure the UI never freezes, every scrape is wrapped in a <b>30-second race condition</b>. If a massive file takes longer than 30s, the backend gracefully drops it and synthesizes an answer from the remaining fast sources.</p>
    <ul>
      <li><b>Tweak it:</b> In <code>controllers/query.controller.ts</code>, adjust the timeout on Line 54:</li>
    </ul>
<pre><code>setTimeout(() => reject(new Error("Timeout")), 30000)</code></pre>
  </li>

  <li>
    <h3>4. Hybrid Search Fallback</h3>
    <p>Pure vector search isn't perfect. If the database confidence score is below 70% (meaning the answer probably wasn't in the initial top 50 links), the system automatically switches to a live Firecrawl web-search to brute-force the domain for fresh links.</p>
    <ul>
      <li><b>Tweak it:</b> In <code>controllers/query.controller.ts</code>, adjust the strictness on Line 25:</li>
    </ul>
<pre><code>.filter((l: VectorSearchHit) => l.score > 0.7)</code></pre>
  </li>

  <li>
    <h3>5. Relevant Links Synthesis</h3>
    <p>We don't just trust the LLM blindly. The system does a secondary AI pass to filter the exact <b>Top 3 URLs</b> used to generate the final answer. This ensures the user gets clickable citations, with dedicated UI badges differentiating standard web pages from PDF documents.</p>
  </li>

  <li>
    <h3>6. Graceful AI Degradation</h3>
    <p>If the Gemini API hits a rate limit or drops the connection during the final synthesis, the backend catches the error and formats a deterministic summary of the raw extracted text. The user always gets data, never a blank screen.</p>
  </li>
</ul>

<hr style="border: 1px solid #333;" />

<h2>📚 Official Docs Reference</h2>

<p>Need to dive deeper into the tools used?</p>

<ul>
  <li>🔗 <b>Google Gemini API</b>: <a href="https://ai.google.dev/docs">ai.google.dev</a></li>
  <li>🔗 <b>Firecrawl SDK</b>: <a href="https://docs.firecrawl.dev/">docs.firecrawl.dev</a></li>
  <li>🔗 <b>MongoDB Vector Search</b>: <a href="https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/">Atlas Vector Search Docs</a></li>
  <li>🔗 <b>Tailwind CSS</b>: <a href="https://v3.tailwindcss.com/docs/installation">Tailwind v3 Docs</a></li>
  <li>🔗 <b>Vite</b>: <a href="https://vitejs.dev/guide/">Vite Guide</a></li>
</ul>

<br/>


