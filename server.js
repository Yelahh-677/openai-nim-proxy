// server.js - GLM-4.7 Anti-Error 400 Version (SUPER FIXED)
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
const SHOW_REASONING = false; // Set false untuk sorok terus dari chat & edit
const ENABLE_THINKING_MODE = true; 

// ============================================================================
// 🛠️ HELPER: Fungsi cuci teks untuk Non-Streaming
// ============================================================================
function filterReasoning(text) {
  if (!text) return text;
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

const MODEL_MAPPING = {
  'gpt-4o': 'deepseek-ai/deepseek-v3.2',
  'claude-3-sonnet': 'z-ai/glm4.7',
  'gemini-pro': 'z-ai/glm-5.1',
'gemma-romance': 'qwen/qwen3.5-397b-a17b',
'claude-3-haiku-20240307': 'minimaxai/minimax-m2.5',
'gpt-4o-latest': 'deepseek-ai/deepseek-v3.1-terminus',
};

app.post('/v1/chat/completions', async (req, res) => {
  try {
    let { model, messages, temperature, max_tokens, stream } = req.body;
    let nimModel = MODEL_MAPPING[model] || model;
    const isGLM = nimModel.toLowerCase().includes('glm');

    // ============================================================================
    // 🛡️ FIX 1: SANITIZE MESSAGES (JANTUNG KEPADA PENYELESAIAN 400)
    // ============================================================================
    let sanitizedMessages = [];
    
    for (let m of messages) {
      // 1a. Buang mesej kosong
      if (!m.content || m.content.trim() === "") continue; 
      
      // 1b. Paksa 'system' jadi 'user' (Sebab GLM/NIM selalu reject system)
      let role = m.role === 'system' ? 'user' : m.role; 
      
      // 1c. Gabungkan mesej kalau role bertindih (contoh: user pastu user lagi)
      if (sanitizedMessages.length > 0 && sanitizedMessages[sanitizedMessages.length - 1].role === role) {
        sanitizedMessages[sanitizedMessages.length - 1].content += "\n\n" + m.content;
      } else {
        sanitizedMessages.push({ role: role, content: m.content });
      }
    }

    // ============================================================================
    // 🛡️ FIX 2: INJECT THINKING MODE DENGAN SELAMAT
    // ============================================================================
    if (ENABLE_THINKING_MODE && isGLM && sanitizedMessages.length > 0) {
      const thinkingPrompt = "\n\n[SYSTEM INSTRUCTION: You must think deeply before answering. Start your response with <think> followed by your reasoning, then close it with </think> before giving the final answer.]";
      
      // Pastikan kita inject pada 'user', BUKAN 'assistant'
      if (sanitizedMessages[sanitizedMessages.length - 1].role === 'user') {
        sanitizedMessages[sanitizedMessages.length - 1].content += thinkingPrompt;
      } else {
         // Kalau mesej terakhir tu assistant, kita wujudkan user dummy
         sanitizedMessages.push({ role: 'user', content: thinkingPrompt });
      }
    }

    const nimRequest = {
      model: nimModel,
      messages: sanitizedMessages, // <- GUNA MESEJ YANG DAH DICUCI
      temperature: temperature || 0.6,
      max_tokens: max_tokens || 4096,
      stream: stream || false
    };

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: stream ? 'stream' : 'json'
    });

    // ============================================================================
    // STREAMING & NON-STREAMING LOGIC (Tak disentuh, kekal sama)
    // ============================================================================
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      let unfinishedLine = '';
      let isInsideThink = false;

      response.data.on('data', (chunk) => {
        const lines = (unfinishedLine + chunk.toString()).split('\n');
        unfinishedLine = lines.pop();

        for (let line of lines) {
          let trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          if (trimmed.includes('[DONE]')) {
            res.write('data: [DONE]\n\n');
            continue;
          }

          try {
            if (!SHOW_REASONING) {
              const jsonData = JSON.parse(trimmed.replace('data: ', ''));
              const content = jsonData.choices[0].delta?.content || "";

              if (content.includes('<think>')) isInsideThink = true;
              
              if (!isInsideThink && content !== "") {
                res.write(`${trimmed}\n\n`);
              }

              if (content.includes('</think>')) isInsideThink = false;
            } else {
              res.write(`${trimmed}\n\n`);
            }
          } catch (e) {
            if (!isInsideThink) res.write(`${trimmed}\n\n`);
          }
        }
      });
      response.data.on('end', () => res.end());
    } else {
      if (!SHOW_REASONING && response.data.choices && response.data.choices[0].message) {
        response.data.choices[0].message.content = filterReasoning(response.data.choices[0].message.content);
      }
      res.json(response.data);
    }

  } catch (error) {
    // ============================================================================
    // 🛡️ FIX 3: LOG RALAT SEBENAR DARI SERVER (WAJIB TENGOK TERMINAL)
    // ============================================================================
    console.error('Proxy Error Message:', error.message);
    if (error.response && error.response.data) {
      console.error('🔥 DETEL PUNCA 400 SEBENAR:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({ 
        error: { message: error.message || 'Server error' } 
      });
    }
  }
});

app.listen(PORT, () => console.log(`Proxy up on ${PORT} | Filtering: ${!SHOW_REASONING}`)); 
