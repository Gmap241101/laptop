let activeClerkRuntimeClient = null;
let activeClerkRuntimeSurface = '';

export const setActiveClerkRuntimeClient = (client, surface = '') => {
  if (!client || typeof client !== 'object') {
    throw new Error('A Clerk runtime client is required.');
  }
  activeClerkRuntimeClient = client;
  activeClerkRuntimeSurface = String(surface || '').trim();
  return client;
};

export const getActiveClerkRuntimeClient = () => {
  if (!activeClerkRuntimeClient) {
    const error = new Error('Clerk runtime client has not been initialized for this application surface.');
    error.code = 'clerk_runtime_client_uninitialized';
    throw error;
  }
  return activeClerkRuntimeClient;
};

export const getActiveClerkRuntimeSurface = () => activeClerkRuntimeSurface;
