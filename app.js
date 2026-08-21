/* ==========================================
   ChatGPT Go Main Application Controller
   ========================================== */

const App = {
    chats: [],
    activeChatId: null,
    customGpts: [],
    activePersona: null,
    isStreaming: false,
    userIsScrollingUp: false,
    activeController: null,
    userName: 'Danz',

    init() {
        this.loadState();
        this.applyUserName();
        this.setupEventListeners();
        this.renderSidebar();
        this.renderPinnedGpts();
        this.renderCustomGptModalList();
        this.syncApiSettingsForm();
        
        if (this.chats.length > 0) {
            this.selectChat(this.chats[0].id);
        } else {
            this.createNewChat();
        }
    },

    loadState() {
        // Load User Name
        const savedName = localStorage.getItem('chatgpt_go_user_name');
        if (savedName) this.userName = savedName;

        // Load chats history
        const savedChats = localStorage.getItem('chatgpt_go_chats');
        if (savedChats) {
            try { this.chats = JSON.parse(savedChats); } catch (e) { this.chats = []; }
        }

        // Load Custom GPTs / Personas (Default Kosong)
        const savedGpts = localStorage.getItem('chatgpt_go_gpts');
        if (savedGpts) {
            try { 
                const parsed = JSON.parse(savedGpts);
                // Hapus item bawaan sebelumnya agar daftar Disematkan benar-benar kosong secara default
                this.customGpts = parsed.filter(g => !['gpt-code-pro', 'gpt-prompt-style', 'gpt-translator'].includes(g.id));
            } catch (e) { 
                this.customGpts = []; 
            }
        } else {
            this.customGpts = [];
        }
        this.saveGpts();
    },

    saveChats() {
        localStorage.setItem('chatgpt_go_chats', JSON.stringify(this.chats));
    },

    saveGpts() {
        localStorage.setItem('chatgpt_go_gpts', JSON.stringify(this.customGpts));
    },

    /* ==========================================
       Event Listeners Setup
       ========================================== */
    setupEventListeners() {
        // Sidebar Toggles & Mobile Drawer Handling
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');

        const toggleSidebarMobile = () => {
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                sidebar.classList.toggle('active');
                if (sidebar.classList.contains('active')) {
                    sidebarOverlay?.classList.remove('hidden');
                } else {
                    sidebarOverlay?.classList.add('hidden');
                }
            } else {
                sidebar.classList.toggle('collapsed');
            }
        };

        this.closeSidebarMobile = () => {
            if (window.innerWidth <= 768) {
                sidebar?.classList.remove('active');
                sidebarOverlay?.classList.add('hidden');
            }
        };

        document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebarMobile);
        document.getElementById('btn-mobile-menu')?.addEventListener('click', toggleSidebarMobile);
        sidebarOverlay?.addEventListener('click', () => this.closeSidebarMobile());

        // Search Toggle in Sidebar
        const searchBox = document.getElementById('search-box-container');
        document.getElementById('btn-search-toggle')?.addEventListener('click', () => {
            searchBox.classList.toggle('hidden');
            if (!searchBox.classList.contains('hidden')) {
                document.getElementById('search-chat-input')?.focus();
            }
        });
        document.getElementById('btn-clear-search')?.addEventListener('click', () => {
            const searchInput = document.getElementById('search-chat-input');
            if (searchInput) searchInput.value = '';
            this.renderSidebar();
        });
        document.getElementById('search-chat-input')?.addEventListener('input', (e) => {
            this.renderSidebar(e.target.value.trim().toLowerCase());
        });

        // New Chat Button
        document.getElementById('btn-new-chat')?.addEventListener('click', () => {
            this.createNewChat();
        });

        // Smart Scroll & Floating Scroll-to-Bottom Button Handler
        const chatContainer = document.getElementById('chat-container');
        const scrollBtn = document.getElementById('btn-scroll-bottom');

        chatContainer?.addEventListener('scroll', () => {
            const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
            if (distanceFromBottom > 80) {
                this.userIsScrollingUp = true;
                scrollBtn?.classList.remove('hidden');
            } else {
                this.userIsScrollingUp = false;
                scrollBtn?.classList.add('hidden');
            }
        }, { passive: true });

        scrollBtn?.addEventListener('click', () => {
            this.userIsScrollingUp = false;
            this.scrollToBottom(true);
            scrollBtn.classList.add('hidden');
        });

        // Prompt Starters Click
        document.querySelectorAll('.prompt-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                if (prompt) {
                    const input = document.getElementById('chat-input');
                    if (input) {
                        input.value = prompt;
                        this.handleSendMessage();
                    }
                }
            });
        });

        // Chat Input Auto-resize & Keypress
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('btn-send');

        if (chatInput) {
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
                
                if (chatInput.value.trim().length > 0 && !this.isStreaming) {
                    sendBtn.classList.remove('disabled');
                } else if (!this.isStreaming) {
                    sendBtn.classList.add('disabled');
                }
            });

            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }

        // Send & Stop Button Click
        sendBtn?.addEventListener('click', () => {
            if (this.isStreaming) {
                this.stopStreaming();
            } else {
                this.handleSendMessage();
            }
        });

        // Clear Current Chat
        document.getElementById('btn-clear-current-chat')?.addEventListener('click', () => {
            if (confirm('Apakah Anda yakin ingin mengosongkan obrolan ini?')) {
                const activeChat = this.getActiveChat();
                if (activeChat) {
                    activeChat.messages = [];
                    this.saveChats();
                    this.renderActiveChat();
                }
            }
        });

        // Voice Speech Input (Web Speech API)
        const micBtn = document.getElementById('btn-mic');
        if (micBtn) {
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                recognition.lang = 'id-ID';
                recognition.interimResults = false;

                recognition.onstart = () => {
                    micBtn.classList.add('active');
                    micBtn.style.color = '#ef4444';
                    this.showToast('Mendengarkan ucapan Anda...', 'info');
                };

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    if (chatInput) {
                        chatInput.value += (chatInput.value ? ' ' : '') + transcript;
                        chatInput.dispatchEvent(new Event('input'));
                    }
                };

                recognition.onend = () => {
                    micBtn.classList.remove('active');
                    micBtn.style.color = '';
                };

                micBtn.addEventListener('click', () => {
                    recognition.start();
                });
            } else {
                micBtn.title = 'Speech-to-Text tidak didukung browser ini';
                micBtn.style.opacity = '0.4';
            }
        }

        // Attachment File Button Simulation
        const attachBtn = document.getElementById('btn-attach');
        const fileInput = document.getElementById('file-input');
        attachBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const previewBar = document.getElementById('file-preview-bar');
                if (previewBar) {
                    previewBar.innerHTML = `<i class="fa-solid fa-paperclip"></i> <span>${file.name} (${Math.round(file.size / 1024)} KB)</span> <button onclick="App.clearAttachment()"><i class="fa-solid fa-xmark"></i></button>`;
                    previewBar.classList.remove('hidden');
                }
            }
        });

        // Thinking Mode Toggle Button
        const thinkingBtn = document.getElementById('btn-toggle-thinking');
        const thinkingTag = document.getElementById('input-thinking-tag');
        thinkingBtn?.addEventListener('click', () => {
            AIClient.config.enableThinking = !AIClient.config.enableThinking;
            AIClient.saveConfig({});
            thinkingBtn.classList.toggle('active', AIClient.config.enableThinking);
            thinkingTag?.classList.toggle('hidden', !AIClient.config.enableThinking);
            this.showToast(`Mode Berpikir ${AIClient.config.enableThinking ? 'Diaktifkan' : 'Dimatikan'}`, 'info');
        });

        // Model Selector Dropdown Handler
        const modelBtn = document.getElementById('btn-model-selector');
        const modelMenu = document.getElementById('model-dropdown-menu');
        modelBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            modelMenu?.classList.toggle('hidden');
        });
        document.addEventListener('click', () => modelMenu?.classList.add('hidden'));

        document.querySelectorAll('.model-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.model-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');

                const provider = opt.getAttribute('data-provider');
                const model = opt.getAttribute('data-model');
                const title = opt.querySelector('.model-title')?.textContent || model;

                AIClient.saveConfig({ provider, model });
                document.getElementById('current-model-name').textContent = `${title} (${provider.toUpperCase()})`;
                modelMenu?.classList.add('hidden');
                this.showToast(`Model diubah ke: ${title}`, 'success');
            });
        });

        // Modals Open & Close Handlers
        document.getElementById('nav-api-settings-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openModal('modal-api-settings');
        });
        document.getElementById('disclaimer-api-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openModal('modal-api-settings');
        });
        document.getElementById('nav-custom-gpts-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openModal('modal-custom-gpt');
        });
        document.getElementById('btn-add-custom-gpt')?.addEventListener('click', () => {
            this.openModal('modal-custom-gpt');
            this.resetCustomGptForm();
        });
        document.getElementById('btn-create-new-gpt')?.addEventListener('click', () => {
            this.resetCustomGptForm();
        });
        document.getElementById('user-profile-btn')?.addEventListener('click', () => {
            this.openModal('modal-user-settings');
        });
        document.getElementById('btn-quick-settings')?.addEventListener('click', () => {
            this.openModal('modal-api-settings');
        });
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-close-modal');
                this.closeModal(targetId);
            });
        });

        // API Settings Tabs
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const tabId = tab.getAttribute('data-tab');
                document.getElementById(tabId)?.classList.add('active');
            });
        });

        // Toggle Eye Password Fields
        document.querySelectorAll('.btn-toggle-eye').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (input) {
                    const isPass = input.type === 'password';
                    input.type = isPass ? 'text' : 'password';
                    btn.querySelector('i').className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
                }
            });
        });

        // Save API Settings
        document.getElementById('btn-save-api-settings')?.addEventListener('click', () => {
            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
            let provider = 'deepseek';
            if (activeTab === 'tab-openai') provider = 'openai';
            if (activeTab === 'tab-gemini') provider = 'gemini';
            if (activeTab === 'tab-openrouter') provider = 'openrouter';
            if (activeTab === 'tab-custom') provider = 'custom';

            const deepseekKey = document.getElementById('deepseek-api-key')?.value.trim();
            const openaiKey = document.getElementById('openai-api-key')?.value.trim();
            const geminiKey = document.getElementById('gemini-api-key')?.value.trim();
            const openrouterKey = document.getElementById('openrouter-api-key')?.value.trim();
            const customBaseUrl = document.getElementById('custom-base-url')?.value.trim();
            const customModelId = document.getElementById('custom-model-id')?.value.trim();
            const customApiKey = document.getElementById('custom-api-key')?.value.trim();
            const temperature = document.getElementById('setting-temperature')?.value;
            const maxTokens = document.getElementById('setting-max-tokens')?.value;
            const systemPrompt = document.getElementById('setting-system-prompt')?.value.trim();

            AIClient.saveConfig({
                provider,
                deepseekKey,
                openaiKey,
                geminiKey,
                openrouterKey,
                customBaseUrl,
                customModelId,
                customApiKey,
                temperature,
                maxTokens,
                systemPrompt
            });

            // Update top bar title label live
            const currentModelName = document.getElementById('current-model-name');
            if (currentModelName) {
                currentModelName.textContent = `${AIClient.config.model} (${AIClient.config.provider.toUpperCase()})`;
            }

            this.closeModal('modal-api-settings');
            this.showToast('Setelan API berhasil disimpan!', 'success');
        });

        // Temperature Slider Update Text
        const tempSlider = document.getElementById('setting-temperature');
        tempSlider?.addEventListener('input', () => {
            document.getElementById('val-temperature').textContent = tempSlider.value;
        });

        // Custom GPT Form Save & Delete
        document.getElementById('btn-save-gpt')?.addEventListener('click', () => {
            const editId = document.getElementById('gpt-edit-id')?.value;
            const name = document.getElementById('gpt-name')?.value.trim();
            const icon = document.getElementById('gpt-icon')?.value.trim() || '🤖';
            const desc = document.getElementById('gpt-desc')?.value.trim();
            const systemPrompt = document.getElementById('gpt-system-prompt')?.value.trim();
            const pinned = document.getElementById('gpt-pinned')?.checked;

            if (!name || !systemPrompt) {
                this.showToast('Nama dan System Instructions wajib diisi!', 'error');
                return;
            }

            if (editId) {
                const index = this.customGpts.findIndex(g => g.id === editId);
                if (index !== -1) {
                    this.customGpts[index] = { id: editId, name, icon, desc, systemPrompt, pinned };
                }
            } else {
                const newGpt = {
                    id: 'gpt-' + Date.now(),
                    name, icon, desc, systemPrompt, pinned
                };
                this.customGpts.push(newGpt);
            }

            this.saveGpts();
            this.renderPinnedGpts();
            this.renderCustomGptModalList();
            this.resetCustomGptForm();
            this.showToast('Custom GPT berhasil disimpan!', 'success');
        });

        document.getElementById('btn-delete-gpt')?.addEventListener('click', () => {
            const editId = document.getElementById('gpt-edit-id')?.value;
            if (editId && confirm('Hapus Custom GPT ini?')) {
                this.customGpts = this.customGpts.filter(g => g.id !== editId);
                this.saveGpts();
                this.renderPinnedGpts();
                this.renderCustomGptModalList();
                this.resetCustomGptForm();
                this.showToast('Custom GPT berhasil dihapus.', 'info');
            }
        });

        // Backup Export & Import Data
        document.getElementById('btn-export-data')?.addEventListener('click', () => {
            const backupData = {
                chats: this.chats,
                customGpts: this.customGpts,
                apiConfig: AIClient.config,
                exportedAt: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chatgpt-go-backup-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('Data chat berhasil diekspor!', 'success');
        });

        document.getElementById('import-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const imported = JSON.parse(event.target.result);
                        if (imported.chats) this.chats = imported.chats;
                        if (imported.customGpts) this.customGpts = imported.customGpts;
                        if (imported.apiConfig) AIClient.saveConfig(imported.apiConfig);
                        
                        this.saveChats();
                        this.saveGpts();
                        this.renderSidebar();
                        this.renderPinnedGpts();
                        this.renderActiveChat();
                        this.closeModal('modal-user-settings');
                        this.showToast('Data berhasil diimpor!', 'success');
                    } catch (err) {
                        this.showToast('File JSON tidak valid!', 'error');
                    }
                };
                reader.readAsText(file);
            }
        });

        // Save User Display Name Handler
        const saveNameBtn = document.getElementById('btn-save-user-name');
        const nameInput = document.getElementById('user-display-name');

        const handleSaveName = () => {
            const newName = nameInput?.value.trim();
            if (newName) {
                this.userName = newName;
                localStorage.setItem('chatgpt_go_user_name', newName);
                this.applyUserName();
                this.showToast(`Nama berhasil diubah ke: ${newName}`, 'success');
            }
        };

        saveNameBtn?.addEventListener('click', handleSaveName);
        nameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveName();
            }
        });

        document.getElementById('btn-clear-all-data')?.addEventListener('click', () => {
            if (confirm('PERINGATAN: Seluruh riwayat chat dan API Key akan dihapus secara permanen. Lanjutkan?')) {
                localStorage.clear();
                location.reload();
            }
        });
    },

    applyUserName() {
        const nameEls = document.querySelectorAll('.user-name');
        nameEls.forEach(el => el.textContent = this.userName);

        const avatarEls = document.querySelectorAll('.avatar');
        const initial = this.userName.charAt(0).toUpperCase() || 'U';
        avatarEls.forEach(el => el.textContent = initial);

        const inputName = document.getElementById('user-display-name');
        if (inputName) inputName.value = this.userName;
    },

    /* ==========================================
       Chat Sessions & History Management
       ========================================== */
    createNewChat(customGpt = null) {
        const newChat = {
            id: 'chat-' + Date.now(),
            title: customGpt ? `Obrolan: ${customGpt.name}` : 'Obrolan Baru',
            createdAt: new Date().toISOString(),
            customGptId: customGpt ? customGpt.id : null,
            messages: []
        };

        this.chats.unshift(newChat);
        this.saveChats();
        this.activeChatId = newChat.id;
        this.activePersona = customGpt;

        this.updatePersonaBadge();
        this.renderSidebar();
        this.renderActiveChat();
        if (this.closeSidebarMobile) this.closeSidebarMobile();
    },

    selectChat(chatId) {
        this.activeChatId = chatId;
        const chat = this.getActiveChat();
        if (chat && chat.customGptId) {
            this.activePersona = this.customGpts.find(g => g.id === chat.customGptId) || null;
        } else {
            this.activePersona = null;
        }
        this.updatePersonaBadge();
        this.renderSidebar();
        this.renderActiveChat();
        if (this.closeSidebarMobile) this.closeSidebarMobile();
    },

    getActiveChat() {
        return this.chats.find(c => c.id === this.activeChatId);
    },

    deleteChat(chatId, event) {
        if (event) event.stopPropagation();
        this.chats = this.chats.filter(c => c.id !== chatId);
        this.saveChats();

        if (this.activeChatId === chatId) {
            if (this.chats.length > 0) {
                this.selectChat(this.chats[0].id);
            } else {
                this.createNewChat();
            }
        } else {
            this.renderSidebar();
        }
    },

    renameChat(chatId, event) {
        if (event) event.stopPropagation();
        const chat = this.chats.find(c => c.id === chatId);
        if (!chat) return;

        const newTitle = prompt('Ubah judul obrolan:', chat.title);
        if (newTitle && newTitle.trim()) {
            chat.title = newTitle.trim();
            this.saveChats();
            this.renderSidebar();
        }
    },

    renderSidebar(filterQuery = '') {
        const recentList = document.getElementById('recent-chats-list');
        if (!recentList) return;

        recentList.innerHTML = '';
        let filtered = this.chats;

        if (filterQuery) {
            filtered = this.chats.filter(c => c.title.toLowerCase().includes(filterQuery));
        }

        if (filtered.length === 0) {
            recentList.innerHTML = `<div class="modal-subtext" style="padding: 10px;">Tidak ada obrolan.</div>`;
            return;
        }

        filtered.forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-history-item ${chat.id === this.activeChatId ? 'active' : ''}`;
            item.innerHTML = `
                <i class="fa-regular fa-message"></i>
                <span class="chat-item-title">${this.escapeHtml(chat.title)}</span>
                <div class="chat-item-actions">
                    <button class="action-icon" title="Ubah Judul" onclick="App.renameChat('${chat.id}', event)"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-icon" title="Hapus" onclick="App.deleteChat('${chat.id}', event)"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            item.addEventListener('click', () => this.selectChat(chat.id));
            recentList.appendChild(item);
        });
    },

    renderPinnedGpts() {
        const pinnedContainer = document.getElementById('pinned-gpts-list');
        if (!pinnedContainer) return;

        pinnedContainer.innerHTML = '';
        const pinned = this.customGpts.filter(g => g.pinned);

        pinned.forEach(gpt => {
            const pill = document.createElement('div');
            pill.className = 'gpt-item-pill';
            pill.innerHTML = `
                <span>${gpt.icon}</span>
                <span class="chat-item-title">${this.escapeHtml(gpt.name)}</span>
            `;
            pill.addEventListener('click', () => {
                this.createNewChat(gpt);
            });
            pinnedContainer.appendChild(pill);
        });
    },

    updatePersonaBadge() {
        const badgeSpan = document.getElementById('active-persona-name');
        if (badgeSpan) {
            if (this.activePersona) {
                badgeSpan.textContent = `${this.activePersona.icon} ${this.activePersona.name}`;
            } else {
                badgeSpan.textContent = 'Default AI';
            }
        }
    },

    /* ==========================================
       Chat Render & Messaging Handler
       ========================================== */
    renderActiveChat() {
        const chat = this.getActiveChat();
        const welcomeScreen = document.getElementById('welcome-screen');
        const messagesList = document.getElementById('messages-list');

        if (!chat || chat.messages.length === 0) {
            welcomeScreen?.classList.remove('hidden');
            messagesList?.classList.add('hidden');
            if (messagesList) messagesList.innerHTML = '';
            return;
        }

        welcomeScreen?.classList.add('hidden');
        messagesList?.classList.remove('hidden');
        messagesList.innerHTML = '';

        chat.messages.forEach((msg, idx) => {
            this.appendMessageToDOM(msg.role, msg.content, msg.thinking, false, idx);
        });

        this.scrollToBottom();
    },

    appendMessageToDOM(role, content, thinking = '', isStreaming = false, msgIndex = null) {
        const messagesList = document.getElementById('messages-list');
        if (!messagesList) return null;

        const row = document.createElement('div');
        row.className = `message-row ${role}`;
        if (msgIndex !== null) row.setAttribute('data-msg-index', msgIndex);

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        const userInitial = (this.userName && this.userName.charAt(0).toUpperCase()) || 'U';
        avatar.innerHTML = role === 'user' ? userInitial : '<i class="fa-solid fa-sparkles"></i>';

        const body = document.createElement('div');
        body.className = 'message-body';

        // Thinking process box
        if (thinking) {
            const thinkingBox = document.createElement('div');
            thinkingBox.className = 'thinking-box';
            thinkingBox.innerHTML = `<i class="fa-solid fa-brain"></i> <strong>Proses Penalaran:</strong><br>${this.escapeHtml(thinking)}`;
            body.appendChild(thinkingBox);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (role === 'user') {
            contentDiv.textContent = content;
        } else {
            contentDiv.innerHTML = MarkdownRenderer.render(content);
        }
        body.appendChild(contentDiv);

        // Action buttons
        if (role === 'assistant' && !isStreaming) {
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            actions.innerHTML = `
                <button class="icon-btn action-icon" title="Salin Jawaban" onclick="App.copyMessageText(this)"><i class="fa-regular fa-copy"></i></button>
                <button class="icon-btn action-icon" title="Regenerate" onclick="App.regenerateLastMessage()"><i class="fa-solid fa-rotate"></i></button>
            `;
            body.appendChild(actions);
        }

        row.appendChild(avatar);
        row.appendChild(body);
        messagesList.appendChild(row);

        return row;
    },

    async handleSendMessage() {
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('btn-send');
        if (!input) return;

        const userText = input.value.trim();
        if (!userText || this.isStreaming) return;

        // Auto-generate title for new chat
        let chat = this.getActiveChat();
        if (!chat) {
            this.createNewChat();
            chat = this.getActiveChat();
        }

        if (chat && chat.messages.length === 0) {
            chat.title = userText.length > 28 ? userText.substring(0, 28) + '...' : userText;
            this.saveChats();
            this.renderSidebar();
        }

        // Add user message to state
        chat.messages.push({ role: 'user', content: userText });
        this.saveChats();

        // Clear input field
        input.value = '';
        input.style.height = 'auto';
        this.clearAttachment();

        // Hide welcome screen and render user message
        document.getElementById('welcome-screen')?.classList.add('hidden');
        document.getElementById('messages-list')?.classList.remove('hidden');
        this.appendMessageToDOM('user', userText);
        this.userIsScrollingUp = false;
        this.scrollToBottom(true);

        // Prepare streaming state
        this.isStreaming = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
        sendBtn.classList.remove('disabled');
        sendBtn.classList.add('stop-btn');
        sendBtn.title = 'Hentikan Balasan';

        // Placeholder element for streaming assistant message
        const assistantMsgObj = { role: 'assistant', content: '', thinking: '' };
        const assistantRow = this.appendMessageToDOM('assistant', '...', '', true);
        const contentDiv = assistantRow.querySelector('.message-content');
        const bodyDiv = assistantRow.querySelector('.message-body');

        let thinkingBox = null;

        // Active persona system prompt override
        const personaPrompt = this.activePersona ? this.activePersona.systemPrompt : null;

        let lastRenderTime = 0;
        let streamRenderTimer = null;
        let pendingStreamText = '';

        const updateStreamDOM = () => {
            contentDiv.innerHTML = MarkdownRenderer.renderStream(pendingStreamText);
            lastRenderTime = Date.now();
            streamRenderTimer = null;
        };

        this.activeController = await AIClient.sendMessageStream({
            messages: chat.messages,
            activePersonaPrompt: personaPrompt,
            onThinking: (thinkingText) => {
                if (!thinkingBox) {
                    thinkingBox = document.createElement('div');
                    thinkingBox.className = 'thinking-box';
                    bodyDiv.insertBefore(thinkingBox, contentDiv);
                }
                thinkingBox.innerHTML = `<i class="fa-solid fa-brain"></i> <strong>Proses Penalaran:</strong><br>${this.escapeHtml(thinkingText)}`;
                assistantMsgObj.thinking = thinkingText;
            },
            onChunk: (chunkText, fullText) => {
                assistantMsgObj.content = fullText;
                pendingStreamText = fullText;

                const now = Date.now();
                if (now - lastRenderTime >= 50) {
                    if (streamRenderTimer) clearTimeout(streamRenderTimer);
                    updateStreamDOM();
                } else if (!streamRenderTimer) {
                    streamRenderTimer = setTimeout(updateStreamDOM, 50 - (now - lastRenderTime));
                }
            },
            onComplete: (fullText) => {
                if (streamRenderTimer) clearTimeout(streamRenderTimer);
                assistantMsgObj.content = fullText;
                contentDiv.innerHTML = MarkdownRenderer.render(fullText);
                chat.messages.push(assistantMsgObj);
                this.saveChats();
                this.finishStreaming(sendBtn);
            },
            onError: (err) => {
                if (streamRenderTimer) clearTimeout(streamRenderTimer);
                const errMsg = `⚠️ **Gagal Mendapatkan Balasan AI**: ${err.message}`;
                assistantMsgObj.content = errMsg;
                contentDiv.innerHTML = MarkdownRenderer.render(errMsg);
                chat.messages.push(assistantMsgObj);
                this.saveChats();
                this.finishStreaming(sendBtn);
            }
        });
    },

    stopStreaming() {
        if (this.activeController) {
            this.activeController.abort();
            this.activeController = null;
        }
        const sendBtn = document.getElementById('btn-send');
        this.finishStreaming(sendBtn);
        this.showToast('Generasi dihentikan', 'info');
    },

    finishStreaming(sendBtn) {
        this.isStreaming = false;
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
            sendBtn.classList.remove('stop-btn');
            sendBtn.classList.add('disabled');
            sendBtn.title = 'Kirim pesan';
        }
        this.renderActiveChat();
    },

    regenerateLastMessage() {
        const chat = this.getActiveChat();
        if (!chat || chat.messages.length === 0) return;

        // Remove last assistant message if present
        if (chat.messages[chat.messages.length - 1].role === 'assistant') {
            chat.messages.pop();
            this.saveChats();
            this.renderActiveChat();
        }

        // Trigger AI stream again
        const lastUserMsg = chat.messages[chat.messages.length - 1];
        if (lastUserMsg && lastUserMsg.role === 'user') {
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = lastUserMsg.content;
                chat.messages.pop(); // Remove so handleSendMessage doesn't duplicate
                this.handleSendMessage();
            }
        }
    },

    copyMessageText(btn) {
        const row = btn.closest('.message-row');
        const contentDiv = row?.querySelector('.message-content');
        if (contentDiv) {
            navigator.clipboard.writeText(contentDiv.innerText).then(() => {
                this.showToast('Jawaban disalin ke clipboard!', 'success');
            });
        }
    },

    clearAttachment() {
        const fileInput = document.getElementById('file-input');
        const previewBar = document.getElementById('file-preview-bar');
        if (fileInput) fileInput.value = '';
        if (previewBar) {
            previewBar.innerHTML = '';
            previewBar.classList.add('hidden');
        }
    },

    scrollToBottom(force = false) {
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;

        if (force || !this.userIsScrollingUp) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    },

    /* ==========================================
       Modals & Form Helpers
       ========================================== */
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            if (modalId === 'modal-api-settings') this.syncApiSettingsForm();
        }
    },

    closeModal(modalId) {
        document.getElementById(modalId)?.classList.add('hidden');
    },

    syncApiSettingsForm() {
        const cfg = AIClient.config;
        const deepseekInput = document.getElementById('deepseek-api-key');
        if (deepseekInput) deepseekInput.value = cfg.deepseekKey || '';
        document.getElementById('openai-api-key').value = cfg.openaiKey || '';
        document.getElementById('gemini-api-key').value = cfg.geminiKey || '';
        document.getElementById('openrouter-api-key').value = cfg.openrouterKey || '';
        document.getElementById('custom-base-url').value = cfg.customBaseUrl || 'http://localhost:11434/v1';
        document.getElementById('custom-model-id').value = cfg.customModelId || '';
        document.getElementById('custom-api-key').value = cfg.customApiKey || '';
        document.getElementById('setting-temperature').value = cfg.temperature || 0.7;
        document.getElementById('val-temperature').textContent = cfg.temperature || 0.7;
        document.getElementById('setting-max-tokens').value = cfg.maxTokens || 4096;
        document.getElementById('setting-system-prompt').value = cfg.systemPrompt || '';

        // Select tab matching current provider
        let tabName = 'tab-deepseek';
        if (cfg.provider === 'openai') tabName = 'tab-openai';
        if (cfg.provider === 'gemini') tabName = 'tab-gemini';
        if (cfg.provider === 'openrouter') tabName = 'tab-openrouter';
        if (cfg.provider === 'custom') tabName = 'tab-custom';

        document.querySelectorAll('.tab-btn').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.toggle('active', c.id === tabName);
        });
    },

    renderCustomGptModalList() {
        const container = document.getElementById('gpt-items-container');
        if (!container) return;

        container.innerHTML = '';
        this.customGpts.forEach(gpt => {
            const item = document.createElement('div');
            item.className = 'gpt-card-item';
            item.innerHTML = `
                <div class="gpt-card-icon">${gpt.icon}</div>
                <div class="gpt-card-meta">
                    <span class="gpt-card-name">${this.escapeHtml(gpt.name)}</span>
                    <span class="gpt-card-desc">${this.escapeHtml(gpt.desc || '')}</span>
                </div>
            `;
            item.addEventListener('click', () => this.editCustomGptForm(gpt));
            container.appendChild(item);
        });
    },

    editCustomGptForm(gpt) {
        document.getElementById('gpt-form-title').textContent = 'Edit Custom GPT';
        document.getElementById('gpt-edit-id').value = gpt.id;
        document.getElementById('gpt-name').value = gpt.name;
        document.getElementById('gpt-icon').value = gpt.icon;
        document.getElementById('gpt-desc').value = gpt.desc || '';
        document.getElementById('gpt-system-prompt').value = gpt.systemPrompt;
        document.getElementById('gpt-pinned').checked = !!gpt.pinned;
        document.getElementById('btn-delete-gpt')?.classList.remove('hidden');
    },

    resetCustomGptForm() {
        document.getElementById('gpt-form-title').textContent = 'Buat Custom GPT Baru';
        document.getElementById('gpt-edit-id').value = '';
        document.getElementById('gpt-name').value = '';
        document.getElementById('gpt-icon').value = '🤖';
        document.getElementById('gpt-desc').value = '';
        document.getElementById('gpt-system-prompt').value = '';
        document.getElementById('gpt-pinned').checked = true;
        document.getElementById('btn-delete-gpt')?.classList.add('hidden');
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        if (type === 'error') iconClass = 'fa-solid fa-circle-exclamation';

        toast.innerHTML = `<i class="${iconClass}"></i> <span>${this.escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

// Start application
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
