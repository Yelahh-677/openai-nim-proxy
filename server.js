// server.js - THE ULTIMATE GLM CLEANER VERSION
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
// 🔥 MAIN CONTROLS
// ============================================================================
const SHOW_REASONING = false; // Set false untuk sorok terus
const ENABLE_THINKING_MODE = true; 

// ============================================================================
// 🛠️ HELPER: Fungsi Penyembelih Monolog (CUCI HABIS)
// ============================================================================
function filterReasoning(text) {
  if (!text) return text;
  
  let cleanText = text;

  // 1. Buang tag <think> standard (Kalau ada)
  cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Senarai "Sampah" yang GLM selalu tulis kat awal jawapan
  const garbagePhrases = [
    "\\*Okay, let me analyze",
    "\\*The scene:",
    "\\*The user wants me to",
    "\\*Current situation:",
    "\\*Key elements to include:",
    "\\*I need to describe:",
    "\\*Evelyn's psychology:",
    "\\*How would Evelyn react\\?",
    "\\*Physical details to describe:",
    "\\*I need to avoid:",
    "\\*I should focus on:",
    "\\*The act of sliding",
    "\\*Sound integration:"
  ];

  // Logic: Cari frasa ni, dan buang semua benda sampai jumpa perenggan baru (double enter)
  garbagePhrases.forEach(phrase => {
    let regex = new RegExp(phrase + "[\\s\\S]*?\\n\\n", "gi");
    cleanText = cleanText.replace(regex, '');
  });

  // 3. Buang senarai bullet points atau sengkang yang tertinggal
  cleanText = cleanText.replace(/\n- [\s\S]*?\n\n/gi, '\n\n');
  cleanText = cleanText.replace(/\d\. [\s\S]*?\n\n/gi, '\n\n');

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
  'gpt-4-0613': 'deepseek-ai/deepseek-v4-pro'
};

app.post('/v1/chat/completions', async (req, res) => {
  try {
    let { model, messages, temperature, max_tokens } = req.body;
    let nimModel = MODEL_MAPPING[model] || model;
    const isGLM = nimModel.toLowerCase().includes('glm');

    // 🛡️ FORCE DISABLE STREAM (Supaya filter boleh cuci teks 100%)
    const stream = false;

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

    // 🛡️ FIX 2: INJECT THINKING MODE
    if (ENABLE_THINKING_MODE && isGLM && sanitizedMessages.length > 0) {
      const thinkingPrompt = "\n\n[SYSTEM INSTRUCTION: Think deeply before answering. Use <think> tags for reasoning.]";
      sanitizedMessages[sanitizedMessages.length - 1].content += thinkingPrompt;
    }

    const nimRequest = {
      model: nimModel,
      messages: sanitizedMessages,
      temperature: temperature || 0.6,
      max_tokens: max_tokens || 4096,
      stream: false // Force false
    };

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // ============================================================================
    // 🔥 FINAL CLEANING (HANYA UNTUK NON-STREAMING)
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

app.listen(PORT, () => console.log(`🚀 Proxy up on ${PORT} | Filtering: ${!SHOW_REASONING}`));
