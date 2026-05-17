// server.js - THE ULTIMATE CLEANER (DEEPSEEK REASONING ONLY) + HYBRID STREAMING
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
const SHOW_REASONING = false; 
const ENABLE_THINKING_MODE = true; 
const DEEPSEEK_REASONING_MODE = "max"; 
// ============================================================================

// ============================================================================
// 🛠️ HELPER: Fungsi Penyembelih Monolog (Hanya Cuci Thinking)
// ============================================================================
function filterReasoning(text) {
  if (!text) return text;
  
  let cleanText = text;

  // 1. Buang tag <think> standard
  cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Senarai "Sampah" yang GLM selalu tulis kat awal
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

  // 3. Buang senarai bullet points atau sengkang yang tertinggal
  cleanText = cleanText.replace(/\n- [\s\S]*?\n\n/gi, '\n\n');
  cleanText = cleanText.replace(/\d\. [\s\S]*?\n\n/gi, '\n\n');

  return cleanText.trim();
}

const MODEL_MAPPING = {
  'gpt-4o': 'moonshotai/kimi-k2.6',
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
    // KITA TANGKAP SETTING STREAM DARI SILLYTAVERN (TRUE ATAU FALSE)
    let { model, messages, temperature, max_tokens, stream } = req.body;
    let isStream = stream || false; 

    let nimModel = MODEL_MAPPING[model] || model;
    
    const isGLM = nimModel.toLowerCase().includes('glm');
    const isDeepSeek = nimModel.toLowerCase().includes('deepseek');

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

    if (ENABLE_THINKING_MODE && isGLM && sanitizedMessages.length > 0) {
      const thinkingPrompt = "\n\n[SYSTEM INSTRUCTION: Think deeply before answering. Use <think> tags for reasoning.]";
      sanitizedMessages[sanitizedMessages.length - 1].content += thinkingPrompt;
    }

    // DINAMIK: Ikut butang yang kau tekan kat SillyTavern
    const nimRequest = {
      model: nimModel,
      messages: sanitizedMessages,
      temperature: temperature || 0.6,
      max_tokens: max_tokens || 4096,
      stream: isStream 
    };

    if (isDeepSeek) {
      nimRequest.reasoning_effort = DEEPSEEK_REASONING_MODE;
    }

    // ========================================================================
    // 🔀 CABANG LOGIK BERMULA DI SINI (TRUE vs FALSE)
    // ========================================================================

    if (!isStream) {
      // ----------------------------------------------------------------------
      // VERSI 1: STREAM OFF (Tunggu Siap, Cuci Teks, Baru Hantar)
      // ----------------------------------------------------------------------
      const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.choices && response.data.choices[0].message) {
        let originalContent = response.data.choices[0].message.content;
        
        if (!SHOW_REASONING) {
          response.data.choices[0].message.content = filterReasoning(originalContent);
        }
      }

      return res.json(response.data);

    } else {
      // ----------------------------------------------------------------------
      // VERSI 2: STREAM ON (Paip Air Buka Penuh - Anti 504 Timeout)
      // ----------------------------------------------------------------------
      const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream' // 🔴 INI KUNCI UTAMA SUPAYA PROXY TAK CRASH BACA CHUNKS
      });

      // Set headers untuk bagitahu SillyTavern data tengah masuk live
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Tembak data terus ke skrin kau setiap kali NVIDIA hantar huruf
      response.data.on('data', (chunk) => {
        res.write(chunk);
      });

      // Bila NVIDIA habis menaip, kita tutup paip
      response.data.on('end', () => {
        res.end();
      });
    }

  } catch (error) {
    console.error('🔥 ERROR:', error.message);
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({ error: { message: error.message } });
    }
  }
});

app.listen(PORT, () => console.log(`🚀 Proxy up on ${PORT} | DeepSeek Mode: ${DEEPSEEK_REASONING_MODE}`))
