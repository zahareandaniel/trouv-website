/* =============================================
   TROUV CHAUFFEURS — Main JavaScript
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Sticky Header ----------
  const header = document.querySelector('.site-header');
  const scrollThreshold = 60;

  function handleScroll() {
    if (!header) return;
    if (window.scrollY > scrollThreshold) {
      header.classList.add('site-header--scrolled');
    } else {
      header.classList.remove('site-header--scrolled');
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // run on load

  // ---------- Mobile Navigation ----------
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      mobileNav.classList.toggle('active');
      document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });

    // Close mobile nav on link click
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // ---------- Scroll Reveal Animations ----------
  const revealElements = document.querySelectorAll('.reveal, .reveal-stagger');

  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
              }
            });
          },
          {
            threshold: 0.08,
            rootMargin: '0px 0px 0px 0px',
          }
        )
      : null;

  const markRevealVisibleIfInView = (el) => {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < vh * 0.95 && rect.bottom > 0;
  };

  revealElements.forEach((el) => {
    if (!revealObserver) {
      el.classList.add('visible');
      return;
    }
    if (markRevealVisibleIfInView(el)) {
      el.classList.add('visible');
    } else {
      revealObserver.observe(el);
    }
  });

  // ---------- Smooth Scroll for In-Page Links ----------
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
  });

  // ---------- Contact form → POST /api/contact (Resend, see env.example) ----------
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    const statusEl = document.getElementById('contact-form-status');
    let sending = false;

    const clearStatusStyle = () => {
      if (!statusEl) return;
      statusEl.classList.remove('is-error', 'is-success');
    };

    const showStatusError = (text) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      clearStatusStyle();
      statusEl.classList.add('is-error');
    };

    const showStatusSuccess = (text) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      clearStatusStyle();
      statusEl.classList.add('is-success');
    };

    const showStatusNeutral = (text) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      clearStatusStyle();
    };

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;

      const name = contactForm.querySelector('#name');
      const email = contactForm.querySelector('#email');
      const phone = contactForm.querySelector('#phone');
      const service = contactForm.querySelector('#service');
      const message = contactForm.querySelector('#message');
      const companyField = contactForm.querySelector('#contact-company');

      let isValid = true;

      [name, email, phone, message].forEach((field) => {
        if (field && !field.value.trim()) {
          field.style.borderColor = '#cc0000';
          isValid = false;
        } else if (field) {
          field.style.borderColor = '';
        }
      });

      if (email && email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        email.style.borderColor = '#cc0000';
        isValid = false;
      }

      if (!isValid) {
        showStatusError('Please complete all required fields.');
        return;
      }

      if (companyField && companyField.value.trim() !== '') {
        return;
      }

      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      sending = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      showStatusNeutral('Sending your request…');

      const serviceLabel =
        service && service.selectedOptions[0]
          ? service.selectedOptions[0].textContent.trim()
          : '';

      const payload = {
        name: name.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim(),
        service: service && service.value ? service.value : '',
        service_label: serviceLabel,
        message: message.value.trim(),
        company: companyField ? companyField.value : '',
      };

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 503) {
          showStatusError(
            'This quote form is not connected to email yet. Please use info@trouv.co.uk or call +44 203 835 5338 while we finish setup.'
          );
          return;
        }

        if (!res.ok || data.success !== true) {
          const msg =
            (data && data.error) ||
            'Could not send your message. Please try again or email info@trouv.co.uk.';
          throw new Error(msg);
        }

        showStatusSuccess('Thank you. We have received your request and will reply shortly.');
        contactForm.reset();
      } catch (err) {
        const msg =
          err && err.message
            ? err.message
            : 'Something went wrong. Please email info@trouv.co.uk.';
        showStatusError(msg);
      } finally {
        sending = false;
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // ---------- Active Navigation ----------
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ---------- FAQ accordion ----------
  const faqRoot = document.querySelector('.faq-accordion');
  if (faqRoot) {
    faqRoot.querySelectorAll('.faq-item__trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.faq-item');
        const panelId = trigger.getAttribute('aria-controls');
        const panel = panelId ? document.getElementById(panelId) : null;
        if (!panel) return;

        const isOpen = item.classList.contains('is-open');

        faqRoot.querySelectorAll('.faq-item').forEach(other => {
          if (other === item) return;
          other.classList.remove('is-open');
          const t = other.querySelector('.faq-item__trigger');
          const pId = t && t.getAttribute('aria-controls');
          const p = pId ? document.getElementById(pId) : null;
          if (t) t.setAttribute('aria-expanded', 'false');
          if (p) p.hidden = true;
        });

        if (isOpen) {
          item.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          panel.hidden = true;
        } else {
          item.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
          panel.hidden = false;
        }
      });
    });
  }

  // ---------- AI Chatbot Widget ----------
  // Temporarily disabled — re-enable by uncommenting the line below
  // initChatWidget();


  function initChatWidget() {
    // 1. Inject HTML
    const chatHTML = `
      <div id="trouv-chat" class="trouv-chat-widget">
        <div class="trouv-chat-panel">
          <div class="trouv-chat-header">
            <div>
              <h3 class="trouv-chat-title">Trouv Concierge</h3>
              <p class="trouv-chat-subtitle">Quotations & Enquiries</p>
            </div>
            <button class="trouv-chat-close" aria-label="Close Chat">&times;</button>
          </div>
          <div class="trouv-chat-messages" id="trouv-chat-msgs">
            <div class="trouv-msg trouv-msg--bot">Good day. I am the Trouv digital concierge. How may I assist you with your travel plans today?</div>
          </div>
          <form class="trouv-chat-input-area" id="trouv-chat-form">
            <input type="text" id="trouv-chat-input" class="trouv-chat-input" placeholder="Enter pickup, dropoff, date..." autocomplete="off">
            <button type="submit" class="trouv-chat-send" aria-label="Send Message" disabled>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10l15 2l-15 2z" fill="currentColor"/>
              </svg>
            </button>
          </form>
        </div>
        <button class="trouv-chat-fab" id="trouv-chat-trigger" aria-label="Open Chat">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHTML);

    // 2. Select Elements
    const chatWidget = document.getElementById('trouv-chat');
    const triggerBtn = document.getElementById('trouv-chat-trigger');
    const closeBtn = document.querySelector('.trouv-chat-close');
    const form = document.getElementById('trouv-chat-form');
    const input = document.getElementById('trouv-chat-input');
    const sendBtn = document.querySelector('.trouv-chat-send');
    const messagesArea = document.getElementById('trouv-chat-msgs');

    // 3. State
    let messages = [];

    // 4. Toggle Logic
    triggerBtn.addEventListener('click', () => {
      chatWidget.classList.toggle('is-open');
      if (chatWidget.classList.contains('is-open')) {
        setTimeout(() => input.focus(), 300);
      }
    });

    closeBtn.addEventListener('click', () => {
      chatWidget.classList.remove('is-open');
    });

    // 5. Input validation for send button
    input.addEventListener('input', () => {
      sendBtn.disabled = input.value.trim().length === 0;
    });

    // 6. Messaging Logic
    function appendMessage(text, sender) {
      const msgDiv = document.createElement('div');
      msgDiv.className = `trouv-msg trouv-msg--${sender}`;
      msgDiv.textContent = text;
      messagesArea.appendChild(msgDiv);
      scrollToBottom();
    }

    function appendLoading() {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'trouv-msg trouv-msg--bot trouv-msg--loading';
      loadingDiv.id = 'trouv-chat-loading';
      loadingDiv.innerHTML = '<span></span><span></span><span></span>';
      messagesArea.appendChild(loadingDiv);
      scrollToBottom();
    }

    function removeLoading() {
      const loadingDiv = document.getElementById('trouv-chat-loading');
      if (loadingDiv) loadingDiv.remove();
    }

    function scrollToBottom() {
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      appendMessage(text, 'user');
      messages.push({ role: 'user', content: text });
      
      input.value = '';
      sendBtn.disabled = true;
      appendLoading();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages })
        });

        removeLoading();

        // Parse JSON safely — API may return an HTML error page on crash
        let data;
        try {
          data = await response.json();
        } catch {
          console.error('[Trouv Chat] Non-JSON response from /api/chat. Status:', response.status);
          appendMessage('Our quoting system is temporarily unavailable. Please contact us at info@trouv.co.uk or call +44 7494 528909.', 'bot');
          sendBtn.disabled = false;
          return;
        }

        if (response.ok && data.reply) {
          appendMessage(data.reply, 'bot');
          messages.push({ role: 'assistant', content: data.reply });
        } else if (response.status === 429) {
          appendMessage('You have reached the request limit. Please try again in a few hours, or contact us directly on +44 7494 528909.', 'bot');
        } else {
          console.error('[Trouv Chat] API error. Status:', response.status, 'Body:', data);
          appendMessage(data.error || 'Connection error. Please try again.', 'bot');
        }
      } catch (error) {
        removeLoading();
        console.error('[Trouv Chat] Fetch failed:', error);
        appendMessage('An error occurred while connecting. Please use info@trouv.co.uk.', 'bot');
      }
    });
  }
});
