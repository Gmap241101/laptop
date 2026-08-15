export const buildCalendarHolidaySegments = (calendarCells = []) => {
  const occurrencesByReason = new Map();

  calendarCells.forEach((cell, cellIndex) => {
    (cell.holiday?.reasons || []).forEach((reason) => {
      const reasonType = reason.type || 'company';
      const reasonName = String(reason.name || '휴일');
      const reasonKey = `${reasonType}::${reasonName}`;

      if (!occurrencesByReason.has(reasonKey)) {
        occurrencesByReason.set(reasonKey, []);
      }

      occurrencesByReason.get(reasonKey).push({
        cellIndex,
        reason: {
          ...reason,
          type: reasonType,
          name: reasonName,
        },
      });
    });
  });

  const runs = [];

  occurrencesByReason.forEach((occurrences, reasonKey) => {
    const sortedOccurrences = [...occurrences].sort(
      (a, b) => a.cellIndex - b.cellIndex
    );
    let currentRun = null;

    sortedOccurrences.forEach((occurrence) => {
      if (currentRun && occurrence.cellIndex === currentRun.endIndex + 1) {
        currentRun.endIndex = occurrence.cellIndex;
        return;
      }

      if (currentRun) runs.push(currentRun);
      currentRun = {
        reasonKey,
        reason: occurrence.reason,
        startIndex: occurrence.cellIndex,
        endIndex: occurrence.cellIndex,
      };
    });

    if (currentRun) runs.push(currentRun);
  });

  const segments = [];

  runs.forEach((run, runIndex) => {
    let segmentStart = run.startIndex;

    while (segmentStart <= run.endIndex) {
      const weekIndex = Math.floor(segmentStart / 7);
      const weekEndIndex = weekIndex * 7 + 6;
      const segmentEnd = Math.min(run.endIndex, weekEndIndex);

      segments.push({
        id: `${run.reasonKey}-${runIndex}-${segmentStart}`,
        weekIndex,
        startCol: segmentStart % 7,
        endCol: segmentEnd % 7,
        reason: run.reason,
        showLabel: segmentStart === run.startIndex,
        continuesBefore: segmentStart > run.startIndex,
        continuesAfter: segmentEnd < run.endIndex,
        lane: 0,
      });

      segmentStart = segmentEnd + 1;
    }
  });

  const segmentsByWeek = new Map();

  segments
    .sort(
      (a, b) =>
        a.weekIndex - b.weekIndex ||
        a.startCol - b.startCol ||
        b.endCol - a.endCol ||
        a.id.localeCompare(b.id)
    )
    .forEach((segment) => {
      if (!segmentsByWeek.has(segment.weekIndex)) {
        segmentsByWeek.set(segment.weekIndex, []);
      }

      const weekSegments = segmentsByWeek.get(segment.weekIndex);
      const laneEndColumns = [];

      weekSegments.forEach((existingSegment) => {
        laneEndColumns[existingSegment.lane] = Math.max(
          laneEndColumns[existingSegment.lane] ?? -1,
          existingSegment.endCol
        );
      });

      let lane = 0;
      while ((laneEndColumns[lane] ?? -1) >= segment.startCol) {
        lane += 1;
      }

      segment.lane = lane;
      weekSegments.push(segment);
    });

  return segmentsByWeek;
};
