import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { t } from './i18n/index.js';

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

const started = application.start();

started.catch((error) => {
  console.error("God's Eye View initialization failed:", error);
  const loaderStatus = document.querySelector('#loading-screen .loader-status');
  loaderStatus.textContent = t('Error: {message}', {
    message: describeError(error),
  });
  loaderStatus.style.color = '#ff4444';
});

// The Anysee intel platform rides on the running globe. It loads after the
// scene, and a failure here is logged without touching the base app.
started
  .then(
    async (components) => {
      const { mountIntel } = await import('./intel/index.js');
      mountIntel({ viewer: components.scene.viewer });
    },
    () => {},
  )
  .catch((error) => console.error('Anysee intel failed to mount:', error));

export { application };
