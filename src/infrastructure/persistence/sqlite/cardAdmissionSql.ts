export function activeCardNotTombstonedSql(alias = 'cards'): string {
  return `NOT EXISTS (
  SELECT 1
  FROM tombstones card_tombstone
  WHERE card_tombstone.kind = 'card'
    AND card_tombstone.id = ${alias}.id
    AND card_tombstone.deleted_at >= COALESCE(${alias}.updated_at, 0)
)`;
}

export function activeCardSourceStatusSql(alias = 'cards'): string {
  return `(${alias}.source_exists IS NULL OR ${alias}.source_exists = 1)`;
}

export function missingCardSourceStatusSql(alias = 'cards'): string {
  return `${alias}.source_exists = 0`;
}

export function activePluginCardSql(alias = 'cards'): string {
  return `${activeCardSourceStatusSql(alias)}
    AND ${activeCardNotTombstonedSql(alias)}`;
}
