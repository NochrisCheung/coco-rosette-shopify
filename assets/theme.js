(() => {
  const rootUrl = window.Shopify?.routes?.root || '/';

  const announce = (message) => {
    const liveRegion = document.querySelector('[data-live-region]');
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  };

  const updateCartCount = (itemCount) => {
    document.querySelectorAll('[data-cart-count]').forEach((count) => {
      count.textContent = itemCount;
    });

    document.querySelectorAll('[data-cart-count-description]').forEach((description) => {
      description.textContent = description.dataset.cartCountTemplate.replace('__count__', itemCount);
    });
  };

  class CocoCartError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CocoCartError';
    }
  }

  let cartRequestInFlight = false;
  const cartViews = () => Array.from(document.querySelectorAll('coco-cart-page, coco-cart-drawer'));
  const cartSectionIds = () => cartViews().map((view) => view.dataset.sectionId);
  const setCartLoading = (form, isLoading) => {
    const controls = new Set([
      ...document.querySelectorAll('[data-cart-page-form] button, [data-cart-page-form] input, [data-cart-change-form] button, [data-cart-change-form] input, .coco-cart-drawer__checkout'),
      ...(form?.querySelectorAll('button, input') || [])
    ]);
    controls.forEach((control) => {
      if (isLoading) {
        control.dataset.wasDisabled = String(control.disabled);
        control.disabled = true;
      } else if (control.dataset.wasDisabled !== undefined) {
        control.disabled = control.dataset.wasDisabled === 'true';
        delete control.dataset.wasDisabled;
      }
    });
  };

  const cartFocusTarget = () => {
    const active = document.activeElement;
    if (active?.id) return () => document.getElementById(active.id);
    const buttonAttribute = ['data-cart-page-quantity-button', 'data-quantity-button'].find((name) => active?.hasAttribute(name));
    if (buttonAttribute) {
      const inputId = active.closest('.coco-quantity-input')?.querySelector('input')?.id;
      const selector = `[${buttonAttribute}="${active.getAttribute(buttonAttribute)}"]`;
      return () => document.getElementById(inputId)?.closest('.coco-quantity-input')?.querySelector(selector);
    }
    return () => active?.isConnected ? active : document.querySelector('[data-cart-page-checkout], [data-cart-drawer-trigger]');
  };

  const renderCartSections = (data, errorMessage) => {
    // Validate the entire bundled response before replacing either view.
    const replacements = cartViews().map((view) => {
      const markup = data.sections?.[view.dataset.sectionId];
      if (typeof markup !== 'string') throw new CocoCartError(errorMessage);
      const parsed = new DOMParser().parseFromString(markup, 'text/html');
      const replacement = parsed.querySelector(view.localName);
      if (!replacement || replacement.dataset.sectionId !== view.dataset.sectionId) throw new CocoCartError(errorMessage);
      replacement.querySelectorAll('noscript').forEach((element) => element.remove());
      return { view, replacement };
    });
    const drawer = replacements.find(({ view }) => view.localName === 'coco-cart-drawer');
    const rawCount = drawer?.replacement.dataset.cartItemCount;
    const count = rawCount === undefined ? data.item_count : /^\d+$/.test(rawCount) ? Number(rawCount) : NaN;
    if (!Number.isSafeInteger(count) || count < 0 || (data.item_count !== undefined && data.item_count !== count)) throw new CocoCartError(errorMessage);
    replacements.forEach(({ view, replacement }) => view.renderSection(replacement));
    updateCartCount(count);
  };

  class CocoCartDrawer extends HTMLElement {
    connectedCallback() {
      this.opener = null;
      this.noticeTimer = null;
      this.handleClick = this.handleClick.bind(this);
      this.handleChange = this.handleChange.bind(this);
      this.handleSubmit = this.handleSubmit.bind(this);
      document.addEventListener('click', this.handleClick);
      document.addEventListener('change', this.handleChange);
      document.addEventListener('submit', this.handleSubmit);
      this.setDialog();
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.handleClick);
      document.removeEventListener('change', this.handleChange);
      document.removeEventListener('submit', this.handleSubmit);
      window.clearTimeout(this.noticeTimer);
    }

    setDialog() {
      this.dialog = this.querySelector('[data-cart-drawer]');
      this.status = this.querySelector('[data-cart-drawer-status]');
      this.error = this.querySelector('[data-cart-drawer-error]');
      this.notice = this.querySelector('[data-cart-notice]');
      this.noticeMessage = this.querySelector('[data-cart-notice-message]');

      if (!this.dialog) return;

      this.dialog.addEventListener('click', (event) => {
        if (event.target === this.dialog) this.dialog.close();
      });

      this.dialog.addEventListener('close', () => {
        if (this.opener) this.opener.focus();
        this.opener = null;
      });
    }

    get messages() {
      return {
        addError: this.dataset.addError,
        itemAdded: this.dataset.itemAdded,
        itemRemoved: this.dataset.itemRemoved,
        refreshError: this.dataset.refreshError,
        updateError: this.dataset.updateError,
        updated: this.dataset.updated
      };
    }

    open(opener = null) {
      if (!this.dialog || !('showModal' in this.dialog)) return;
      this.opener = opener || this.opener;
      if (!this.dialog.open) this.dialog.showModal();
    }

    setStatus(message) {
      if (this.status) this.status.textContent = message;
      announce(message);
    }

    showNotice(message) {
      if (!this.notice || !this.noticeMessage) return;
      window.clearTimeout(this.noticeTimer);
      this.noticeMessage.textContent = message;
      this.notice.hidden = false;
      this.notice.dataset.visible = 'true';
      this.noticeTimer = window.setTimeout(() => this.dismissNotice(), 5000);
    }

    dismissNotice() {
      if (!this.notice) return;
      window.clearTimeout(this.noticeTimer);
      delete this.notice.dataset.visible;
      this.notice.hidden = true;
    }

    clearError(form) {
      if (this.error) {
        this.error.hidden = true;
        this.error.textContent = '';
      }
      const formError = form?.querySelector('[data-product-form-error]');
      if (formError) {
        formError.hidden = true;
        formError.textContent = '';
      }
    }

    showError(form, message) {
      if (this.error) {
        this.error.hidden = false;
        this.error.textContent = message;
      }
      const formError = form?.querySelector('[data-product-form-error]');
      if (formError) {
        formError.hidden = false;
        formError.textContent = message;
        formError.focus();
      }
      announce(message);
    }

    renderSection(replacement) {
      const wasOpen = this.dialog?.open;
      this.innerHTML = replacement.innerHTML;
      this.dataset.cartItemCount = replacement.dataset.cartItemCount;
      this.setDialog();
      if (wasOpen) this.open();
    }

    async updateCart(payload) {
      const response = await fetch(`${rootUrl}cart/change.js`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...payload,
          sections: cartSectionIds(),
          sections_url: window.location.pathname
        })
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new CocoCartError(this.messages.updateError);
      }
      if (!response.ok) throw new CocoCartError(data.description || this.messages.updateError);
      return data;
    }

    async addProduct(formData) {
      formData.append('sections', cartSectionIds().join(','));
      formData.append('sections_url', window.location.pathname);

      const response = await fetch(`${rootUrl}cart/add.js`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new CocoCartError(this.messages.addError);
      }
      if (!response.ok) throw new CocoCartError(data.description || this.messages.addError);
      return data;
    }

    async handleCartResult(request, form, successMessage, fallbackError, { openOnSuccess = true, showNotice = false } = {}) {
      if (cartRequestInFlight) return;
      cartRequestInFlight = true;
      const restoreFocus = cartFocusTarget();
      let refreshed = false;
      this.clearError(form);
      setCartLoading(form, true);
      try {
        const data = await request();
        renderCartSections(data, this.messages.refreshError);
        refreshed = true;
        if (openOnSuccess) this.open();
        this.setStatus(successMessage);
        if (showNotice) this.showNotice(successMessage);
      } catch (error) {
        this.showError(form, error instanceof CocoCartError ? error.message : fallbackError);
      } finally {
        setCartLoading(form, false);
        cartRequestInFlight = false;
        if (refreshed) restoreFocus()?.focus({ preventScroll: true });
      }
    }

    handleClick(event) {
      const noticeDismiss = event.target.closest('[data-cart-notice-dismiss]');
      if (noticeDismiss && this.contains(noticeDismiss)) {
        this.dismissNotice();
        return;
      }

      const cartTrigger = event.target.closest('[data-cart-drawer-trigger]');
      if (cartTrigger) {
        if (!this.dialog || !('showModal' in this.dialog)) return;
        event.preventDefault();
        this.open(cartTrigger);
        return;
      }

      const removeLink = event.target.closest('[data-cart-remove]');
      if (removeLink && this.contains(removeLink)) {
        event.preventDefault();
        this.handleCartResult(() => this.updateCart({ id: removeLink.dataset.cartRemove, quantity: 0 }), null, this.messages.itemRemoved, this.messages.updateError);
        return;
      }

      const quantityButton = event.target.closest('[data-quantity-button]');
      if (!quantityButton || !this.contains(quantityButton)) return;

      const form = quantityButton.closest('[data-cart-change-form]');
      const input = form?.querySelector('[name="quantity"]');
      if (!input) return;

      const currentValue = Number.parseInt(input.value, 10) || 0;
      input.value = quantityButton.dataset.quantityButton === 'increase' ? currentValue + 1 : Math.max(0, currentValue - 1);
      form.requestSubmit();
    }

    handleChange(event) {
      const quantityInput = event.target.closest('[data-cart-change-form] [name="quantity"]');
      if (!quantityInput || !this.contains(quantityInput)) return;
      quantityInput.closest('[data-cart-change-form]')?.requestSubmit();
    }

    handleSubmit(event) {
      const productForm = event.target.closest('[data-product-form]');
      if (productForm) {
        if (!this.dialog || !('showModal' in this.dialog)) return;
        if (event.submitter?.dataset.shopifyPaymentButton) return;
        event.preventDefault();
        // Capture native FormData before loading disables its successful controls.
        const formData = new FormData(productForm);
        this.handleCartResult(() => this.addProduct(formData), productForm, this.messages.itemAdded, this.messages.addError, { openOnSuccess: false, showNotice: true });
        return;
      }

      const cartChangeForm = event.target.closest('[data-cart-change-form]');
      if (!cartChangeForm || !this.contains(cartChangeForm)) return;

      event.preventDefault();
      const formData = new FormData(cartChangeForm);
      const quantity = Number.parseInt(formData.get('quantity'), 10);
      this.handleCartResult(() => this.updateCart({ id: formData.get('id'), quantity: Number.isNaN(quantity) ? 0 : quantity }), cartChangeForm, this.messages.updated, this.messages.updateError);
    }
  }

  class CocoCartPage extends HTMLElement {
    connectedCallback() {
      this.handleChange = this.handleChange.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleSubmit = this.handleSubmit.bind(this);
      this.addEventListener('change', this.handleChange);
      this.addEventListener('click', this.handleClick);
      this.addEventListener('keydown', this.handleKeydown);
      this.addEventListener('submit', this.handleSubmit);
      this.setElements();
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.handleChange);
      this.removeEventListener('click', this.handleClick);
      this.removeEventListener('keydown', this.handleKeydown);
      this.removeEventListener('submit', this.handleSubmit);
    }

    get messages() {
      return {
        itemRemoved: this.dataset.itemRemoved,
        updateError: this.dataset.updateError,
        updated: this.dataset.updated
      };
    }

    setElements() {
      this.form = this.querySelector('[data-cart-page-form]');
      this.error = this.querySelector('[data-cart-page-error]');
      this.status = this.querySelector('[data-cart-page-status]');
    }

    setStatus(message) {
      if (this.status) this.status.textContent = message;
      announce(message);
    }

    clearError() {
      if (!this.error) return;
      this.error.hidden = true;
      this.error.textContent = '';
    }

    showError(message) {
      if (this.error) {
        this.error.hidden = false;
        this.error.textContent = message;
      }
      announce(message);
    }

    renderSection(replacement) {
      this.innerHTML = replacement.innerHTML;
      this.setElements();
    }

    async updateLine(id, quantity) {
      const response = await fetch(`${rootUrl}cart/change.js`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id,
          quantity,
          sections: cartSectionIds(),
          sections_url: window.location.pathname
        })
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new CocoCartError(this.messages.updateError);
      }
      if (!response.ok) throw new CocoCartError(data.description || this.messages.updateError);
      return data;
    }

    async handleCartUpdate(request, successMessage) {
      if (cartRequestInFlight) return;
      cartRequestInFlight = true;
      const restoreFocus = cartFocusTarget();
      let refreshed = false;
      this.clearError();
      setCartLoading(null, true);
      try {
        const data = await request();
        renderCartSections(data, this.messages.updateError);
        refreshed = true;
        this.setStatus(successMessage);
      } catch (error) {
        this.showError(error instanceof CocoCartError ? error.message : this.messages.updateError);
      } finally {
        setCartLoading(null, false);
        cartRequestInFlight = false;
        if (refreshed) restoreFocus()?.focus({ preventScroll: true });
      }
    }

    handleChange(event) {
      const quantityInput = event.target.closest('[data-cart-page-quantity]');
      if (!quantityInput || !this.contains(quantityInput)) return;

      const quantity = Number.parseInt(quantityInput.value, 10);
      this.handleCartUpdate(
        () => this.updateLine(quantityInput.dataset.cartLineKey, Number.isNaN(quantity) ? 0 : Math.max(0, quantity)),
        this.messages.updated
      );
    }

    handleKeydown(event) {
      const quantityInput = event.target.closest('[data-cart-page-quantity]');
      if (!quantityInput || !this.contains(quantityInput) || event.key !== 'Enter') return;

      event.preventDefault();
      quantityInput.blur();
    }

    handleClick(event) {
      const removeLink = event.target.closest('[data-cart-page-remove]');
      if (removeLink && this.contains(removeLink)) {
        event.preventDefault();
        this.handleCartUpdate(() => this.updateLine(removeLink.dataset.cartPageRemove, 0), this.messages.itemRemoved);
        return;
      }

      const quantityButton = event.target.closest('[data-cart-page-quantity-button]');
      if (!quantityButton || !this.contains(quantityButton)) return;

      const quantityInput = quantityButton.closest('.coco-quantity-input')?.querySelector('[data-cart-page-quantity]');
      if (!quantityInput) return;

      const currentQuantity = Number.parseInt(quantityInput.value, 10) || 0;
      const quantity = quantityButton.dataset.cartPageQuantityButton === 'increase'
        ? currentQuantity + 1
        : Math.max(0, currentQuantity - 1);
      this.handleCartUpdate(() => this.updateLine(quantityInput.dataset.cartLineKey, quantity), quantity === 0 ? this.messages.itemRemoved : this.messages.updated);
    }

    handleSubmit(event) {
      const form = event.target.closest('[data-cart-page-form]');
      if (!form || !this.contains(form)) return;
      if (event.submitter?.matches('[data-cart-page-checkout]')) return;

      event.preventDefault();
      const quantityInput = form.querySelector('[data-cart-page-quantity]');
      if (!quantityInput) return;
      const quantity = Number.parseInt(quantityInput.value, 10);
      this.handleCartUpdate(
        () => this.updateLine(quantityInput.dataset.cartLineKey, Number.isNaN(quantity) ? 0 : Math.max(0, quantity)),
        this.messages.updated
      );
    }
  }

  class CocoProduct extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('[data-product-form]');
      this.variantInput = this.querySelector('[data-product-variant-id]');
      this.addButton = this.querySelector('[data-product-add-button]');
      this.optionRequest = null;
      this.savedMeasurements = new Map();
      this.handleFormData = this.handleFormData.bind(this);
      this.form?.addEventListener('formdata', this.handleFormData);
      this.handleChange = this.handleChange.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.handleSubmit = this.handleSubmit.bind(this);
      this.addEventListener('change', this.handleChange);
      this.addEventListener('click', this.handleClick);
      this.addEventListener('submit', this.handleSubmit);
      this.enhanceDescriptionDisclosures();
      this.syncCustomSizeMeasurements();
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.handleChange);
      this.removeEventListener('click', this.handleClick);
      this.optionRequest?.abort();
      this.form?.removeEventListener('formdata', this.handleFormData);
      this.removeEventListener('submit', this.handleSubmit);
    }

    get selectedOptionInputs() {
      return Array.from(this.querySelectorAll('[data-product-option] input:checked')).sort(
        (first, second) => {
          const firstPosition = Number.parseInt(
            first.closest('[data-product-option-position]')?.dataset.productOptionPosition || '0',
            10
          );
          const secondPosition = Number.parseInt(
            second.closest('[data-product-option-position]')?.dataset.productOptionPosition || '0',
            10
          );
          return firstPosition - secondPosition;
        }
      );
    }

    enhanceDescriptionDisclosures() {
      const description = this.querySelector('[data-product-description]');
      if (!description || description.dataset.disclosuresEnhanced === 'true') return;

      const headings = Array.from(description.children).filter((element) => element.tagName === 'H2');
      if (headings.length === 0) return;

      headings.forEach((heading) => {
        const content = [];
        let sibling = heading.nextElementSibling;
        while (sibling && sibling.tagName !== 'H2') {
          const nextSibling = sibling.nextElementSibling;
          content.push(sibling);
          sibling = nextSibling;
        }

        const disclosure = document.createElement('details');
        disclosure.className = 'coco-product__description-disclosure';

        const summary = document.createElement('summary');
        summary.textContent = heading.textContent;
        disclosure.append(summary);
        heading.replaceWith(disclosure);
        content.forEach((element) => disclosure.append(element));
      });

      description.dataset.disclosuresEnhanced = 'true';
      description.classList.add('coco-product__description--disclosures');
    }

    handleChange(event) {
      const optionInput = event.target.closest('[data-option-value-id]');
      if (!optionInput) return;

      this.syncCustomSizeMeasurements();

      if (optionInput.dataset.optionProductUrl) {
        window.location.assign(optionInput.dataset.optionProductUrl);
        return;
      }

      this.refreshOptionValues();
    }

    syncCustomSizeMeasurements() {
      const measurements = this.querySelector('[data-custom-size-measurements]');
      if (!measurements) return;

      const isCustomSize = this.selectedOptionInputs.some((input) => input.hasAttribute('data-custom-size-option'));
      measurements.hidden = !isCustomSize;
      measurements.setAttribute('aria-hidden', String(!isCustomSize));
      measurements.querySelectorAll('[data-custom-size-input]').forEach((input) => {
        input.disabled = !isCustomSize;
        input.required = isCustomSize;
      });
    }

    handleClick(event) {
      if (event.target.closest('[data-product-options-retry]')) {
        this.refreshOptionValues();
        return;
      }
      const mediaButton = event.target.closest('[data-product-media-button]');
      if (mediaButton && this.contains(mediaButton)) {
        this.selectMedia(mediaButton.dataset.productMediaButton);
        return;
      }

      const quantityButton = event.target.closest('[data-product-quantity-button]');
      if (!quantityButton || !this.contains(quantityButton)) return;

      const quantityInput = this.querySelector('[data-product-quantity]');
      if (!quantityInput) return;
      const quantity = Number.parseInt(quantityInput.value, 10) || 1;
      quantityInput.value = quantityButton.dataset.productQuantityButton === 'increase' ? quantity + 1 : Math.max(1, quantity - 1);
    }

    selectMedia(mediaId) {
      const selectedId = String(mediaId);
      const mediaItems = this.querySelectorAll('[data-product-media-id]');
      const selectedMedia = Array.from(mediaItems).find((item) => item.dataset.productMediaId === selectedId);
      if (!selectedMedia) return;

      mediaItems.forEach((item) => {
        item.hidden = item !== selectedMedia;
      });
      this.querySelectorAll('[data-product-media-button]').forEach((button) => {
        const isSelected = button.dataset.productMediaButton === selectedId;
        button.classList.toggle('is-active', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
      });
    }

    handleFormData(event) {
      this.querySelectorAll('[data-custom-size-input]:enabled').forEach((input) => {
        if (input.validity.valid) event.formData.set(input.name, input.value.replace(',', '.'));
      });
    }

    handleSubmit(event) {
      if (event.target !== this.form) return;
      if (!this.variantInput?.value || this.addButton?.disabled || this.hasAttribute('aria-busy') || !this.form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    async refreshOptionValues() {
      const optionValueIds = this.selectedOptionInputs.map((input) => input.dataset.optionValueId);
      if (optionValueIds.length === 0 || !this.addButton) return;

      this.optionRequest?.abort();
      const request = new AbortController();
      this.optionRequest = request;
      this.setAttribute('aria-busy', 'true');
      this.addButton.disabled = true;
      // Never submit the previous variant while a different selection is pending.
      this.variantInput.value = '';
      const retry = this.querySelector('[data-product-options-retry]');
      if (retry) retry.hidden = true;
      const formError = this.querySelector('[data-product-form-error]');
      if (formError) formError.hidden = true;

      const url = new URL(this.dataset.productUrl, window.location.origin);
      const currentUrl = new URL(window.location.href);
      for (const [key, value] of currentUrl.searchParams) {
        if (!['variant', 'option_values', 'section_id'].includes(key)) url.searchParams.append(key, value);
      }
      url.searchParams.set('option_values', optionValueIds.join(','));
      const fetchUrl = new URL(url);
      fetchUrl.searchParams.set('section_id', this.dataset.sectionId);

      try {
        const response = await fetch(fetchUrl, { signal: request.signal });
        if (!response.ok) throw new Error(this.dataset.optionRefreshError);
        const markup = await response.text();
        const replacement = new DOMParser().parseFromString(markup, 'text/html').querySelector('coco-product');
        if (!replacement || replacement.dataset.optionIdentityValid !== 'true' || replacement.dataset.productId !== this.dataset.productId) throw new Error(this.dataset.optionRefreshError);
        const echoedSelection = optionValueIds.every((id, index) => (
          replacement.querySelector(`[data-product-option-position="${index + 1}"] input:checked`)?.dataset.optionValueId === id
        ));
        if (!echoedSelection || replacement.querySelectorAll('[data-product-option] input:checked').length !== optionValueIds.length) throw new Error(this.dataset.optionRefreshError);
        if (request.signal.aborted || !this.isConnected) return;
        const focusId = document.activeElement?.id;
        const selectionStart = document.activeElement?.selectionStart;
        const selectionEnd = document.activeElement?.selectionEnd;
        const disclosures = Array.from(this.querySelectorAll('.coco-product__description-disclosure')).map((element) => element.open);
        // Take values immediately before replacement, including typing during the request.
        this.querySelectorAll('[data-custom-size-input]').forEach((input) => this.savedMeasurements.set(input.name, input.value));
        const quantity = this.querySelector('[data-product-quantity]')?.value;
        const measurements = this.savedMeasurements;
        // DOMParser parses with scripting disabled. Do not activate its noscript styles on adoption.
        replacement.querySelectorAll('noscript').forEach((element) => element.remove());
        this.replaceWith(replacement);
        replacement.savedMeasurements = measurements;
        replacement.querySelectorAll('[data-custom-size-input]').forEach((input) => {
          input.value = measurements.get(input.name) || '';
        });
        if (quantity) replacement.querySelector('[data-product-quantity]').value = quantity;
        replacement.querySelectorAll('.coco-product__description-disclosure').forEach((element, index) => { element.open = disclosures[index] === true; });
        const variantId = replacement.querySelector('[data-product-variant-id]')?.value;
        if (variantId) {
          url.searchParams.delete('option_values');
          url.searchParams.set('variant', variantId);
        }
        window.history.replaceState({}, '', url);
        if (focusId) {
          const focused = document.getElementById(focusId);
          focused?.focus({ preventScroll: true });
          if (focused && typeof selectionStart === 'number') focused.setSelectionRange(selectionStart, selectionEnd);
        }
      } catch (error) {
        if (error.name === 'AbortError' || request.signal.aborted) return;
        if (formError) {
          formError.hidden = false;
          formError.textContent = this.dataset.optionRefreshError;
        }
        if (retry) retry.hidden = false;
        announce(this.dataset.optionRefreshError);
      } finally {
        if (this.optionRequest === request) this.removeAttribute('aria-busy');
      }
    }
  }

  const connectMobileNavigation = () => {
    const dialog = document.querySelector('[data-mobile-navigation]');
    const trigger = document.querySelector('[data-mobile-navigation-trigger]');
    const closeTrigger = dialog?.querySelector('[data-mobile-navigation-close]');
    if (!dialog || !trigger || !closeTrigger || !('showModal' in dialog)) return;

    let opener = null;
    let isClosing = false;
    const closeDialog = () => {
      if (!dialog.open || isClosing) return;
      isClosing = true;
      dialog.dataset.closing = 'true';
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
      window.setTimeout(() => dialog.close(), duration);
    };

    trigger.addEventListener('click', () => {
      if (dialog.open || isClosing) return;
      opener = trigger;
      trigger.setAttribute('aria-expanded', 'true');
      dialog.showModal();
    });
    closeTrigger.addEventListener('click', closeDialog);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('close', () => {
      delete dialog.dataset.closing;
      isClosing = false;
      trigger.setAttribute('aria-expanded', 'false');
      opener?.focus();
      opener = null;
    });
  };

  const connectFacetDisclosures = () => {
    document.querySelectorAll('[data-facet-groups]').forEach((groups) => {
      const disclosures = Array.from(groups.querySelectorAll('.coco-facets__group'));
      disclosures.forEach((disclosure) => {
        disclosure.addEventListener('toggle', () => {
          if (!disclosure.open) return;
          disclosures.forEach((otherDisclosure) => {
            if (otherDisclosure !== disclosure) otherDisclosure.open = false;
          });
        });
      });
    });
  };

  const connectFacetSorting = () => {
    document.querySelectorAll('[data-facets-sort]').forEach((sortSelect) => {
      sortSelect.addEventListener('change', () => {
        const form = sortSelect.closest('form');
        if (!form) return;
        form.requestSubmit();
      });
    });
  };

  const connectCookiePreferences = () => {
    document.querySelectorAll('[data-cookie-preferences]').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        window.privacyBanner?.showPreferences();
      });
    });
  };

  const connectLocalisation = () => {
    document.querySelectorAll('[data-localisation]').forEach((controls) => {
      controls.dataset.enhanced = 'true';
      controls.querySelectorAll('form').forEach((form) => {
        form.querySelector('select')?.addEventListener('change', () => form.requestSubmit());
        form.addEventListener('submit', (event) => {
          const hasMeasurements = Array.from(document.querySelectorAll('[data-custom-size-input]')).some((input) => input.value !== '');
          if (hasMeasurements && !window.confirm(controls.dataset.unsavedMessage)) {
            event.preventDefault();
            form.reset();
            return;
          }
          const returnTo = form.querySelector('[name="return_to"]');
          if (returnTo) returnTo.value = `${window.location.pathname}${window.location.search}`;
        });
      });
    });
  };

  if (!customElements.get('coco-cart-drawer')) customElements.define('coco-cart-drawer', CocoCartDrawer);
  if (!customElements.get('coco-cart-page')) customElements.define('coco-cart-page', CocoCartPage);
  if (!customElements.get('coco-product')) customElements.define('coco-product', CocoProduct);
  connectMobileNavigation();
  connectFacetDisclosures();
  connectFacetSorting();
  connectCookiePreferences();
  connectLocalisation();
})();
