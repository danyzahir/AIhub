/* ==========================================
   Markdown Renderer & Code Syntax Highlighter
   ========================================== */

const MarkdownRenderer = {
    init() {
        if (typeof marked !== 'undefined') {
            // Configure marked options for fast performance
            marked.setOptions({
                gfm: true,
                breaks: true,
                headerIds: false,
                mangle: false
            });
        }
    },

    /**
     * Fast streaming parser (No heavy syntax highlight on every micro-chunk)
     */
    renderStream(markdownText) {
        if (!markdownText) return '';
        if (typeof marked !== 'undefined') {
            return marked.parse(markdownText);
        }
        return this.fallbackParse(markdownText);
    },

    /**
     * Full parser with Code Syntax Highlighting & Copy Buttons
     */
    render(markdownText) {
        if (!markdownText) return '';

        let html = '';
        if (typeof marked !== 'undefined') {
            html = marked.parse(markdownText);
        } else {
            html = this.fallbackParse(markdownText);
        }

        return this.enhanceCodeBlocks(html);
    },

    fallbackParse(text) {
        let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // Bold
        escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic
        escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Inline Code
        escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Paragraphs
        return escaped.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    },

    enhanceCodeBlocks(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Process all <pre><code> elements
        const preElements = tempDiv.querySelectorAll('pre');
        preElements.forEach(pre => {
            const codeEl = pre.querySelector('code');
            if (!codeEl) return;

            let lang = 'code';
            const classList = Array.from(codeEl.classList);
            const langClass = classList.find(c => c.startsWith('language-'));
            if (langClass) {
                lang = langClass.replace('language-', '');
            }

            const rawCode = codeEl.textContent;

            // Highlight using Highlight.js if available
            if (typeof hljs !== 'undefined') {
                try {
                    if (lang !== 'code' && hljs.getLanguage(lang)) {
                        codeEl.innerHTML = hljs.highlight(rawCode, { language: lang }).value;
                    } else {
                        codeEl.innerHTML = hljs.highlightAuto(rawCode).value;
                    }
                } catch (e) {
                    codeEl.textContent = rawCode;
                }
            }

            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `
                <span class="code-lang">${lang}</span>
                <button class="btn-copy-code" title="Salin Kode">
                    <i class="fa-regular fa-copy"></i>
                    <span>Salin Kode</span>
                </button>
            `;

            // Setup copy action
            const copyBtn = header.querySelector('.btn-copy-code');
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(rawCode).then(() => {
                    const icon = copyBtn.querySelector('i');
                    const text = copyBtn.querySelector('span');
                    icon.className = 'fa-solid fa-check';
                    text.textContent = 'Tersalin!';
                    setTimeout(() => {
                        icon.className = 'fa-regular fa-copy';
                        text.textContent = 'Salin Kode';
                    }, 2000);
                });
            });

            // Replace pre with wrapper containing header and pre
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });

        return tempDiv.innerHTML;
    }
};

// Initialize renderer on script load
document.addEventListener('DOMContentLoaded', () => {
    MarkdownRenderer.init();
});
