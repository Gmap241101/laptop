import { useState } from 'react';

import { STATUS } from '../../constants/appConstants.js';
import useResponsiveAssetGridColumns from '../../hooks/useResponsiveAssetGridColumns.js';

export default function useAssetCatalogViewController() {
  const [query, setQuery] = useState('');
  const [selectedAssetCategory, setSelectedAssetCategory] = useState('전체');
  const [availabilityFilter, setAvailabilityFilter] = useState(STATUS.AVAILABLE);
  const [adminLaptopQuery, setAdminLaptopQuery] = useState('');
  const [adminSelectedAssetCategory, setAdminSelectedAssetCategory] = useState('전체');
  const [adminAvailabilityFilter, setAdminAvailabilityFilter] = useState('전체');
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const assetGridColumns = useResponsiveAssetGridColumns();

  return {
    adminAvailabilityFilter,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    assetGridColumns,
    availabilityFilter,
    query,
    selectedAssetCategory,
    setAdminAvailabilityFilter,
    setAdminLaptopQuery,
    setAdminSelectedAssetCategory,
    setAvailabilityFilter,
    setQuery,
    setSelectedAssetCategory,
    setShowUploadPanel,
    showUploadPanel,
  };
}
