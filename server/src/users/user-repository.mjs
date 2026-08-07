const mapRow = (row) => {
  if (!row) return null;
  return Object.freeze({
    id: String(row.id),
    clerkUserId: row.clerk_user_id,
    primaryEmail: row.primary_email,
    primaryEmailVerified: Boolean(row.primary_email_verified),
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    imageUrl: row.image_url,
    clerkCreatedAt: row.clerk_created_at,
    clerkUpdatedAt: row.clerk_updated_at,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

export const createUserRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool with query() is required.');
  }

  return Object.freeze({
    async findByClerkUserId(clerkUserId) {
      const result = await pool.query(
        `SELECT id, clerk_user_id, primary_email, primary_email_verified,
                display_name, first_name, last_name, image_url,
                clerk_created_at, clerk_updated_at, last_synced_at,
                created_at, updated_at
           FROM app_user_identities
          WHERE clerk_user_id = $1`,
        [clerkUserId],
      );
      return mapRow(result.rows[0]);
    },

    async upsertFromClerk(profile) {
      const result = await pool.query(
        `INSERT INTO app_user_identities (
           clerk_user_id, primary_email, primary_email_verified,
           display_name, first_name, last_name, image_url,
           clerk_created_at, clerk_updated_at, last_synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (clerk_user_id) DO UPDATE SET
           primary_email = EXCLUDED.primary_email,
           primary_email_verified = EXCLUDED.primary_email_verified,
           display_name = EXCLUDED.display_name,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           image_url = EXCLUDED.image_url,
           clerk_created_at = EXCLUDED.clerk_created_at,
           clerk_updated_at = EXCLUDED.clerk_updated_at,
           last_synced_at = NOW(),
           updated_at = NOW()
         RETURNING id, clerk_user_id, primary_email, primary_email_verified,
                   display_name, first_name, last_name, image_url,
                   clerk_created_at, clerk_updated_at, last_synced_at,
                   created_at, updated_at`,
        [
          profile.clerkUserId,
          profile.primaryEmail,
          profile.primaryEmailVerified,
          profile.displayName,
          profile.firstName,
          profile.lastName,
          profile.imageUrl,
          profile.clerkCreatedAt,
          profile.clerkUpdatedAt,
        ],
      );
      return mapRow(result.rows[0]);
    },
  });
};
