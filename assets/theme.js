(() => {
  const rootUrl = window.Shopify?.routes?.root || '/';

  const announce = (message) => {
    const liveRegion = document.querySelector('[data-live-region]');
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  };

  class CocoCartError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CocoCartError';
    }
  }

  class CocoCartDrawer extends HTMLElement {
    connectedCallback() {
      this.opener = null;
      this.handleClick = this.handleClick.bind(this);
      this.handleSubmit = this.handleSubmit.bind(this);
      document.addEventListener('click', this.handleClick);
      document.addEventListener('submit', this.handleSubmit);
      this.setDialog();
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.handleClick);
      document.removeEventListener('submit', this.handleSubmit);
    }

    setDialog() {
      this.dialog = this.querySelector('[data-cart-drawer]');
      this.status = this.querySelector('[data-cart-drawer-status]');
      this.error = this.querySelector('[data-cart-drawer-error]');

      if (!this.dialog) return;

      this.dialog.addEventListener('click', (event) => {
        if (event.target === this.dialog) this.dialog.close();
      });

      this.dialog.addEventListener('close', () => {
        if (this.opener) this.opener.focus();
        this.opener = null;
      });
    }

    get sectionId() {
      return this.dataset.sectionId;
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

    setLoading(form, isLoading) {
      const controls = form?.querySelectorAll('button, input');
      controls?.forEach((control) => {
        if (isLoading) {
          control.dataset.wasDisabled = String(control.disabled);
          control.disabled = true;
          return;
        }
        control.disabled = control.dataset.wasDisabled === 'true';
        delete control.dataset.wasDisabled;
      });
    }

    updateCount(itemCount) {
      document.querySelectorAll('[data-cart-count]').forEach((count) => {
        count.textContent = itemCount;
      });

      document.querySelectorAll('[data-cart-count-description]').forEach((description) => {
        description.textContent = description.dataset.cartCountTemplate.replace('__count__', itemCount);
      });
    }

    renderSection(sectionMarkup) {
      const parsedDocument = new DOMParser().parseFromString(sectionMarkup, 'text/html');
      const replacement = parsedDocument.querySelector('coco-cart-drawer');
      if (!replacement) throw new CocoCartError(this.messages.refreshError);

      this.innerHTML = replacement.innerHTML;
      this.setDialog();
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
          sections: [this.sectionId],
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

    async addProduct(form) {
      const formData = new FormData(form);
      formData.append('sections', this.sectionId);
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

    async handleCartResult(request, form, successMessage, fallbackError) {
      this.clearError(form);
      this.setLoading(form, true);
      try {
        const data = await request;
        const sectionMarkup = data.sections?.[this.sectionId];
        if (!sectionMarkup) throw new CocoCartError(this.messages.refreshError);
        this.renderSection(sectionMarkup);
        this.updateCount(data.item_count);
        this.open();
        this.setStatus(successMessage);
      } catch (error) {
        this.showError(form, error instanceof CocoCartError ? error.message : fallbackError);
      } finally {
        this.setLoading(form, false);
      }
    }

    handleClick(event) {
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
        this.handleCartResult(this.updateCart({ id: removeLink.dataset.cartRemove, quantity: 0 }), null, this.messages.itemRemoved, this.messages.updateError);
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

    handleSubmit(event) {
      const productForm = event.target.closest('[data-product-form]');
      if (productForm) {
        if (!this.dialog || !('showModal' in this.dialog)) return;
        if (event.submitter?.dataset.shopifyPaymentButton) return;
        event.preventDefault();
        this.handleCartResult(this.addProduct(productForm), productForm, this.messages.itemAdded, this.messages.addError);
        return;
      }

      const cartChangeForm = event.target.closest('[data-cart-change-form]');
      if (!cartChangeForm || !this.contains(cartChangeForm)) return;

      event.preventDefault();
      const formData = new FormData(cartChangeForm);
      const quantity = Number.parseInt(formData.get('quantity'), 10);
      this.handleCartResult(this.updateCart({ id: formData.get('id'), quantity: Number.isNaN(quantity) ? 0 : quantity }), cartChangeForm, this.messages.updated, this.messages.updateError);
    }
  }

  class CocoProduct extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('[data-product-form]');
      this.variantInput = this.querySelector('[data-product-variant-id]');
      this.price = this.querySelector('[data-product-price]');
      this.availability = this.querySelector('[data-product-availability]');
      this.addButton = this.querySelector('[data-product-add-button]');
      this.variantData = this.querySelector('[data-product-variants]');
      this.variants = this.variantData ? JSON.parse(this.variantData.textContent) : [];
      this.handleChange = this.handleChange.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.addEventListener('change', this.handleChange);
      this.addEventListener('click', this.handleClick);
      this.enhanceDescriptionDisclosures();
      this.syncCustomSizeMeasurements();
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.handleChange);
      this.removeEventListener('click', this.handleClick);
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

    get selectedOptionNames() {
      return this.selectedOptionInputs.map((input) => input.value);
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

      if (this.dataset.usesServerOptionRefresh === 'true') {
        this.refreshOptionValues();
        return;
      }

      const variant = this.variants.find((candidate) => candidate.options.every((option, index) => option === this.selectedOptionNames[index]));
      this.updateVariant(variant);
    }

    syncCustomSizeMeasurements() {
      const measurements = this.querySelector('[data-custom-size-measurements]');
      if (!measurements) return;

      const selectedSize = this.selectedOptionInputs.find((input) => (
        input.closest('[data-product-option-name]')?.dataset.productOptionName === 'size'
      ));
      const isCustomSize = selectedSize?.value.trim().toLocaleLowerCase() === 'custom size';
      measurements.hidden = !isCustomSize;
      measurements.setAttribute('aria-hidden', String(!isCustomSize));
      measurements.querySelectorAll('[data-custom-size-input]').forEach((input) => {
        input.disabled = !isCustomSize;
        input.required = isCustomSize;
      });
    }

    handleClick(event) {
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

    renderPrice(variant) {
      if (!this.price) return;

      const price = document.createElement('p');
      price.className = `coco-price${variant.compareAtPrice ? ' coco-price--sale' : ''}`;

      if (variant.compareAtPrice) {
        const compareAtPrice = document.createElement('s');
        compareAtPrice.className = 'coco-price__compare';
        compareAtPrice.textContent = variant.compareAtPrice;
        price.append(compareAtPrice);
      }

      const currentPrice = document.createElement('span');
      currentPrice.className = 'coco-price__current';
      currentPrice.textContent = variant.price;
      price.append(currentPrice);

      this.price.replaceChildren(price);
    }

    updateVariant(variant) {
      if (!variant) {
        this.variantInput.value = '';
        this.addButton.disabled = true;
        this.addButton.textContent = this.addButton.dataset.unavailableLabel;
        this.availability.textContent = this.addButton.dataset.unavailableLabel;
        return;
      }

      this.variantInput.value = variant.id;
      this.addButton.disabled = !variant.available;
      this.addButton.textContent = variant.available ? this.addButton.dataset.addLabel : this.addButton.dataset.soldOutLabel;
      this.availability.textContent = variant.available ? '' : this.addButton.dataset.soldOutLabel;
      this.renderPrice(variant);

      if (variant.featuredMediaId) this.selectMedia(variant.featuredMediaId);

      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url);
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

    async refreshOptionValues() {
      const optionValueIds = this.selectedOptionInputs.map((input) => input.dataset.optionValueId);
      if (optionValueIds.length === 0) return;

      const url = new URL(this.dataset.productUrl, window.location.origin);
      url.searchParams.set('option_values', optionValueIds.join(','));

      try {
        const response = await fetch(`${url.pathname}${url.search}&section_id=${this.dataset.sectionId}`);
        if (!response.ok) throw new Error(this.dataset.optionRefreshError);
        const markup = await response.text();
        const replacement = new DOMParser().parseFromString(markup, 'text/html').querySelector('coco-product');
        if (!replacement) throw new Error(this.dataset.optionRefreshError);
        this.outerHTML = replacement.outerHTML;
        window.history.replaceState({}, '', url);
      } catch {
        announce(this.dataset.optionRefreshError);
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

  if (!customElements.get('coco-cart-drawer')) customElements.define('coco-cart-drawer', CocoCartDrawer);
  if (!customElements.get('coco-product')) customElements.define('coco-product', CocoProduct);
  connectMobileNavigation();
  connectFacetDisclosures();
})();
