import { useState } from 'react';

export default function useAppInitializationReadinessController() {
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseLoadErrorMessage, setFirebaseLoadErrorMessage] = useState('');

  return {
    firebaseLoadErrorMessage,
    firebaseReady,
    setFirebaseLoadErrorMessage,
    setFirebaseReady,
  };
}
