import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  isValidMemberName,
  normalizeMemberName,
} from '../../utils/memberPolicy.js';

const normalizeComparableTeams = (teams = []) =>
  teams
    .map((team) => String(team || '').trim())
    .filter(Boolean);

const normalizeComparableBorrowers = (borrowers = []) =>
  borrowers.map((borrower) => ({
    id: String(borrower.id || ''),
    name: String(borrower.name || '').trim(),
    team: String(borrower.team || '').trim(),
  }));

export default function useAdminMemberDirectoryEditor({
  borrowers = [],
  teams = [],
  triggerToast,
}) {
  const triggerToastRef = useRef(triggerToast);
  const [newTeam, setNewTeam] = useState('');
  const [tempTeams, setTempTeams] = useState(teams || []);
  const [editingTeamIndex, setEditingTeamIndex] = useState(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [draggingTeamIndex, setDraggingTeamIndex] = useState(null);
  const [newBorrower, setNewBorrower] = useState('');
  const [newBorrowerTeam, setNewBorrowerTeam] = useState('전체');
  const [tempBorrowers, setTempBorrowers] = useState(borrowers || []);
  const [editingBorrowerIndex, setEditingBorrowerIndex] = useState(null);
  const [editingBorrowerName, setEditingBorrowerName] = useState('');
  const [draggingBorrowerIndex, setDraggingBorrowerIndex] = useState(null);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    if (teams.length > 0 && !newBorrowerTeam) {
      setNewBorrowerTeam(teams[0]);
    }
  }, [teams]);

  const resetPeopleDraftUi = useCallback(() => {
    setEditingTeamIndex(null);
    setEditingTeamName('');
    setDraggingTeamIndex(null);
    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
    setDraggingBorrowerIndex(null);
    setNewTeam('');
    setNewBorrower('');
    setNewBorrowerTeam('전체');
  }, []);

  const replaceTempPeopleDraft = useCallback(
    ({ nextTeams = [], nextBorrowers = [] } = {}) => {
      setTempTeams(nextTeams || []);
      setTempBorrowers(nextBorrowers || []);
      resetPeopleDraftUi();
    },
    [resetPeopleDraftUi]
  );

  useEffect(() => {
    replaceTempPeopleDraft({
      nextTeams: teams || [],
      nextBorrowers: borrowers || [],
    });
  }, [borrowers, replaceTempPeopleDraft, teams]);

  const peopleSettingsDirty = useMemo(
    () =>
      JSON.stringify(normalizeComparableTeams(tempTeams)) !==
        JSON.stringify(normalizeComparableTeams(teams)) ||
      JSON.stringify(normalizeComparableBorrowers(tempBorrowers)) !==
        JSON.stringify(normalizeComparableBorrowers(borrowers)),
    [borrowers, teams, tempBorrowers, tempTeams]
  );

  const cancelTempPeopleChanges = useCallback(
    ({ silent = false } = {}) => {
      replaceTempPeopleDraft({
        nextTeams: teams || [],
        nextBorrowers: borrowers || [],
      });

      if (!silent) {
        triggerToastRef.current(
          '부서·사용자 변경사항이 취소되고 이전 상태로 복원되었습니다.',
          'success'
        );
      }
    },
    [borrowers, replaceTempPeopleDraft, teams]
  );

  const addTempTeam = useCallback(() => {
    const teamName = newTeam.trim();

    if (!teamName) {
      triggerToastRef.current('부서명을 입력해 주세요.', 'error');
      return;
    }

    if (tempTeams.some((team) => String(team || '').trim() === teamName)) {
      triggerToastRef.current('이미 등록된 부서명입니다.', 'error');
      return;
    }

    setTempTeams((previousTeams) => [...previousTeams, teamName]);
    setNewTeam('');
    triggerToastRef.current(
      `[${teamName}] 부서가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  }, [newTeam, tempTeams]);

  const startEditTempTeam = useCallback((team, index) => {
    setEditingTeamIndex(index);
    setEditingTeamName(team);
  }, []);

  const applyEditTempTeam = useCallback(
    (team, index) => {
      const nextTeamName = editingTeamName.trim();

      if (!nextTeamName) {
        triggerToastRef.current('부서명을 입력해 주세요.', 'error');
        return;
      }

      if (
        tempTeams.some(
          (item, itemIndex) =>
            itemIndex !== index &&
            String(item || '').trim() === nextTeamName
        )
      ) {
        triggerToastRef.current('이미 등록된 부서명입니다.', 'error');
        return;
      }

      setTempTeams((previousTeams) =>
        previousTeams.map((item, itemIndex) =>
          itemIndex === index ? nextTeamName : item
        )
      );
      setTempBorrowers((previousBorrowers) =>
        previousBorrowers.map((borrower) =>
          borrower.team === team
            ? { ...borrower, team: nextTeamName }
            : borrower
        )
      );

      if (newBorrowerTeam === team) {
        setNewBorrowerTeam(nextTeamName);
      }

      setEditingTeamIndex(null);
      setEditingTeamName('');
      triggerToastRef.current(
        `[${team}] 부서명이 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
        'success'
      );
    },
    [editingTeamName, newBorrowerTeam, tempTeams]
  );

  const deleteTempTeam = useCallback(
    (team, index) => {
      setTempTeams((previousTeams) =>
        previousTeams.filter((_, itemIndex) => itemIndex !== index)
      );
      setTempBorrowers((previousBorrowers) =>
        previousBorrowers.filter((borrower) => borrower.team !== team)
      );

      if (newBorrowerTeam === team) {
        setNewBorrowerTeam('전체');
      }

      setEditingTeamIndex(null);
      setEditingTeamName('');
      triggerToastRef.current(
        `[${team}] 부서 및 해당 부서 소속 사용자가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
        'success'
      );
    },
    [newBorrowerTeam]
  );

  const moveTempTeam = useCallback((fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex) return;

    setTempTeams((previousTeams) => {
      const nextTeams = [...previousTeams];
      const [movedTeam] = nextTeams.splice(fromIndex, 1);
      nextTeams.splice(toIndex, 0, movedTeam);
      return nextTeams;
    });

    setEditingTeamIndex(null);
    setEditingTeamName('');
  }, []);

  const addTempBorrower = useCallback(() => {
    if (tempTeams.length === 0) {
      triggerToastRef.current(
        '등록된 부서가 없어 사용자를 등록할 수 없습니다.',
        'error'
      );
      return;
    }

    if (
      !newBorrowerTeam ||
      newBorrowerTeam === '전체' ||
      !tempTeams.includes(newBorrowerTeam)
    ) {
      triggerToastRef.current('등록할 부서를 선택하세요', 'error');
      return;
    }

    const borrowerName = normalizeMemberName(newBorrower);

    if (!isValidMemberName(borrowerName)) {
      triggerToastRef.current(
        '사용자명은 공백 없이 한글 또는 영문 2~30자로 입력해 주세요.',
        'error'
      );
      return;
    }

    if (
      tempBorrowers.some(
        (borrower) =>
          borrower.team === newBorrowerTeam &&
          String(borrower.name || '').trim() === borrowerName
      )
    ) {
      triggerToastRef.current(
        '해당 부서에 이미 등록된 사용자명입니다.',
        'error'
      );
      return;
    }

    setTempBorrowers((previousBorrowers) => [
      ...previousBorrowers,
      {
        name: borrowerName,
        team: newBorrowerTeam,
      },
    ]);
    setNewBorrower('');
    triggerToastRef.current(
      `[${newBorrowerTeam}] ${borrowerName} 사용자가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  }, [newBorrower, newBorrowerTeam, tempBorrowers, tempTeams]);

  const startEditTempBorrower = useCallback((borrower, originalIndex) => {
    setEditingBorrowerIndex(originalIndex);
    setEditingBorrowerName(borrower.name);
  }, []);

  const applyEditTempBorrower = useCallback(
    (borrower, originalIndex) => {
      const nextBorrowerName = normalizeMemberName(editingBorrowerName);

      if (!isValidMemberName(nextBorrowerName)) {
        triggerToastRef.current(
          '사용자명은 공백 없이 한글 또는 영문 2~30자로 입력해 주세요.',
          'error'
        );
        return;
      }

      if (
        tempBorrowers.some(
          (item, itemIndex) =>
            itemIndex !== originalIndex &&
            item.team === borrower.team &&
            String(item.name || '').trim() === nextBorrowerName
        )
      ) {
        triggerToastRef.current(
          '해당 부서에 이미 등록된 사용자명입니다.',
          'error'
        );
        return;
      }

      setTempBorrowers((previousBorrowers) =>
        previousBorrowers.map((item, itemIndex) =>
          itemIndex === originalIndex
            ? { ...item, name: nextBorrowerName }
            : item
        )
      );

      setEditingBorrowerIndex(null);
      setEditingBorrowerName('');
      triggerToastRef.current(
        `[${borrower.name}] 사용자명이 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
        'success'
      );
    },
    [editingBorrowerName, tempBorrowers]
  );

  const deleteTempBorrower = useCallback((borrower, originalIndex) => {
    setTempBorrowers((previousBorrowers) =>
      previousBorrowers.filter((_, itemIndex) => itemIndex !== originalIndex)
    );
    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
    triggerToastRef.current(
      `[${borrower.name}] 사용자가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  }, []);

  const moveTempBorrower = useCallback((fromIndex, toIndex) => {
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) return;

    setTempBorrowers((previousBorrowers) => {
      const nextBorrowers = [...previousBorrowers];
      const [movedBorrower] = nextBorrowers.splice(fromIndex, 1);
      nextBorrowers.splice(toIndex, 0, movedBorrower);
      return nextBorrowers;
    });

    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
  }, []);

  const displayedTempBorrowers = useMemo(
    () =>
      tempBorrowers
        .map((borrower, originalIndex) => ({
          ...borrower,
          originalIndex,
        }))
        .filter(
          (borrower) =>
            newBorrowerTeam === '전체' ||
            borrower.team === newBorrowerTeam
        ),
    [newBorrowerTeam, tempBorrowers]
  );

  return {
    addTempBorrower,
    addTempTeam,
    applyEditTempBorrower,
    applyEditTempTeam,
    cancelTempPeopleChanges,
    deleteTempBorrower,
    deleteTempTeam,
    displayedTempBorrowers,
    draggingBorrowerIndex,
    draggingTeamIndex,
    editingBorrowerIndex,
    editingBorrowerName,
    editingTeamIndex,
    editingTeamName,
    moveTempBorrower,
    moveTempTeam,
    newBorrower,
    newBorrowerTeam,
    newTeam,
    peopleSettingsDirty,
    replaceTempPeopleDraft,
    setDraggingBorrowerIndex,
    setDraggingTeamIndex,
    setEditingBorrowerIndex,
    setEditingBorrowerName,
    setEditingTeamIndex,
    setEditingTeamName,
    setNewBorrower,
    setNewBorrowerTeam,
    setNewTeam,
    startEditTempBorrower,
    startEditTempTeam,
    tempBorrowers,
    tempTeams,
  };
}
