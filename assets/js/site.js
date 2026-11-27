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

  // Web call: talk to Maya in the browser. Retell's files load only when the visitor starts a call.
  var wc = document.getElementById('webcall');
  if (wc && wc.showModal) {
    var wcCall = null, wcClient = null, wcLibs = null, wcTimer = null, wcStarted = 0, wcBusy = false;
    var wcMax = (parseInt(wc.getAttribute('data-max'), 10) || 10) * 60;
    var $ = function (sel) { return wc.querySelector(sel); };
    var show = function (step) {
      ['intro', 'live', 'done'].forEach(function (s) { $('[data-wc-step="' + s + '"]').hidden = s !== step; });
      wc.classList.remove('is-live');
    };
    var loadLibs = function () {
      if (wcLibs) return wcLibs;
      wcLibs = wc.getAttribute('data-libs').split(',').reduce(function (chain, src) {
        return chain.then(function () {
          return new Promise(function (ok, fail) {
            var s = document.createElement('script');
            s.src = src; s.onload = ok; s.onerror = function () { fail(new Error('load')); };
            document.head.appendChild(s);
          }).then(function () {
            // Retell's file looks for these two names.
            if (window.EventEmitter3 && !window.eventemitter3) window.eventemitter3 = window.EventEmitter3;
            if (window.LivekitClient && !window.livekitClient) window.livekitClient = window.LivekitClient;
          });
        });
      }, Promise.resolve());
      wcLibs.catch(function () { wcLibs = null; });
      return wcLibs;
    };
    var stopClock = function () { if (wcTimer) { clearInterval(wcTimer); wcTimer = null; } };
    var finish = function (message) {
      if (!wcCall && !wcBusy) return;
      var secs = wcStarted ? Math.round((Date.now() - wcStarted) / 1000) : 0;
      stopClock(); wcCall = null; wcBusy = false; wcStarted = 0;
      $('[data-wc-done]').innerHTML = message || 'The call has ended. Thank you for speaking to Maya.';
      show('done');
      track('web_call_ended', { seconds: secs });
    };
    var callInstead = ' You can also call <a href="tel:+441218190003">0121 819 0003</a>.';
    var start = function () {
      if (wcBusy || wcCall) return;
      wcBusy = true;
      show('live');
      $('[data-wc-status]').textContent = 'Connecting…';
      $('[data-wc-hint]').textContent = 'Please allow the microphone if your browser asks.';
      $('[data-wc-time]').textContent = '0:00';
      $('[data-wc-mute]').setAttribute('aria-pressed', 'false');
      $('[data-wc-mute]').textContent = 'Mute';
      if (!navigator.mediaDevices || !window.isSecureContext) {
        finish('Sorry, this browser cannot make a web call.' + callInstead);
        return;
      }
      track('web_call_started', {});
      loadLibs().then(function () {
        if (!wcBusy) return;                       // closed while loading
        var sdk = window.retellClientJsSdk;
        wcClient = wcClient || new sdk.RetellClient({ key: wc.getAttribute('data-key') });
        var failed = false;
        wcCall = wcClient.createWebCall({
          agent_id: wc.getAttribute('data-agent'),
          metadata: { source: 'website', page: location.pathname },
          hooks: {
            onStatus: function (status) {
              if (status === 'live') {
                wcStarted = Date.now();
                wc.classList.add('is-live');
                $('[data-wc-status]').textContent = 'You are connected to Maya';
                $('[data-wc-hint]').textContent = 'Speak normally. Press End call when you have finished.';
                stopClock();
                wcTimer = setInterval(function () {
                  var s = Math.round((Date.now() - wcStarted) / 1000);
                  $('[data-wc-time]').textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
                  if (s >= wcMax && wcCall) wcCall.end();
                }, 1000);
              }
            },
            onError: function (err) {
              failed = true;
              var text = String((err && (err.name + ' ' + err.message)) || '').toLowerCase();
              var mic = /notallowed|permission|denied|notfound|microphone|device/.test(text);
              finish((mic ? 'We could not use your microphone. Please allow it in your browser and try again.'
                          : 'Sorry, the call could not be connected.') + callInstead);
            },
            onEnd: function () { if (!failed) finish(); }
          }
        });
      }).catch(function () {
        finish('Sorry, the call could not be started.' + callInstead);
      });
    };
    var hangUp = function () {
      var c = wcCall;
      if (c && c.end) { try { Promise.resolve(c.end()).catch(function () {}); } catch (e) {} }
      if (wcBusy || wcCall) finish();
    };
    document.querySelectorAll('[data-webcall]').forEach(function (b) {
      b.addEventListener('click', function () {
        track('web_call_cta_click', { location: b.getAttribute('data-cta') || '' });
        if (!wcCall && !wcBusy) show('intro');
        wc.showModal();
      });
    });
    wc.querySelectorAll('[data-wc-start]').forEach(function (b) { b.addEventListener('click', start); });
    $('[data-wc-end]').addEventListener('click', hangUp);
    $('[data-wc-mute]').addEventListener('click', function () {
      if (!wcCall) return;
      var on = this.getAttribute('aria-pressed') !== 'true';
      try { if (on) wcCall.mute(); else wcCall.unmute(); } catch (e) { return; }
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      this.textContent = on ? 'Unmute' : 'Mute';
    });
    $('[data-wc-close]').addEventListener('click', function () { wc.close(); });
    wc.addEventListener('close', function () { if (wcCall || wcBusy) { hangUp(); show('intro'); } });
    window.addEventListener('pagehide', function () { if (wcCall && wcCall.end) { try { wcCall.end(); } catch (e) {} } });
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
