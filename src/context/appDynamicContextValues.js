const APP_DYNAMIC_CONTEXT_GROUP_ORDER = Object.freeze([
  'shared',
  'identity',
  'rental',
  'boards',
  'operations',
  'content',
  'dialogs',
]);

/**
 * 기능별로 나눈 App 동적 컨텍스트 값을 기존 평면 계약으로 병합합니다.
 * 중복 키는 조립 경계 오류이므로 즉시 감지하고, 누락된 그룹은 빈 객체로 처리합니다.
 */
export const mergeAppDynamicContextValueGroups = (groups = {}) => {
  const mergedValues = {};
  const ownerByKey = new Map();
  const supportedGroupNames = new Set(APP_DYNAMIC_CONTEXT_GROUP_ORDER);

  Object.keys(groups).forEach((groupName) => {
    if (!supportedGroupNames.has(groupName)) {
      throw new Error(
        `Unsupported App context value group: "${groupName}".`
      );
    }
  });

  APP_DYNAMIC_CONTEXT_GROUP_ORDER.forEach((groupName) => {
    const groupValues = groups[groupName] || {};

    Object.entries(groupValues).forEach(([key, value]) => {
      const existingOwner = ownerByKey.get(key);
      if (existingOwner) {
        throw new Error(
          `App context value "${key}" is duplicated in "${existingOwner}" and "${groupName}".`
        );
      }

      ownerByKey.set(key, groupName);
      mergedValues[key] = value;
    });
  });

  return mergedValues;
};

export const APP_DYNAMIC_CONTEXT_GROUP_NAMES =
  APP_DYNAMIC_CONTEXT_GROUP_ORDER;
