// Static exploration dialog adapter. Content and game progress belong to the caller.
globalThis.AkashicInspection = {
  create({ root, layers, onClose }) {
    const doc = root.ownerDocument;
    let active = null;
    let opener = null;
    let destroying = false;
    const previousInert = root.inert;
    for (const layer of layers) {
      layer.firstElementChild.setAttribute("role", "dialog");
    }
    const focusOpener = (event) => {
      const button = event.target.closest("button");
      if (button && (root.contains(button) || layers.some((layer) => layer.contains(button)))) {
        button.focus({ preventScroll: true });
      }
    };
    const close = (layer = active) => {
      if (!active || layer !== active) {
        return;
      }
      layer.classList.add("is-hidden");
      active = null;
      root.inert = previousInert;
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
      opener = null;
      if (!destroying) {
        onClose?.(layer);
      }
    };
    const keydown = (event) => {
      if (!active) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        const buttons = [...active.querySelectorAll("button")].filter(
          (button) => !button.disabled && button.getClientRects().length > 0
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    root.addEventListener("click", focusOpener, true);
    for (const layer of layers) {
      layer.addEventListener("click", focusOpener, true);
    }
    doc.addEventListener("keydown", keydown);
    return {
      open(layer) {
        if (!layers.includes(layer)) {
          throw Error("Unknown inspection layer");
        }
        const wasOpen = active === layer;
        if (!active) {
          opener = doc.activeElement;
        }
        for (const other of layers) {
          if (other !== layer) {
            other.classList.add("is-hidden");
          }
        }
        active = layer;
        layer.classList.remove("is-hidden");
        root.inert = true;
        if (
          !wasOpen ||
          !layer.contains(doc.activeElement) ||
          !doc.activeElement.getClientRects().length
        ) {
          layer
            .querySelector("[data-inspection-close], button:last-child")
            .focus({ preventScroll: true });
        }
      },
      close,
      destroy() {
        destroying = true;
        close();
        root.removeEventListener("click", focusOpener, true);
        for (const layer of layers) {
          layer.removeEventListener("click", focusOpener, true);
        }
        doc.removeEventListener("keydown", keydown);
      },
    };
  },
};
