(function () {
  'use strict';

  // Analytics hooks. Nothing is loaded and nothing leaves the browser until an
  // analytics tool is added; events carry no personal data.
  window.dataLayer = window.dataLayer || [];
  function track(event, params) {
    var row = { event: event, page: location.pathname };
    for (var k in params || {}) row[k] = params[k];
    window.dataLayer.push(row);
  }

  // Mobile menu
  var menu = document.querySelector('.menu');
  var nav = document.getElementById('nav');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        menu.setAttribute('aria-expanded', 'false');
        menu.focus();
      }
    });
  }

  // Click tracking: calls, demo buttons, booking buttons
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a || a.hasAttribute('data-book')) return;
    var where = a.getAttribute('data-cta') || '';
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {
      track('click_to_call', { location: where });
      if (a.hasAttribute('data-demo')) track('demo_cta_click', { industry: a.getAttribute('data-demo') });
    } else if (a.hasAttribute('data-booking')) {
      track('booking_cta_click', { location: where });
    }
  });

  // Booking dialog on the contact page
  var modal = document.getElementById('modal');
  if (modal && modal.showModal) {
    document.querySelectorAll('[data-book]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        track('booking_cta_click', { location: 'contact-dialog' });
        modal.showModal();
      });
    });
    modal.querySelector('.close').addEventListener('click', function () { modal.close(); });
  }

  // FAQ search
  var search = document.getElementById('faqsearch');
  if (search) {
    var items = document.querySelectorAll('#faqlist details');
    var none = document.getElementById('noresults');
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase(), n = 0;
      items.forEach(function (d) {
        var hit = d.textContent.toLowerCase().indexOf(q) !== -1;
        d.hidden = !hit;
        if (hit) n++;
      });
      none.hidden = n !== 0;
    });
  }

  // Enquiry form
  var form = document.getElementById('enquiry');
  if (form) {
    var status = document.getElementById('formstatus');
    var button = form.querySelector('button[type="submit"]');
    var started = Date.now();
    var endpoint = form.getAttribute('data-endpoint');
    var rules = {
      name: function (v) { return v.length >= 2 ? '' : 'Please enter your name.'; },
      business: function (v) { return v.length >= 2 ? '' : 'Please enter your business name.'; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Please enter a valid email address.'; },
      phone: function (v) { return v === '' || /^[0-9+()\-\s]{7,20}$/.test(v) ? '' : 'Please enter a valid telephone number, or leave this blank.'; },
      message: function (v) { return v.length >= 10 ? '' : 'Please tell us a little about your requirements.'; }
    };
    function setError(field, msg) {
      var el = form.elements[field];
      var box = document.getElementById('err-' + field);
      if (!el || !box) return;
      box.textContent = msg;
      if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    }
    function say(kind, html) {
      status.className = 'notice ' + kind;
      status.innerHTML = html;
    }
    Object.keys(rules).forEach(function (f) {
      form.elements[f].addEventListener('blur', function () {
        if (form.elements[f].hasAttribute('aria-invalid')) setError(f, rules[f](form.elements[f].value.trim()));
      });
    });
    var fallback = 'Please call <a href="tel:+441218190003">0121 819 0003</a> or email <a href="mailto:info@mission4ai.com">info@mission4ai.com</a>.';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = null, data = {};
      Object.keys(rules).forEach(function (f) {
        var v = form.elements[f].value.trim();
        var msg = rules[f](v);
        setError(f, msg);
        if (msg && !first) first = form.elements[f];
        data[f] = v;
      });
      var consent = form.elements.consent;
      var cmsg = consent.checked ? '' : 'Please tick the box so we can reply to your enquiry.';
      setError('consent', cmsg);
      if (cmsg && !first) first = consent;
      if (first) {
        say('bad', 'Please check the highlighted fields and try again.');
        first.focus();
        return;
      }
      data.industry = form.elements.industry.value;
      data.consent = true;
      data.website = form.elements.website.value;      // honeypot, must stay empty
      data.elapsed = Math.round((Date.now() - started) / 1000);
      data.page = location.href;

      if (!endpoint) {
        say('bad', 'Sorry, the form is not available at the moment. ' + fallback);
        return;
      }
      button.disabled = true;
      say('', 'Sending your enquiry…');
      var timer = window.AbortController ? new AbortController() : null;
      var t = timer ? setTimeout(function () { timer.abort(); }, 15000) : null;
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: timer ? timer.signal : undefined
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok === true, status: r.status, body: j }; });
      }).then(function (res) {
        if (t) clearTimeout(t);
        button.disabled = false;
        if (res.ok) {
          track('enquiry_submitted', { industry: data.industry });
          form.reset();
          started = Date.now();
          say('ok', 'Thank you. Your enquiry has been sent and we will be in touch shortly.');
          status.focus();
        } else if (res.status === 429) {
          say('bad', 'We have received several enquiries from you already. ' + fallback);
        } else if (res.status === 400 && res.body && res.body.errors) {
          Object.keys(res.body.errors).forEach(function (f) { setError(f, res.body.errors[f]); });
          say('bad', 'Please check the highlighted fields and try again.');
        } else {
          say('bad', 'Sorry, your enquiry could not be sent. ' + fallback);
        }
      }).catch(function () {
        if (t) clearTimeout(t);
        button.disabled = false;
        say('bad', 'Sorry, your enquiry could not be sent. ' + fallback);
      });
    });
  }
})();
