export const LION_REACTION_DURATIONS = Object.freeze({
  YES: 600,
  NO: 900,
  IRRELEVANT: 900,
});

export const LION_REACTION_ASSETS = Object.freeze({
  YES: './assets/characters/hon-lion-yes.png?v=20261020reaction',
  NO: './assets/characters/hon-lion-no-quiet.png?v=20261020reaction',
  IRRELEVANT: './assets/characters/hon-lion-irrelevant-round.png?v=20261020reaction',
});

export const LION_REACTION_BY_CHOICE = Object.freeze({
  YES: 'YES',
  NO: 'NO',
  IRRELEVANT: 'IRRELEVANT',
  PARTIAL: 'YES',
  SOLVED: 'YES',
  NEEDS_CLARIFICATION: 'IRRELEVANT',
});

/**
 * Owns the transient reaction sprite lifecycle. The preload image gets one
 * load/error listener for its entire lifetime; a pending activation is a
 * value replaced by the latest answer, so repeated answers never accumulate
 * listeners and a late load cannot resurrect a cleared reaction.
 */
export function createLionReactions({
  button,
  image,
  documentRef,
  idleSrc,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  const assets = new Map(Object.entries(LION_REACTION_ASSETS).map(([reaction, src]) => [reaction, {
    src,
    loaded: null,
    node: null,
    activation: null,
  }]));
  let token = 0;
  let timer = 0;

  const clearTimer = () => {
    clearTimeoutFn(timer);
    timer = 0;
  };

  const clear = () => {
    token += 1;
    clearTimer();
    for (const asset of assets.values()) asset.activation = null;
    button?.removeAttribute('data-reaction');
    button?.style?.removeProperty('--lion-reaction-duration');
    if (image) image.src = idleSrc;
  };

  const activate = (reaction, asset, activationToken) => {
    if (activationToken !== token || button?.hidden || asset.loaded !== true) return;
    image.src = asset.src;
    // Flush the idle state so an immediate identical reply restarts its CSS keyframes.
    void image.offsetWidth;
    button.setAttribute('data-reaction', reaction.toLowerCase());
    button.style?.setProperty('--lion-reaction-duration', `${LION_REACTION_DURATIONS[reaction]}ms`);
    clearTimer();
    timer = setTimeoutFn(() => {
      if (activationToken === token) clear();
    }, LION_REACTION_DURATIONS[reaction]);
  };

  const preload = () => {
    for (const [reaction, asset] of assets) {
      if (asset.node) continue;
      const preloadImage = documentRef.createElement('img');
      asset.node = preloadImage;
      preloadImage.decoding = 'async';
      preloadImage.addEventListener('load', () => {
        asset.loaded = true;
        const activation = asset.activation;
        asset.activation = null;
        if (activation) activate(reaction, asset, activation.token);
      }, { once: true });
      preloadImage.addEventListener('error', () => {
        asset.loaded = false;
        asset.activation = null;
      }, { once: true });
      preloadImage.src = asset.src;
      if (preloadImage.complete) asset.loaded = preloadImage.naturalWidth > 0;
    }
  };

  const show = (choice) => {
    const reaction = LION_REACTION_BY_CHOICE[choice];
    clear();
    if (!reaction || button?.hidden) return;
    const asset = assets.get(reaction);
    if (!asset || asset.loaded === false) return;
    const activation = { token };
    if (asset.loaded === true) {
      activate(reaction, asset, activation.token);
    } else {
      // Preload installed the sole listener. Replace only the pending value.
      asset.activation = activation;
    }
  };

  return Object.freeze({ clear, preload, show });
}
