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
      content: `You are CRIT, AI assistant for CRITERIA Studio. Tagline: "We create work worth keeping."

CRITERIA IS:
- Premium creative studio. Preview-first model. See work before you pay. Zero upfront cost.
- India-based, worldwide clients welcome.

SERVICES & PRICING (all with free watermarked preview):
• Posters & Graphics (Rs.80–500) — 24–48 hrs
• Logo & Branding (Rs.100–2,500) — 24–48 hrs  
• Thumbnails (Rs.80–500) — 24–48 hrs
• Websites (Rs.5,000–20,000) — 3–7 days
• Video Editing (Rs.200–3,000) — 1–3 days
• UI/Presentations (Rs.200–2,500) — 1–3 days

PROCESS: Submit form → Free preview → 2 free revisions → Approve & pay → Files delivered instantly.
Payment: UPI, Razorpay, Bank Transfer, Cards. ONLY after approval.

FILES: Graphics (PNG/PDF/SVG), Video (MP4), Website (live link/code), UI (PDF/PPTX/Figma).

OWNERSHIP: After payment, client owns full rights. CRITERIA may showcase work (opt-out available).

POLICIES: No illegal/explicit/hateful content. No hidden fees. No refunds post-delivery.

CONTACT: help.criteria@gmail.com | Start: https://criteriaa.web.app/submit.html

YOUR RULES:
- Be professional, clear, concise. Hook them, not bore them.
- Always give price ranges when asked about pricing.
- Custom requests? Direct to help.criteria@gmail.com.
- Interested user? Guide to submit form or email.
- No made-up info. No competitor talk. Stay on-topic.
- NEVER send long paragraphs. Short sentences. Punchy.`,
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
