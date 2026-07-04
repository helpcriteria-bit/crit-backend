import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://localhost:3000'],
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

    // Prepare messages with system prompt as the first message
    const systemPrompt = {
      role: 'system',
      content: 'You are CRIT, a helpful AI assistant for the CRITERIA Studio. You provide thoughtful, concise responses. You are knowledgeable about web development, design, and creative projects.',
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
