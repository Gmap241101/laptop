export const assertDisposableTarget = async (source, target, config) => {
  const a = (await source.query(`SELECT current_database() AS name, current_user AS actor`)).rows[0];
  const b = (await target.query(`SELECT current_database() AS name, current_user AS actor`)).rows[0];
  // The disposable marker must be prepared on the target DB by an operator who
  // controls that resource. Source DB never gets this marker. An accidental
  // source-target credential swap therefore blocks schema removal.
  if (a.name === b.name || a.actor === b.actor) throw new Error('backup_target_not_isolated');
  const marker = await target.query(`SELECT marker_id,environment,resource_id FROM backup_guard.disposable_target`);
  if (marker.rows.length !== 1 || marker.rows[0].marker_id !== config.expectedTarget ||
      marker.rows[0].environment !== config.environment ||
      marker.rows[0].resource_id !== config.targetResourceId) {
    throw new Error('backup_target_marker_mismatch');
  }
  // Explicit source guard: if a disposable marker exists here, abort.
  const guard = await source.query(`SELECT to_regclass('backup_guard.disposable_target') AS marker`);
  if (guard.rows[0].marker) throw new Error('backup_source_contains_disposable_marker');
  return { sourceName: a.name, targetName: b.name };
};

