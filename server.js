// server.js - THE ULTIMATE CLEANER & DEEPSEEK CONTROLLER
// ============================================================================
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// ============================================================================
// 🔥 MAIN CONTROLS (TUKAR SETTING KAT SINI)
// ============================================================================
const SHOW_REASONING = false; // Set false untuk sorok suara hati GLM
const ENABLE_THINKING_MODE = true; 

// 👇 INI SUIS UNTUK DEEPSEEK V4 PRO 👇
// Pilihan kau: "none" (Laju), "high" (Sederhana Detail), "max" (Paling Detail/Lama)
const DEEPSEEK_REASONING_MODE = "max"; 
// ============================================================================

// ============================================================================
// 🛠️ HELPER: Fungsi Penyembelih Monolog + Auto Perenggan
// ============================================================================
function filterReasoning(text) {
  if (!text) return text;
  
  let cleanText = text;

  // 1. Buang tag <think> standard
  cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Senarai "Sampah" yang GLM selalu tulis
  const garbagePhrases = [
    "\\*Okay, let me analyze", "\\*The scene:", "\\*The user wants me to",
    "\\*Current situation:", "\\*Key elements to include:", "\\*I need to describe:",
    "\\*Evelyn's psychology:", "\\*How would Evelyn react\\?", "\\*Physical details to describe:",
    "\\*I need to avoid:", "\\*I should focus on:", "\\*The act of sliding", "\\*Sound integration:"
  ];

  garbagePhrases.forEach(phrase => {
    let regex = new RegExp(phrase + "[\\s\\S]*?\\n\\n", "gi");
    cleanText = cleanText.replace(regex, '');
  });

  // 3. Buang senarai bullet points
  cleanText = cleanText.replace(/\n- [\s\S]*?\n\n/gi, '\n\n');
  cleanText = cleanText.replace(/\d\. [\s\S]*?\n\n/gi, '\n\n');

  // 4. AUTO-PARAGRAPH FIX (Pecahkan Wall of Text)
  cleanText = cleanText.replace(/("\s*)(\*)/g, '$1\n\n$2'); // Dialog -> Aksi
  cleanText = cleanText.replace(/(\*\s*)(")/g, '$1\n\n$2'); // Aksi -> Dialog
  cleanText = cleanText.replace(/("\s*)(")/g, '$1\n\n$2'); // Dialog -> Dialog
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n'); // Kemaskan space

  return cleanText.trim();
}

const MODEL_MAPPING = {
  'gpt-4o': 'deepseek-ai/deepseek-v3.2',
  'claude-3-sonnet': 'z-ai/glm4.7',
  'gemini-pro': 'z-ai/glm-5.1',
  'gemma-romance': 'qwen/qwen3.5-397b-a17b',
  'claude-3-haiku-20240307': 'minimaxai/minimax-m2.5',
  'gpt-4o-latest': 'minimaxai/minimax-m2.7',
  'claude-3-opus-20240229': 'deepseek-ai/deepseek-v4-flash',
  'gpt-4-0613': 'deepseek-ai/deepseek-v4-pro' // <-- Ini DeepSeek V4 Pro
};

app.post('/v1/chat/completions', async (req, res) => {
  try {
    let { model, messages, temperature, max_tokens } = req.body;
    let nimModel = MODEL_MAPPING[model] || model;
    
    // Kenal pasti adakah ini GLM atau DeepSeek
    const isGLM = nimModel.toLowerCase().includes('glm');
    const isDeepSeek = nimModel.toLowerCase().includes('deepseek');

    // 🛡️ FIX 1: SANITIZE MESSAGES
    let sanitizedMessages = [];
    for (let m of messages) {
      if (!m.content || m.content.trim() === "") continue; 
      let role = m.role === 'system' ? 'user' : m.role; 
      
      if (sanitizedMessages.length > 0 && sanitizedMessages[sanitizedMessages.length - 1].role === role) {
        sanitizedMessages[sanitizedMessages.length - 1].content += "\n\n" + m.content;
      } else {
        sanitizedMessages.push({ role: role, content: m.content });
      }
    }

    // 🛡️ FIX 2: INJECT GLM THINKING MODE
    if (ENABLE_THINKING_MODE && isGLM && sanitizedMessages.length > 0) {
      const thinkingPrompt = "\n\n[SYSTEM INSTRUCTION: Think deeply before answering. Use <think> tags for reasoning.]";
      sanitizedMessages[sanitizedMessages.length - 1].content += thinkingPrompt;
    }

    // 🛡️ BINA REQUEST BODY
    const nimRequest = {
      model: nimModel,
      messages: sanitizedMessages,
      temperature: temperature || 0.6,
      max_tokens: max_tokens || 4096,
      stream: false // Force false untuk pastikan filter cuci 100%
    };

    // 🛡️ FIX 3: INJECT DEEPSEEK REASONING EFFORT (Hanya jalan kalau pakai model DeepSeek)
    if (isDeepSeek) {
      nimRequest.reasoning_effort = DEEPSEEK_REASONING_MODE;
    }

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // ============================================================================
    // 🔥 FINAL CLEANING
    // ============================================================================
    if (response.data.choices && response.data.choices[0].message) {
      let originalContent = response.data.choices[0].message.content;
      
      if (!SHOW_REASONING) {
        response.data.choices[0].message.content = filterReasoning(originalContent);
      }
    }

    res.json(response.data);

  } catch (error) {
    console.error('🔥 ERROR:', error.message);
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({ error: { message: error.message } });
    }
  }
});

app.listen(PORT, () => console.log(`🚀 Proxy up on ${PORT} | Filtering: ${!SHOW_REASONING} | DeepSeek Mode: ${DEEPSEEK_REASONING_MODE}`));
