// The status chips and the status dropdown share the same single filter value.
// Clicking a chip keeps the current search, resets pagination, and toggles back
// to 'all' when selected twice. No network requests are issued here.
export const nextMailQueueChipFilter=(currentStatus,clickedStatus,search)=>({
  status:currentStatus===clickedStatus?'all':clickedStatus,
  page:1,
  search,
});
