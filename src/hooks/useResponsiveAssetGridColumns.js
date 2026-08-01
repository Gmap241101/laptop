import { useEffect, useState } from 'react';

const getAssetGridColumns = () => {
  if (typeof window === 'undefined') {
    return 1;
  }

  if (window.matchMedia('(min-width: 1280px)').matches) {
    return 3;
  }

  if (window.matchMedia('(min-width: 640px)').matches) {
    return 2;
  }

  return 1;
};

const addMediaQueryListener = (mediaQuery, listener) => {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }

  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
};

export default function useResponsiveAssetGridColumns() {
  const [assetGridColumns, setAssetGridColumns] = useState(getAssetGridColumns);

  useEffect(() => {
    const updateAssetGridColumns = () => {
      setAssetGridColumns((currentColumns) => {
        const nextColumns = getAssetGridColumns();
        return currentColumns === nextColumns ? currentColumns : nextColumns;
      });
    };

    const desktopQuery = window.matchMedia('(min-width: 1280px)');
    const tabletQuery = window.matchMedia('(min-width: 640px)');
    const removeDesktopListener = addMediaQueryListener(
      desktopQuery,
      updateAssetGridColumns
    );
    const removeTabletListener = addMediaQueryListener(
      tabletQuery,
      updateAssetGridColumns
    );

    updateAssetGridColumns();

    return () => {
      removeDesktopListener();
      removeTabletListener();
    };
  }, []);

  return assetGridColumns;
}
