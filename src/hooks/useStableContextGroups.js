import { useRef } from 'react';

const EVENT_HANDLER_PREFIX = /^(add|apply|authenticate|cancel|close|confirm|create|delete|discard|dismiss|finalize|goTo|handle|import|logout|move|open|push|refresh|register|restore|review|run|save|send|set|start|submit|toggle|trigger|update)/;

const shouldStabilizeFunction = (key, value) =>
  typeof value === 'function' &&
  !/^[A-Z]/.test(key) &&
  EVENT_HANDLER_PREFIX.test(key);

const isSameSlice = (previousSlice, nextValues, keys) => {
  if (!previousSlice) return false;

  return keys.every(
    (key) => Object.is(previousSlice[key], nextValues[key])
  );
};

/**
 * App.jsx가 매 렌더링마다 새 상태 객체를 만들더라도 화면별로 실제 값이
 * 바뀐 컨텍스트 조각만 새 객체로 교체합니다. 변경되지 않은 조각은 이전
 * 참조를 유지하므로 React.memo가 불필요한 하위 렌더링을 건너뛸 수 있습니다.
 *
 * App 내부에서 매 렌더링마다 다시 만들어지는 이벤트 함수는 최신 구현을
 * 호출하는 안정된 프록시로 전달합니다. 표시 계산 중 직접 호출되는 formatter,
 * getter, renderer 및 대문자로 시작하는 React 컴포넌트는 원래 참조를 유지합니다.
 */
export default function useStableContextGroups(source, groupDefinitions) {
  const previousGroupsRef = useRef({});
  const functionProxyRef = useRef(new Map());
  const nextGroups = {};

  const getStableValue = (path, key, value) => {
    if (!shouldStabilizeFunction(key, value)) return value;

    let entry = functionProxyRef.current.get(path);
    if (!entry) {
      entry = {
        current: value,
        proxy: null,
      };
      entry.proxy = function stableContextEventHandler(...args) {
        return entry.current.apply(this, args);
      };
      functionProxyRef.current.set(path, entry);
    }

    entry.current = value;
    return entry.proxy;
  };

  Object.entries(groupDefinitions).forEach(([groupName, sliceDefinitions]) => {
    const previousGroup = previousGroupsRef.current[groupName] || {};
    const nextGroup = {};
    let groupChanged = false;

    Object.entries(sliceDefinitions).forEach(([sliceName, keys]) => {
      const nextValues = {};
      keys.forEach((key) => {
        nextValues[key] = getStableValue(
          `${groupName}.${sliceName}.${key}`,
          key,
          source[key]
        );
      });

      const previousSlice = previousGroup[sliceName];
      const nextSlice = isSameSlice(previousSlice, nextValues, keys)
        ? previousSlice
        : Object.freeze(nextValues);

      nextGroup[sliceName] = nextSlice;
      if (nextSlice !== previousSlice) groupChanged = true;
    });

    const previousSliceNames = Object.keys(previousGroup);
    const nextSliceNames = Object.keys(nextGroup);
    const hasSameSliceNames =
      previousSliceNames.length === nextSliceNames.length &&
      nextSliceNames.every((sliceName) =>
        Object.prototype.hasOwnProperty.call(previousGroup, sliceName)
      );

    nextGroups[groupName] =
      !groupChanged && hasSameSliceNames
        ? previousGroup
        : Object.freeze(nextGroup);
  });

  previousGroupsRef.current = nextGroups;
  return nextGroups;
}
