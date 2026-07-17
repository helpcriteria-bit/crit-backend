import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
// NOTE: CORS_ORIGIN in .env is a comma-separated string (see .env.example).
// It must be split into an array — passing the raw string to `cors()` makes
// it compare the Origin header against the WHOLE string, so a list like
// "https://a.com,https://b.com" would never match either site.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// Initialize Groq client (API key is safe on server)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Store conversation history for context
const conversationHistory = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Get or create conversation history for this session
    const session = sessionId || 'default';
    if (!conversationHistory.has(session)) {
      conversationHistory.set(session, []);
    }

    const history = conversationHistory.get(session);

    // Add user message to history
    history.push({
      role: 'user',
      content: message.trim(),
    });

    // Skip warmup pings silently
    if (message.trim() === '__ping__') {
      return res.json({ response: 'ok', sessionId: session });
    }

    // Prepare messages with system prompt as the first message
    const systemPrompt = {
      role: 'system',
      content: `You are CRIT, the official AI assistant for CRITERIA — a premium creative studio based in India, built on one promise: you see the work before you pay for it.

TAGLINE: "We create work worth keeping."

ABOUT CRITERIA:
CRITERIA is a professional creative studio serving small businesses, startups, creators, and entrepreneurs worldwide. Every project begins with a free preview — watermarked or live — so clients evaluate quality before any payment. This preview-first model is the core of CRITERIA's identity. CRITERIA is risk-free by design.

SERVICES & PRICING:
1. Posters & Graphics — Rs.80 to Rs.500
   Covers: social media posts, event posters, banners, brand creatives, business cards, invitations, certificates, ad creatives, infographics, packaging, book covers, merch/apparel designs.
   Preview: watermarked. Turnaround: 24-48 hours.

2. Logo & Branding — Rs.100 to Rs.2,500
   Covers: wordmarks, icons, full brand identity systems, colour palettes, typography, app icons, favicons.
   Preview: concept preview. Turnaround: 24-48 hours. Includes up to 2 free revisions.

3. Thumbnails — Rs.80 to Rs.500
   Covers: YouTube thumbnails, podcast covers, content artwork.
   Preview: watermarked. Turnaround: 24-48 hours.

4. Websites — Rs.5,000 to Rs.20,000
   Covers: landing pages, portfolio sites, business websites. Clean, modern, fast, mobile-responsive.
   Preview: live preview link. Turnaround: 3-7 days.

5. Video Editing — Rs.200 to Rs.3,000
   Covers: Reels, YouTube videos, short-form content — cut, colour-graded, paced.
   Preview: watermarked blurred preview. Turnaround: 1-3 days.

6. UI / Presentations — Rs.200 to Rs.2,500
   Covers: app mockups, pitch decks, slide design, CVs/resumes.
   Preview: live preview. Turnaround: 1-3 days.

Minimum deadline for any project: 3 days from submission.
Prices vary by complexity. International clients quoted in preferred currency.

HOW THE PROCESS WORKS:
Step 1 — Client fills a 5-step project form at https://criteriaa.web.app/submit.html (Name, Service, Description + files, Budget & Deadline, Review & Submit). No payment needed to submit.
Step 2 — CRITERIA builds a free watermarked preview or live demo.
Step 3 — Client reviews. Up to 2 free revisions before any payment.
Step 4 — Client approves, pays, receives clean watermark-free final files immediately.

FILE FORMATS ON DELIVERY:
- Graphics & Logos: PNG, JPEG, PDF, SVG
- Videos: MP4 (1080p or 4K)
- Websites: Hosted live link or full source code
- UI / Presentations: PDF, PPTX, or Figma

PAYMENTS:
- UPI: GPay, PhonePe, Paytm, BHIM (India)
- Razorpay: cards, net banking
- Bank Transfer: international clients
- International Card
- Payment is triggered ONLY after preview approval. Zero upfront payment, ever.
- No refunds after final files are delivered — client already approved the preview.
- No hidden fees. Price agreed is price paid.

RIGHTS & OWNERSHIP:
- After payment, client owns full rights — commercial and personal.
- CRITERIA may showcase work in portfolio. Clients can opt out anytime.
- No attribution required.

WHAT CRITERIA DOES NOT CREATE:
- Illegal content
- Explicit or adult content
- Hateful or discriminatory content
- Content that violates intellectual property or copyright

CONTACT:
- Email: help.criteria@gmail.com
- Start a project: https://criteriaa.web.app/submit.html
- Instagram: @criteria.studio | Behance: criteria_studio | X: @criteria.online

YOUR IDENTITY:
- Your name is CRIT. You are CRITERIA's AI assistant.
- You are not human but you are knowledgeable, professional, and helpful.

YOUR BEHAVIOUR RULES:
- Always respond in a professional, clear, and helpful tone. Be concise but complete.
- When a user is interested in a service, guide them to https://criteriaa.web.app/submit.html or help.criteria@gmail.com.
- If asked about pricing, give the actual price ranges listed above — always include the range, not just "it depends."
- For custom or unusual requests not in the service list, direct to help.criteria@gmail.com.
- Never make up services, prices, timelines, or policies not listed above.
- Do not discuss competitors by name or make direct comparisons.
- If a question is completely outside CRITERIA's scope, politely say so and redirect.
- Do not engage with topics unrelated to CRITERIA, creative services, or the user's project needs.
- Keep responses focused. Avoid unnecessary filler or padding.`,
    };

    // Create messages array with system prompt and history
    const messagesWithSystem = [
      systemPrompt,
      ...history,
    ];

    // Call Groq API with conversation history
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: messagesWithSystem,
    });

    // Extract text from response
    const assistantMessage = response.choices[0]?.message?.content || 'Unable to generate response';

    // Add assistant response to history
    history.push({
      role: 'assistant',
      content: assistantMessage,
    });

    // Keep history manageable (last 20 messages)
    if (history.length > 20) {
      conversationHistory.set(session, history.slice(-20));
    }

    // Send back to client
    res.json({ 
      response: assistantMessage,
      sessionId: session,
    });
  } catch (error) {
    console.error('API Error:', error);
    
    // Specific error handling
    if (error.status === 401) {
      return res.status(401).json({ 
        error: 'Authentication failed. Check your API key.',
      });
    }

    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limited. Please try again later.',
      });
    }

    res.status(500).json({ 
      error: error.message || 'Internal server error',
    });
  }
});

// Clear session endpoint
app.post('/api/clear-session', (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessionId || 'default';
    
    conversationHistory.delete(session);
    res.json({ success: true, message: `Session ${session} cleared` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`✓ CRIT server running at http://localhost:${port}`);
  console.log(`✓ Health check: http://localhost:${port}/health`);
  console.log(`✓ Chat endpoint: POST http://localhost:${port}/api/chat`);
  console.log(`✓ API Key loaded: ${process.env.GROQ_API_KEY ? 'Yes' : 'No'}`);
});
