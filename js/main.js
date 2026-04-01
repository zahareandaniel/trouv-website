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

  // ---------- Form Handling (Frontend Only) ----------
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Basic validation
      const name = contactForm.querySelector('#name');
      const email = contactForm.querySelector('#email');
      const phone = contactForm.querySelector('#phone');
      const message = contactForm.querySelector('#message');

      let isValid = true;

      [name, email, phone, message].forEach(field => {
        if (field && !field.value.trim()) {
          field.style.borderColor = '#cc0000';
          isValid = false;
        } else if (field) {
          field.style.borderColor = '';
        }
      });

      if (email && email.value && !email.value.includes('@')) {
        email.style.borderColor = '#cc0000';
        isValid = false;
      }

      if (isValid) {
        // Show success state
        const submitBtn = contactForm.querySelector('.btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Thank You';
        submitBtn.style.backgroundColor = '#333';
        submitBtn.disabled = true;

        setTimeout(() => {
          contactForm.reset();
          submitBtn.textContent = originalText;
          submitBtn.style.backgroundColor = '';
          submitBtn.disabled = false;
        }, 3000);
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
});
