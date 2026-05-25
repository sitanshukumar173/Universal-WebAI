<div align="center">

<h1 style="font-size: 3em; margin-bottom: 0;">🌐 Universal WebAI</h1>

<p>
  <strong>A high-performance hybrid RAG Chrome extension</strong><br/>
  <em>Turn the website you are browsing into a searchable AI knowledge base.</em>
</p>

<p>
  <img src="https://img.shields.io/badge/React-19.2.4-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Vite-8.0.1-B73BFE?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Node.js-Express_5.2.1-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas_Vector_Search-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Groq-llama--3.1--8b--instant-0f172a?style=for-the-badge" alt="Groq" />
  <img src="https://img.shields.io/badge/Jina_Reader-Scraping-111827?style=for-the-badge" alt="Jina Reader" />
</p>

<p>
  <a href="COMPLETE_DOCUMENTATION.md"><strong>Read the full documentation</strong></a>
</p>

</div>

<br/>

## What This Project Does

Universal WebAI is a browser extension that understands the page you are on, maps the site behind it, searches the most relevant pages, scrapes the page content, and returns a concise answer with source links.

The current stack is:

- Gemini embeddings for semantic search
- Firecrawl for site mapping and search fallback
- Jina Reader for page scraping
- Groq for answer synthesis and source-link synthesis
- MongoDB Atlas Vector Search for retrieval
- React + Vite for the popup UI

## Highlights

- Maps a site in the background without blocking the first question
- Reuses mapping and extraction caches to speed up repeat queries
- Streams answers through SSE for a responsive chat-like experience
- Shows source links directly in the popup
- Preserves chat history per site in both localStorage and chrome.storage.local

## Documentation

The detailed architecture, API flow, environment variables, and troubleshooting guide live here:

- [Complete Documentation](COMPLETE_DOCUMENTATION.md)

## Project Structure

```text
Universal-WebAI-MAIN/
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── db.ts
│   │   ├── models.ts
│   │   ├── scraper.ts
│   │   ├── controllers/query.controller.ts
│   │   └── services/
│   │       ├── ai.service.ts
│   │       └── web.service.ts
│   └── package.json
├── frontend/
│   ├── src/App.jsx
│   ├── src/App.css
│   ├── manifest.json
│   └── package.json
├── README.md
└── COMPLETE_DOCUMENTATION.md
```

## Quick Start

### Backend

```bash
cd backend
npm install
npm run build
npm run start
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

Then load the `frontend` folder in Chrome via `chrome://extensions` using Developer Mode.

## Environment Variables

Create `backend/.env` with your own values:

```env
MONGO_URI=your_mongodb_uri
PORT=5000

GEMINI_KEY=your_gemini_key
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001

GROQ_API_KEY=your_groq_key
GROQ_ANSWER_MODEL=llama-3.1-8b-instant
GROQ_ANSWER_FALLBACK_MODELS=llama-3.1-70b-versatile

FIRECRAWL_KEY=your_firecrawl_key
JINA_KEY=
```

`JINA_KEY` is optional for free-tier Jina Reader usage.

## Current Flow

1. The popup reads the active tab URL.
2. The backend normalizes the URL and checks whether the site is already mapped.
3. The backend uses Gemini embeddings to search MongoDB Atlas Vector Search.
4. If needed, it falls back to Firecrawl search.
5. The backend scrapes selected pages using Jina Reader.
6. Groq synthesizes the final answer and link list.
7. The popup renders the answer, progress state, and relevant links.

## Notes

- Firecrawl is still used for `map()` and search fallback.
- Jina Reader is used for page scraping only.
- Gemini stays responsible only for embeddings.
- Groq handles the final answer and relevant-link synthesis.

## License

Copyright (c) 2026 Sitanshu Kumar Chourasia. All rights reserved.
