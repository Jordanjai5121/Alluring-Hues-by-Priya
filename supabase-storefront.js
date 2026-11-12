/* Alluring Hues by Priya — Supabase storefront bridge.
   Uses only the public publishable/anon key. RLS remains the security boundary. */
(function () {
  'use strict';
  var config = window.AHP_SUPABASE_CONFIG || {};
  if (!window.supabase || !config.url || !config.anonKey ||
      config.anonKey.indexOf('PASTE_YOUR_') === 0) {
    console.warn('Alluring Hues: Supabase storefront configuration is missing.');
    return;
  }

  var client = window.supabase.createClient(config.url, config.anonKey);
  window.AHP_SUPABASE = client;

  function notify(message) {
    if (typeof toast === 'function') toast(message);
    else console.log(message);
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
  }
  function fieldValue(id) {
    var node = document.getElementById(id);
    return node ? node.value.trim() : '';
  }
  function setFieldError(id, message) {
    var node = document.getElementById(id);
    if (!node) return;
    var box = node.parentElement && node.parentElement.querySelector('.err');
    if (box) box.textContent = message || '';
  }
  function validName(value) { return value.length >= 2 && value.length <= 80; }
  function validPhone(value) { return value.length >= 5 && value.length <= 20; }
  function validOptionalMobile(value) { return !value || /^\+?[\d\s-]{7,16}$/.test(value); }
  function sendWhatsApp(message) {
    if (typeof wa === 'function') wa(message);
    else window.open('https://wa.me/918883412455?text=' + encodeURIComponent(message), '_blank', 'noopener');
  }
  async function saveEnquiry(name, contact, type, message) {
    var result = await client.from('enquiries').insert({
      name: name.slice(0, 80),
      contact: (contact || 'Not provided').slice(0, 120),
      enquiry_type: type,
      message: message.slice(0, 2000),
      status: 'new'
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function loadCatalog() {
    try {
      var results = await Promise.all([
        client.from('categories')
          .select('id,name,slug,sort_order,is_active')
          .eq('is_active', true)
          .order('sort_order', {ascending: true}),
        client.from('products')
          .select('id,category_id,name,slug,description,price,price_on_request,image_url,is_active,is_featured,created_at')
          .eq('is_active', true)
          .order('created_at', {ascending: false}),
        client.rpc('catalog_has_products')
      ]);
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;

      var categoryRows = results[0].data || [];
      var productRows = results[1].data || [];
      var hasAnyProducts = results[2].data === true;
      var categoryNames = {};
      categoryRows.forEach(function (category) {
        categoryNames[category.id] = category.name;
      });

      if (categoryRows.length) {
        var oldDescriptions = {};
        CATS.forEach(function (category) { oldDescriptions[category[0]] = category[1]; });
        CATS.splice.apply(CATS, [0, CATS.length].concat(categoryRows.map(function (category) {
          return [category.name, oldDescriptions[category.name] || 'Explore handmade creations and personalised gifts.'];
        })));
        syncCategoryUI();
      }

      /* Once the owner has added any Supabase products, Supabase becomes the
         source of truth. Hidden products remain in Admin but are excluded here.
         If the table is still empty, keep the original sample catalogue. */
      if (hasAnyProducts || productRows.length) {
        BASE.splice(0, BASE.length);
        DBP = productRows.filter(function (product) { return product.is_active === true; })
          .map(function (product) {
            var image = product.image_url || '';
            return {
              id: product.id,
              name: product.name,
              cat: categoryNames[product.category_id] || 'Uncategorised',
              img: image,
              imgs: image ? [image] : [],
              desc: product.description || 'Handmade with care by Alluring Hues by Priya.',
              colors: '',
              shown: '',
              price: product.price_on_request ? null : product.price,
              salePrice: null,
              saleLabel: '',
              mode: product.price_on_request ? 'enquiry' : 'price',
              custom: true,
              featured: !!product.is_featured,
              active: true,
              slug: product.slug
            };
          });
        mergeP();
        cart = cart.filter(function (item) { return P.some(function (product) { return product.id === item.id; }); });
        if (typeof save === 'function') save();
        if (typeof drawCart === 'function') drawCart();
      } else if (categoryRows.length) {
        render();
      }
      window.AHP_CATALOG_LOADED = true;
    } catch (error) {
      console.error('Alluring Hues catalogue load failed:', error);
      notify('Could not load the live product catalogue. Please refresh or contact the store.');
    }
  }

  function syncCategoryUI() {
    var categoryGrid = document.getElementById('cats');
    var filter = document.getElementById('fc');
    if (categoryGrid) {
      categoryGrid.innerHTML = CATS.map(function (category, index) {
        return '<article class="card"><div style="font-size:2rem;color:var(--gold)">✿</div>' +
          '<h3>' + escapeHtml(category[0]) + '</h3><p>' + escapeHtml(category[1]) + '</p>' +
          '<div class="row"><button class="btn sm" data-cat="' + index + '">Explore Collection</button>' +
          '<button class="btn o sm" data-ec="' + index + '">Enquire Now</button></div></article>';
      }).join('');
    }
    if (filter) {
      filter.innerHTML = '<option value="">All categories</option>' + CATS.map(function (category) {
        return '<option value="' + escapeHtml(category[0]) + '">' + escapeHtml(category[0]) + '</option>';
      }).join('');
    }
  }

  async function submitOrder(form) {
    var name = fieldValue('bn');
    var phone = fieldValue('bp');
    var city = fieldValue('bc');
    var address = fieldValue('ba');
    var notes = fieldValue('br');
    setFieldError('bn', validName(name) ? '' : 'Enter your name (2–80 characters).');
    setFieldError('bp', validPhone(phone) ? '' : 'Enter a valid contact number.');
    setFieldError('bc', city ? '' : 'Enter your city or area.');
    setFieldError('ba', address.length >= 6 ? '' : 'Enter your delivery address.');
    if (!validName(name) || !validPhone(phone) || !city || address.length < 6) return;

    var selected = Array.isArray(BI) ? BI.slice() : [];
    if (!selected.length) {
      notify('Your cart is empty. Add a product first.');
      return;
    }
    var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    var orderItems = [];
    var displayItems = [];
    selected.forEach(function (item) {
      var product = P.find(function (candidate) { return candidate.id === item.id; });
      if (!product) return;
      orderItems.push({
        product_id: uuidPattern.test(product.id) ? product.id : null,
        product_name: product.name,
        quantity: Number(item.qty)
      });
      displayItems.push({
        id: product.slug || product.id,
        name: product.name,
        qty: Number(item.qty),
        price: typeof unit === 'function' ? (unit(product) || null) : null
      });
    });
    if (!orderItems.length) {
      notify('The selected products could not be identified. Refresh the shop and try again.');
      return;
    }

    var orderNumber = typeof oid === 'function' ? oid() : ('AHO-' + Math.random().toString(36).slice(2, 8).toUpperCase());
    var button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Saving order…'; }

    try {
      var result = await client.rpc('place_order', {
        p_order_number: orderNumber,
        p_customer_name: name,
        p_phone: phone,
        p_email: null,
        p_delivery_city: city,
        p_delivery_address: address,
        p_notes: notes,
        p_items: orderItems
      });
      if (result.error) throw result.error;

      LASTO = {
        id: orderNumber,
        saved: true,
        items: displayItems,
        name: name,
        phone: phone,
        city: city,
        addr: address,
        note: notes,
        at: Date.now()
      };
      cart = [];
      if (typeof save === 'function') save();
      if (typeof drawCart === 'function') drawCart();
      BFC = false;
      BI = [];
      document.getElementById('bdb').innerHTML =
        '<h2>Order placed successfully</h2>' +
        '<p>Your order has been saved to the store admin.</p>' +
        '<p>Order ID: <strong>' + escapeHtml(orderNumber) + '</strong></p>' +
        '<p class="note">The seller will confirm availability, final price and delivery details.</p>' +
        '<div class="row"><button class="btn wa" type="button" data-wo="1">Send order details on WhatsApp</button></div>';
      notify('Order saved. It is now available in Admin → Orders.');
    } catch (error) {
      console.error('Order save failed:', error);
      notify('Order was NOT saved: ' + (error.message || 'Please check Supabase setup.'));
      if (button) { button.disabled = false; button.textContent = 'Place order'; }
    }
  }

  async function submitCartEnquiry() {
    var name = fieldValue('kn');
    var phone = fieldValue('kc');
    var city = fieldValue('kl');
    var notes = fieldValue('kr');
    if (!validName(name) || !city) {
      notify('Enter your name and delivery city / area.');
      return;
    }
    if (!validOptionalMobile(phone)) {
      notify('Enter a valid contact number or leave it empty.');
      return;
    }
    if (!Array.isArray(cart) || !cart.length) {
      notify('Your cart is empty. Add a product first.');
      return;
    }
    var lines = cart.map(function (item, index) {
      var product = P.find(function (candidate) { return candidate.id === item.id; });
      return (index + 1) + '. ' + (product ? product.name : 'Product') + ' × ' + item.qty;
    }).join('\n');
    var message = 'Product enquiry\n' + lines +
      '\nDelivery city / area: ' + city +
      '\nCustomisation: ' + (notes || 'None');
    var whatsapp = 'Hello Alluring Hues by Priya!\n\nI would like to enquire about:\n' + lines +
      '\n\nName: ' + name + '\nContact: ' + (phone || 'Not provided') +
      '\nDelivery city / area: ' + city + '\nCustomisation: ' + (notes || 'None') +
      '\n\nPlease confirm availability, final price and delivery charges.';
    sendWhatsApp(whatsapp);
    try {
      await saveEnquiry(name, phone, 'Product Enquiry', message);
      notify('Product enquiry saved in Admin → Enquiries.');
    } catch (error) {
      console.error('Product enquiry save failed:', error);
      notify('WhatsApp opened, but the enquiry was NOT saved: ' + (error.message || 'Supabase error.'));
    }
  }

  async function submitCustomEnquiry() {
    var name = fieldValue('cn');
    var phone = fieldValue('cc');
    var idea = fieldValue('ct');
    setFieldError('cn', validName(name) ? '' : 'Enter your name.');
    if (!validName(name)) return;
    if (!idea || idea.length < 5) {
      notify('Please describe your custom order idea (at least 5 characters).');
      return;
    }
    if (!validOptionalMobile(phone)) {
      notify('Enter a valid contact number or leave it empty.');
      return;
    }
    var message = 'Custom order request: ' + idea;
    sendWhatsApp('Hello Alluring Hues by Priya!\n\nI would like to request a custom order.\n\nName: ' +
      name + '\nContact: ' + (phone || 'Not provided') + '\nIdea: ' + idea +
      '\n\nPlease confirm availability, final pricing and making time.\n\nThank you!');
    try {
      await saveEnquiry(name, phone, 'Custom Order', message);
      notify('Custom order enquiry saved in Admin → Enquiries.');
    } catch (error) {
      console.error('Custom enquiry save failed:', error);
      notify('WhatsApp opened, but the enquiry was NOT saved: ' + (error.message || 'Supabase error.'));
    }
  }

  async function submitGeneralEnquiry() {
    var name = fieldValue('en');
    var message = fieldValue('em');
    setFieldError('en', validName(name) ? '' : 'Enter your name.');
    setFieldError('em', message.length >= 5 ? '' : 'Write a short message.');
    if (!validName(name) || message.length < 5) return;
    sendWhatsApp('Hello Alluring Hues by Priya!\n\nName: ' + name + '\n' + message);
    try {
      await saveEnquiry(name, 'Not provided', 'General Enquiry', message);
      notify('Enquiry saved in Admin → Enquiries.');
    } catch (error) {
      console.error('General enquiry save failed:', error);
      notify('WhatsApp opened, but the enquiry was NOT saved: ' + (error.message || 'Supabase error.'));
    }
  }

  /* Capture submits before the older WhatsApp-only handlers run. */
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.id) return;
    var handler = form.id === 'bf' ? submitOrder :
      form.id === 'kf' ? submitCartEnquiry :
      form.id === 'cf' ? submitCustomEnquiry :
      form.id === 'ef' ? submitGeneralEnquiry : null;
    if (!handler) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    Promise.resolve(handler(form)).catch(function (error) {
      console.error('Storefront form failed:', error);
      notify(error.message || 'Could not submit this request.');
    });
  }, true);

  /* Save direct product/category/workshop WhatsApp enquiries as well. */
  document.addEventListener('click', function (event) {
    var productButton = event.target.closest('[data-e]');
    if (productButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var product = P.find(function (candidate) { return candidate.id === productButton.dataset.e; });
      if (product) {
        var text = 'Product enquiry: ' + product.name + ' (' + (product.slug || product.id) + '). Quantity: 1.';
        sendWhatsApp('Hello Alluring Hues by Priya!\n\nI am interested in ' + product.name +
          '. Please share available designs, colours, final price and delivery details.\n\nThank you!');
        saveEnquiry('Website visitor', 'Not provided', 'Product Enquiry', text)
          .then(function () { notify('Product enquiry saved in Admin → Enquiries.'); })
          .catch(function (error) {
            console.error('Direct product enquiry save failed:', error);
            notify('WhatsApp opened, but the enquiry was NOT saved: ' + (error.message || 'Supabase error.'));
          });
      }
      return;
    }

    var categoryButton = event.target.closest('[data-ec]');
    if (categoryButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var category = CATS[Number(categoryButton.dataset.ec)];
      if (category) {
        var text = 'Customer is interested in the ' + category[0] + ' collection.';
        sendWhatsApp('Hello Alluring Hues by Priya!\n\nI would like to enquire about: ' +
          category[0] + '. Please share available designs and details.\n\nThank you!');
        saveEnquiry('Website visitor', 'Not provided', 'Category Enquiry', text)
          .then(function () { notify('Category enquiry saved in Admin → Enquiries.'); })
          .catch(function (error) {
            console.error('Category enquiry save failed:', error);
            notify('WhatsApp opened, but the enquiry was NOT saved: ' + (error.message || 'Supabase error.'));
          });
      }
      return;
    }

    var genericLink = event.target.closest('[data-wa]');
    if (genericLink) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var message = genericLink.dataset.wa || 'Website enquiry';
      sendWhatsApp(message);
      saveEnquiry('Website visitor', 'Not provided', 'Website Enquiry', message)
        .then(function () { notify('Enquiry saved in Admin → Enquiries.'); })
        .catch(function (error) {
          console.error('Website enquiry save failed:', error);
          notify('WhatsApp opened, but the enquiry was NOT saved: ' + (error.message || 'Supabase error.'));
        });
    }
  }, true);

  /* Track AHO order references against the Supabase orders table. */
  showStatus = async function (orderNumber, element) {
    try {
      var result = await client.from('orders')
        .select('order_number,status,created_at')
        .eq('order_number', orderNumber)
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        element.innerHTML = '<p class="note">No order was found for ' + escapeHtml(orderNumber) + '.</p>';
        return;
      }
      var labels = {
        new: 'Placed',
        confirmed: 'Confirmed',
        processing: 'In making',
        shipped: 'Dispatched',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
      };
      var status = labels[result.data.status] || 'Placed';
      element.innerHTML = typeof tlh === 'function'
        ? tlh(orderNumber, {status: status, at: result.data.created_at})
        : '<p>Order ' + escapeHtml(orderNumber) + ': ' + escapeHtml(status) + '</p>';
    } catch (error) {
      console.error('Order tracking failed:', error);
      element.innerHTML = '<p class="err">Could not check this order. Please try again.</p>';
    }
  };

  loadCatalog();
})();