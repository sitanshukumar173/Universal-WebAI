# 🌐 Universal WebAI - Complete Documentation

**A High-Performance Hybrid RAG Browser Extension that turns any website into a searchable AI knowledge base**

---

## Table of Contents

1. [What Is Universal WebAI](#what-is-universal-webai)
2. [Why It Exists](#why-it-exists)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [System Architecture](#system-architecture)
6. [Complete User Journey](#complete-user-journey)
7. [Backend Architecture & Functions](#backend-architecture--functions)
8. [Frontend Architecture](#frontend-architecture)
9. [Database Schema](#database-schema)
10. [API Reference](#api-reference)
11. [How Each Function Works](#how-each-function-works)
12. [Data Flow Examples](#data-flow-examples)
13. [Setup & Configuration](#setup--configuration)
14. [Testing & Troubleshooting](#testing--troubleshooting)

---

## What Is Universal WebAI

Imagine you're on a complex university website or institutional portal. You need to find "Who is the director?" Instead of clicking through 20 pages, you:

1. **Open the Chrome Extension popup**
2. **Type your question**
3. **Get instant answer** with source links

**How?** The system:

- ✅ Maps the entire website automatically
- ✅ Creates AI vector embeddings for every page
- ✅ Searches semantically to find relevant content
- ✅ Scrapes and extracts answers from discovered pages
- ✅ Uses Gemini AI to synthesize accurate answers
- ✅ Shows exact sources where answer was found

### Key Features

- **Website Mapping**: Discovers all URLs on a domain (50-500+ pages)
- **Vector Search**: Semantic similarity search using embeddings
- **Multi-Source Synthesis**: Combines answers from multiple pages
- **Fallback Search**: Uses Firecrawl search if vector matches are weak
- **Role-Based Extraction**: Special handling for names/roles (Director, Dean, HOD, etc.)
- **PDF Support**: Extracts content from PDF documents
- **Real-Time UI**: Chrome extension popup with chat interface
- **Source Attribution**: Shows exact URLs where answers come from

---

## Why It Exists

Problem: Massive institutional portals, PDFs, and complex websites are **impossible to search manually**.

Solution: **Universal WebAI** automatically:

1. Maps entire websites
2. Creates searchable AI knowledge bases
3. Returns verified answers with source citations
4. Saves hours of manual clicking and searching

---

## Technology Stack

### Frontend

- **React 19.2.4** - UI framework
- **Vite 8.0.1** - Fast build tool and dev server
- **Tailwind CSS 3.4.19** - Utility-first CSS styling
- **Chrome Extension APIs** - Browser integration (tabs, messaging)

### Backend

- **Node.js + Express 5.2.1** - Web server and API
- **TypeScript 6.0.2** - Type-safe JavaScript
- **Mongoose 9.3.3** - MongoDB object modeling
- **MongoDB 7.1.1** - Database driver

### External APIs & Services

- **Google Gemini 2.5 Flash** - LLM for answer synthesis and reasoning
- **Google Gemini Embedding 001** - Convert text to 768-dimensional vectors
- **Firecrawl 4.18.0** - Web scraping and site mapping
- **MongoDB Atlas Vector Search** - Semantic similarity search
- **CORS** - Cross-origin request handling

### Other Dependencies

- **body-parser** - JSON parsing
- **cors** - Cross-origin resource sharing
- **dotenv** - Environment variable management

---

## Project Structure

```
Universal-WebAI-MAIN/
├── README.md                          # Project intro
├── COMPLETE_DOCUMENTATION.md          # This file
│
├── backend/                           # Express.js Server
│   ├── package.json                  # Dependencies
│   ├── tsconfig.json                 # TypeScript config
│   ├── src/
│   │   ├── index.ts                  # ✨ Main server entry point
│   │   ├── db.ts                     # MongoDB connection setup
│   │   ├── models.ts                 # Mongoose schemas (websites, sitemaps)
│   │   ├── types.ts                  # TypeScript interfaces
│   │   ├── scraper.ts                # Firecrawl & Gemini API setup
│   │   ├── controllers/
│   │   │   └── query.controller.ts   # ✨ Main query handler (entry point)
│   │   ├── routes/
│   │   │   └── query.routes.ts       # API route definitions
│   │   └── services/
│   │       ├── web.service.ts        # Website mapping & vector search
│   │       └── ai.service.ts         # AI answer generation
│   └── dist/                         # Compiled JavaScript
│
└── frontend/                          # Chrome Extension
    ├── package.json                  # Dependencies
    ├── vite.config.js                # Vite configuration
    ├── tailwind.config.js            # Tailwind configuration
    ├── eslint.config.js              # ESLint configuration
    ├── index.html                    # HTML template
    ├── manifest.json                 # Chrome extension manifest
    ├── src/
    │   ├── main.jsx                  # React entry point
    │   ├── App.jsx                   # ✨ Main React component
    │   ├── App.css                   # Component styles
    │   ├── index.css                 # Global styles
    │   └── assets/                   # Static files
    └── public/
        └── manifest.json             # Extension configuration

✨ = Key entry points to understand first
```

---

## System Architecture

### Visual Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                      CHROME EXTENSION (Frontend)                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ React App.jsx                                                │  │
│  │ - Gets active tab URL                                        │  │
│  │ - User input form for questions                              │  │
│  │ - Chat message display (user & AI)                           │  │
│  │ - Shows relevant source links                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────────────┘
                          │ HTTP POST /api/v1/query
                          │ (question + URL)
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│                 EXPRESS.JS BACKEND (Node.js)                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ query.controller.ts - Main Handler                           │  │
│  │ 1. Validate & normalize URLs                                 │  │
│  │ 2. Check if domain already mapped                            │  │
│  │ 3. Start background mapping (if needed)                      │  │
│  │ 4. Create question embeddings                                │  │
│  │ 5. Perform vector search                                     │  │
│  │ 6. Fallback to Firecrawl search if weak                      │  │
│  │ 7. Extract content from discovered URLs                      │  │
│  │ 8. Synthesize answer from extracted text                     │  │
│  │ 9. Extract relevant source links                             │  │
│  │ 10. Return answer + sources to frontend                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                        │         │          │                       │
│         ┌──────────────┴─┬───────┴──┬───────┴────────┐              │
│         ▼                ▼          ▼                ▼              │
│   ┌─────────────┐ ┌────────────┐ ┌──────────────────┐             │
│   │web.service  │ │ai.service  │ │ scraper.ts       │             │
│   │             │ │            │ │ Firecrawl + APIs │             │
│   │• mapNewWb() │ │• getEmbedding()              │ │             │
│   │  → crawl    │ │  → Gemini embedding         │ │             │
│   │• vectorSrc()│ │• synthesizeAnswer()          │ │• scrapeUrl()│
│   │  → search   │ │  → Gemini 2.5 Flash         │ │• getFirec...│
│   │             │ │• synthesizeLinks()           │ │• getGenAI()│
│   │             │ │  → Extract source URLs      │ │             │
│   └─────────────┘ └────────────┘ └──────────────────┘             │
│         │                │            │                            │
└─────────┼────────────────┼────────────┼────────────────────────────┘
          │                │            │
    ┌─────▼──────┐ ┌──────▼──────┐ ┌──▼──────────────┐
    │  MongoDB   │ │  Google     │ │  Firecrawl     │
    │  Atlas     │ │  Gemini API │ │  (Web Scraper) │
    │            │ │             │ │                │
    │ Collections:│ │ Models:     │ │ Services:      │
    │ websites   │ │ embedding   │ │ • map()        │
    │ sitemaps   │ │ • 768 dim   │ │   crawl site   │
    │            │ │ • 2.5-flash │ │ • scrape()     │
    │ Indexes:   │ │ • fallback  │ │   extract text │
    │ vectorIdx  │ │ • retry 3x  │ │ • search()     │
    └────────────┘ └─────────────┘ └────────────────┘
```

### Three Main Components

1. **Frontend (React + Chrome Extension)**
   - Gets current tab URL
   - Sends questions to backend
   - Displays answers and source links
   - Real-time chat interface

2. **Backend (Express.js + Node.js)**
   - Handles all business logic
   - Maps websites in background
   - Creates embeddings
   - Performs vector search
   - Scrapes content
   - Synthesizes answers with AI

3. **Database (MongoDB Atlas)**
   - Stores domain mapping status
   - Stores all discovered URLs
   - Stores vector embeddings for search
   - Indexes for fast retrieval

---

## Complete User Journey

### Real-World Scenario: University Website Query

```
┌─ STEP 1: USER OPENS EXTENSION
│  Location: https://university.edu/admissions
│  Action: Clicks extension icon in toolbar
│  Result: Popup appears, shows "university.edu" in header
│
├─ STEP 2: USER TYPES QUESTION
│  Input: "Who is the director of admissions?"
│  Action: Types in chat box and clicks SEND
│  Result: Question added to chat, loading spinner shows
│
├─ STEP 3: FRONTEND SENDS REQUEST
│  Method: POST http://localhost:5000/api/v1/query
│  Body: {
│    question: "Who is the director of admissions?",
│    currentPageUrl: "https://university.edu/admissions",
│    baseUrl: "https://university.edu/"
│  }
│
├─ STEP 4: BACKEND RECEIVES REQUEST
│  Extract:
│    - domain: "university.edu"
│    - question: "Who is the director of admissions?"
│    - currentPageUrl: "https://university.edu/admissions"
│    - baseUrl: "https://university.edu/"
│
├─ STEP 5: CHECK DATABASE
│  Query: "Is university.edu already mapped?"
│  Result: NO → Start background mapping (non-blocking)
│  Action: Spawn mapNewWebsite() in background
│           Continue with current request
│
├─ STEP 6: CREATE QUESTION EMBEDDING
│  Input: "Who is the director of admissions?"
│  Process: Call Gemini Embedding API
│  Output: Vector of 768 numbers
│  Example: [-0.234, 0.456, -0.789, ...]
│
├─ STEP 7: VECTOR SEARCH
│  Search: MongoDB Atlas Vector Search
│  Query: Find URLs with similar embeddings
│  Filter: Only from domain "university.edu"
│  Limit: Return top 1 result
│  Result: Found "https://university.edu/about/leadership"
│          with similarity score: 0.92
│
├─ STEP 8: CHECK SCORE & FALLBACK
│  Score: 0.92 > 0.7 ✓
│  Decision: Use this URL (score is good)
│  If score < 0.7: Use Firecrawl.search() as fallback
│
├─ STEP 9: PRIORITIZE URLS
│  Priority Order:
│    1st: https://university.edu/admissions (current page)
│    2nd: https://university.edu/ (base URL)
│    3rd: https://university.edu/about/leadership (search result)
│
├─ STEP 10: EXTRACT CONTENT (PARALLEL)
│  For each URL:
│    • Firecrawl scrapes the page
│    • LLM extracts answer to question
│    • 30-second timeout per URL
│    • Process all at once (Promise.all)
│  Results:
│    URL 1: "Not found on this page"
│    URL 2: "No specific mention"
│    URL 3: "Dr. Sarah Johnson, Director of Admissions"
│
├─ STEP 11: COMBINE CONTEXT
│  Combine all extracted text:
│  "Not found on this page
│   ---
│   No specific mention
│   ---
│   Dr. Sarah Johnson, Director of Admissions"
│
├─ STEP 12: AI SYNTHESIZES ANSWER
│  Prompt to Gemini 2.5 Flash:
│  "Question: Who is the director of admissions?
│   Context: [combined extracted text]
│   Provide concise answer based ONLY on context."
│
│  Response: "Dr. Sarah Johnson is the Director of Admissions."
│
├─ STEP 13: EXTRACT RELEVANT LINKS
│  Prompt: "Which URLs contain the answer?"
│  Response: ["https://university.edu/about/leadership"]
│
├─ STEP 14: SEND RESPONSE TO FRONTEND
│  Response: {
│    answer: "Dr. Sarah Johnson is the Director of Admissions.",
│    sources: [
│      "https://university.edu/admissions",
│      "https://university.edu/",
│      "https://university.edu/about/leadership"
│    ],
│    relevantLinks: ["https://university.edu/about/leadership"]
│  }
│
├─ STEP 15: DISPLAY IN CHAT
│  Chat bubble shows:
│    AI: "Dr. Sarah Johnson is the Director of Admissions."
│
│    Relevant links:
│    🔗 https://university.edu/about/leadership
│
└─ STEP 16: USER CAN CLICK LINKS
   User clicks links to verify answers
   Keeps context in extension for follow-up questions
```

---

## Backend Architecture & Functions

### Entry Point: index.ts

```typescript
import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import aiRoute from "./routes/query.routes.js";
import { connectDB } from "./db.js";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", /^chrome-extension:\/\//],
  }),
);

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/v1", aiRoute);

const port = process.env.PORT || 5000;
app.listen(port, () =>
  console.log(`✨ Universal WebAI Backend Live on ${port}`),
);
```

**What it does:**

1. Loads environment variables
2. Creates Express server
3. Enables JSON parsing
4. Configures CORS for localhost and Chrome extensions
5. Connects to MongoDB
6. Sets up API routes
7. Starts listening on port 5000

---

### Database Connection: db.ts

```typescript
import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("✅ MongoDB Connected Successfully");
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
    process.exit(1);
  }
};
```

**What it does:**

- Connects to MongoDB Atlas using MONGO_URI from .env
- Exits process if connection fails (fail fast)
- Logs success/error

---

### Database Models: models.ts

```typescript
const WebsiteSchema = new Schema({
  domain: { type: String, unique: true, required: true },
  isMapped: { type: Boolean, default: false },
});
export const WebsiteModel = model("websites", WebsiteSchema);

const SitemapSchema = new Schema({
  domain: { type: String, required: true },
  url: { type: String, unique: true, required: true },
  title: { type: String },
  description: { type: String },
  embedding: { type: [Number], required: true },
});
export const SitemapModel = model("sitemaps", SitemapSchema);
```

**Collections:**

- **websites**: Tracks domain mapping status (is it indexed?)
- **sitemaps**: Stores every discovered URL with its embedding

---

### Main Query Handler: query.controller.ts

The `handleQuery()` function is the heart of the system:

```
REQUEST ARRIVES
    ↓
[1] Normalize URLs
    ↓
[2] Extract domain
    ↓
[3] Check if mapped → Start background mapping if needed
    ↓
[4] Create question embedding
    ↓
[5] Vector search for similar URLs
    ↓
[6] Check score → Fallback search if weak
    ↓
[7] Prioritize URLs (current → base → others)
    ↓
[8] Extract content from each URL (parallel)
    ↓
[9] Combine extracted context
    ↓
[10] Synthesize answer with AI
    ↓
[11] Extract relevant links
    ↓
RESPONSE SENT TO FRONTEND
```

**Key logic:**

```typescript
// Check if domain is already mapped
const siteExists = await WebsiteModel.findOne({ domain });

// If not mapped, start background mapping
if (!siteExists?.isMapped && !mappingInProgress.has(domain)) {
  void mapNewWebsite(domain, normalizedBaseUrl)
    .then(() => console.log("Mapping completed"))
    .catch((err) => console.error("Mapping failed", err))
    .finally(() => mappingInProgress.delete(domain));
}

// Create question embedding
const questionVector = await getEmbedding(question);

// Vector search
const candidateLinks = await vectorSearch(questionVector, domain);

// Filter by score or fallback
let targetUrls = candidateLinks.filter((l) => l.score > 0.7).map((l) => l.url);

if (targetUrls.length === 0) {
  // Fallback search
  const search = await firecrawl.search(`${domain} ${question}`, { limit: 2 });
  targetUrls = search.web.map((r) => r.url);
}

// Extract content in parallel
const results = await Promise.all(
  sources.map((url) => scrapeUrlCompat(url, config)),
);

// Synthesize answer
const answer = await synthesizeAnswer(question, context);
const relevantLinks = await synthesizeRelevantLinks(question, context, sources);
```

---

### Website Mapping: web.service.ts - mapNewWebsite()

Background process that maps entire websites:

```
mapNewWebsite(domain, websiteUrl)
    ↓
[1] Use Firecrawl to crawl entire website
    ↓ Discovers 50-500+ URLs
    ↓
[2] Normalize URL format (handle links as strings or objects)
    ↓
[3] Remove duplicate URLs
    ↓
[4] For EACH unique URL:
    ├─ Create embedding from title/URL
    ├─ Save to MongoDB sitemaps collection
    └─ Track progress (success/failed count)
    ↓
[5] Mark domain as isMapped = true
    ↓
LOGGING: total URLs, success count, failed count, duration
```

**Benefits:**

- Runs in background (doesn't block first query)
- Subsequent queries are instant (embeddings cached)
- First query response still fast (returns while mapping happens)

---

### Vector Search: web.service.ts - vectorSearch()

Finds most relevant URLs using semantic similarity:

```typescript
export const vectorSearch = async (
  questionVector: number[],
  domain: string,
): Promise<VectorSearchHit[]> => {
  return await SitemapModel.aggregate([
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: questionVector,
        numCandidates: 50,
        limit: 1,
      },
    },
    {
      $project: {
        url: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
    {
      $match: { domain },
    },
  ]);
};
```

**Output:**

```
[
  {
    url: "https://example.com/leadership",
    score: 0.92  // 0-1, higher = more similar
  }
]
```

**Score interpretation:**

- `0.92` = Highly relevant, definitely use
- `0.75` = Relevant, acceptable
- `< 0.7` = Weak match, trigger fallback

---

### Create Embeddings: ai.service.ts - getEmbedding()

Converts text to vector representation:

```typescript
const EMBEDDING_MODEL = "models/gemini-embedding-001";

export const getEmbedding = async (text: string): Promise<number[]> => {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values; // 768 numbers
};
```

**Example:**

```
Input: "Who is the director?"
Output: [-0.234, 0.456, -0.789, ..., 0.123] (768 values)

Similar question: "Tell me the director's name"
Output: [-0.231, 0.459, -0.785, ..., 0.121] (very similar)
```

**Why embeddings?**

- Convert text to numbers
- Similar meanings → Similar numbers
- Fast comparison using math (dot product, cosine similarity)
- MongoDB Vector Search finds matches instantly

---

### Scrape Content: scraper.ts - scrapeUrlCompat()

Extracts answers from URLs using Firecrawl:

```typescript
export async function scrapeUrlCompat(
  url: string,
  request: ExtractCompatRequest,
): Promise<ExtractCompatResult> {
  const firecrawl = getFirecrawl();

  const result = await firecrawl.scrape(url, {
    formats: [
      {
        type: "json",
        prompt: request.extract.prompt, // "Answer this question"
        schema: request.extract.schema, // What fields to extract
      },
    ],
    onlyMainContent: true, // Skip nav, ads, footers
  });

  // Try JSON extraction
  if (result.json?.answer) {
    return { success: true, extract: result.json };
  }

  // Fallback to markdown
  if (result.markdown) {
    return { success: true, extract: { answer: result.markdown } };
  }

  return { success: false };
}
```

**Extraction prompt example:**

```
Question: Who is the director of admissions?
Extract the most precise factual answer from this page.
Prefer exact names, numbers, and dates from the page text.
Do not add explanation.
```

**Timeout:** 30 seconds per URL (prevents hanging)

---

### Synthesize Answer: ai.service.ts - synthesizeAnswer()

Uses AI to generate answer from context:

```typescript
export const synthesizeAnswer = async (
  question: string,
  context: string,
): Promise<string> => {
  const prompt = `Question: ${question}
Context: ${context}

Provide a concise, factual answer based ONLY on the context.
If the answer cannot be determined, state that clearly.
Do not invent information.`;

  const rawAnswer = await generateWithFallback("answer", prompt);

  // Clean up response
  const stripped = stripAnswerBoilerplate(rawAnswer);

  // Special handling for short answers (names, roles)
  if (shouldBeShortAnswer(question)) {
    return extractShortAnswerFromContext(question, context) || stripped;
  }

  return stripped;
};
```

**Retry logic:**

- Try: Gemini 2.5 Flash (primary)
- If fails: Try Gemini 2.0 Flash, Gemini 1.5 Flash
- Max 3 attempts per model
- Exponential backoff: 500ms × attempt_number
- Automatic fallback to other models

---

### Extract Relevant Links: ai.service.ts - synthesizeRelevantLinks()

Identifies which source URLs contain the answer:

```typescript
export const synthesizeRelevantLinks = async (
  question: string,
  context: string,
  sources: string[],
): Promise<string[]> => {
  const prompt = `Question: ${question}
Context: ${context}
Available URLs: ${sources.join(", ")}

Which URLs from the list most directly contain the answer?
Return only the URLs, one per line.`;

  const response = await generateWithFallback("links", prompt);

  // Parse and validate URLs
  return response
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => sources.includes(line))
    .slice(0, 3); // Max 3 links
};
```

---

## Frontend Architecture

### Main Component: App.jsx

The React component handles all UI logic:

```
App.jsx
├─ State
│  ├─ input: current question text
│  ├─ messages: chat history
│  ├─ loading: is waiting for response?
│  └─ activeUrl: current tab URL
│
├─ Effects
│  ├─ Get current tab URL (on mount)
│  └─ Auto-scroll to latest message
│
├─ Handlers
│  └─ handleSend(): Send question to backend
│
└─ Render
   ├─ Header (site name + status indicator)
   ├─ Messages area (chat bubbles)
   └─ Input form (text input + send button)
```

**Key features:**

1. **Get Current URL**: Uses Chrome extension API

   ```javascript
   window.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
     if (tabs[0]?.url) setActiveUrl(tabs[0].url);
   });
   ```

2. **Send Question**: Creates request to backend

   ```javascript
   const res = await fetch("http://localhost:5000/api/v1/query", {
     method: "POST",
     body: JSON.stringify({
       question: query,
       currentPageUrl: activeUrl,
       baseUrl: `${new URL(activeUrl).origin}/`,
     }),
   });
   ```

3. **Display Response**: Shows answer and links

   ```javascript
   setMessages((prev) => [
     ...prev,
     {
       role: "ai",
       text: data.answer,
       relevantLinks: data.relevantLinks,
     },
   ]);
   ```

4. **UI Components:**
   - Header: Shows domain name + green/orange indicator
   - Chat area: User messages (right, white) and AI (left, dark)
   - Message display: Shows answer + clickable links
   - Input area: Text field + SEND button

---

## Database Schema

### Collection 1: websites

Tracks domain mapping status:

```javascript
{
  _id: ObjectId("..."),
  domain: "university.edu",
  isMapped: true,           // Are all URLs indexed?
  createdAt: ISODate("...")
}
```

**Used to:**

- Check if domain needs mapping
- Avoid redundant crawling
- Track domains that have been processed

---

### Collection 2: sitemaps

Stores every URL with its embedding:

```javascript
{
  _id: ObjectId("..."),
  domain: "university.edu",
  url: "https://university.edu/about/leadership",
  title: "Leadership Team",
  description: "Meet our leaders",
  embedding: [
    -0.023451, 0.145678, -0.078901, ...(768 total)
  ],
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

**Fields:**

- `domain`: Filter search to specific domain
- `url`: The actual webpage URL
- `title`: Page title (used for embedding)
- `embedding`: 768-dimensional vector (for search)

**Indexes:**

- `url: unique` - No duplicate URLs
- `vector_index: embedding` - MongoDB Vector Search index

---

## API Reference

### Endpoint: POST /api/v1/query

**Request:**

```json
{
  "question": "Who is the director?",
  "currentPageUrl": "https://example.com/page",
  "baseUrl": "https://example.com/"
}
```

**Optional fields:**

- `websiteUrl`: Legacy, use currentPageUrl instead

**Response (Success - 200):**

```json
{
  "answer": "John Smith is the director.",
  "sources": [
    "https://example.com/page",
    "https://example.com/",
    "https://example.com/leadership"
  ],
  "relevantLinks": ["https://example.com/leadership"]
}
```

**Response (No results - 404):**

```json
{
  "message": "No info found"
}
```

**Response (Bad input - 400):**

```json
{
  "message": "Invalid URL input. Please provide a valid current/base URL."
}
```

**Response (Server error - 500):**

```json
{
  "error": "Error message details"
}
```

---

## How Each Function Works

### Frontend: handleSend()

**Purpose:** Send question to backend and display response

**Flow:**

```
1. User clicks SEND or presses Enter
2. Get question from input field
3. Add to messages as user message
4. Show loading spinner
5. Send POST request to backend
6. Wait for response (with timeout)
7. Add AI response to messages
8. Hide loading spinner
9. Clear input field
```

**Code:**

```javascript
const handleSend = async (e) => {
  e.preventDefault();
  const query = input;
  setInput("");
  setMessages((prev) => [...prev, { role: "user", text: query }]);
  setLoading(true);

  try {
    const res = await fetch("http://localhost:5000/api/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: query,
        currentPageUrl: activeUrl,
        baseUrl: new URL(activeUrl).origin + "/",
      }),
    });

    const data = await res.json();
    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        text: data.answer,
        relevantLinks: data.relevantLinks,
      },
    ]);
  } catch (err) {
    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        text: "Error: Backend is not responding",
      },
    ]);
  } finally {
    setLoading(false);
  }
};
```

---

### Backend: handleQuery() - Main Flow

**Purpose:** Process question and return answer

**High-level flow:**

```
1. Extract question and URLs
2. Normalize URLs (add https:// if needed)
3. Get domain from URL
4. Check if domain is already mapped
5. If not: Start background mapping
6. Create embedding for question
7. Vector search in MongoDB
8. Check score: if < 0.7, use fallback search
9. Compile list of URLs to scrape
10. Scrape each URL in parallel
11. Combine extracted content
12. Synthesize answer with Gemini AI
13. Extract relevant links
14. Return answer + sources + links
```

---

### Backend: mapNewWebsite() - Website Mapping

**Purpose:** Discover all URLs on domain and create embeddings

**Flow:**

```
1. Use Firecrawl to crawl entire website
   → Discovers 50-500+ URLs
2. Normalize all links to consistent format
3. Remove duplicate URLs
4. For each unique URL:
   a. Create text to embed (title or URL)
   b. Call Gemini embedding API
   c. Save to MongoDB with embedding
5. Mark domain as isMapped = true
6. Log statistics (total, success, failed)
```

**Timeline:**

- First query: 15-30 seconds (mapping happens in background)
- Subsequent queries: Instant (embeddings cached in DB)

---

### Backend: vectorSearch() - Find Similar URLs

**Purpose:** Find URLs most similar to question

**Process:**

```
1. Receive question as 768-dimensional vector
2. Query MongoDB Vector Search index
3. Find top candidates by similarity
4. Calculate similarity score (0-1)
5. Filter by domain
6. Return top 1 result
```

**Output:**

```javascript
[
  {
    url: "https://example.com/page",
    score: 0.92,
  },
];
```

---

### Backend: getEmbedding() - Create Vector

**Purpose:** Convert text to 768-dimensional vector

**Process:**

```
1. Receive text: "Who is the director?"
2. Call Google Gemini Embedding API
3. Get 768 numbers representing meaning
4. Return as array
```

**Why 768 dimensions?**

- Standard Gemini embedding size
- Large enough to capture meaning
- Small enough to be fast

---

### Backend: scrapeUrlCompat() - Extract Content

**Purpose:** Get answer from URL using LLM-guided extraction

**Process:**

```
1. Receive URL and extraction config
2. Send to Firecrawl with:
   - JSON extraction format
   - Question-specific prompt
   - Response schema (what fields)
3. Firecrawl:
   - Downloads page
   - Uses LLM to extract content
   - Returns structured JSON
4. If JSON extraction fails:
   - Fallback to returning markdown
5. If everything fails:
   - Return success: false
6. Apply 30-second timeout
```

---

### Backend: synthesizeAnswer() - Generate Answer

**Purpose:** Create coherent answer from extracted text

**Process:**

```
1. Receive question and combined context
2. Create prompt for Gemini
3. Send to generateWithFallback()
4. In generateWithFallback():
   a. Try primary model (Gemini 2.5 Flash)
   b. If fails: Try fallback models
   c. Retry up to 3 times per model
   d. Use exponential backoff (500ms × attempt)
5. Clean response:
   - Remove markdown code blocks
   - Remove boilerplate phrases
6. If question asks for name/role:
   - Extract just the name
7. Return final answer
```

---

### Backend: synthesizeRelevantLinks() - Extract Sources

**Purpose:** Identify which URLs contain the answer

**Process:**

```
1. Create prompt asking "Which URLs contain answer?"
2. Send to Gemini
3. Parse response for URLs
4. Validate URLs are in our source list
5. Return up to 3 most relevant links
```

---

## Data Flow Examples

### Example 1: New Domain - First Query

```
Timeline:
0s    - User asks question
0s    - Backend receives request
0.1s  - Database check: domain not mapped
0.1s  - Start background mapping (non-blocking)
0.2s  - Create question embedding
0.5s  - Vector search (finds nothing, score < 0.7)
0.6s  - Fallback: Firecrawl search
1.5s  - Extract content from 3 URLs (parallel)
3s    - Synthesize answer with Gemini
3.5s  - Extract relevant links
3.5s  - Send response to frontend
3.5s  - User sees answer

Meanwhile (background, non-blocking):
3.5s-20s - Mapping: Firecrawl crawls site
20s  - Mapping: Create embeddings for 100+ URLs
22s  - Mapping: Save to MongoDB
23s  - Mapping: Mark domain as isMapped = true
```

**Result:**

- User gets answer in 3.5 seconds
- Subsequent queries: 0.5 seconds (instant)

---

### Example 2: Cached Domain - Second Query

```
Timeline:
0s    - User asks different question
0s    - Backend receives request
0.1s  - Database check: domain IS mapped ✓
0.1s  - Skip background mapping
0.2s  - Create question embedding
0.3s  - Vector search (finds best URL, score 0.89)
0.5s  - Extract content from found URL
1.5s  - Synthesize answer
2s    - Extract relevant links
2s    - Send response
2s    - User sees answer

Total: 2 seconds (vs. 3.5s first time)
```

---

### Example 3: Role-Based Query

```
Question: "Who is the dean?"

Processing:
1. Detects role keyword: "dean"
2. Vector search finds most relevant page
3. Scrapes page looking for dean info
4. Context: "Dean of Science: Dr. Rajesh Kumar"
5. Synthesizes: Detects role + name pattern
6. Returns: "Dr. Rajesh Kumar" (just the name, not full sentence)

Total: 2-3 seconds
```

---

## Setup & Configuration

### Prerequisites

- **Node.js** 16+ installed
- **npm** or **yarn** package manager
- **MongoDB Atlas** account (free tier okay)
- **Google Gemini API** key (free tier okay)
- **Firecrawl API** key (free tier okay)

### Backend Setup

#### Step 1: Install Dependencies

```bash
cd backend
npm install
```

#### Step 2: Create .env File

```bash
cat > .env << 'EOF'
# MongoDB Connection
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/webai

# Google Gemini APIs
GEMINI_KEY=AIzaSyXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
GEMINI_ANSWER_MODEL=gemini-2.5-flash

# Firecrawl API
FIRECRAWL_KEY=fc_xxx_xxx_xxx

# Server
PORT=5000
EOF
```

#### Step 3: Build TypeScript

```bash
npm run build
```

#### Step 4: Start Server

```bash
npm run start

# Expected output:
# ✨ Universal WebAI Backend Live on 5000
# ✅ MongoDB Connected Successfully
```

Or for development with auto-reload:

```bash
npm run dev
```

---

### Frontend Setup

#### Step 1: Install Dependencies

```bash
cd frontend
npm install
```

#### Step 2: Build for Chrome Extension

```bash
npm run build

# Creates: dist/ folder
```

#### Step 3: Load in Chrome

1. Open `chrome://extensions/`
2. Toggle "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `frontend` folder
5. ✅ Extension appears in toolbar

#### Step 4: Test Connection

1. Open any website
2. Click extension icon
3. Ask a question
4. Should get response from backend

---

### MongoDB Atlas Setup

#### Vector Index Configuration

Go to MongoDB Atlas → Collection → Indexes → Create Search Index

```json
{
  "cosmosDB": false,
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "dimensions": 768,
        "similarity": "cosine",
        "type": "vector"
      },
      "domain": {
        "type": "filter"
      }
    }
  },
  "name": "vector_index"
}
```

---

## Testing & Troubleshooting

### Testing Backend Connectivity

```bash
# Check if backend is running
curl http://localhost:5000/

# Should NOT return "Connection refused"
```

### Testing Query Endpoint

```bash
curl -X POST http://localhost:5000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Who is the CEO?",
    "currentPageUrl": "https://example.com",
    "baseUrl": "https://example.com/"
  }'
```

### Testing MongoDB

```bash
# In backend code, create a test script:
const testDB = async () => {
  const count = await WebsiteModel.countDocuments();
  console.log(`Websites in DB: ${count}`);
};
testDB();
```

### Common Issues

| Problem                      | Cause                        | Solution                                   |
| ---------------------------- | ---------------------------- | ------------------------------------------ |
| **CORS Error**               | Frontend can't reach backend | Check CORS origins in backend/src/index.ts |
| **Connection Refused**       | Backend not running          | `cd backend && npm run start`              |
| **No results found**         | Bad vector search score      | Check vector_index exists in MongoDB       |
| **Slow first query**         | Normal! Mapping in progress  | Wait 20-30s, next query will be instant    |
| **Gemini API Error**         | Invalid/expired API key      | Check GEMINI_KEY in .env                   |
| **Firecrawl errors**         | Website not scrapable        | Try different website, or check API key    |
| **MongoDB connection error** | Invalid MONGO_URI            | Check connection string in .env            |

### Useful Logs

**Backend logs show:**

```
[QUERY][xxxxx][START] - Query started
[MAP][START] - Mapping started
[MAP][OK] - URL mapped successfully
[VECTOR][candidates=X] - Vector search results
[EXTRACT][success=X/Y] - Content extraction stats
[ANSWER][durationMs=X] - Answer synthesis time
[QUERY][xxxxx][DONE] - Query completed
```

---

## Summary

**Universal WebAI is a complete RAG system that:**

1. **Maps websites** → Discovers all URLs automatically
2. **Creates embeddings** → Converts content to searchable vectors
3. **Searches semantically** → Finds most relevant pages
4. **Extracts content** → Gets exact answers from pages
5. **Synthesizes answers** → Uses AI to create coherent responses
6. **Cites sources** → Shows exactly where answers come from

**Architecture:**

- Frontend: React + Chrome Extension
- Backend: Express + Node.js + TypeScript
- Database: MongoDB Atlas with Vector Search
- AI: Google Gemini (embeddings + synthesis)
- Scraping: Firecrawl (web crawling + extraction)

**Performance:**

- First query: 3-5 seconds (mapping + search)
- Subsequent queries: 0.5-1 second (instant)
- Handles 50-500+ page websites
- Parallel processing for speed
- Automatic fallback on failures

**Key Features:**

- Background mapping (non-blocking)
- Vector search + semantic similarity
- Multi-source synthesis
- Special role-based extraction
- PDF support via Firecrawl
- Real-time UI updates
- Robust error handling

---

**Version:** 1.0.0
**Last Updated:** April 29, 2026
**Status:** Production Ready ✅
