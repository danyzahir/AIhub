/* ==========================================
   AI API Client (DeepSeek, OpenAI, Gemini, OpenRouter & Custom)
   ========================================== */

const AIClient = {
    // Default API Configuration (All keys empty by default for manual entry)
    config: {
        provider: 'deepseek', // 'deepseek', 'openai', 'gemini', 'openrouter', 'custom'
        openaiKey: '',
        deepseekKey: '',
        geminiKey: '',
        openrouterKey: '',
        customBaseUrl: 'http://localhost:11434/v1',
        customModelId: 'llama3:latest',
        customApiKey: '',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: 'Kamu adalah asisten AI profesional. Berikan jawaban yang terstruktur sangat rapi, elegan, dan mudah dibaca dalam Bahasa Indonesia. Gunakan heading (# / ##), poin-poin singkat (bullet points), serta tabel Markdown yang rapi jika menjelaskan perbandingan atau data ringkasan.',
        enableThinking: false
    },

    init() {
        this.loadConfig();
    },

    loadConfig() {
        const saved = localStorage.getItem('chatgpt_go_api_config');
        if (saved) {
            try {
                this.config = { ...this.config, ...JSON.parse(saved) };
                if (this.config.model === 'gemini-2.0-flash') {
                    this.config.model = 'gemini-3.6-flash';
                }
            } catch (e) {
                console.error('Failed to parse stored API config:', e);
            }
        }
    },

    saveConfig(newConfig) {
        if (newConfig.openaiKey !== undefined) newConfig.openaiKey = newConfig.openaiKey.trim();
        if (newConfig.deepseekKey !== undefined) newConfig.deepseekKey = newConfig.deepseekKey.trim();
        if (newConfig.geminiKey !== undefined) newConfig.geminiKey = newConfig.geminiKey.trim();
        if (newConfig.openrouterKey !== undefined) newConfig.openrouterKey = newConfig.openrouterKey.trim();
        if (newConfig.customApiKey !== undefined) newConfig.customApiKey = newConfig.customApiKey.trim();

        this.config = { ...this.config, ...newConfig };

        // Auto-correct model matching active provider
        if (this.config.provider === 'deepseek' && (!this.config.model || !this.config.model.startsWith('deepseek'))) {
            this.config.model = 'deepseek-chat';
        }
        if (this.config.provider === 'openai' && (!this.config.model || !this.config.model.startsWith('gpt'))) {
            this.config.model = 'gpt-4o';
        }
        if (this.config.provider === 'gemini' && (!this.config.model || !this.config.model.startsWith('gemini') || this.config.model === 'gemini-2.0-flash')) {
            this.config.model = 'gemini-3.6-flash';
        }

        localStorage.setItem('chatgpt_go_api_config', JSON.stringify(this.config));
    },

    /**
     * Smart Auto-Detection API Key & Provider Fallback
     */
    getActiveApiKey() {
        const p = this.config.provider;
        
        // 1. Direct match
        if (p === 'deepseek' && this.config.deepseekKey) return this.config.deepseekKey;
        if (p === 'openai' && this.config.openaiKey) return this.config.openaiKey;
        if (p === 'gemini' && this.config.geminiKey) return this.config.geminiKey;
        if (p === 'openrouter' && this.config.openrouterKey) return this.config.openrouterKey;
        if (p === 'custom' && (this.config.customApiKey || this.config.customBaseUrl)) return this.config.customApiKey || 'no-key-required';

        // 2. Intelligent Fallback: Check which API Key is available in config
        if (this.config.deepseekKey) { 
            this.config.provider = 'deepseek';
            this.config.model = 'deepseek-chat';
            return this.config.deepseekKey; 
        }
        if (this.config.openaiKey) { 
            this.config.provider = 'openai';
            this.config.model = 'gpt-4o';
            return this.config.openaiKey; 
        }
        if (this.config.geminiKey) { 
            this.config.provider = 'gemini';
            if (!this.config.model || !this.config.model.startsWith('gemini') || this.config.model === 'gemini-2.0-flash') {
                this.config.model = 'gemini-3.6-flash';
            }
            return this.config.geminiKey; 
        }
        if (this.config.openrouterKey) { 
            this.config.provider = 'openrouter';
            return this.config.openrouterKey; 
        }

        return '';
    },

    isVisionModel(provider, modelName) {
        if (provider === 'openai') {
            const m = (modelName || '').toLowerCase();
            return m.includes('gpt-4o') || m.includes('vision') || m.includes('gpt-4-turbo');
        }
        if (provider === 'gemini') {
            return true;
        }
        if (provider === 'openrouter') {
            const m = (modelName || '').toLowerCase();
            return m.includes('gpt-4o') || m.includes('claude-3') || m.includes('gemini') || m.includes('vision') || m.includes('pixtral') || m.includes('llava');
        }
        if (provider === 'deepseek') {
            return false;
        }
        return false;
    },

    /**
     * Core Streaming Method
     */
    async sendMessageStream({ messages, activePersonaPrompt, onChunk, onThinking, onComplete, onError }) {
        const controller = new AbortController();
        const signal = controller.signal;

        const apiKey = this.getActiveApiKey();
        const provider = this.config.provider;

        // System prompt priority: custom persona > global settings
        const effectiveSystemPrompt = activePersonaPrompt || this.config.systemPrompt;

        // If no API Key is provided anywhere, use interactive Demo Stream
        if (!apiKey && (provider === 'openai' || provider === 'deepseek' || provider === 'gemini' || provider === 'openrouter')) {
            this.runDemoStream({ messages, onChunk, onThinking, onComplete, signal });
            return controller;
        }

        try {
            if (provider === 'gemini') {
                await this.streamGemini({ messages, systemPrompt: effectiveSystemPrompt, apiKey, onChunk, onThinking, onComplete, onError, signal });
            } else {
                await this.streamOpenAICompatible({ messages, systemPrompt: effectiveSystemPrompt, provider, apiKey, onChunk, onThinking, onComplete, onError, signal });
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Stream aborted by user');
            } else {
                console.error('API Stream Error:', err);
                if (onError) onError(err);
            }
        }

        return controller;
    },

    /**
     * OpenAI Compatible Stream (DeepSeek, OpenAI, OpenRouter, Custom Endpoint)
     */
    async streamOpenAICompatible({ messages, systemPrompt, provider, apiKey, onChunk, onThinking, onComplete, onError, signal }) {
        let endpoint = 'https://api.openai.com/v1/chat/completions';
        let headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };

        if (provider === 'deepseek') {
            endpoint = 'https://api.deepseek.com/chat/completions';
        } else if (provider === 'openrouter') {
            endpoint = 'https://openrouter.ai/api/v1/chat/completions';
            headers['HTTP-Referer'] = window.location.href;
            headers['X-Title'] = 'AI Hub';
        } else if (provider === 'custom') {
            let baseUrl = this.config.customBaseUrl.replace(/\/+$/, '');
            if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
            endpoint = `${baseUrl}/chat/completions`;
        }

        let modelName = this.config.model;
        if (provider === 'custom' && this.config.customModelId) {
            modelName = this.config.customModelId;
        }

        // Default model correction per provider
        if (provider === 'deepseek' && (!modelName || !modelName.startsWith('deepseek'))) {
            modelName = 'deepseek-chat';
        }
        if (provider === 'openai' && (!modelName || !modelName.startsWith('gpt'))) {
            modelName = 'gpt-4o';
        }

        const supportsVision = this.isVisionModel(provider, modelName);

        // Format message history
        const formattedMessages = [];
        if (systemPrompt) {
            formattedMessages.push({ role: 'system', content: systemPrompt });
        }
        messages.forEach(m => {
            if (m.attachments && m.attachments.length > 0) {
                if (supportsVision) {
                    const parts = [];
                    if (m.content) {
                        parts.push({ type: 'text', text: m.content });
                    }
                    m.attachments.forEach(att => {
                        if (att.isImage && att.dataUrl) {
                            parts.push({
                                type: 'image_url',
                                image_url: { url: att.dataUrl }
                            });
                        } else if (att.textContent) {
                            parts.push({
                                type: 'text',
                                text: `[Lampiran File "${att.name}"]:\n${att.textContent}`
                            });
                        }
                    });
                    formattedMessages.push({ role: m.role, content: parts });
                } else {
                    let textContent = m.content || '';
                    m.attachments.forEach(att => {
                        if (att.isImage) {
                            textContent += `\n\n[Lampiran Foto: "${att.name}"]`;
                        } else if (att.textContent) {
                            textContent += `\n\n[Lampiran File "${att.name}"]:\n${att.textContent}`;
                        }
                    });
                    formattedMessages.push({ role: m.role, content: textContent.trim() });
                }
            } else {
                formattedMessages.push({ role: m.role, content: m.content || '' });
            }
        });

        const body = {
            model: modelName,
            messages: formattedMessages,
            temperature: parseFloat(this.config.temperature) || 0.7,
            max_tokens: parseInt(this.config.maxTokens) || 4096,
            stream: true
        };

        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: signal
            });
        } catch (fetchErr) {
            throw new Error(`Koneksi Gagal: Tidak dapat menghubungi server (${provider.toUpperCase()}). Periksa koneksi internet atau masalah CORS.`);
        }

        if (!response.ok) {
            const errText = await response.text();
            let formattedErr = `API Error ${response.status}`;
            if (response.status === 401) {
                formattedErr = `[401 Unauthorized] API Key ${provider.toUpperCase()} Anda tidak valid atau saldo akun belum mencukupi. Periksa kembali Key di Setelan API.`;
            } else if (response.status === 402 || response.status === 429) {
                formattedErr = `[Quota Error ${response.status}] Saldo API Key habis atau batas pemanggilan (rate limit) tercapai.`;
            } else {
                formattedErr = `[Error ${response.status}] ${errText}`;
            }
            throw new Error(formattedErr);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let thinkingBuffer = '';
        let isInsideThinkingTag = false;

        if (this.config.enableThinking && onThinking) {
            onThinking('Menganalisis permintaan...');
            await new Promise(r => setTimeout(r, 400));
        }

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep last incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (trimmed.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        const deltaReasoning = parsed.choices?.[0]?.delta?.reasoning_content || '';
                        const deltaContent = parsed.choices?.[0]?.delta?.content || '';

                        // Capture DeepSeek R1 reasoning stream
                        if (deltaReasoning) {
                            thinkingBuffer += deltaReasoning;
                            if (onThinking) onThinking(thinkingBuffer);
                        }
                        
                        if (deltaContent) {
                            if (deltaContent.includes('<think>')) {
                                isInsideThinkingTag = true;
                                continue;
                            }
                            if (deltaContent.includes('</think>')) {
                                isInsideThinkingTag = false;
                                continue;
                            }

                            if (isInsideThinkingTag) {
                                thinkingBuffer += deltaContent;
                                if (onThinking) onThinking(thinkingBuffer);
                            } else {
                                fullText += deltaContent;
                                if (onChunk) onChunk(deltaContent, fullText);
                            }
                        }
                    } catch (e) {
                        // ignore JSON parse chunk glitches
                    }
                }
            }
        }

        if (onComplete) onComplete(fullText);
    },

    /**
     * Google Gemini REST API Stream
     */
    async streamGemini({ messages, systemPrompt, apiKey, onChunk, onThinking, onComplete, onError, signal }) {
        const rawModel = this.config.model || 'gemini-3.6-flash';
        const model = (!rawModel || rawModel === 'gemini-2.0-flash') ? 'gemini-3.6-flash' : rawModel;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

        const contents = [];
        messages.forEach(m => {
            const role = m.role === 'assistant' ? 'model' : 'user';
            const parts = [];
            if (m.content) {
                parts.push({ text: m.content });
            }
            if (m.attachments && m.attachments.length > 0) {
                m.attachments.forEach(att => {
                    if (att.isImage && att.dataUrl) {
                        const match = att.dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
                        if (match) {
                            parts.push({
                                inlineData: {
                                    mimeType: match[1],
                                    data: match[2]
                                }
                            });
                        }
                    } else if (att.textContent) {
                        parts.push({
                            text: `[Lampiran File "${att.name}"]:\n${att.textContent}`
                        });
                    }
                });
            }
            if (parts.length === 0) parts.push({ text: '' });
            contents.push({ role, parts });
        });

        const body = {
            contents: contents,
            generationConfig: {
                temperature: parseFloat(this.config.temperature) || 0.7,
                maxOutputTokens: parseInt(this.config.maxTokens) || 4096
            }
        };

        if (systemPrompt) {
            body.systemInstruction = {
                parts: [{ text: systemPrompt }]
            };
        }

        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: signal
            });
        } catch (fetchErr) {
            throw new Error(`Koneksi Gagal: Tidak dapat menghubungi server Google Gemini API.`);
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error (${response.status}): ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let buffer = '';

        if (this.config.enableThinking && onThinking) {
            onThinking('Google Gemini sedang berpikir...');
            await new Promise(r => setTimeout(r, 400));
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        const candidate = parsed.candidates?.[0];
                        const textChunk = candidate?.content?.parts?.[0]?.text || '';
                        
                        if (textChunk) {
                            fullText += textChunk;
                            if (onChunk) onChunk(textChunk, fullText);
                        }
                    } catch (e) {}
                }
            }
        }

        if (onComplete) onComplete(fullText);
    },

    /**
     * Interactive Demo Fallback Mode
     */
    async runDemoStream({ messages, onChunk, onThinking, onComplete, signal }) {
        const lastMsgObj = messages[messages.length - 1];
        const lastUserMsg = lastMsgObj?.content || '';
        const attachmentInfo = lastMsgObj?.attachments && lastMsgObj.attachments.length > 0
            ? `\n\n📷 **Terdeteksi ${lastMsgObj.attachments.length} foto/lampiran file yang siap diproses oleh model vision!**`
            : '';
        
        if (this.config.enableThinking && onThinking) {
            onThinking('Menganalisis pesan dan foto lampiran...');
            await new Promise(r => setTimeout(r, 600));
        }

        const responseText = `Halo! **AI Hub** siap membantu Anda. 🚀${attachmentInfo}

Saya mendeteksi bahwa **API Key (${this.config.provider.toUpperCase()}) belum dikonfigurasi** di browser Anda.

### 🔑 Cara Memasang API Key AI Anda:
1. Buka **Setelan API & Model** (klik ikon gear / kunci di pojok kanan atas).
2. Masukkan API Key Anda pada Tab Provider yang sesuai:
   - **DeepSeek**: Key \`sk-...\` dari [DeepSeek Platform](https://platform.deepseek.com/api_keys).
   - **OpenAI**: Key \`sk-...\` dari [OpenAI Platform](https://platform.openai.com/api-keys).
   - **Google Gemini**: Key gratis dari [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Klik tombol **Simpan Setelan**.

---

*Pesan Anda sebelumnya:*
> "${lastUserMsg || '(Hanya lampiran foto/file)'}"`;

        const words = responseText.split(' ');
        let currentText = '';

        for (let i = 0; i < words.length; i++) {
            if (signal.aborted) break;
            const word = (i === 0 ? '' : ' ') + words[i];
            currentText += word;
            if (onChunk) onChunk(word, currentText);
            await new Promise(r => setTimeout(r, 20));
        }

        if (onComplete) onComplete(currentText);
    }
};

// Initialize API client
AIClient.init();
