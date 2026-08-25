const repositoryError = (code, message, details = {}) =>
  Object.assign(new Error(message), { code, details });

const mapRow = (row = {}) => Object.freeze({
  assetId: String(row.asset_id || ''),
  category: String(row.category_name || ''),
  assetNo: String(row.asset_no || ''),
  model: String(row.model || ''),
  baseStatus: row.base_status === '대여불가' ? '대여불가' : '대여가능',
  categorySortOrder: Number(row.category_sort_order || 0),
  requestId: String(row.request_id || ''),
  appUserId: row.app_user_id === null || row.app_user_id === undefined ? '' : String(row.app_user_id),
  startDate: String(row.start_date || ''),
  dueDate: String(row.due_date || ''),
  status: String(row.status || ''),
  actualReturnDate: String(row.actual_return_date || ''),
  overdueDaysAtReturn: Number(row.overdue_days_at_return || 0),
  currentSummary: Object.freeze({
    total: Number(row.current_total || 0),
    available: Number(row.current_available || 0),
    requested: Number(row.current_requested || 0),
    reserved: Number(row.current_reserved || 0),
    approved: Number(row.current_approved || 0),
    overdue: Number(row.current_overdue || 0),
  }),
});

export const createMemberRentalStatusRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool with query() is required.');
  }

  return Object.freeze({
    async readMonth({ monthStart, monthEnd, referenceDate }) {
      try {
        const result = await pool.query(
          `WITH scoped_requests AS (
             SELECT request.id AS rental_request_id,
                    request.request_id,
                    request.app_user_id,
                    item.laptop_id,
                    COALESCE(guard.start_date, request.start_date)::text AS start_date,
                    COALESCE(guard.due_date, request.due_date)::text AS due_date,
                    request.status,
                    request.actual_return_date,
                    request.overdue_days_at_return,
                    CASE
                      WHEN request.status = '반납완료'
                        AND request.actual_return_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                        THEN request.actual_return_date::date
                      WHEN request.status = '반납완료'
                        AND request.overdue_days_at_return > 0
                        THEN COALESCE(guard.due_date, request.due_date) + request.overdue_days_at_return::int
                      WHEN request.status = '대여중' AND COALESCE(guard.due_date, request.due_date) < $3::date
                        THEN $3::date
                      ELSE COALESCE(guard.due_date, request.due_date)
                    END AS effective_end_date
               FROM app_rental_requests request
               JOIN app_rental_request_items item
                 ON item.rental_request_id = request.id
               LEFT JOIN app_rental_asset_reservation_guards guard
                 ON guard.request_id = request.request_id
                AND guard.laptop_id = item.laptop_id
                AND guard.active = TRUE
              WHERE request.status IN ('신청중', '보류', '대여중', '반납완료')
                AND COALESCE(guard.start_date, request.start_date) <= $2::date
                AND CASE
                      WHEN request.status = '반납완료'
                        AND request.actual_return_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                        THEN request.actual_return_date::date
                      WHEN request.status = '반납완료'
                        AND request.overdue_days_at_return > 0
                        THEN COALESCE(guard.due_date, request.due_date) + request.overdue_days_at_return::int
                      WHEN request.status = '대여중' AND COALESCE(guard.due_date, request.due_date) < $3::date
                        THEN $3::date
                      ELSE COALESCE(guard.due_date, request.due_date)
                    END >= $1::date
           ),
           current_summary AS (
             SELECT
               (SELECT COUNT(*)::int FROM app_rental_assets) AS current_total,
               (SELECT COUNT(*)::int
                  FROM app_rental_assets current_asset
                 WHERE current_asset.base_status <> '대여불가'
                   AND NOT EXISTS (
                     SELECT 1
                       FROM app_rental_asset_reservation_guards guard
                      WHERE guard.laptop_id = current_asset.asset_id
                        AND guard.active = TRUE
                   )) AS current_available,
               (SELECT COUNT(*)::int
                  FROM app_rental_asset_reservation_guards guard
                 WHERE guard.active = TRUE
                   AND guard.status IN ('신청중', '보류')) AS current_requested,
               (SELECT COUNT(*)::int
                  FROM app_rental_asset_reservation_guards guard
                 WHERE guard.active = TRUE
                   AND guard.status = '대여중'
                   AND guard.start_date > $3::date) AS current_reserved,
               (SELECT COUNT(*)::int
                  FROM app_rental_asset_reservation_guards guard
                 WHERE guard.active = TRUE
                   AND guard.status = '대여중'
                   AND guard.start_date <= $3::date) AS current_approved,
               (SELECT COUNT(*)::int
                  FROM app_rental_asset_reservation_guards guard
                 WHERE guard.active = TRUE
                   AND guard.status = '대여중'
                   AND guard.start_date <= $3::date
                   AND guard.due_date < $3::date) AS current_overdue
           )
           SELECT asset.asset_id,
                  category.name AS category_name,
                  category.sort_order AS category_sort_order,
                  asset.asset_no,
                  asset.model,
                  asset.base_status,
                  scoped.request_id,
                  scoped.app_user_id,
                  scoped.start_date,
                  scoped.due_date,
                  scoped.status,
                  scoped.actual_return_date,
                  scoped.overdue_days_at_return,
                  summary.current_total, summary.current_available, summary.current_requested,
                  summary.current_reserved, summary.current_approved, summary.current_overdue
             FROM app_rental_assets asset
             JOIN app_asset_categories category ON category.id = asset.category_id
             LEFT JOIN scoped_requests scoped ON scoped.laptop_id = asset.asset_id
             CROSS JOIN current_summary summary
            ORDER BY category.sort_order, asset.asset_no_normalized, asset.asset_id,
                     scoped.start_date NULLS LAST, scoped.request_id NULLS LAST`,
          [monthStart, monthEnd, referenceDate],
        );
        return Object.freeze(result.rows.map(mapRow));
      } catch (error) {
        if (error?.code?.startsWith?.('member_rental_status_')) throw error;
        throw repositoryError(
          'member_rental_status_postgresql_read_failed',
          'PostgreSQL member rental status could not be read.',
          { causeName: error?.name || '', postgresCode: error?.code || '' },
        );
      }
    },
  });
};
